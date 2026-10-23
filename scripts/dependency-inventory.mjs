import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { readPnpmLock } from './pnpm-metadata.mjs';
import { dependencySpecifiersHash } from './dependency-specifiers.mjs';

// Metadata inventory only. Unknown/missing license declarations require review.
const pnpmLock = readFileSync('pnpm-lock.yaml');
const cargoLock = readFileSync('src-tauri/Cargo.lock');
const { packages } = readPnpmLock();
const npm = [];
const policyBytes = readFileSync('legal/approved-license-expressions.json');
const policy = JSON.parse(policyBytes);
for (let index = 0; index < packages.length; index += 8) {
  const batch = await Promise.all(packages.slice(index, index + 8).map(async item => {
    const url = 'https://registry.npmjs.org/' + encodeURIComponent(item.name) + '/' + encodeURIComponent(item.version);
    const metadata = JSON.parse(execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
    if (typeof metadata.license !== 'string' || !policy.npm.includes(metadata.license)) throw new Error('License review required: ' + item.key);
    return { ...item, license: metadata.license };
  }));
  npm.push(...batch);
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const rust = metadata.packages.filter(p => p.source).map(p => ({ name: p.name, version: p.version, license: p.license || null, source: p.source })).sort((a, b) => (a.name + '@' + a.version).localeCompare(b.name + '@' + b.version, 'en'));
if (rust.some(p => !policy.rust.includes(p.license))) throw new Error('A Rust dependency requires manual license review');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const inventory = { schemaVersion: 2, scope: 'All unique pnpm registry package identities and Cargo resolved packages, including development and optional platform dependencies. Metadata only; platform system libraries are not included.', lockfiles: { pnpmSha256: sha256(pnpmLock), cargoSha256: sha256(cargoLock) }, licensePolicySha256: sha256(policyBytes), manifestDependenciesSha256: dependencySpecifiersHash(JSON.parse(readFileSync('package.json'))), npm, rust };
writeFileSync('doc/dependency-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log('Inventoried ' + npm.length + ' pnpm packages and ' + rust.length + ' Rust packages');
