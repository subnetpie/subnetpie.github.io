import assert from 'node:assert/strict';
import {test} from 'node:test';
import {W65C816} from './w65c816.js';

const MODES = [
  ['E', true, true, true],
  ['M0X0', false, false, false],
  ['M0X1', false, false, true],
  ['M1X0', false, true, false],
  ['M1X1', false, true, true],
];

function fixture(opcode, e, m, x, operands = [0, 0, 0]) {
  const bytes = new Map([[0xfffc, 0x00], [0xfffd, 0x80],
    [0x8000, opcode], [0x8001, operands[0]],
    [0x8002, operands[1]], [0x8003, operands[2]]]);
  const bus = {
    read(addr) { return bytes.get(addr & 0xffffff) ?? 0; },
    write(addr, value) { bytes.set(addr & 0xffffff, value & 0xff); },
    read_word(addr) { return this.read(addr) | (this.read(addr + 1) << 8); },
  };
  const cpu = new W65C816(bus);
  cpu.register.e = e;
  cpu.register.p = (cpu.register.p & ~0x30) | (m ? 0x20 : 0) | (x ? 0x10 : 0);
  cpu.register.s = e ? 0x01ff : 0x2000;
  return {cpu, bytes};
}

for (const [mode, e, m, x] of MODES) {
  test(`all 256 opcodes decode in ${mode}`, () => {
    const missing = [];
    const faults = [];
    for (let op = 0; op < 256; op++) {
      const {cpu} = fixture(op, e, m, x);
      try {
        const cycles = cpu.step();
        if (!Number.isFinite(cycles) || cycles < 1)
          faults.push(`$${op.toString(16).padStart(2, '0')}: cycles=${cycles}`);
      } catch (error) {
        const tag = `$${op.toString(16).padStart(2, '0')}`;
        if (/W65C816 unimplemented opcode/.test(String(error))) missing.push(tag);
        else faults.push(`${tag}: ${error.message}`);
      }
    }
    assert.deepEqual(missing, [], `${mode}: missing decoder cases`);
    assert.deepEqual(faults, [], `${mode}: implemented cases must execute once`);
  });
}

test('LDA absolute long,X carries across a bank in 8-bit M mode', () => {
  const {cpu, bytes} = fixture(0xbf, false, true, true, [0xff, 0xff, 0x12]);
  cpu.register.x = 1;
  cpu.register.a = 0xab00;
  bytes.set(0x130000, 0x80);
  assert.equal(cpu.step(), 5);
  assert.equal(cpu.register.a, 0xab80);
  assert.equal(cpu.register.pc, 0x8004);
  assert.ok(cpu.register.p & 0x80);
});

test('LDA absolute long,X reads both bytes in 16-bit M mode', () => {
  const {cpu, bytes} = fixture(0xbf, false, false, false, [0xff, 0xff, 0x12]);
  cpu.register.x = 1;
  bytes.set(0x130000, 0x34);
  bytes.set(0x130001, 0x12);
  assert.equal(cpu.step(), 6);
  assert.equal(cpu.register.a, 0x1234);
  assert.equal(cpu.register.pc, 0x8004);
});
