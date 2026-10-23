import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import console from 'node:console';

// Regeneration tool only. Ordinary CI validates the committed snapshot offline.
// cargo-about 0.9.2 selects the complete graph for our three release targets.
// Generic SPDX fallback templates are NOT substituted for upstream copyright texts.
const hash = value => createHash('sha256').update(value).digest('hex');
const about = JSON.parse(execFileSync('cargo', ['about', 'generate', '--offline', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--config', 'legal/about.toml', '--format', 'json'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const records = new Map();
const packages = [];
function collectFile(path, origin, member) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
  if (text.includes('\0') || text.length > 2 * 1024 * 1024) throw new Error(`Invalid license text: ${origin}`);
  const sha256 = hash(text);
  if (!records.has(sha256)) records.set(sha256, { sha256, text, origins: new Set(), packages: new Set() });
  const record = records.get(sha256);record.origins.add(origin);record.packages.add(member);
  return { sha256, substantive: text.length > 400 && /permission is hereby|redistribution and use|terms and conditions|Mozilla Public|permission to use|provided.*as.is|you may use|you may.*distribut/is.test(text) };
}
function harvest(directory, member, origin, extra = []) {
  const paths = [];
  const walk = path => {
    if (statSync(path).isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
    else if (statSync(path).isFile()) paths.push(path);
  };
  for (const name of readdirSync(directory).sort()) if (/^(licen[cs]e|copying|notice|copyright|unlicense)/i.test(name)) walk(join(directory, name));
  for (const path of extra) if (existsSync(path) && statSync(path).isFile()) paths.push(path);
  return [...new Set(paths)].map(path => collectFile(path, `${origin}#${relative(directory, path).split('\\').join('/')}`, member));
}
const supplements = JSON.parse(readFileSync('legal/upstream-license-sources.json', 'utf8'));
for (const item of supplements) if (hash(readFileSync(join('legal', item.file))) !== item.sha256 || !/\/([0-9a-f]{40})\//.test(item.url)) throw new Error('Supplemental upstream license provenance changed');
for (const { package: pkg } of about.crates) {
  if (!pkg.source) continue;
  const member = `cargo:${pkg.name}@${pkg.version}`;
  const source = `https://crates.io/api/v1/crates/${pkg.name}/${encodeURIComponent(pkg.version)}/download`;
  const directory = dirname(pkg.manifest_path);
  const extra = about.licenses.filter(l => l.source_path && l.used_by.some(u => u.crate.id === pkg.id)).map(l => l.source_path).filter(path => !relative(directory, path).startsWith('..'));
  const files = harvest(directory, member, source, extra);
  if (!files.some(f => f.substantive)) {
    for (const item of supplements.filter(i => i.packages.includes(pkg.name))) {
      // A supplemental file is accepted only from the exact published crate VCS commit.
      const vcs = JSON.parse(readFileSync(join(directory, '.cargo_vcs_info.json'), 'utf8'));
      if (item.commit === vcs.git.sha1) files.push(collectFile(join('legal', item.file), item.url, member));
    }
  }
  let declaredMitTerms = false;
  if (!files.some(f => f.substantive) && /\bMIT\b/.test(pkg.license) && !pkg.license.includes('AND') && files.length) {
    // Some published objc2 workspace revisions declare MIT and only link to it.
    // Preserve that exact upstream declaration, authors and full referenced terms;
    // never invent a copyright holder/year or leave SPDX template placeholders.
    files.push(collectFile('legal/mit-permission-terms.txt', 'https://spdx.org/licenses/MIT.html', member));
    declaredMitTerms = true;
  }
  let declaredMplTerms = false;
  if (!files.some(f => f.substantive) && pkg.license === 'MPL-2.0' && files.length) {
    files.push(collectFile('legal/mpl-2.0.txt', 'https://www.mozilla.org/MPL/2.0/', member));
    declaredMplTerms = true;
  }
  if (!files.some(f => f.substantive)) throw new Error(`Missing actual copyright/license text: ${member}`);
  packages.push({ id: member, license: pkg.license, source, repository: pkg.repository, authors: pkg.authors, declaredMitTerms, declaredMplTerms, texts: [...new Set(files.map(f => f.sha256))].sort() });
}
const npmPaths = Object.entries(lock.packages).filter(([path, pkg]) => path && !pkg.dev).map(([path]) => path);
// Include the build tools' runtime helpers/polyfill notices conservatively as well.
for (const name of ['vite', 'rollup', 'esbuild', '@vitejs/plugin-react']) npmPaths.push(`node_modules/${name}`);
for (const path of [...new Set(npmPaths)].sort()) {
  const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  const member = `npm:${pkg.name}@${pkg.version}`;
  const source = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz`;
  const files = harvest(path, member, source);
  if (!files.some(f => f.substantive)) throw new Error(`Missing npm license text: ${member}`);
  packages.push({ id: member, license: pkg.license, source, texts: [...new Set(files.map(f => f.sha256))].sort() });
}
packages.sort((a, b) => a.id.localeCompare(b.id, 'en'));
const blocks = [...records.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
let text = 'THIRD-PARTY LICENSES AND NOTICES\n\n';
text += 'This file preserves upstream license, copyright and NOTICE texts for the locked macOS/Windows dependency graph, including build dependencies and frontend runtime helpers conservatively. For packages whose original notice only references MIT or MPL-2.0, the exact declaration and published authors are retained together with the full referenced permission terms; these exceptions are marked explicitly below and no copyright attribution is invented. Dependencies are unmodified. Each package links to its exact version source archive. For MPL-2.0 covered files, source is available at that archive; the license and this source-availability notice accompany the binaries. System-provided frameworks, WebView2 and Windows/macOS SDKs remain subject to their vendors\' terms.\n\n';
for (const pkg of packages) text += `${pkg.id}\nDeclared license: ${pkg.license}\nExact source: ${pkg.source}\n${pkg.authors?.length ? `Published authors: ${pkg.authors.join('; ')}\n` : ''}${pkg.declaredMitTerms || pkg.declaredMplTerms ? 'Text exception: upstream references its license without the full text; full referenced terms supplied.\n' : ''}Text SHA-256: ${pkg.texts.join(', ')}\n\n`;
for (const record of blocks) text += `\n${'='.repeat(72)}\nText SHA-256: ${record.sha256}\nApplies to: ${[...record.packages].sort().join(', ')}\nSources:\n${[...record.origins].sort().join('\n')}\n${'-'.repeat(72)}\n${record.text}\n`;
writeFileSync('THIRD_PARTY_NOTICES.txt', text);
const manifest = { schemaVersion: 1, generator: 'cargo-about 0.9.2 + scripts/generate-notices.mjs', targets: ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'x86_64-pc-windows-msvc'], npmLockSha256: hash(readFileSync('package-lock.json')), cargoLockSha256: hash(readFileSync('src-tauri/Cargo.lock')), noticesSha256: hash(text), packages, textCount: blocks.length };
writeFileSync('legal/notice-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Preserved ${blocks.length} license/notice texts for ${packages.length} packages`);
