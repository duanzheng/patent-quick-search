import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { verifyDiskImage } from './release-artifacts.mjs';

test('real macOS hdiutil SLA fixture (no executable or production installer)', { skip: process.platform !== 'darwin', timeout: 120000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'patent-native-sla-'));
  const image = join(root, 'fixture.dmg');const mounts = new Set();
  const info = () => execFileSync('hdiutil', ['info', '-plist'], { encoding: 'utf8', timeout: 15000 });
  const attached = () => info().includes(image);
  const run = (args, options = {}) => execFileSync('hdiutil', args, { stdio: 'pipe', timeout: 60000, ...options });
  try {
    const volume = join(root, 'volume');const resources = join(volume, 'Fixture.app/Contents/Resources');mkdirSync(resources, { recursive: true });
    const license = readFileSync('LICENSE');
    const legal = [{ name: 'LICENSE', bytes: license }, { name: 'THIRD_PARTY_NOTICES.txt', bytes: Buffer.from('Synthetic notice, not a real application.\n') }].map(file => {
      writeFileSync(join(resources, file.name), file.bytes);
      return { name: file.name, sha256: createHash('sha256').update(file.bytes).digest('hex') };
    });
    run(['create', '-srcfolder', volume, '-fs', 'HFS+', '-format', 'UDZO', '-volname', 'PatentSlaFixture', image]);
    const template = readFileSync('tests/fixtures/dmg-eula-resources.xml', 'utf8').replace('${EULA_FORMAT}', 'TEXT').replace('${EULA_DATA}', license.toString('base64'));
    const xml = join(root, 'sla.xml');writeFileSync(xml, template);
    run(['udifrez', '-xml', xml, '', '-quiet', image]);

    await t.test('closed stdin reproduces attach canceled before mounting', () => {
      const mount = mkdtempSync(join(root, 'eof-'));mounts.add(mount);
      try {
        assert.throws(() => run(['attach', '-readonly', '-nobrowse', '-mountpoint', mount, image], { input: '' }), error => {
          assert.match(error.stderr.toString(), /attach canceled/i);
          assert.match(error.stdout.toString(), /MIT License/);return true;
        });
        assert.equal(attached(), false);
      } finally {
        if (attached()) run(['detach', mount]);
        if (existsSync(mount)) rmdirSync(mount);mounts.delete(mount);
      }
    });
    await t.test('real acknowledgement mounts read-only and verification detaches it', () => {
      verifyDiskImage(image, legal, (command, args, options) => {
        const result = execFileSync(command, args, options);
        if (args[0] === 'attach') {
          const mount = args[args.indexOf('-mountpoint') + 1];mounts.add(mount);
          assert.throws(() => writeFileSync(join(mount, 'must-not-write'), 'test'), error => ['EROFS', 'EACCES', 'EPERM'].includes(error.code));
        } else if (args[0] === 'detach') mounts.delete(args[1]);
        return result;
      });
      assert.equal(attached(), false);
    });
    await t.test('failed resource hash still detaches the actual image', () => {
      assert.throws(() => verifyDiskImage(image, [{ ...legal[0], sha256: '0'.repeat(64) }, legal[1]]), /license resources/);
      assert.equal(attached(), false);
    });
  } finally {
    for (const mount of mounts) if (attached()) run(['detach', mount]);
    if (!attached()) rmSync(root, { recursive: true, force: true });
  }
});
