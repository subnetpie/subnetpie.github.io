import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia} from './media.js';
test('legacy floppy speed survives reset and motor-off; native and block media retain hardware speed',()=>{
 const {board:m}=createMachine();
 mountMedia(m,decodeMedia('game.dsk',new Uint8Array(143360)));m.reset(true);
 m.cpu.register.e=true;m.memory.speed=0x84;m.memory.iwmMotor=false;
 assert.equal(m.memory.isFastCpu(),false);
 m.memory.noteSlowCycle();assert.equal(m.memory.consumeSlowCycles(),0,'no fast-bus wait penalty at 1 MHz');
 m.cpu.register.e=false;assert.equal(m.memory.isFastCpu(),true);
 mountMedia(m,decodeMedia('Total Replay.hdv',new Uint8Array(512)));
 m.cpu.register.e=true;assert.equal(m.memory.isFastCpu(),true);
 m.memory.speed=4;assert.equal(m.memory.isFastCpu(),false,'HDV software still controls SPEED');
});
test('Choplifter stays at Apple II speed after its disk motor stops',{skip:!process.env.CHOPLIFTER_DSK},()=>{
 const {board:m}=createMachine();
 m.video_iigs.context.putImageData=()=>{};m.video_iigs.context.fillRect=()=>{};
 mountMedia(m,decodeMedia('Choplifter.dsk',readFileSync(process.env.CHOPLIFTER_DSK)));m.reset(true);
 let motorSeen=false,gameSeen=false;
 for(let i=0;i<50;i++) {
  m.clock(2800000);motorSeen ||= !!m.memory.iwmMotor;
  if(motorSeen&&!m.memory.iwmMotor&&m.cpu.register.e&&m.cpu.addr()<0xc000) {
   gameSeen=true;assert.equal(m.memory.isFastCpu(),false);
  }
 }
 assert.ok(gameSeen,'game must execute after disk loading finishes');
});
