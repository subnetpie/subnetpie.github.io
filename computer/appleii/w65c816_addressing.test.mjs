import assert from 'node:assert/strict';
import {test} from 'node:test';
import {W65C816Addressing} from './w65c816_addressing.js';

function machine(operands = [], state = {}) {
  const bytes = new Map(operands.map((v, i) => [0x8000 + i, v]));
  const cpu = {
    r: {d: 0, db: 0, x: 0, y: 0, s: 0x01ff, e: false, ...state},
    mem: {
      read(addr) { return bytes.get(addr & 0xffffff) ?? 0; },
      write(addr, value) { bytes.set(addr & 0xffffff, value & 0xff); },
    },
    pc: 0x8000,
    fetch8() { return this.mem.read(this.pc++); },
    fetch16() { return this.fetch8() | (this.fetch8() << 8); },
    fetch24() { return this.fetch16() | (this.fetch8() << 16); },
  };
  return {bus: new W65C816Addressing(cpu), cpu, bytes};
}

test('ALX adds X across the 24-bit bank boundary, without DB', () => {
  const {bus, cpu} = machine([0xff, 0xff, 0x12], {x: 1, db: 0x98});
  assert.equal(bus.ALX(), 0x130000);
  assert.equal(cpu.pc, 0x8003);
});

test('normal 16-bit read/write crosses a 24-bit bank boundary', () => {
  const {bus, bytes} = machine();
  bus.write16(0x12ffff, 0x1234);
  assert.equal(bytes.get(0x12ffff), 0x34);
  assert.equal(bytes.get(0x130000), 0x12);
  assert.equal(bus.read16(0x12ffff), 0x1234);
});

test('E mode direct page wraps when D low byte is zero', () => {
  const {bus, bytes} = machine([], {e: true, d: 0x0100});
  bytes.set(0x01ff, 0x78);
  bytes.set(0x0100, 0x56);
  assert.equal(bus.read16Direct(0x01ff), 0x5678);
});

test('MAME direct-X pointer high-byte wrap when E and D low byte nonzero', () => {
  const {bus, bytes} = machine([], {e: true, d: 0x0101});
  bytes.set(0x02ff, 0x22);
  bytes.set(0x0200, 0x11);
  assert.equal(bus.read16DirectX(0x02ff), 0x1122);
});

test('direct and absolute-indexed address penalties are recorded', () => {
  const {bus} = machine([0x03, 0xff, 0x01], {d: 0x0101, db: 0x09, x: 1});
  assert.equal(bus.D(), 0x0104);
  assert.equal(bus.extraCycles, 1);
  assert.equal(bus.AX(), 0x090200);
  assert.equal(bus.extraCycles, 2);
  bus.begin();
  assert.equal(bus.extraCycles, 0);
});
