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


test('SCC transmit buffer remains busy until baud-timed character completes',()=>{
  const s=new IIgsSCC(); const out=[]; s.onTransmit=(ch,v)=>out.push([ch,v]);
  s.write(3,5); s.write(3,0x60); // channel A WR5: 8-bit characters
  s.write(3,12); s.write(3,2);   // BRG low
  s.write(3,13); s.write(3,0);   // BRG high
  s.write(2,0x41);
  assert.equal(s.channels[0].txEmpty,false);
  const clocks=s.channels[0].baudDivisor()*s.channels[0].bitsPerCharacter();
  s.tick(clocks-1);
  assert.equal(out.length,0);
  s.tick(1);
  assert.deepEqual(out,[[0,0x41]]);
  assert.equal(s.channels[0].txEmpty,true);
});

test('SCC TX-empty interrupt asserts only after timed transmission',()=>{
  let irq=false; const s=new IIgsSCC(v=>irq=v);
  s.write(3,1); s.write(3,0x02);
  assert.equal(irq,true);
  s.write(2,0x33);
  assert.equal(irq,false);
  s.tick(s.channels[0].txCycles);
  assert.equal(irq,true);
});
