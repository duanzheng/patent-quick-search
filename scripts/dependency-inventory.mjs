import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import console from 'node:console';

// This is a metadata inventory, not a legal opinion or a license-text bundle.
const npmLock = readFileSync('package-lock.json');
const cargoLock = readFileSync('src-tauri/Cargo.lock');
const lock = JSON.parse(npmLock);
const entries = Object.entries(lock.packages).filter(([path]) => path);
const npm = [];
for (let index = 0; index < entries.length; index += 8) {
  const batch = await Promise.all(entries.slice(index, index + 8).map(async ([path, item]) => {
    const name = path.split('node_modules/').at(-1);
    const installed = `${path}/package.json`;
    let license = item.license;
    if (!license && existsSync(installed)) license = JSON.parse(readFileSync(installed, 'utf8')).license;
    if (!license) {
      // curl also honors HTTPS_PROXY in managed development environments.
      const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(item.version)}`;
      const metadata = execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
      license = JSON.parse(metadata).license;
    }
    if (typeof license !== 'string' || !license) throw new Error(`License review required: ${name}@${item.version}`);
    return { path, name, version: item.version, license, development: !!item.dev, optional: !!item.optional };
  }));
  npm.push(...batch);
}
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
const rust = metadata.packages.filter(p => p.source).map(p => ({ name: p.name, version: p.version, license: p.license || null, source: p.source })).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'));
if (rust.some(p => !p.license)) throw new Error('A Rust dependency requires manual license review');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const inventory = { schemaVersion: 1, scope: 'All npm lock entries and Cargo resolved packages, including development and target-specific dependencies. Metadata only; platform system libraries are not included.', lockfiles: { npmSha256: sha256(npmLock), cargoSha256: sha256(cargoLock) }, npm, rust };
writeFileSync('doc/dependency-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log(`Inventoried ${npm.length} npm entries and ${rust.length} Rust packages`);
