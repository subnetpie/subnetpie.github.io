import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsMemory} from './iigs_memory.js';
import {W65C816} from './w65c816.js';

for(const size of [0x20000, 0x40000]) {
  test(`IIgs ${size / 1024}K ROM supplies the bank-00 reset vector`, () => {
    const legacy = {
      _aux: new Uint8Array(0x10000),
      read: () => 0x00,
      write: () => {}
    };
    const bus = new IIgsMemory(legacy, null);
    const rom = new Uint8Array(size);
    rom.fill(0xea);
    rom[size - 4] = 0x34;
    rom[size - 3] = 0x12;
    bus.loadROM(rom);

    assert.equal(bus.read_word(0xfffffc), 0x1234, 'ROM contents at $FF:FFFC');
    assert.equal(bus.read_word(0x00fffc), 0x1234, 'reset vector visible at $00:FFFC');
    assert.equal(new W65C816(bus).register.pc, 0x1234, 'CPU starts at ROM reset entry');
  });
}
