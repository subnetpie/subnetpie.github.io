import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsSCC} from './iigs_scc.js';

test('SCC reset exposes transmitter empty and idle modem status',()=>{
  const s=new IIgsSCC();
  assert.equal(s.read(1)&0x2c,0x2c);
  assert.equal(s.read(3)&0x2c,0x2c);
});

test('SCC data ports preserve independent channel receive streams',()=>{
  const s=new IIgsSCC();
  s.inject(0,0x41); s.inject(1,0x42);
  assert.equal(s.read(2),0x41);
  assert.equal(s.read(0),0x42);
});

test('SCC receive interrupt asserts and clears as FIFO drains',()=>{
  let irq=false; const s=new IIgsSCC(v=>irq=v);
  // Channel A: select WR1 then enable receive interrupts.
  s.write(3,1); s.write(3,0x18);
  s.inject(0,0x55);
  assert.equal(irq,true);
  assert.equal(s.read(2),0x55);
  assert.equal(irq,false);
});

test('SCC channel reset does not disturb the other channel',()=>{
  const s=new IIgsSCC();
  s.inject(1,0x66);
  s.resetChannel(0);
  assert.equal(s.read(0),0x66);
});
