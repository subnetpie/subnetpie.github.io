import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {prodosToDOS,mountMedia,decodeMedia} from './media.js';

for(const machine of ['iie','iigs']) {
  test(`${machine} block boot passes the slot in X, independent of disk size`, () => {
    const {board:m}=createMachine(machine);
    const disk=new Uint8Array(1600*512);disk.set([1,0x4c,1,8]);
    m.prodosBlock.load_image('boot.hdv',disk);
    m.cpu.register.pc=0xc700;
    for(let i=0;i<100 && m.cpu.register.pc!==0x801;i++)m.cpu.step();
    assert.equal(m.cpu.register.pc,0x801);
    assert.equal(m.cpu.register.x,0x70);
  });

  for(const command of [0,1,2,4]) {
    test(`${machine} block firmware register contract for command ${command}`, () => {
      const {board:m}=createMachine(machine);
      m.prodosBlock.load_image('test.hdv',new Uint8Array(1600*512));
      [0x20,0x80,0xc7,0xea].forEach((v,i)=>m.memory.write(0x200+i,v));
      [command,0x70,0,8,0,0].forEach((v,i)=>m.memory.write(0x42+i,v));
      Object.assign(m.cpu.register,{pc:0x200,x:0x39,y:0x5a});
      for(let i=0;i<100 && m.cpu.register.pc!==0x203;i++)m.cpu.step();
      assert.equal(m.cpu.register.pc,0x203);
      assert.equal(m.cpu.register.a&255,command===4?0x27:0);
      assert.equal(m.cpu.register.x,command===0?0x40:0x39);
      assert.equal(m.cpu.register.y,command===0?6:0x5a);
      const carry=machine==='iigs'?m.cpu.register.p&1:Number(m.cpu.register.flag.c);
      assert.equal(carry,command===4?1:0);
    });
  }
}

for(const machine of ['iie','iigs']) {
  test(`${machine} official ProDOS 2.4.2 reaches its file menu on slot 7`,
    {skip:!process.env.PRODOS_242_DSK}, () => {
      const {board:m}=createMachine(machine);
      // DOS <-> ProDOS ordering uses the same involution on 140K images.
      const disk=prodosToDOS(readFileSync(process.env.PRODOS_242_DSK));
      mountMedia(m,decodeMedia('ProDOS.hdv',disk));m.reset(true);
      m.clock(10000000);
      const rows=Array.from({length:24},(_,r)=>Array.from({length:40},(_,c)=>
        String.fromCharCode(m.legacyMemory._main[0x400+(r&7)*128+(r>>3)*40+c]&127)).join('')).join('\n');
      assert.match(rows,/S7,D1:\/PRODOS\.2\.4\.2/);
      assert.match(rows,/BASIC\.SYSTEM/);
      assert.match(rows,/RETURN:SELECT/);
    });
}

for(const machine of ['iie','iigs']) {
  test(`${machine} failed block boot returns to its caller`,()=>{
    const {board:m}=createMachine(machine);
    m.prodosBlock.load_image('boot.hdv',new Uint8Array(512));
    m.prodosBlock.execute=()=>0x27;
    [0x20,0x08,0xc7,0xea].forEach((v,i)=>m.memory.write(0x200+i,v));
    m.cpu.register.pc=0x200;
    for(let i=0;i<100&&m.cpu.register.pc!==0x203;i++)m.cpu.step();
    assert.equal(m.cpu.register.pc,0x203);
  });
}
