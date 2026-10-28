// The material images' checks (modules/masters/material-images.js): file type from its bytes, code / kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniff, target } from '../src/modules/masters/material-images.js';

test('knows the file by its first bytes, not its name', () => {
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(sniff(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(sniff(Buffer.from('<svg onload=alert(1)>')), null);
  assert.equal(sniff(Buffer.alloc(0)), null);
});

test('takes a positive material code and a known kind only', () => {
  assert.deepEqual(target('22600134', 'basket'), { code: 22600134, kind: 'basket' });
  assert.deepEqual(target('5', undefined), { code: 5, kind: undefined });
  for (const bad of ['0', '-1', '1.5', 'abc', '1e3']) assert.throws(() => target(bad, 'artwork'), /material code/);
  assert.throws(() => target('5', 'logo'), /image kind/);
});
