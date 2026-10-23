import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function checkNotices(root = '.') {
  const read = path => readFileSync(resolve(root, path));
  const manifest = JSON.parse(read('legal/notice-manifest.json'));
  if (manifest.schemaVersion !== 2 || JSON.stringify(manifest.targets) !== JSON.stringify(['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc'])) throw new Error('Invalid notice target coverage');
  if (manifest.pnpmLockSha256 !== hash(read('pnpm-lock.yaml')) || manifest.cargoLockSha256 !== hash(read('src-tauri/Cargo.lock'))) throw new Error('License texts are stale: regenerate third-party notices');
  const notice = read('THIRD_PARTY_NOTICES.txt');
  if (manifest.noticesSha256 !== hash(notice) || notice.length < 10000 || !manifest.textCount) throw new Error('Third-party license text missing or modified');
  const inventory = JSON.parse(read('doc/dependency-inventory.json'));
  const expectedNpm = inventory.npm.filter(pkg => !pkg.development).map(pkg => `npm:${pkg.name}@${pkg.version}`);
  if (expectedNpm.some(id => !manifest.packages.some(p => p.id === id))) throw new Error('Frontend runtime license coverage missing');
  if (!manifest.packages.some(p => p.id.startsWith('cargo:')) || manifest.packages.some(p => !p.texts.length || !p.source.startsWith('https://'))) throw new Error('Invalid package/source coverage in notices');
  for (const pkg of manifest.packages) for (const sha of pkg.texts) if (!notice.includes(`Text SHA-256: ${sha}`)) throw new Error('Referenced license text is absent');
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
  if (tauri.bundle.resources['../THIRD_PARTY_NOTICES.txt'] !== 'THIRD_PARTY_NOTICES.txt' || tauri.bundle.resources['../LICENSE'] !== 'LICENSE') throw new Error('License resources must be bundled into the application');
  return manifest;
}
