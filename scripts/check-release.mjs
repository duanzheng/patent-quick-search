import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { versions } from './check-repository.mjs';

export function assertTag(tag, version) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || tag !== `v${version}`) throw new Error('Tag must be vX.Y.Z and match every application version');
}
export function assertTargetCommit(tag, expected, branch = 'refs/remotes/origin/master', cwd = '.') {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = git(['rev-parse', '--verify', `${tag}^{commit}`]);
  if (!/^[0-9a-f]{40}$/.test(expected) || commit !== expected || git(['rev-parse', 'HEAD']) !== expected) throw new Error('Tag, checkout and event commit must agree');
  // Exact branch ref: a similarly named branch cannot satisfy this check.
  git(['rev-parse', '--verify', branch]);
  git(['merge-base', '--is-ancestor', commit, branch]);
  return commit;
}
export function assertLicense(root = '.') {
  const path = resolve(root, 'LICENSE');
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (!existsSync(path) || readFileSync(path, 'utf8').trim().length < 100 || !pkg.license || pkg.license === 'UNLICENSED') throw new Error('Release blocked: owner must choose and add a license and update package metadata');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertTag(process.env.RELEASE_TAG, versions());
  assertTargetCommit(process.env.RELEASE_TAG, process.env.RELEASE_SHA);
  assertLicense();
  console.log('Release policy OK: matching versions, master ancestry, explicit license');
}
