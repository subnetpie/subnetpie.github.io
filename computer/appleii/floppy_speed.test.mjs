import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,readZipEntries} from './media.js';
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
 mountMedia(m,{kind:'block',name:'old.2mg',data:new Uint8Array(819200),physical:'35'});
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

test('WOZ disk clock uses elapsed slow-bus time on both machines',()=>{
 for(const type of ['iie','iigs']) {
  const {board:m}=createMachine(type);
  m.cycles=type==='iigs'?2800000:1020500;
  assert.ok(Math.abs(m.floppy525._get_cycles()-(type==='iigs'?1021800:1020500))<1);
 }
});
test('Star Trek WOZ ZIP boots through Disk II firmware',{skip:!process.env.STAR_TREK_ZIP},()=>{
 const {board:m}=createMachine();
 m.video_iigs.context.putImageData=()=>{};m.video_iigs.context.fillRect=()=>{};
 const [entry]=readZipEntries(readFileSync(process.env.STAR_TREK_ZIP));
 mountMedia(m,decodeMedia(entry.name,entry.data));m.reset(true);
 for(let i=0;i<15;i++)m.clock(2800000);
 assert.equal(m.memory.iwmMotor,false,'disk load has finished');
 assert.ok(m.floppy525._disks[0].head_pos>0,'loader read beyond boot track');
 assert.ok(m.cpu.addr()>=0x800 && m.cpu.addr()<0xc000,'executing loaded program');
});
