import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { checkNotices } from './check-notices.mjs';
import { dependencySpecifiersHash } from './dependency-specifiers.mjs';

export function versions(root = '.') {
  const read = name => readFileSync(resolve(root, name), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  const lock = read('pnpm-lock.yaml');
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(pkg.packageManager || '') || !/^lockfileVersion: ['"]?9\.0/m.test(lock) || existsSync(resolve(root, 'package-lock.json'))) throw new Error('Use the exact pinned pnpm version and pnpm-lock.yaml only');
  if (read('.npmrc').trim() !== 'registry=https://registry.npmjs.org/') throw new Error('Use the public HTTPS npm registry without committed credentials');
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
  const cargoPackage = read('src-tauri/Cargo.toml').match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const cargo = cargoPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const cargoLicense = cargoPackage?.match(/^license\s*=\s*"([^"]+)"/m)?.[1];
  const rustLock = read('src-tauri/Cargo.lock').match(/name = "patent-quick-search"\nversion = "([^"]+)"/)?.[1];
  const all = [pkg.version, tauri.version, cargo, rustLock];
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || all.some(v => v !== pkg.version)) throw new Error('Package, lockfiles, Cargo and Tauri versions must match (X.Y.Z)');
  if (!pkg.license || [cargoLicense, tauri.bundle.license].some(v => v !== pkg.license)) throw new Error('Package, Cargo and Tauri license metadata must agree');
  const inventory = JSON.parse(read('doc/dependency-inventory.json'));
  if (inventory.schemaVersion !== 2 || inventory.manifestDependenciesSha256 !== dependencySpecifiersHash(pkg)) throw new Error('Dependency specifiers changed: run pnpm run dependencies:refresh and review licenses');
  for (const [file, field] of [['pnpm-lock.yaml', 'pnpmSha256'], ['src-tauri/Cargo.lock', 'cargoSha256']]) {
    const actual = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
    if (inventory.lockfiles[field] !== actual) throw new Error('Dependency inventory is stale: run pnpm run dependencies:refresh and review licenses');
  }
  if (inventory.licensePolicySha256 !== createHash('sha256').update(readFileSync(resolve(root, 'legal/approved-license-expressions.json'))).digest('hex')) throw new Error('Reviewed license policy changed: refresh and review dependency snapshots');
  checkNotices(root);
  return pkg.version;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(`Repository metadata OK: ${versions()}`);
