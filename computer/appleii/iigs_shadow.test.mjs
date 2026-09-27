import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsMemory} from './iigs_memory.js';

function bus() {
  const legacy = {
    _aux: new Uint8Array(0x10000),
    read: () => 0,
    write() {}
  };
  return new IIgsMemory(legacy, null);
}

test('bank 01 SHR writes shadow when SHR shadowing is enabled', () => {
  const m = bus();
  m.write(0xc035, 0x00);
  m.write(0x012000, 0x5a);
  m.write(0x019d00, 0x36);
  assert.equal(m.read(0xe12000), 0x5a);
  assert.equal(m.read(0xe19d00), 0x36);
});

test('bank 01 hires page 1 shadows even when SHR shadowing is inhibited', () => {
  const m = bus();
  m.write(0xc035, 0x08); // inhibit SHR; hires page 1 and auxiliary hires still enabled
  m.write(0x012000, 0xa5);
  assert.equal(m.read(0xe12000), 0xa5);
});

test('bank 01 hires page 1 does not shadow when both paths are inhibited', () => {
  const m = bus();
  m.write(0xc035, 0x1a); // inhibit SHR, hires page 1, and auxiliary hires
  m.write(0x012000, 0xa5);
  assert.equal(m.read(0x012000), 0xa5);
  assert.equal(m.read(0xe12000), 0);
});

test('bank 01 hires page 2 shadows when SHR shadowing is inhibited', () => {
  const m = bus();
  m.write(0xc035, 0x08); // SHR inhibited; page 2 and auxiliary hires enabled
  m.write(0x014000, 0x6c);
  assert.equal(m.read(0x014000), 0x6c);
  assert.equal(m.read(0xe14000), 0x6c);
});

test('bank 01 hires page 2 does not shadow when both paths are inhibited', () => {
  const m = bus();
  m.write(0xc035, 0x1c); // inhibit SHR, hires page 2, and auxiliary hires
  m.write(0x014000, 0x6c);
  assert.equal(m.read(0x014000), 0x6c);
  assert.equal(m.read(0xe14000), 0);
});
