import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

export function nativeChanges(paths) {
  return paths.some(path => /^(src-tauri\/|scripts\/|tests\/fixtures\/|\.github\/workflows\/|Cargo\.(toml|lock)$|rust-toolchain(\.toml)?$|\.gitattributes$)/.test(path));
}
export function fullChecks(event, ref) {
  return event === 'workflow_dispatch' || event === 'workflow_call' || ref.startsWith('refs/tags/');
}
export function changedPaths(base, head, cwd = '.') {
  if (![base, head].every(value => /^[0-9a-f]{40}$/.test(value)) || /^0+$/.test(base)) throw new Error('Unavailable immutable diff range');
  // Both names for a rename matter; NUL handles spaces, tabs and newlines safely.
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base + '...' + head], { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).split('\0').filter(Boolean);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let native = true;
  if (!fullChecks(process.env.CI_EVENT || '', process.env.CI_REF || '')) {
    try { native = nativeChanges(changedPaths(process.env.CHANGE_BASE, process.env.CHANGE_HEAD)); }
    catch { console.log('Cannot prove change scope; running full native checks.'); }
  }
  appendFileSync(process.env.GITHUB_OUTPUT, 'native=' + native + '\n');
  console.log('Native checks required: ' + native);
}
