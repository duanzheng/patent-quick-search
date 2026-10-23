import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { versions } from './check-repository.mjs';
import { inspectWindowsPayload } from './verify-windows-artifacts.mjs';

export const targets = {
  'aarch64-apple-darwin': { folder: 'dmg', extensions: ['.dmg'], signing: 'ad-hoc; not notarized' },
  'x86_64-apple-darwin': { folder: 'dmg', extensions: ['.dmg'], signing: 'ad-hoc; not notarized' },
  'x86_64-pc-windows-msvc': { folder: 'nsis', extensions: ['.exe', '.msi'], signing: 'unsigned' },
};
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const nameFor = (version, target, ext) => `patent-quick-search_${version}_${target}${ext}`;
function assertIdentity(version, commit) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid build identity');
}
export function stage(root, target, commit, destination) {
  const policy = targets[target];if (!policy) throw new Error('Unsupported release target');
  const version = versions(root);assertIdentity(version, commit);
  const release = join(root, 'src-tauri', 'target', target, 'release');
  if (target.endsWith('windows-msvc')) inspectWindowsPayload(readFileSync(join(release, 'patent-quick-search.exe')));
  mkdirSync(destination, { recursive: true });
  const files = policy.extensions.map(ext => {
    const directory = join(release, 'bundle', ext === '.msi' ? 'msi' : policy.folder);
    const paths = readdirSync(directory).filter(n => n.endsWith(ext));
    if (paths.length !== 1) throw new Error(`Expected exactly one ${ext} bundle for ${target}`);
    const source = join(directory, paths[0]);
    if (!statSync(source).isFile() || !statSync(source).size) throw new Error('Empty or invalid bundle');
    const name = nameFor(version, target, ext);copyFileSync(source, join(destination, name));
    return { name, bytes: statSync(source).size, sha256: hash(source) };
  });
  const manifest = { schemaVersion: 1, version, commit, target, signing: policy.signing, runtimeVerified: false, files };
  writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function assemble(source, destination, version, commit) {
  assertIdentity(version, commit);
  const expectedDirs = Object.keys(targets).map(t => `bundle-${t}`).sort();
  if (JSON.stringify(readdirSync(source).sort()) !== JSON.stringify(expectedDirs)) throw new Error('Missing or extra platform artifact');
  // Validate everything before copying any public release asset.
  const manifests = Object.entries(targets).map(([target, policy]) => {
    const directory = join(source, `bundle-${target}`);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.commit !== commit || manifest.target !== target || manifest.signing !== policy.signing || manifest.runtimeVerified !== false) throw new Error('Artifact identity mismatch');
    const expected = policy.extensions.map(ext => nameFor(version, target, ext)).sort();
    if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify([...expected, 'manifest.json'].sort()) || JSON.stringify(manifest.files.map(f => f.name).sort()) !== JSON.stringify(expected)) throw new Error('Incomplete or unexpected release files');
    for (const file of manifest.files) {
      const path = join(directory, file.name);
      if (!statSync(path).isFile() || statSync(path).size <= 0 || statSync(path).size !== file.bytes || hash(path) !== file.sha256) throw new Error('Artifact checksum mismatch');
    }
    return manifest;
  });
  if (existsSync(destination) && readdirSync(destination).length) throw new Error('Release staging directory must be empty');
  mkdirSync(destination, { recursive: true });
  const checksums = [];
  for (const manifest of manifests) for (const file of manifest.files) {
    copyFileSync(join(source, `bundle-${manifest.target}`, file.name), join(destination, file.name));
    checksums.push(`${file.sha256}  ${file.name}`);
  }
  const manifestName = 'build-manifest.json';
  writeFileSync(join(destination, manifestName), JSON.stringify({ schemaVersion: 1, version, commit, builds: manifests }, null, 2) + '\n');
  checksums.push(`${hash(join(destination, manifestName))}  ${manifestName}`);
  writeFileSync(join(destination, 'SHA256SUMS'), checksums.sort().join('\n') + '\n');
  return manifests;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, target] = process.argv.slice(2);
  if (mode === 'stage') stage('.', target, process.env.RELEASE_SHA, 'release-stage');
  else if (mode === 'assemble') assemble('downloaded', 'release-assets', versions(), process.env.RELEASE_SHA);
  else throw new Error('Use stage <target> or assemble');
  console.log('Release artifact validation passed');
}
