import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(file);
const secretKey = /password|secret|token|private.?key|credential|connection.?string/i;

export function redact(value, sensitive = false, key = '') {
  if (sensitive === true || secretKey.test(key)) return value == null ? value : '[REDACTED]';
  if (Array.isArray(value)) return value.map((v, i) => redact(v, sensitive?.[i]));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, sensitive?.[k], k)]));
  return value;
}

// Preserve the GuxOps resource-change schema. Other sections repeat secrets.
export function analysisPlan(plan) {
  return {
    format_version: plan.format_version,
    terraform_version: plan.terraform_version,
    resource_changes: (plan.resource_changes ?? []).map(r => ({
      address: r.address, mode: r.mode, type: r.type, name: r.name, provider_name: r.provider_name,
      change: {
        actions: r.change.actions,
        before: redact(r.change.before, r.change.before_sensitive),
        after: redact(r.change.after, r.change.after_sensitive),
        before_sensitive: r.change.before_sensitive, after_sensitive: r.change.after_sensitive,
        after_unknown: r.change.after_unknown, replace_paths: r.change.replace_paths
      }
    }))
  };
}

export function configHash(dir) {
  const entries = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.terraform', '.git', 'node_modules', '.terraform.lock.hcl'].includes(entry.name)) continue;
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks in the Terraform directory are not supported.');
      if (entry.isDirectory()) walk(file);
      else if (/\.(tf|tf\.json|tfvars|tfvars\.json|hcl)$/.test(entry.name)) entries.push([path.relative(dir, file), sha256(read(file))]);
    }
  }
  walk(dir);
  return sha256(JSON.stringify(entries));
}

export function verifyManifest(manifest, expected, planBytes, manifestBytes, context) {
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(manifestBytes) !== expected) throw new Error('Plan manifest digest does not match the trusted plan job output.');
  if (manifest.schema !== 1 || sha256(planBytes) !== manifest.planSha256) throw new Error('Saved plan checksum mismatch.');
  for (const key of ['repository', 'commit', 'environment', 'stateBucket', 'statePrefix', 'workspace', 'projectId', 'terraformVersion', 'configSha256']) {
    if (manifest[key] !== context[key]) throw new Error(`Plan context mismatch: ${key}.`);
  }
  const age = Date.now() - Date.parse(manifest.createdAt);
  if (!Number.isFinite(age) || age < -60000 || age > 86400000) throw new Error('Plan expired; generate and review a new plan (maximum age 24 hours).');
}

