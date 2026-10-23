import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assemble, targets } from './release-artifacts.mjs';

// Synthetic bytes exercise staging integrity only; these are never installers.
function fixture(root) {
  const source = join(root, 'downloaded');mkdirSync(source);
  for (const [target, policy] of Object.entries(targets)) {
    const directory = join(source, `bundle-${target}`);mkdirSync(directory);
    const files = policy.extensions.map(ext => {
      const name = `patent-quick-search_0.1.0_${target}${ext}`;const bytes = 'synthetic';
      writeFileSync(join(directory, name), bytes);
      return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, version: '0.1.0', commit: 'a'.repeat(40), target, signing: policy.signing, runtimeVerified: false, files }));
  }
  return source;
}
for (const scenario of ['complete', 'missing-platform', 'missing-file', 'tampered-file', 'wrong-commit', 'extra-private-file', 'wrong-signing']) test(`release assembly: ${scenario}`, () => {
  const root = mkdtempSync(join(tmpdir(), 'patent-artifacts-'));
  try {
    const source = fixture(root);const directory = join(source, 'bundle-aarch64-apple-darwin');
    const manifest = join(directory, 'manifest.json');
    if (scenario === 'missing-platform') rmSync(directory, { recursive: true });
    if (scenario === 'missing-file') rmSync(join(directory, 'patent-quick-search_0.1.0_aarch64-apple-darwin.dmg'));
    if (scenario === 'tampered-file') writeFileSync(join(directory, 'patent-quick-search_0.1.0_aarch64-apple-darwin.dmg'), 'tampered!');
    if (scenario === 'extra-private-file') writeFileSync(join(directory, 'credentials-v1.json'), 'synthetic');
    if (scenario === 'wrong-signing') writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('ad-hoc; not notarized', 'signed'));
    const run = () => assemble(source, join(root, 'release'), '0.1.0', (scenario === 'wrong-commit' ? 'b' : 'a').repeat(40));
    if (scenario === 'complete') { assert.equal(run().length, 3);assert.equal(readFileSync(join(root, 'release/SHA256SUMS'), 'utf8').trim().split('\n').length, 5); }
    else assert.throws(run);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
