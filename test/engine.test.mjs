import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisPlan, redact, sha256, verifyManifest } from '../src/engine.mjs';

test('redacts nested sensitivity masks and secret names without hiding IAM policy fields', () => {
  assert.deepEqual(redact({ password: 'hidden', nested: [{ value: 'secret', role: 'roles/owner' }] }, { nested: [{ value: true }] }), { password: '[REDACTED]', nested: [{ value: '[REDACTED]', role: 'roles/owner' }] });
  assert.equal(redact('secret', true), '[REDACTED]');
  assert.equal(redact(null, true), null);
});

test('analysis artifact omits all other potentially sensitive plan sections', () => {
  const result = analysisPlan({ variables: { token: 'secret' }, prior_state: 'secret', planned_values: 'secret', configuration: 'secret', output_changes: 'secret', resource_changes: [] });
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.deepEqual(result.resource_changes, []);
});

test('apply rejects tampering, context mismatch and expired plans', () => {
  const plan = Buffer.from('saved-plan');
  const context = { repository: 'org/repo', commit: 'abc', environment: 'dev', stateBucket: 'bucket', statePrefix: 'infra', workspace: 'default', projectId: 'test', terraformVersion: '1.12.1', configSha256: 'config' };
  const manifest = { schema: 1, ...context, planSha256: sha256(plan), createdAt: new Date().toISOString() };
  const bytes = JSON.stringify(manifest);
  verifyManifest(manifest, sha256(bytes), plan, bytes, context);
  assert.throws(() => verifyManifest(manifest, '', plan, bytes, context), /digest/);
  assert.throws(() => verifyManifest(manifest, sha256(bytes), Buffer.from('changed'), bytes, context), /checksum/);
  for (const key of Object.keys(context)) assert.throws(() => verifyManifest(manifest, sha256(bytes), plan, bytes, { ...context, [key]: 'different' }), /context mismatch/);
  const old = { ...manifest, createdAt: '2020-01-01' };
  assert.throws(() => verifyManifest(old, sha256(JSON.stringify(old)), plan, JSON.stringify(old), context), /expired/);
});
