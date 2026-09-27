import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsDOC} from './iigs_doc.js';

test('DOC oscillator register pages retain frequency volume wave and control',()=>{
  const d=new IIgsDOC();
  d.writeRegister(0x00,0x34); d.writeRegister(0x20,0x12);
  d.writeRegister(0x40,0x80); d.writeRegister(0x60,0x22);
  d.writeRegister(0x80,0x08);
  assert.equal(d.osc[0].freq,0x1234);
  assert.equal(d.readRegister(0x40),0x80);
  assert.equal(d.readRegister(0x60),0x22);
  assert.equal(d.readRegister(0x80),0x08);
});

test('DOC running oscillator fetches waveform and produces a sample',()=>{
  const d=new IIgsDOC();
  d.ram[0x100]=0xc0;
  d.osc[0].freq=1; d.osc[0].volume=255; d.osc[0].wave=1; d.osc[0].control=0;
  assert.equal(d.tick(1),64);
});

test('DOC zero terminator halts one-shot oscillator and raises IRQ',()=>{
  let irq=false; const d=new IIgsDOC(v=>irq=v);
  d.ram[0x200]=0;
  Object.assign(d.osc[0],{freq:1,volume:255,wave:2,control:0x0e,accumulator:0});
  d.tick(1);
  assert.ok(d.osc[0].control&1);
  assert.equal(irq,true);
  assert.equal(d.readRegister(0xe1),0);
  assert.equal(irq,false);
});

test('DOC swap mode starts the paired oscillator at terminator',()=>{
  const d=new IIgsDOC(); d.enabledOscillators=2;
  d.ram[0x100]=0; d.ram[0x200]=0x90;
  Object.assign(d.osc[0],{freq:1,volume:255,wave:1,control:0x04,accumulator:0});
  Object.assign(d.osc[1],{freq:1,volume:255,wave:2,control:1,accumulator:99});
  d.tick(1);
  assert.ok(d.osc[0].control&1);
  assert.equal(d.osc[1].control&1,0);
  assert.equal(d.osc[1].accumulator,0);
});
