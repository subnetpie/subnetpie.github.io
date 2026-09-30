import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,readZipEntries} from './media.js';

test('ActionGS device manager discovers Drive 2 and reads Space Ace after insertion',{
 skip:!process.env.ACTION_GS_ZIP||!process.env.SPACE_ACE_ZIP
},()=>{
 const {board:m}=createMachine();
 m.video_iigs.context.putImageData=()=>{};m.video_iigs.context.fillRect=()=>{};
 const load=path=>{const [e]=readZipEntries(readFileSync(path));return decodeMedia(e.name,e.data);};
 mountMedia(m,load(process.env.ACTION_GS_ZIP));m.reset(true);
 for(let i=0;i<3600;i++)m.clock(46667);
 const saved={...m.cpu.register};
 mountMedia(m,load(process.env.SPACE_ACE_ZIP),1,{preserveSession:true});
 assert.deepEqual({...m.cpu.register},saved);
 // Test-only native caller in unused RAM, exercising the loaded GS/OS code.
 const base=0x1f0000,par=base+0x100,buffer=base+0x400;
 const rd=a=>m.memory.read(a),wr=(a,v)=>m.memory.write(a,v);
 const word=a=>rd(a)|(rd(a+1)<<8);
 const w16=(a,v)=>{wr(a,v&255);wr(a+1,v>>>8);};
 const w32=(a,v)=>{w16(a,v);w16(a+2,v>>>16);};
 function call(command) {
  [0x22,0xa8,0,0xe1,command&255,command>>>8,0,1,0x1f,0].forEach((v,i)=>wr(base+i,v));
  Object.assign(m.cpu.register,{pc:0,pb:0x1f,db:0,d:0,s:0x1ff,p:4,e:false});
  m.cpu.stopped=false;
  let n=0;while(m.cpu.addr()!==base+10 && n++<100000)m.cpu.step();
  assert.ok(n<100000,'GS/OS call returns');return m.cpu.register.a;
 }
 let second=0;
 for(let id=1;id<=16;id++) {
  w16(par,8);w16(par+2,id);w32(par+4,buffer);w16(buffer,128);
  if(call(0x202c))break; // DInfoGS
  if((word(par+14)&7)===7 && word(par+16)===2) {second=id;break;}
 }
 assert.ok(second,'GS/OS must enumerate the second device');
 w16(par,6);w16(par+2,second);w32(par+4,buffer);
 w32(par+8,512);w32(par+12,2);w16(par+16,512);w32(par+18,0);
 assert.equal(call(0x202f),0,'DReadGS reads Drive 2 through its generated driver');
 assert.equal(word(par+18),512);
 const length=rd(buffer+4)&15;
 const volume=String.fromCharCode(...Array.from({length},(_,i)=>rd(buffer+5+i)));
 assert.equal(volume,'DISK1');
 assert.equal(m.prodosBlock.drives[0].name,'ActionGS.2mg');
});
