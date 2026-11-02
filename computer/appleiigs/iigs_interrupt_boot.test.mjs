import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,readZipEntries} from './media.js';
import {zipSync} from './vendor/fflate.js';

test('native IRQ fetches ROM vector and executes the FPI trampoline with LC RAM selected',()=>{
  const {board:m}=createMachine();
  m.memory.write(0xc068,0); // Read language-card RAM.
  m.memory.ram[0xffee]=0; m.memory.ram[0xffef]=0;
  assert.equal(m.memory.read_word(0xffee),0);
  m.cpu.register.e=false; m.cpu.register.p=0; m.cpu.register.s=0x1fff;
  m.cpu.register.pc=0x800;
  m.cpu.irq(true); m.cpu.step(); m.cpu.irq(false);
  assert.equal(m.cpu.addr(),m.memory.read_word(0xffffee));
  assert.equal(m.memory.read(m.cpu.addr()),0xb8,'CLV at the native IRQ trampoline');
  m.cpu.step(); m.cpu.step();
  assert.equal(m.cpu.addr(),0xe10010);
  for(const bank of [0,1,0xe0,0xe1])for(let a=0xc071;a<=0xc07f;a++)
    assert.equal(m.memory.read((bank<<16)|a),m.memory.read(0xff0000|a));
});

test('reading CLRVBLINT acknowledges the latched VBL and quarter-second IRQs',()=>{
  const {board:m}=createMachine();
  m.memory.write(0xc041,0x18); m.memory.setVblFlag(); m.memory.setQuarterFlag();
  assert.equal(m.cpu.irqLine,true);
  m.memory.read(0xe1c047);
  assert.equal(m.memory.intFlag&0x19,0); assert.equal(m.cpu.irqLine,false);
});

const arkanoid=process.env.ARKANOID_IMAGE;
test('Arkanoid 800K IIgs boot continues beyond welcome-screen interrupts', {skip:!arkanoid},()=>{
  const {board:m}=createMachine();
  mountMedia(m,decodeMedia('Arkanoid.2mg',readFileSync(arkanoid)));m.reset(true);
  let reads=0;m.prodosBlock.setTrace(()=>reads++);
  let invalidVector=false;
  const interrupt=m.cpu.interrupt.bind(m.cpu);
  m.cpu.interrupt=(...args)=>{const n=interrupt(...args);if(m.cpu.addr()===0)invalidVector=true;return n;};
  m.clock(15000000);
  assert.equal(invalidVector,false);
  assert.ok(reads>400,'boot must continue reading program data beyond the first 34 blocks');
  assert.equal(m.video_iigs.isSuperHires(),true);
  assert.equal(m.cpu.register.e,false);
});


test('ZIP-contained Arkanoid 2MG reaches the playfield and continues rendering after startup', {skip:!arkanoid},()=>{
  const {board:m}=createMachine();
  const [entry]=readZipEntries(zipSync({'Arkanoid.2mg':readFileSync(arkanoid)}));
  mountMedia(m,decodeMedia(entry.name,entry.data));m.reset(true);
  m.clock(55000000);
  m.keyboard.key_down(32);m.clock(1000000);m.keyboard.key_up();
  m.clock(44000000);
  const frame=()=>{
    const v=m.video_iigs;
    v.rebuildPaletteCache();
    for(let y=0;y<200;y++){
      const scb=v.decodeSCB(y);
      v[scb.mode640?'render640Line':'render320Line'](y,scb,v.image.data);
    }
    assert.ok(v.image.data.filter((c,i)=>i%4!==3&&c>32).length>20000,'playfield must be visible');
    return createHash('sha256').update(v.image.data).digest('hex');
  };
  assert.equal(m.video_iigs.isSuperHires(),true);
  const before=frame();m.clock(10000000);
  assert.notEqual(frame(),before,'game graphics must continue animating');
  assert.ok(m.cpu.addr()>0x10000,'native program must still be executing');
});

const thexder=process.env.THEXDER_ZIP;
test('Thexder ZIP passes ProDOS 16 device initialization and enters native graphics', {skip:!thexder},()=>{
  const {board:m}=createMachine();
  const [entry]=readZipEntries(readFileSync(thexder));
  mountMedia(m,decodeMedia(entry.name,entry.data));m.reset(true);
  let reads=0, badReturn=false;
  m.prodosBlock.setTrace(()=>reads++);
  m.cpu.setTrace(e=>{if(e.pc===0x99e1&&e.op===0)badReturn=true;});
  m.clock(20000000);
  m.cpu.setTrace(null);
  assert.equal(badReturn,false,'ProDOS must preserve its return stack');
  assert.ok(reads>600,'program blocks must load beyond the ProDOS splash');
  assert.equal(m.cpu.register.e,false);
  assert.equal(m.video_iigs.isSuperHires(),true);
  m.video_iigs.refresh(true);
  assert.ok(m.video_iigs.image.data.some((c,i)=>i%4!==3&&c>32), 'native graphics must be visible');
});
