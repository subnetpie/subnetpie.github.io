import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parse2MG} from './disk_2mg.js';

function fixture(format, length, {offset = 64, headerLength = 64,
    declaredLength = length, blocks = format === 1 ? length / 512 : 0,
    flags = 0, trailing = 0} = {}) {
  const bytes = new Uint8Array(Math.max(offset + length + trailing, 64));
  const view = new DataView(bytes.buffer);
  bytes.set([0x32, 0x49, 0x4d, 0x47]);
  view.setUint16(0x08, headerLength, true);
  view.setUint16(0x0a, 1, true);
  view.setUint32(0x0c, format, true);
  view.setUint32(0x10, flags, true);
  view.setUint32(0x14, blocks, true);
  view.setUint32(0x18, offset, true);
  view.setUint32(0x1c, declaredLength, true);
  bytes.fill(0xa5, offset, offset + length);
  return bytes;
}

test('ProDOS 2MG exposes only its declared blocks, without header or comment', () => {
  const src = fixture(1, 1024, {offset: 96, trailing: 20, flags: 0x8000017f});
  const disk = parse2MG(src);
  assert.equal(disk.kind, 'prodos-order');
  assert.equal(disk.blocks, 2);
  assert.equal(disk.data.length, 1024);
  assert.equal(disk.data[0], 0xa5);
  assert.equal(disk.writeProtected, true);
  assert.equal(disk.volume, 127);
  assert.equal(disk.data.buffer, src.buffer);
});

test('DOS-order and nibble images retain their distinct formats', () => {
  assert.equal(parse2MG(fixture(0, 143360)).kind, 'dos-order');
  assert.equal(parse2MG(fixture(2, 6656)).kind, 'nibble');
});

test('older 52-byte headers and WOOF zero-length ProDOS declarations', () => {
  const src = fixture(1, 512, {headerLength: 52, declaredLength: 0, blocks: 1});
  assert.equal(parse2MG(src).data.length, 512);
});

test('rejects invalid signature, header, version, format and data range', () => {
  const broken = fixture(1, 512);
  broken[0] = 0;
  assert.throws(() => parse2MG(broken), /signature/);
  const short = fixture(1, 512);
  new DataView(short.buffer).setUint16(0x08, 20, true);
  assert.throws(() => parse2MG(short), /header length/);
  const version = fixture(1, 512);
  new DataView(version.buffer).setUint16(0x0a, 2, true);
  assert.throws(() => parse2MG(version), /version/);
  assert.throws(() => parse2MG(fixture(3, 512)), /format/);
  const range = fixture(1, 512);
  new DataView(range.buffer).setUint32(0x18, 1200, true);
  assert.throws(() => parse2MG(range), /range/);
});

test('rejects inconsistent ProDOS block counts', () => {
  assert.throws(() => parse2MG(fixture(1, 512, {blocks: 2})), /block count/);
  assert.throws(() => parse2MG(fixture(1, 513, {blocks: 0})), /block count/);
});

test('respects Uint8Array byteOffset', () => {
  const source = fixture(1, 512);
  const wrapped = new Uint8Array(source.length + 4);
  wrapped.set(source, 4);
  assert.equal(parse2MG(wrapped.subarray(4)).data[0], 0xa5);
});
