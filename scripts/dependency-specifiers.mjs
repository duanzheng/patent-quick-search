import { createHash } from 'node:crypto';

// Root versions do not appear in pnpm-lock.yaml; keep application version checks separate.
export function dependencySpecifiersHash(pkg) {
  const specifiers = Object.fromEntries(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].map(group => [group, Object.fromEntries(Object.entries(pkg[group] || {}).sort(([a], [b]) => a.localeCompare(b, 'en')))]));
  return createHash('sha256').update(JSON.stringify(specifiers)).digest('hex');
}
