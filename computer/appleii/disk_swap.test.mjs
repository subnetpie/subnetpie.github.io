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
 mountMedia(m,decodeMedia('game.dsk',new Uint8Array(143360)),1,{preserveSession:true});
 assert.equal(m.prodosBlock.name,'system.hdv');assert.ok(m.prodosBlock.image);
 assert.equal(m.memory.speed,4);assert.equal(m.memory.legacyFloppySpeed,false);
 assert.throws(()=>mountMedia(m,{kind:'rom',data:new Uint8Array(0x40000)},0,{preserveSession:true}),/require Load and restart/);
 assert.equal(m.prodosBlock.name,'system.hdv');
});

test('DSK replacement clears stale media only in the selected drive',()=>{
 const {board:m}=createMachine();
 const system={kind:'block',name:'system.2mg',data:new Uint8Array(819200),physical:'35'};
 mountMedia(m,system);
 const floppy=decodeMedia('game.dsk',new Uint8Array(143360));
 mountMedia(m,floppy,1,{preserveSession:true});
 assert.equal(m.memory.floppy35.media,system);
 mountMedia(m,floppy);
 m.reset(true);
 assert.equal(m.memory.floppy35Media,null);
 assert.equal(m.memory.floppy35.media,null);
 assert.equal(m.prodosBlock.image,null);
});

test('two block drives route reads, writes and status independently',()=>{
 const {board:m}=createMachine();
 const a=new Uint8Array(1024).fill(0x11),b=new Uint8Array(1536).fill(0x22);
 mountMedia(m,decodeMedia('system.hdv',a));
 m.cpu.register.pc=0x3456;const regs={...m.cpu.register};
 mountMedia(m,decodeMedia('application.hdv',b),1,{preserveSession:true});
 assert.deepEqual({...m.cpu.register},regs);
 function command(unit,cmd) {
  [cmd,unit,0,8,0,0].forEach((v,i)=>m.memory.write(0x42+i,v));
  return m.prodosBlock.execute();
 }
 assert.equal(command(0x70,1),0);assert.equal(m.memory.read(0x800),0x11);
 assert.equal(command(0xf0,1),0);assert.equal(m.memory.read(0x800),0x22);
 assert.equal(command(0xf0,0),0);assert.equal(m.prodosBlock.read(0xc0f1),3);
 m.memory.write(0x800,0x55);assert.equal(command(0xf0,2),0);
 assert.equal(m.prodosBlock.drives[1].image[0],0x55);assert.equal(m.prodosBlock.image[0],0x11);
 m.prodosBlock.eject(1);assert.equal(command(0xf0,1),0x28);
 assert.equal(command(0x70,1),0);
});

test('IWM selects independent 3.5-inch media and reset preserves both',()=>{
 const {board:m}=createMachine();
 const a={kind:'block',name:'system.2mg',physical:'35',data:new Uint8Array(819200)};
 const b={...a,name:'app.2mg',data:new Uint8Array(819200).fill(0x22)};
 mountMedia(m,a);mountMedia(m,b,1,{preserveSession:true});
 m.memory.diskReg=0x40;
 m.memory.read(0xc0ea);assert.equal(m.memory.floppy35.media,a);
 m.memory.read(0xc0eb);assert.equal(m.memory.floppy35.media,b);
 m.reset(true);
 assert.equal(m.memory.floppy35Drives[0].media,a);assert.equal(m.memory.floppy35Drives[1].media,b);
});

test('two 5.25-inch drives select distinct disks and eject preserves CPU state',async()=>{
 const {ejectMedia}=await import('./media.js');
 const {board:m}=createMachine('iie');
 mountMedia(m,decodeMedia('first.dsk',new Uint8Array(143360)));
 mountMedia(m,decodeMedia('second.dsk',new Uint8Array(143360).fill(0x22)),1,{preserveSession:true});
 m.memory.read(0xc0ea);assert.equal(m.floppy525._active_disk.name,'first.dsk');
 m.memory.read(0xc0eb);assert.equal(m.floppy525._active_disk.name,'second.dsk');
 const regs={...m.cpu.register};ejectMedia(m,1);
 assert.deepEqual({...m.cpu.register},regs);
 assert.equal(m.floppy525._disks[1].medium,null);
 assert.ok(m.floppy525._disks[0].medium);
 assert.equal(m.mountedMedia[1],null);
});
