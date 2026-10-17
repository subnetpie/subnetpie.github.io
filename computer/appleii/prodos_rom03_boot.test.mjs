import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia} from './media.js';
import {AppleIIMemoryExpansion} from './memory_expansion.js';

function runUntilBlock0Loaded(m,{limit=20}={}){
  let booted=false;
  for(let i=0;i<limit&&!booted;i++) {
    m.clock(500000);
    booted=m.memory.read(0x0800)===0x01&&m.memory.read(0x0801)===0x4c;
  }
  return booted;
}

test('IIgs ROM03 boots mounted ProDOS slot card into $0801',()=>{
  const {board:m}=createMachine('iigs');
  const image=new Uint8Array(1024);
  image.set([0x01,0x4c,0x01,0x08]);
  mountMedia(m,decodeMedia('boot.hdv',image));
  m.reset(true);

  const slot=[];
  const commands=[];
  m.cpu.setTrace(e=>{
    const pc=e.pc&0xffff;
    if(pc>=0xc700&&pc<=0xc7ff&&slot.length<48)
      slot.push({pc,d:e.r.d&0xffff,db:e.r.db&0xff,e:e.r.e,s:e.r.s&0xffff,
        auxZp:!!m.memory.legacy.aux_zp,auxRead:!!m.memory.legacy.aux_read,
        auxWrite:!!m.memory.legacy.aux_write});
  });
  m.prodosBlock.setTrace(e=>{if(commands.length<8)commands.push(e);});

  const booted=runUntilBlock0Loaded(m);
  assert.ok(booted,
    'ROM03 slot boot did not load block 0: '+JSON.stringify({
      slot,commands,
      selectors:{auxZp:!!m.memory.legacy.aux_zp,auxRead:!!m.memory.legacy.aux_read,auxWrite:!!m.memory.legacy.aux_write},
      zp:Array.from({length:6},(_,i)=>m.memory.read(0x42+i)),
      boot:Array.from({length:4},(_,i)=>m.memory.read(0x800+i))
    }));
});

test('ROM03 HDV boot survives slot 1 memory expansion and slot 4 Mockingboard',()=>{
  const {board:m}=createMachine('iigs');
  const memexpRom=new Uint8Array(readFileSync(new URL('./roms/341-0344a.bin',import.meta.url)));
  const memexp=new AppleIIMemoryExpansion(m.memory,{slot:1,rom:memexpRom});
  m.memoryExpansionCard=memexp;
  m.memoryExpansionSlot=1;
  m.iigsSlot4Device='mockingboard';
  if(m.mockingboard)m.mockingboard.selected=()=>true;

  const image=new Uint8Array(1024);
  image.set([0x01,0x4c,0x01,0x08]);
  mountMedia(m,decodeMedia('boot.hdv',image));
  m.reset(true);
  memexp.reset();

  // Mirror the configured machine-level slot policy: external firmware in
  // slots 1, 4 and 7. C800 ownership itself starts unclaimed after reset.
  m.memory.slotRom=(1<<1)|(1<<4)|(1<<7);
  m.memory.slotC3Rom=false;
  m.memory._a2C800Owner=null;

  const c800Owners=[];
  const originalClaim=memexp.claimC800.bind(memexp);
  memexp.claimC800=()=>{
    originalClaim();
    if(c800Owners.length<16)c800Owners.push(m.memory._a2C800Owner===memexp?'memexp':'other');
  };

  const booted=runUntilBlock0Loaded(m,{limit:30});
  assert.ok(booted,
    'ROM03 HDV boot was corrupted by the memory expansion card: '+JSON.stringify({
      slotRom:m.memory.slotRom,
      c800Owner:m.memory._a2C800Owner===memexp?'memexp':m.memory._a2C800Owner? 'other':'none',
      c800Owners,
      boot:Array.from({length:4},(_,i)=>m.memory.read(0x800+i))
    }));
});
