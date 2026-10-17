import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia} from './media.js';

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

  let booted=false;
  for(let i=0;i<20&&!booted;i++) {
    m.clock(500000);
    booted=m.memory.read(0x0800)===0x01&&m.memory.read(0x0801)===0x4c;
  }
  assert.ok(booted,
    'ROM03 slot boot did not load block 0: '+JSON.stringify({
      slot,commands,
      selectors:{auxZp:!!m.memory.legacy.aux_zp,auxRead:!!m.memory.legacy.aux_read,auxWrite:!!m.memory.legacy.aux_write},
      zp:Array.from({length:6},(_,i)=>m.memory.read(0x42+i)),
      boot:Array.from({length:4},(_,i)=>m.memory.read(0x800+i))
    }));
});