export function run(env = process.env) {
  const input = (name, fallback = '') => env['TF_ACTION_' + name] || fallback;
  const mode = input('MODE', 'plan');
  if (!['validate', 'plan', 'destroy-plan', 'apply'].includes(mode)) throw new Error('mode must be validate, plan, destroy-plan, or apply.');
  if (input('LEGACY_APPLY', 'false') !== 'false' || input('SECRETS', '{}') !== '{}') throw new Error('v2 migration: use mode=apply with a reviewed saved plan; pass Terraform variables through TF_VAR_ environment variables.');
  const dir = fs.realpathSync(path.resolve(input('WORKDIR', '.')));
  const bundle = path.resolve(input('PLAN_DIRECTORY', '.terraform-action-plan'));
  if (bundle === dir || dir.startsWith(bundle + path.sep)) throw new Error('Plan directory cannot contain the Terraform working directory.');
  const childEnv = { ...env, TF_IN_AUTOMATION: 'true', TF_INPUT: 'false' };
  // Extra CLI arguments can silently disable locking or change the state target.
  for (const key of Object.keys(childEnv)) if (key.startsWith('TF_CLI_ARGS')) delete childEnv[key];
  const tf = (args, accepted = [0]) => {
    const result = spawnSync('terraform', args, { cwd: dir, env: childEnv, encoding: 'utf8', maxBuffer: 67108864 });
    // Provider diagnostics can contain secrets. Do not forward raw output.
    if (result.error || !accepted.includes(result.status)) throw new Error(`terraform ${args[0]} failed (exit ${result.status ?? 'unavailable'}); raw output suppressed to protect sensitive values. Reproduce with authorized local credentials.`);
    return result;
  };
  const stateBucket = input('STATE_BUCKET');
  const statePrefix = input('STATE_PREFIX', 'infra');
  const workspace = input('WORKSPACE', 'default');
  if (!/^[a-zA-Z0-9_-]+$/.test(workspace)) throw new Error('Invalid Terraform workspace.');
  const initArgs = ['init', '-input=false', '-no-color', '-reconfigure'];
  if (stateBucket) initArgs.push(`-backend-config=bucket=${stateBucket}`, `-backend-config=prefix=${statePrefix}`);
  const terraformVersion = JSON.parse(tf(['version', '-json']).stdout).terraform_version;
  const context = () => ({
    repository: env.GITHUB_REPOSITORY || 'local', commit: env.GITHUB_SHA || 'local',
    environment: input('ENVIRONMENT', 'dev'), projectId: input('PROJECT_ID'),
    stateBucket, statePrefix, workspace, terraformVersion, configSha256: configHash(dir)
  });
  let manifest;
  if (mode === 'apply') {
    if (input('APPROVED') !== 'true') throw new Error('Apply requires approved=true after a trusted workflow approval gate.');
    const bytes = read(path.join(bundle, 'manifest.json'));
    manifest = JSON.parse(bytes);
    verifyManifest(manifest, input('EXPECTED_MANIFEST_SHA256'), read(path.join(bundle, 'tfplan')), bytes, context());
    if (manifest.lockSha256) {
      const lock = read(path.join(bundle, 'provider-lock.hcl'));
      if (sha256(lock) !== manifest.lockSha256) throw new Error('Provider lock checksum mismatch.');
      const destination = path.join(dir, '.terraform.lock.hcl');
      if (fs.existsSync(destination) && sha256(read(destination)) !== manifest.lockSha256) throw new Error('Provider selections changed after planning.');
      fs.writeFileSync(destination, lock, { mode: 0o600 });
    }
    initArgs.push('-lockfile=readonly');
  }
  tf(initArgs);
  tf(['workspace', 'select', workspace]);
  if (mode === 'apply') {
    verifyManifest(manifest, input('EXPECTED_MANIFEST_SHA256'), read(path.join(bundle, 'tfplan')), read(path.join(bundle, 'manifest.json')), context());
    tf(['apply', '-input=false', '-no-color', '-lock-timeout=120s', path.join(bundle, 'tfplan')]);
    output('apply_status', 'success', env);
    output('plan-apply_status', 'success', env);
    console.log('Applied the verified saved plan.');
    return;
  }
  tf(['fmt', '-check', '-recursive', '-no-color']);
  tf(['validate', '-no-color']);
  if (mode === 'validate') { output('plan_status', 'validated', env); return; }
  if (fs.existsSync(bundle)) throw new Error('Plan directory already exists; use a new directory for each plan.');
  fs.mkdirSync(bundle, { recursive: true, mode: 0o700 });
  const planPath = path.join(bundle, 'tfplan');
  const args = ['plan', '-input=false', '-no-color', '-lock-timeout=120s', '-detailed-exitcode', `-out=${planPath}`];
  if (mode === 'destroy-plan') args.push('-destroy');
  const result = tf(args, [0, 2]);
  fs.chmodSync(planPath, 0o600);
  const plan = analysisPlan(JSON.parse(tf(['show', '-json', planPath]).stdout));
  const lockPath = path.join(dir, '.terraform.lock.hcl');
  const lock = fs.existsSync(lockPath) ? read(lockPath) : null;
  if (lock) fs.writeFileSync(path.join(bundle, 'provider-lock.hcl'), lock, { mode: 0o600 });
  const manifestData = { schema: 1, ...context(), mode, createdAt: new Date().toISOString(), runId: env.GITHUB_RUN_ID || 'local', planSha256: sha256(read(planPath)), lockSha256: lock ? sha256(lock) : null, hasChanges: result.status === 2 };
  const manifestBytes = JSON.stringify(manifestData, null, 2) + '\n';
  fs.writeFileSync(path.join(bundle, 'manifest.json'), manifestBytes, { mode: 0o600 });
  fs.writeFileSync(path.join(bundle, 'terraform-plan.json'), JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
  const counts = {};
  for (const resource of plan.resource_changes) { const action = resource.change.actions.join('/'); counts[action] = (counts[action] || 0) + 1; }
  const summary = `### Terraform ${mode}\n\nChanges: ${result.status === 2 ? 'yes' : 'no'}\n\n${Object.entries(counts).map(([action, count]) => `- ${action}: ${count}`).join('\n')}\n\nPlan SHA-256: \`${manifestData.planSha256}\`\n`;
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  output('has-changes', String(result.status === 2), env);
  output('plan-sha256', manifestData.planSha256, env);
  output('manifest-sha256', sha256(manifestBytes), env);
  output('plan-directory', bundle, env);
  output('plan-json', path.join(bundle, 'terraform-plan.json'), env);
  output('plan_status', result.status === 2 ? 'changes' : 'no_changes', env);
  output('plan-apply_status', 'success', env);
  console.log(summary);
}

function output(name, value, env) {
  if (/[\r\n]/.test(value)) throw new Error('Invalid multiline action output.');
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
