import process from 'node:process';
import console from 'node:console';
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Header inspection only: this never loads an executable or claims Windows runtime acceptance.
export function inspectWindowsPayload(input, { expectGui = true } = {}) {
  const bytes = Buffer.from(input);
  const fail = () => { throw new Error('Expected an x86_64 Windows PE32+ executable payload'); };
  if (bytes.length < 64 || bytes.readUInt16LE(0) !== 0x5a4d) fail();
  const pe = bytes.readUInt32LE(0x3c);
  if (pe < 64 || pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x4550) fail();
  const machine = bytes.readUInt16LE(pe + 4), optionalSize = bytes.readUInt16LE(pe + 20), flags = bytes.readUInt16LE(pe + 22);
  if (machine !== 0x8664 || optionalSize < 112 || pe + 24 + optionalSize > bytes.length || !(flags & 2) || (flags & 0x2000)) fail();
  const optional = pe + 24;
  if (bytes.readUInt16LE(optional) !== 0x20b) fail();
  const subsystem = bytes.readUInt16LE(optional + 68);
  if (expectGui && subsystem !== 2) throw new Error('Release payload must use the Windows GUI subsystem');
  return { architecture: 'x86_64', machine, format: 'PE32+', subsystem };
}
export function verifyWindowsArtifacts(projectRoot, { includeMsi = false, output } = {}) {
  const root = resolve(projectRoot), target = join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release');
  const payload = join(target, 'patent-quick-search.exe');
  const metadata = inspectWindowsPayload(readFileSync(payload));
  const reportFile = path => ({ path: relative(root, path).split('\\').join('/'), bytes: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
  const scan = (kind, suffix) => {
    const directory = join(target, 'bundle', kind);
    const matches = existsSync(directory) ? readdirSync(directory).filter(name => name.toLowerCase().endsWith(suffix)).map(name => join(directory, name)) : [];
    if (!matches.length || matches.some(path => !statSync(path).isFile() || !statSync(path).size)) throw new Error(`Missing ${kind} installer output`);
    return matches.map(reportFile);
  };
  // NSIS may have an x86 bootstrapper even when the installed application is x64.
  const installers = [...scan('nsis', '.exe'), ...(includeMsi ? scan('msi', '.msi') : [])];
  const manifest = { schemaVersion: 1, createdAtUtc: new Date().toISOString(), target: 'x86_64-pc-windows-msvc', profile: 'release', payload: { ...reportFile(payload), ...metadata }, installers, runtimeVerified: false, cleanInstallVerified: false, credentialsVerified: false, realApiVerified: false };
  const destination = output ? resolve(output) : join(root, 'src-tauri/target/windows-verification/artifacts.json');
  mkdirSync(dirname(destination), { recursive: true });writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('node scripts/verify-windows-artifacts.mjs [--include-msi] [--output <manifest.json>]');
  else {
    try { const at = args.indexOf('--output');const result = verifyWindowsArtifacts(resolve(dirname(fileURLToPath(import.meta.url)), '..'), { includeMsi: args.includes('--include-msi'), output: at >= 0 ? args[at + 1] : undefined });console.log(JSON.stringify(result, null, 2)); }
    catch (error) { console.error(error.message);process.exitCode = 1; }
  }
}
