import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { run, sha256 } from '../src/engine.mjs';

test('real Terraform plan, exact apply, no-op, mutation rejection, destroy and empty state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-actions-test-'));
  const workdir = path.join(root, 'module');
  fs.mkdirSync(workdir);
  fs.writeFileSync(path.join(workdir, 'main.tf'), 'resource "terraform_data" "test" {\n  input = "no-cloud-resources"\n}\n');
  const base = { ...process.env, TF_ACTION_WORKDIR: workdir, TF_ACTION_ENVIRONMENT: 'test', GITHUB_OUTPUT: path.join(root, 'outputs'), GITHUB_STEP_SUMMARY: path.join(root, 'summary') };
  const plan = name => ({ ...base, TF_ACTION_PLAN_DIRECTORY: path.join(root, name) });
  const apply = e => ({ ...e, TF_ACTION_MODE: 'apply', TF_ACTION_APPROVED: 'true', TF_ACTION_EXPECTED_MANIFEST_SHA256: sha256(fs.readFileSync(path.join(e.TF_ACTION_PLAN_DIRECTORY, 'manifest.json'))) });
  try {
    const create = plan('create');
    run(create);
    assert.throws(() => run({ ...apply(create), TF_ACTION_APPROVED: 'false' }), /approved/);
    assert.throws(() => run({ ...apply(create), TF_ACTION_ENVIRONMENT: 'prod' }), /context mismatch/);
    run(apply(create));
    const noop = plan('noop');
    run(noop);
    assert.equal(JSON.parse(fs.readFileSync(path.join(noop.TF_ACTION_PLAN_DIRECTORY, 'manifest.json'))).hasChanges, false);
    fs.appendFileSync(path.join(workdir, 'main.tf'), '# changed after review\n');
    assert.throws(() => run(apply(noop)), /context mismatch/);
    const destroy = { ...plan('destroy'), TF_ACTION_MODE: 'destroy-plan' };
    run(destroy);
    run(apply(destroy));
    const state = spawnSync('terraform', ['state', 'list'], { cwd: workdir, encoding: 'utf8' });
    assert.equal(state.status, 0);
    assert.equal(state.stdout.trim(), '');
  } finally {
    // This fixture can create only terraform_data in a local state file.
    fs.rmSync(root, { recursive: true, force: true });
  }
});
