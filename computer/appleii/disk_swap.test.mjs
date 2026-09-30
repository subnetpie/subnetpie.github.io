import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {mountMedia,decodeMedia,readZipEntries} from './media.js';
import {zipSync} from './vendor/fflate.js';
for(const machine of ['iie','iigs'])test(`${machine} disk swap preserves execution state and reads replacement blocks`,()=>{
 const {board:m}=createMachine(machine);
 const first=new Uint8Array(1024),second=new Uint8Array(1024);second[512]=0x5a;
 mountMedia(m,decodeMedia('first.hdv',first));
 m.cpu.register.pc=0x2345;m.cycles=123456;m.memory.write(0x300,0x67);
 const regs={...m.cpu.register};
 const [entry]=readZipEntries(zipSync({'second.hdv':second}));
 mountMedia(m,decodeMedia(entry.name,entry.data),0,{preserveSession:true});
 assert.deepEqual({...m.cpu.register},regs);assert.equal(m.cycles,123456);assert.equal(m.memory.read(0x300),0x67);
 [1,0x70,0,8,1,0].forEach((v,i)=>m.memory.write(0x42+i,v));
 assert.equal(m.prodosBlock.execute(),0);assert.equal(m.memory.read(0x800),0x5a);
});
test('floppy insertion preserves mounted hard disk and existing speed policy',()=>{
 const {board:m}=createMachine();mountMedia(m,decodeMedia('system.hdv',new Uint8Array(1024)));
 m.memory.speed=4;
 mountMedia(m,decodeMedia('game.dsk',new Uint8Array(143360)),0,{preserveSession:true});
 assert.equal(m.prodosBlock.name,'system.hdv');assert.ok(m.prodosBlock.image);
 assert.equal(m.memory.speed,4);assert.equal(m.memory.legacyFloppySpeed,false);
 assert.throws(()=>mountMedia(m,{kind:'rom',data:new Uint8Array(0x40000)},0,{preserveSession:true}),/require Load and restart/);
 assert.equal(m.prodosBlock.name,'system.hdv');
});

test('fresh DSK boot ejects stale 3.5 media, but insertion preserves it',()=>{
 const {board:m}=createMachine();
 const system={kind:'block',name:'system.2mg',data:new Uint8Array(819200),physical:'35'};
 mountMedia(m,system);
 const floppy=decodeMedia('game.dsk',new Uint8Array(143360));
 mountMedia(m,floppy,0,{preserveSession:true});
 assert.equal(m.memory.floppy35.media,system);
 mountMedia(m,floppy);
 m.reset(true);
 assert.equal(m.memory.floppy35Media,null);
 assert.equal(m.memory.floppy35.media,null);
 assert.equal(m.prodosBlock.image,null);
});
