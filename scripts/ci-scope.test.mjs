import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { nativeChanges, fullChecks, changedPaths } from './ci-scope.mjs';

test('frontend, docs and package-only changes skip unrelated native checks', () => {
  assert.equal(nativeChanges(['src/App.tsx', 'README.md', 'doc/development.md', 'package.json', 'pnpm-lock.yaml', '.github/dependabot.yml']), false);
});
test('native code, workflows and verification helpers require native checks', () => {
  for (const path of ['src-tauri/Cargo.lock', 'src-tauri/src/main.rs', 'scripts/release-artifacts.mjs', 'tests/fixtures/dmg-eula-resources.xml', '.github/workflows/ci.yml', '.gitattributes']) assert.equal(nativeChanges([path]), true, path);
});
test('tags and explicit full checks cannot be path-skipped', () => {
  for (const [event, ref] of [['push', 'refs/tags/v0.1.2'], ['workflow_dispatch', 'refs/heads/master'], ['workflow_call', 'refs/heads/master']]) assert.equal(fullChecks(event, ref), true);
  assert.equal(fullChecks('pull_request', 'refs/pull/1/merge'), false);
});
test('real git diff retains deletions, renamed native files and unusual filenames', () => {
  const root = mkdtempSync(join(tmpdir(), 'patent-ci-scope-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '-b', 'master');git('config', 'user.name', 'Offline Test');git('config', 'user.email', 'offline@example.invalid');
    mkdirSync(join(root, 'src-tauri'));writeFileSync(join(root, 'src-tauri/old.rs'), 'old');git('add', '.');git('commit', '-m', 'base');const base = git('rev-parse', 'HEAD');
    git('mv', 'src-tauri/old.rs', 'frontend-name.txt');const unusual = process.platform === 'win32' ? 'with space.txt' : 'space\nand-tab\t.txt';writeFileSync(join(root, unusual), 'fixture');git('add', '.');git('commit', '-m', 'rename');
    const paths = changedPaths(base, git('rev-parse', 'HEAD'), root);
    assert.ok(paths.includes('src-tauri/old.rs'));assert.ok(paths.includes(unusual));assert.equal(nativeChanges(paths), true);
    assert.throws(() => changedPaths('0'.repeat(40), base, root));assert.throws(() => changedPaths('--output=bad', base, root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
