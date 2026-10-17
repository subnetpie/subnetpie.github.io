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

  // Select RAM address $012345. MAME reports the top address register with
  // the Apple card's fixed high nibble set ($F0 | address bits 16-19).
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

  // Rewind and verify RAM reads auto-increment the same live pointer.
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
