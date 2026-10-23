import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertTag, assertTargetCommit, assertLicense } from './check-release.mjs';

test('reject mismatched, prerelease, malformed and injectable tags', () => {
  assertTag('v0.1.0', '0.1.0');
  for (const tag of ['v0.2.0', 'v01.1.0', 'v0.1.0-beta', 'v0.1.0;echo bad', undefined]) assert.throws(() => assertTag(tag, '0.1.0'));
});
test('reject off-master commits, moved tags, wrong checkout and absent master', () => {
  const root = mkdtempSync(join(tmpdir(), 'patent-policy-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'master');git('config', 'user.name', 'Offline Test');git('config', 'user.email', 'offline@example.invalid');
    writeFileSync(join(root, 'file'), 'base');git('add', '.');git('commit', '-m', 'base');
    const base = git('rev-parse', 'HEAD');git('update-ref', 'refs/remotes/origin/master', base);git('tag', 'v0.1.0');
    assert.equal(assertTargetCommit('v0.1.0', base, undefined, root), base);
    git('checkout', '-b', 'unmerged');writeFileSync(join(root, 'file'), 'unmerged');git('commit', '-am', 'unmerged');
    const other = git('rev-parse', 'HEAD');git('tag', 'v0.2.0');
    assert.throws(() => assertTargetCommit('v0.2.0', other, undefined, root));
    assert.throws(() => assertTargetCommit('v0.1.0', base, undefined, root));
    assert.throws(() => assertTargetCommit('v0.1.0', other, undefined, root));
    git('checkout', 'master');git('update-ref', '-d', 'refs/remotes/origin/master');
    assert.throws(() => assertTargetCommit('v0.1.0', base, undefined, root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('an explicit owner license and metadata are required', () => {
  const root = mkdtempSync(join(tmpdir(), 'patent-license-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ license: 'UNLICENSED' }));
    assert.throws(() => assertLicense(root), /owner must choose/);
    writeFileSync(join(root, 'LICENSE'), 'synthetic license text '.repeat(10));
    assert.throws(() => assertLicense(root), /owner must choose/);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ license: 'MIT' }));
    assertLicense(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
