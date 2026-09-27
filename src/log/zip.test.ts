import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from './zip';

const enc = new TextEncoder();

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('hello'))).toBe(0x3610a686);
  });

  it('writes an archive that python zipfile can read and verify', () => {
    const zip = createZip([
      { name: 'protokolle.json', data: enc.encode('{"a":1}') },
      { name: 'aufnahmen/ü-test.wav', data: new Uint8Array([0, 1, 2, 3, 255]) },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'test.zip');
    writeFileSync(file, zip);
    const script =
      'import sys, zipfile\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(sorted(z.namelist()), z.read("protokolle.json").decode())';
    const out = execFileSync('python3', ['-c', script, file], { encoding: 'utf8' }).trim();
    expect(out).toBe(`['aufnahmen/ü-test.wav', 'protokolle.json'] {"a":1}`);
  });
});
