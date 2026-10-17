import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AppleIIMemoryExpansion} from './memory_expansion.js';

class HookMemory {
  constructor(){this.readHooks=[];this.writeHooks=[];}
  add_read_hook(fn){this.readHooks.push(fn);}
  add_write_hook(fn){this.writeHooks.push(fn);}
  read(addr){
    for(const fn of this.readHooks){const value=fn(addr);if(value!==undefined)return value&0xff;}
    return 0xff;
  }
  write(addr,value){
    for(const fn of this.writeHooks){const result=fn(addr,value&0xff);if(result!==undefined)return result;}
    return undefined;
  }
}

test('Apple II Memory Expansion matches MAME C0nX pointer semantics',()=>{
  const memory=new HookMemory();
  const card=new AppleIIMemoryExpansion(memory,{slot:4});
  const base=0xc0c0;

  memory.write(base+0,0x45);
  memory.write(base+1,0x23);
  memory.write(base+2,0x01);
  assert.equal(memory.read(base+0),0x45);
  assert.equal(memory.read(base+1),0x23);
  assert.equal(memory.read(base+2),0xf1);

  memory.write(base+3,0xa5);
  assert.equal(card.ram[0x12345],0xa5);
  assert.equal(memory.read(base+0),0x46);
  assert.equal(memory.read(base+1),0x23);
  assert.equal(memory.read(base+2),0xf1);

  memory.write(base+0,0x45);
  memory.write(base+1,0x23);
  memory.write(base+2,0x01);
  assert.equal(memory.read(base+3),0xa5);
  assert.equal(memory.read(base+0),0x46);
});

test('Memory Expansion reset clears registers but preserves RAM',()=>{
  const memory=new HookMemory();
  const card=new AppleIIMemoryExpansion(memory,{slot:2});
  const base=0xc0a0;
  memory.write(base+0,0x10);
  memory.write(base+3,0x7e);
  card.reset();
  assert.equal(memory.read(base+0),0x00);
  assert.equal(memory.read(base+1),0x00);
  assert.equal(memory.read(base+2),0x00);
  assert.equal(card.ram[0x10],0x7e);
});

test('Memory Expansion follows its selected slot and can be disabled',()=>{
  const memory=new HookMemory();
  const card=new AppleIIMemoryExpansion(memory,{slot:1});
  memory.write(0xc090,0x34);
  assert.equal(memory.read(0xc090),0x34);

  card.setSlot(7);
  assert.equal(memory.read(0xc090),0xff);
  memory.write(0xc0f0,0x78);
  assert.equal(memory.read(0xc0f0),0x78);

  card.setEnabled(false);
  assert.equal(memory.read(0xc0f0),0xff);
});

test('Memory Expansion only owns C800 after its CnXX ROM is selected',()=>{
  const memory=new HookMemory();
  const rom=new Uint8Array(0x1000);
  rom.fill(0x11);
  rom[0x100]=0x42;
  rom[0x800]=0x99;
  rom[0xfff]=0x77;
  const card=new AppleIIMemoryExpansion(memory,{slot:1,rom});

  // Before a C1xx access the card must not globally steal C800-CFFF.
  assert.equal(memory.read(0xc800),0xff);
  assert.equal(card.c800Active,false);

  assert.equal(memory.read(0xc100),0x42);
  assert.equal(card.c800Active,true);
  assert.equal(memory.read(0xc800),0x99);

  // CFFF returns the card byte and releases C800 ownership for the next read.
  assert.equal(memory.read(0xcfff),0x77);
  assert.equal(card.c800Active,false);
  assert.equal(memory.read(0xc800),0xff);
});

test('IIgs internal slot ROM selection prevents memory card CnXX interception',()=>{
  const memory=new HookMemory();
  memory.intCxRom=true;
  memory.slotRom=0x02;
  const rom=new Uint8Array(0x1000).fill(0x5a);
  const card=new AppleIIMemoryExpansion(memory,{slot:1,rom});

  assert.equal(memory.read(0xc100),0xff);
  assert.equal(card.c800Active,false);

  memory.intCxRom=false;
  assert.equal(memory.read(0xc100),0x5a);
  assert.equal(card.c800Active,true);
});
