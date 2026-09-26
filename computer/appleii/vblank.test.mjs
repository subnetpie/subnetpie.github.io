import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IOManager} from './io_manager.js';
import {Memory} from './memory.js';
import {W65C02S} from './w65c02s.js';

function machine(start = 0) {
  let cycles = start;
  const memory = new Memory(new Uint8Array(8192), new Uint8Array(8192));
  const display = new Proxy({}, {get: () => () => {}});
  new IOManager(memory, {key: 0, strobe() {}}, display, display,
    display, display, () => {}, {}, () => cycles);
  const cpu = new W65C02S(memory);
  return {memory, cpu, at(n) {cycles = n;}, cycles: () => cycles,
    step() {cycles += cpu.step();}};
}

test('IIe RDVBLBAR follows NTSC CPU cycles with active-low blanking', () => {
  const m = machine();
  for(const [cycle, expected] of [[0,128],[12479,128],[12480,0],[17029,0],
    [17030,128],[29510,0],[34060,128]]) {
    m.at(cycle);
    assert.equal(m.memory.read(0xc019), expected);
    // Reads must not advance the video clock independently of CPU time.
    for(let i = 0; i < 100; i++) assert.equal(m.memory.read(0xc019), expected);
  }
});

for(const start of [0, 13000]) {
  test(`Total Replay VBL polling loop completes starting at cycle ${start}`, () => {
    const m = machine(start);
    // The uploaded Total Replay v6.1 image executes this loop at $FF05:
    // LDA $C019 / BPL -5 / BIT $C019 / BMI -5.
    m.memory._main.set([0xad,0x19,0xc0,0x10,0xfb,0x2c,0x19,0xc0,0x30,0xfb], 0x800);
    m.cpu.reset(); m.cpu.register.pc = 0x800;
    while(m.cycles() < start + 34060 && m.cpu.register.pc !== 0x80a) m.step();
    assert.equal(m.cpu.register.pc, 0x80a, 'must exit both halves of the VBL wait');
    assert.equal(m.memory.read(0xc019), 0);
  });
}
