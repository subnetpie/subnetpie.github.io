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
  d.osc[0].freq=0x100; d.osc[0].volume=255; d.osc[0].wave=1; d.osc[0].control=0;
  d.renderSample();
  assert.equal(d.lastSample,64);
});

test('DOC zero terminator halts one-shot oscillator and raises IRQ',()=>{
  let irq=false; const d=new IIgsDOC(v=>irq=v);
  d.ram[0x200]=0;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:2,control:0x0e,accumulator:0});
  d.renderSample();
  assert.ok(d.osc[0].control&1);
  assert.equal(irq,true);
  assert.equal(d.readRegister(0xe1),0);
  assert.equal(irq,false);
});

test('DOC swap mode starts the paired oscillator at terminator',()=>{
  const d=new IIgsDOC(); d.enabledOscillators=2;
  d.ram[0x100]=0; d.ram[0x200]=0x90;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:1,control:0x04,accumulator:0});
  Object.assign(d.osc[1],{freq:0x100,volume:255,wave:2,control:1,accumulator:99});
  d.renderSample();
  assert.ok(d.osc[0].control&1);
  assert.equal(d.osc[1].control&1,0);
  assert.equal(d.osc[1].accumulator,0);
});


test('DOC master clock preserves fractional time across CPU instructions',()=>{
  const d=new IIgsDOC();
  d.enabledOscillators=1;
  d.ram[0x100]=0x90;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:1,control:0,accumulator:0});
  const threshold=2800000*8;
  const cycles=Math.floor(threshold/d.masterHz);
  assert.equal(d.tick(cycles,2800000),0);
  assert.equal(d.osc[0].accumulator,0);
  assert.equal(d.tick(1,2800000),1);
  assert.equal(d.osc[0].accumulator,0x100);
});

test('DOC output rate falls as more oscillators are enabled',()=>{
  const a=new IIgsDOC(), b=new IIgsDOC();
  a.enabledOscillators=1; b.enabledOscillators=2;
  const cycles=1000;
  assert.ok(a.tick(cycles,2800000) > b.tick(cycles,2800000));
});


test('DOC resolution selects and aligns larger wave tables',()=>{
  const d=new IIgsDOC();
  // 1K table (resolution 2): wave pointer $07 aligns to $0400.
  d.ram[0x401]=0xd0;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:0x07,control:0,size:2,accumulator:0});
  d.renderSample();
  assert.equal(d.lastSample,80);
});

test('DOC resolution permits indexes beyond the old 256-byte window',()=>{
  const d=new IIgsDOC();
  d.ram[0x601]=0xe0;
  Object.assign(d.osc[0],{freq:0x20100,volume:255,wave:0x04,control:0,size:2,accumulator:0});
  d.renderSample();
  assert.equal(d.lastSample,96);
});

test('DOC loop mode restarts accumulator when a zero terminator is reached',()=>{
  const d=new IIgsDOC();
  d.ram[0x101]=0;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:1,control:0x02,size:0,accumulator:0});
  d.renderSample();
  assert.equal(d.osc[0].control&1,0);
  assert.equal(d.osc[0].accumulator,0);
});


test('DOC queues simultaneous oscillator IRQs until each is acknowledged',()=>{
  let irq=false; const d=new IIgsDOC(v=>irq=v); d.enabledOscillators=2;
  d.ram[0x101]=0; d.ram[0x201]=0;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:1,control:0x08,size:0,accumulator:0});
  Object.assign(d.osc[1],{freq:0x100,volume:255,wave:2,control:0x08,size:0,accumulator:0});
  d.renderSample();
  assert.equal(irq,true);
  assert.equal(d.readRegister(0xe1),0);
  assert.equal(irq,true);
  assert.equal(d.readRegister(0xe1),2);
  assert.equal(irq,false);
  assert.equal(d.readRegister(0xe1),0xff);
});

test('DOC routes even and odd oscillators to separate output buses',()=>{
  const d=new IIgsDOC(); d.enabledOscillators=2;
  d.ram[0x101]=0xc0; d.ram[0x201]=0xa0;
  Object.assign(d.osc[0],{freq:0x100,volume:255,wave:1,control:0,size:0,accumulator:0});
  Object.assign(d.osc[1],{freq:0x100,volume:255,wave:2,control:0,size:0,accumulator:0});
  d.renderSample();
  assert.equal(d.lastLeft,64);
  assert.equal(d.lastRight,32);
  assert.equal(d.lastSample,48);
});
