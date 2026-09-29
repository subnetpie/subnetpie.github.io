import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsDOC} from './iigs_doc.js';

function voice(options={}) {
  const d=new IIgsDOC();d.enabledOscillators=32;
  d.ram.fill(0xc0,0x100,0x200);
  Object.assign(d.osc[0],{freq:0x200,volume:255,wave:1,control:0,...options});
  return d;
}

test('DOC fetches before phase advance, updates data register and uses fixed mixer gain',()=>{
  const d=voice();d.ram[0x101]=0xa0;
  d.renderSample();assert.equal(d.readRegister(0x60),0xc0);
  assert.equal(d.lastLeft,64*255/2048);
  d.renderSample();assert.equal(d.readRegister(0x60),0xa0);
  assert.equal(d.lastLeft,32*255/2048);
});

test('DOC routing follows channel control bits, independent of voice number',()=>{
  const d=voice({control:0x10});
  Object.assign(d.osc[1],{volume:128,wave:1,control:0});
  d.renderSample();
  assert.equal(d.lastLeft,64*128/2048);
  assert.equal(d.lastRight,64*255/2048);
});

test('DOC adds voices without changing the gain of existing voices; last voice is tripled',()=>{
  const d=voice();d.renderSample();const one=d.lastLeft;
  Object.assign(d.osc[1],{volume:255,wave:1,control:0});
  d.renderSample();assert.equal(d.lastLeft,one*2);
  d.enabledOscillators=2;d.renderSample();assert.equal(d.lastLeft,one*4);
});

test('DOC size bits and resolution bits independently select table and phase shift',()=>{
  const d=voice({wave:7,size:(2<<3)|3,accumulator:513*1024,freq:0});
  d.ram[0x601]=0xd0; // 1K table aligned to $400; shift = 9+3-2 = 10.
  d.renderSample();assert.equal(d.readRegister(0x60),0xd0);
});

test('free-run wraps at table end with fractional phase preserved; one-shot halts',()=>{
  for(const control of [0,2]) {
    const d=voice({control,accumulator:255*512+17,freq:600});
    d.renderSample();
    assert.equal(d.osc[0].control&1,control===2?1:0);
    if(control===0)assert.equal(d.osc[0].accumulator,617);
  }
});

test('zero data halts both free-run and one-shot, with IRQ acknowledgment',()=>{
  for(const control of [8,10]) {
    const d=voice({control});d.ram[0x100]=0;d.renderSample();
    assert.equal(d.osc[0].control&1,1);assert.equal(d.irqPending,true);
    assert.equal(d.readRegister(0xe0),0x41);assert.equal(d.irqPending,false);
  }
});

test('swap mode 3 starts partner; mode 2 odd voice modulates the next voice',()=>{
  const d=voice({control:6});d.ram[0x100]=0;d.osc[1].wave=2;d.ram[0x200]=0x80;
  d.renderSample();assert.equal(d.osc[0].control&1,1);assert.equal(d.osc[1].control&1,0);
  d.osc[1].control=4;d.osc[1].wave=2;d.ram[0x200]=0x40;
  d.osc[2].control=0;d.osc[2].wave=3;d.ram[0x300]=0xc0;
  d.renderSample();assert.equal(d.osc[2].volume,0x40);
  assert.equal(d.lastLeft,64*64/2048);
});

test('even sync voice resets the preceding voice at its table end',()=>{
  const d=voice();d.osc[0].control=1;
  Object.assign(d.osc[1],{wave:1,control:0,accumulator:5000});
  Object.assign(d.osc[2],{wave:1,control:4,accumulator:255*512});
  d.renderSample();assert.equal(d.osc[1].accumulator,0);
});

test('running control writes preserve phase; a halted-to-running edge restarts it',()=>{
  const d=voice({accumulator:1234});d.writeRegister(0xa0,0x10);
  assert.equal(d.osc[0].accumulator,1234);
  d.writeRegister(0xa0,1);d.writeRegister(0xa0,0);
  assert.equal(d.osc[0].accumulator,0);
});

test('CPU halt in swap mode starts partner without an IRQ if newly disabled',()=>{
  const d=voice({control:14});d.writeRegister(0xa0,7);
  assert.equal(d.osc[1].control&1,0);assert.equal(d.irqPending,false);
});

test('IRQ acknowledgment prioritizes oscillator number, not event order',()=>{
  const d=voice();d.irqQueue=[5,2];d.irqPending=true;
  assert.equal(d.readRegister(0xe0),0x45);assert.equal(d.irqPending,true);
  assert.equal(d.readRegister(0xe0),0x4b);assert.equal(d.irqPending,false);
  assert.equal(d.readRegister(0xe0),0xcb);
});

test('DOC scan clock includes two overhead slots and is independent of tick boundaries',()=>{
  const a=voice(),b=voice();let delivered=0,lastTime=-1;
  a.onSample=(l,r,remaining)=>{delivered++;const time=2800000-remaining;assert.ok(time>lastTime);lastTime=time;};
  const count=a.tick(2800000);
  assert.equal(count,Math.floor(7159090/(8*34)));assert.equal(delivered,count);
  for(let i=0;i<1000;i++)b.tick(2800);
  assert.equal(a.masterAccum,b.masterAccum);
  assert.equal(a.osc[0].accumulator,b.osc[0].accumulator);
});

test('IIgs SOUNDCTL exposes four-bit system volume independently of DOC access flags',()=>{
  const d=new IIgsDOC();
  d.setControl(0x2b);
  assert.equal(d.getVolume(),0x0b);
  assert.equal(d.getControl(),0x3f);
});

test('IIgs SOUNDCTL auto-increment advances only when bit 5 is enabled',()=>{
  const d=new IIgsDOC();
  d.setAddressLow(0x10); d.setAddressHigh(0x12);
  d.setControl(0x4f); d.writeData(0xaa);
  assert.equal(d.address,0x1210);
  d.setControl(0x6f); d.writeData(0xbb);
  assert.equal(d.address,0x1211);
});


test('DOC RAM access is separate from registers and SOUNDDATA uses a read latch',()=>{
 const d=new IIgsDOC(); d.setControl(0x40);d.setAddressLow(0xa0);d.writeData(0x55);
 assert.equal(d.osc[0].control,1);assert.equal(d.ram[0xa0],0x55);
 d.readData();assert.equal(d.readData(),0x55);
 d.setControl(0);d.setAddressLow(0xe1);d.writeData(0x3e);
 assert.equal(d.enabledOscillators,32);
 d.setAddressHigh(0x12);d.setControl(0);assert.equal(d.address,0xe1);
});
