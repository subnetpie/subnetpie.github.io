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

  assert.equal(memory.read(0xc800),0xff);
  assert.equal(card.ownsC800(),false);

  assert.equal(memory.read(0xc100),0x42);
  assert.equal(card.ownsC800(),true);
  assert.equal(memory.read(0xc800),0x99);

  assert.equal(memory.read(0xcfff),0x77);
  assert.equal(card.ownsC800(),false);
  assert.equal(memory.read(0xc800),0xff);
});

test('C800 expansion ROM ownership is global and first card wins like MAME A2Bus',()=>{
  const memory=new HookMemory();
  const rom1=new Uint8Array(0x1000).fill(0x11);
  const rom2=new Uint8Array(0x1000).fill(0x22);
  rom1[0x100]=0xa1; rom1[0x800]=0xc1; rom1[0xfff]=0xf1;
  rom2[0x200]=0xa2; rom2[0x800]=0xc2; rom2[0xfff]=0xf2;
  const card1=new AppleIIMemoryExpansion(memory,{slot:1,rom:rom1});
  const card2=new AppleIIMemoryExpansion(memory,{slot:2,rom:rom2});

  assert.equal(memory.read(0xc100),0xa1);
  assert.equal(memory._a2C800Owner,card1);
  // Slot 2 CnXX still reads normally but cannot steal an already-owned C800.
  assert.equal(memory.read(0xc200),0xa2);
  assert.equal(memory._a2C800Owner,card1);
  assert.equal(memory.read(0xc800),0xc1);
  assert.equal(memory.read(0xcfff),0xf1);
  assert.equal(memory._a2C800Owner,null);

  assert.equal(memory.read(0xc200),0xa2);
  assert.equal(memory._a2C800Owner,card2);
  assert.equal(memory.read(0xc800),0xc2);
});

test('IIgs internal slot ROM selection prevents memory card CnXX interception',()=>{
  const memory=new HookMemory();
  memory.intCxRom=true;
  memory.slotRom=0x02;
  const rom=new Uint8Array(0x1000).fill(0x5a);
  const card=new AppleIIMemoryExpansion(memory,{slot:1,rom});

  assert.equal(memory.read(0xc100),0xff);
  assert.equal(card.ownsC800(),false);

  memory.intCxRom=false;
  assert.equal(memory.read(0xc100),0x5a);
  assert.equal(card.ownsC800(),true);
});

test('IIgs internal C800 ROM overrides a previously selected memory-card C800 owner',()=>{
  const memory=new HookMemory();
  memory.intCxRom=false;
  memory.intC8Rom=false;
  memory.slotRom=0x02;
  const rom=new Uint8Array(0x1000).fill(0x11);
  rom[0x100]=0x42;
  rom[0x800]=0x99;
  rom[0xfff]=0x77;
  const card=new AppleIIMemoryExpansion(memory,{slot:1,rom});
  memory.add_read_hook(addr=>{
    const low=addr&0xffff;
    if((memory.intCxRom||memory.intC8Rom) && low>=0xc800 && low<=0xcfff)
      return low===0xcfff?0x5f:0x55;
    return undefined;
  });

  assert.equal(memory.read(0xc100),0x42);
  assert.equal(card.ownsC800(),true);
  assert.equal(memory.read(0xc800),0x99);

  memory.intCxRom=true;
  assert.equal(memory.read(0xc800),0x55);
  assert.equal(card.ownsC800(),true);
  assert.equal(memory.read(0xcfff),0x5f);
  assert.equal(card.ownsC800(),false);
});

test('IIgs slot 3 memory expansion follows SLOTC3ROM rather than SLOTROMSEL',()=>{
  const memory=new HookMemory();
  memory.intCxRom=false;
  memory.slotRom=0x00;
  memory.slotC3Rom=false;
  const rom=new Uint8Array(0x1000).fill(0x33);
  rom[0x300]=0x63;
  const card=new AppleIIMemoryExpansion(memory,{slot:3,rom});

  assert.equal(memory.read(0xc300),0xff);
  memory.slotC3Rom=true;
  assert.equal(memory.read(0xc300),0x63);
  assert.equal(memory._a2C800Owner,card);
});
