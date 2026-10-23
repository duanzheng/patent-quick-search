import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const identity = key => {
  const match = /^((?:@[^/]+\/)?[^@]+)@(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(key);
  if (!match) throw new Error('Review non-registry dependency identity: ' + key);
  return { name: match[1], version: match[2] };
};
const baseKey = key => key.split('(')[0];
export function inspectPnpmLock(lock) {
  if (String(lock.lockfileVersion) !== '9.0' || !lock.importers?.['.'] || Object.keys(lock.importers).length !== 1 || !lock.packages || !lock.snapshots) throw new Error('Unsupported pnpm lockfile structure');
  const production = new Set();
  const visited = new Set();
  const visit = (name, reference) => {
    if (typeof reference !== 'string') throw new Error('Unsupported pnpm dependency reference');
    const key = name + '@' + reference;
    if (visited.has(key)) return;
    visited.add(key);
    if (!lock.packages[baseKey(key)] || !lock.snapshots[key]) throw new Error('Incomplete pnpm dependency graph: ' + key);
    production.add(baseKey(key));
    const snapshot = lock.snapshots[key];
    for (const group of ['dependencies', 'optionalDependencies']) for (const [child, version] of Object.entries(snapshot[group] || {})) visit(child, version);
  };
  for (const group of ['dependencies', 'optionalDependencies']) for (const [name, item] of Object.entries(lock.importers['.'][group] || {})) visit(name, item.version);
  const optional = new Map();
  for (const [key, snapshot] of Object.entries(lock.snapshots)) optional.set(baseKey(key), (optional.get(baseKey(key)) ?? true) && !!snapshot.optional);
  const packages = Object.entries(lock.packages).map(([key, item]) => {
    const pkg = identity(key);
    if (!/^(sha512|sha256|sha1)-[A-Za-z0-9+/]+=*$/.test(item.resolution?.integrity || '') || item.resolution.tarball && !item.resolution.tarball.startsWith('https://registry.npmjs.org/')) throw new Error('Review non-registry or unverified dependency: ' + key);
    return { key, ...pkg, development: !production.has(key), optional: optional.get(key) || false };
  }).sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return { lock, packages };
}
export function readPnpmLock(root = '.') {
  return inspectPnpmLock(parse(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')));
}
