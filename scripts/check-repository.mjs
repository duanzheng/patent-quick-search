import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { checkNotices } from './check-notices.mjs';

export function versions(root = '.') {
  const read = name => readFileSync(resolve(root, name), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
  const cargoPackage = read('src-tauri/Cargo.toml').match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const cargo = cargoPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const cargoLicense = cargoPackage?.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
  const rustLock = read('src-tauri/Cargo.lock').match(/name = "patent-quick-search"\nversion = "([^"]+)"/)?.[1];
  const all = [pkg.version, lock.version, lock.packages[''].version, tauri.version, cargo, rustLock];
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || all.some(v => v !== pkg.version)) throw new Error('Package, lockfiles, Cargo and Tauri versions must match (X.Y.Z)');
  if (!pkg.license || [lock.packages[''].license, cargoLicense, tauri.bundle.license].some(v => v !== pkg.license)) throw new Error('npm, Cargo and Tauri license metadata must agree');
  for (const entry of Object.values(lock.packages)) {
    if (entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/')) throw new Error('Lockfile must use the public HTTPS npm registry');
  }
  const inventory = JSON.parse(read('doc/dependency-inventory.json'));
  for (const [file, field] of [['package-lock.json', 'npmSha256'], ['src-tauri/Cargo.lock', 'cargoSha256']]) {
    const actual = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
    if (inventory.lockfiles[field] !== actual) throw new Error('Dependency inventory is stale: run npm run audit:licenses');
  }
  checkNotices(root);
  return pkg.version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Repository metadata OK: ${versions()}`);
