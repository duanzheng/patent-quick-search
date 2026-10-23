import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPnpmLock } from './pnpm-metadata.mjs';

function fixture() {
  const resolution = { integrity: 'sha512-YWJjZA==' };
  return { lockfileVersion: '9.0', importers: { '.': { dependencies: { 'root-package': { version: '1.0.0(peer@2.0.0)' } }, devDependencies: { tooling: { version: '3.0.0' } } } }, packages: { 'root-package@1.0.0': { resolution }, '@scope/runtime@2.0.0': { resolution }, 'tooling@3.0.0': { resolution }, 'platform-helper@1.0.0': { resolution } }, snapshots: { 'root-package@1.0.0(peer@2.0.0)': { dependencies: { '@scope/runtime': '2.0.0' }, optionalDependencies: { 'platform-helper': '1.0.0' } }, '@scope/runtime@2.0.0': { dependencies: { 'root-package': '1.0.0(peer@2.0.0)' } }, 'platform-helper@1.0.0': { optional: true }, 'tooling@3.0.0': {} } };
}
test('pnpm license graph retains scoped runtime, peers, cycles and optional platforms', () => {
  const packages = inspectPnpmLock(fixture()).packages;
  assert.equal(packages.length, 4);
  assert.equal(packages.find(p => p.name === 'tooling').development, true);
  assert.equal(packages.find(p => p.name === '@scope/runtime').development, false);
  assert.equal(packages.find(p => p.name === 'platform-helper').optional, true);
});
test('reject incomplete runtime graphs, exotic sources and absent integrity', () => {
  let lock = fixture();delete lock.snapshots['@scope/runtime@2.0.0'];assert.throws(() => inspectPnpmLock(lock), /Incomplete/);
  lock = fixture();lock.packages['tooling@3.0.0'].resolution = { integrity: 'sha512-YWJjZA==', tarball: 'https://unreviewed.invalid/tool.tgz' };assert.throws(() => inspectPnpmLock(lock), /non-registry/);
  lock = fixture();lock.packages['tooling@3.0.0'].resolution = {};assert.throws(() => inspectPnpmLock(lock), /unverified/);
  lock = fixture();lock.packages['git+https://unreviewed.invalid/tool'] = {};assert.throws(() => inspectPnpmLock(lock), /identity/);
});
