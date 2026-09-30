import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,ejectMedia} from './media.js';
for(const type of ['iie','iigs'])test(`${type} SmartPort firmware discovers empty drive then reports insertion`,()=>{
 const {board:m}=createMachine(type);
 mountMedia(m,decodeMedia('system.hdv',new Uint8Array(1024).fill(0x11)));m.reset(true);
 const wr=(a,v)=>m.memory.write(a,v),rd=a=>m.memory.read(a);
 function call(command,unit,code=0) {
  // Exercise real JSR/inline parameters/firmware/RTS, including return flags.
  [0x20,0x83,0xc7,command,0,4,0xea].forEach((v,i)=>wr(0x300+i,v));
  [3,unit,0,8,code,0,0].forEach((v,i)=>wr(0x400+i,v));
  m.cpu.register.pc=0x300;
  for(let i=0;i<60 && m.cpu.register.pc!==0x306;i++)m.cpu.step();
  assert.equal(m.cpu.register.pc,0x306,'RTS skips the three inline bytes');
  return m.cpu.register.a&255;
 }
 assert.equal(rd(0xc707),0,'SmartPort signature');
 assert.equal(call(0,0),0);assert.equal(rd(0x800),2,'two devices, even with an empty second drive');
 assert.equal(m.cpu.register.x,8);
 assert.equal(call(0,2,3),0);assert.equal(rd(0x800)&0x10,0);
 assert.equal(rd(0x816),0xc0,'removable, extended calls and disk-switched errors');
 assert.equal(m.cpu.register.x,25,'DIB length');
 mountMedia(m,decodeMedia('app.hdv',new Uint8Array(1536).fill(0x22)),1,{preserveSession:true});
 assert.equal(call(0,2),0x2e,'insertion notification');
 assert.equal(call(0,2),0);assert.equal(rd(0x800)&0x10,0x10);assert.equal(rd(0x801),3);
 assert.equal(call(1,2),0);assert.equal(rd(0x800),0x22);
 assert.equal(call(1,1),0);assert.equal(rd(0x800),0x11,'system remains accessible');
 ejectMedia(m,1);
 assert.equal(call(0,2),0x2e);assert.equal(call(0,2),0);
 assert.equal(call(1,2),0x2f,'empty drive is offline, not nonexistent');
 ejectMedia(m,0);assert.equal(call(0,0),0);assert.equal(rd(0x800),2,'controller stays callable with no media');
 assert.equal(call(4,0),0);assert.equal(call(0,0),0);
});

test('extended SmartPort reads a nonzero-bank parameter list and buffer',()=>{
 const {board:m}=createMachine();
 mountMedia(m,decodeMedia('system.hdv',new Uint8Array(1024).fill(0x11)));
 mountMedia(m,decodeMedia('app.hdv',new Uint8Array(1024).fill(0x5a)),1,{preserveSession:true});m.reset(true);
 const wr=(a,v)=>m.memory.write(a,v);
 // JSR C783 / extended read / 32-bit pointer to list in bank 2.
 [0x20,0x83,0xc7,0x41,0,4,2,0,0xea].forEach((v,i)=>wr(0x300+i,v));
 [3,2,0,8,3,0,1,0,0,0].forEach((v,i)=>wr(0x20400+i,v));
 m.cpu.register.pc=0x300;
 for(let i=0;i<60 && m.cpu.register.pc!==0x308;i++)m.cpu.step();
 assert.equal(m.cpu.register.pc,0x308);
 assert.equal(m.cpu.register.a&255,0);
 assert.equal(m.memory.read(0x30800),0x5a);
 assert.equal(m.memory.read(0x309ff),0x5a);
 assert.equal(m.cpu.register.x,0);assert.equal(m.cpu.register.y,2);
 assert.equal(m.prodosBlock.read(0xc7fb),0x80,'extended, not SCSI');
});

test('unpopulated IIgs slot I/O uses the floating bus',()=>{
 const {board:m}=createMachine();m.memory.floatingBus=()=>0x35;
 assert.equal(m.memory.read(0xe0c0c4),0x35);
 assert.equal(m.memory.read(0xc0d4),0x35);
});
