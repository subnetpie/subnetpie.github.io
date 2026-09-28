import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeMedia,parse2IMG,prodosToDOS,readZipEntries,isZip,mountMedia} from './media.js';
import {zipSync} from './vendor/fflate.js';
import {createMachine} from './test-support/headless.mjs';

function wrap(data,format=1,flags=0,offset=64) {
  const out=new Uint8Array(offset+data.length+7);
  out.set([50,73,77,71]);const v=new DataView(out.buffer);
  v.setUint16(8,64,true);v.setUint16(10,1,true);v.setUint32(12,format,true);
  v.setUint32(16,flags,true);v.setUint32(20,format===1?data.length/512:0,true);
  v.setUint32(24,offset,true);v.setUint32(28,data.length,true);
  out.set(data,offset);out.fill(0xcc,offset+data.length);return out;
}

test('2IMG extracts only disk bytes using its offset, flags and volume', () => {
  const disk=new Uint8Array(143360).fill(0x5a);
  const wrapped=wrap(disk,0,0x8000012a,128);
  const parsed=parse2IMG(wrapped);
  assert.deepEqual(parsed.data,disk);assert.equal(parsed.volume,42);
  assert.equal(parsed.writeProtected,true);
  assert.equal(decodeMedia('disk.2mg',wrapped).kind,'floppy');
});

test('2IMG rejects truncated data, bad offsets and inconsistent block counts', () => {
  const good=wrap(new Uint8Array(512));
  assert.throws(()=>parse2IMG(good.slice(0,100)),/truncated|range/);
  for(const [field,value] of [[24,32],[24,0xffffffff],[28,0xffffffff],[20,99],[12,3]]) {
    const bad=good.slice();new DataView(bad.buffer).setUint32(field,value,true);
    assert.throws(()=>parse2IMG(bad));
  }
});

test('legacy WOOF zero-length ProDOS header uses its block count', () => {
  const image=wrap(new Uint8Array(512).fill(0x63));
  new DataView(image.buffer).setUint32(28,0,true);
  assert.equal(decodeMedia('legacy.2img',image).data.length,512);
});

test('ProDOS 5.25-inch sectors are converted to DOS order', () => {
  const disk=new Uint8Array(143360);
  for(let i=0;i<disk.length/256;i++)disk.fill(i%16,i*256,(i+1)*256);
  const media=decodeMedia('disk.po',disk);
  const expected=[0,14,13,12,11,10,9,8,7,6,5,4,3,2,1,15];
  assert.deepEqual(expected.map((_,i)=>media.data[i*256]),expected);
  assert.deepEqual(prodosToDOS(media.data),disk);
  assert.deepEqual(decodeMedia('disk.2mg',wrap(disk)).data,media.data);
});

test('ZIP filters metadata and sorts multiple disk choices naturally', () => {
  const archive=zipSync({'__MACOSX/._disk2.dsk':new Uint8Array(8),
    'pack/disk10.dsk':new Uint8Array(143360),
    'pack/disk2.dsk':new Uint8Array(143360),'readme.txt':new Uint8Array(3)});
  assert.equal(isZip('renamed.bin',archive),true);
  const entries=readZipEntries(archive);
  assert.deepEqual(entries.map(e=>e.name),['pack/disk2.dsk','pack/disk10.dsk']);
  assert.throws(()=>readZipEntries(zipSync({'readme.txt':new Uint8Array(1)})),/no supported/);
  assert.throws(()=>readZipEntries(new Uint8Array(10)));
});

test('ZIP-contained 2IMG mounts a block image and honors write protection', () => {
  const disk=new Uint8Array(1024).fill(0x5a);
  const [entry]=readZipEntries(zipSync({'folder/disk.2mg':wrap(disk,1,0x80000000)}));
  const {board:m}=createMachine();
  mountMedia(m,decodeMedia(entry.name,entry.data));
  assert.deepEqual(m.prodosBlock.image,disk);
  m.legacyMemory._main.set([2,0x70,0,8,0,0],0x42);
  assert.equal(m.prodosBlock.execute(),0x2b);
  assert.equal(m.prodosBlock.dirty,false);
  const prior=m.prodosBlock.image;
  assert.throws(()=>mountMedia(m,decodeMedia('broken.2mg',new Uint8Array(64))));
  assert.equal(m.prodosBlock.image,prior,'invalid input must preserve mounted disk');
});

for(const format of [0,1,2]) {
  test(`IIgs boots ZIP-contained legacy version-0 2IMG format ${format}`, () => {
    const {board:m}=createMachine();
    const disk=new Uint8Array(143360);disk.set([1,0x4c,1,8]);
    let payload=disk;
    if(format===2) {
      payload=new Uint8Array(35*6656).fill(0xff);
      for(let t=0;t<35;t++) {
        const track=[];
        for(let s=0;s<16;s++)track.push(...m.floppy525.sector_62encode(disk,t,s));
        payload.set(track,t*6656);
      }
    }
    const container=wrap(payload,format);
    new DataView(container.buffer).setUint16(10,0,true);
    const [entry]=readZipEntries(zipSync({'Boot.2mg':container}));
    m.prodosBlock.load_image('old.po',new Uint8Array(512));
    mountMedia(m,decodeMedia(entry.name,entry.data));m.reset(true);
    assert.equal(m.prodosBlock.image,null,'the new floppy must replace boot priority');
    let booted=false;m.cpu.setTrace(e=>{if(e.pc===0x801)booted=true;});
    for(let i=0;i<20&&!booted;i++)m.clock(500000);
    assert.ok(booted);assert.deepEqual(m.legacyMemory._main.slice(0x800,0x900),disk.slice(0,256));
  });
}

test('Total Replay loads from a ZIP containing a 2MG wrapper',
  {skip:!process.env.TOTAL_REPLAY_IMAGE}, () => {
    const disk=readFileSync(process.env.TOTAL_REPLAY_IMAGE);
    const [entry]=readZipEntries(zipSync({'Total Replay.2mg':wrap(disk)},{level:1}));
    const {board:m,pixels}=createMachine();
    mountMedia(m,decodeMedia(entry.name,entry.data));m.reset(true);m.clock(10000000);
    assert.equal(m.prodosBlock.blockCount,65535);
    assert.ok(m.cpu.register.pc>=0xff5c && m.cpu.register.pc<=0xff69,'menu waits for input');
    assert.ok(pixels.some((v,i)=>i%4!==3&&v>100),'menu is visible');
  });


test('IIgs Arkanoid 2MG progresses beyond its boot block',
  {skip:!process.env.ARKANOID_IMAGE}, () => {
    const src=readFileSync(process.env.ARKANOID_IMAGE);
    const {board:m}=createMachine();
    const media=decodeMedia('Arkanoid.2mg',src);
    assert.equal(media.kind,'block','Arkanoid image must decode as a ProDOS block device');
    mountMedia(m,media); m.reset(true);

    const recent=[];
    m.memory.setTrace((rw,addr,value)=>{
      if((addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
        recent.push({rw,addr:addr>>>0,value});
        if(recent.length>64)recent.shift();
      }
    });
    let enteredBoot=false, leftBoot=false;
    m.cpu.setTrace(e=>{
      const pc=e.pc&0xffff;
      if(pc>=0x0800 && pc<0x0a00) enteredBoot=true;
      else if(enteredBoot) leftBoot=true;
    });
    for(let i=0;i<40&&!leftBoot;i++)m.clock(500000);
    assert.ok(enteredBoot,'Arkanoid must enter the ProDOS boot block');
    assert.ok(leftBoot,
      'Arkanoid stalled in boot block: PB='+m.cpu.register.pb.toString(16)+
      ' PC='+m.cpu.register.pc.toString(16)+' recentIO='+JSON.stringify(recent));
  });

test('IIgs native 3.5-inch drive does not use 5.25 motor-off delay',()=>{
  const {board:m}=createMachine(); const b=m.memory;
  b.diskReg=0x40; b.iwmMode=0; b.iwmMotor=true; b.iwmActive=true; b.iwmDevSel=1;
  b.iwmAccess(0xc0e8);
  assert.equal(b.iwmMotor,false);
  assert.equal(b.iwmActive,false);
  assert.equal(b.iwmMotorDelay,0);
  assert.equal(b.iwmDevSel,0);
});

test('IIgs 3.5-inch phase stepping matches MAME quarter-track mapping',()=>{
  const {board:m}=createMachine();
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media);
  const f=m.memory.floppy35; f.mount(media);
  f.setPhase(0x1); assert.deepEqual([f.track,f.subtrack],[0,0]);
  f.setPhase(0x3); assert.deepEqual([f.track,f.subtrack],[0,1]);
  f.setPhase(0x2); assert.deepEqual([f.track,f.subtrack],[0,2]);
  f.setPhase(0x6); assert.deepEqual([f.track,f.subtrack],[0,3]);
  f.setPhase(0x4); assert.deepEqual([f.track,f.subtrack],[1,0]);
  f.setPhase(0x1); assert.deepEqual([f.track,f.subtrack],[1,0],'opposite phase must not move');
  f.setPhase(0xc); assert.deepEqual([f.track,f.subtrack],[1,1]);
  f.setPhase(0x8); assert.deepEqual([f.track,f.subtrack],[1,2]);
  f.setPhase(0x9); assert.deepEqual([f.track,f.subtrack],[1,3]);
  f.setPhase(0x1); assert.deepEqual([f.track,f.subtrack],[2,0]);
});

test('IIgs 800K 3.5-inch backend follows MAME speed-zone geometry',()=>{
  const {board:m}=createMachine();
  const disk=new Uint8Array(1600*512);
  const media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media);
  const f=m.memory.floppy35; f.mount(media);
  assert.deepEqual([0,16,32,48,64].map(t=>f.sectorCount(t)),[12,11,10,9,8]);
  assert.equal(f.sectorOffset(0,1,0),12*512);
  assert.equal(f.sectorOffset(1,0,0),24*512);
});

test('IIgs IWM 35SEL reads GCR address prologues from 800K media',()=>{
  const {board:m}=createMachine();
  const disk=new Uint8Array(1600*512);
  const media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media);
  const b=m.memory; b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true;
  b.iwmQ6=false; b.iwmQ7=false;
  const seen=[]; for(let i=0;i<128;i++)seen.push(b.iwmAccess(0xc0ec));
  assert.ok(seen.some((v,i)=>v===0xd5&&seen[i+1]===0xaa&&seen[i+2]===0x96));
});

test('IIgs 1600-block 2MG is visible to the native 3.5-inch IWM status path',()=>{\n  const {board:m}=createMachine();\n  const disk=new Uint8Array(1600*512);\n  const media=decodeMedia('800k.2mg',wrap(disk,1));\n  assert.equal(media.kind,'block');\n  assert.equal(media.physical,'35');\n  mountMedia(m,media);\n  const b=m.memory;\n  b.diskReg=0x40;\n  b.iwmQ6=true; b.iwmQ7=false;\n  assert.equal(b.iwmAccess(0xc0ec)&0x80,0);\n});\n\ntest('IIgs cold-boots a ProDOS block 2MG extracted from ZIP',()=>{
  const {board:m}=createMachine();
  const disk=new Uint8Array(4096);
  // Slot-7 firmware copies block zero to $0800 then enters $0801.
  disk.set([0x01,0x4c,0x01,0x08]);
  const archive=zipSync({'games/Boot HD.2mg':wrap(disk,1)});
  const [entry]=readZipEntries(archive);
  const media=decodeMedia(entry.name,entry.data);
  assert.equal(media.kind,'block');
  mountMedia(m,media);
  m.reset(true);
  let entered=false;
  m.cpu.setTrace(e=>{if(e.pc===0x0801)entered=true;});
  for(let i=0;i<20&&!entered;i++)m.clock(500000);
  assert.ok(entered,'ZIP-contained 2MG block image must enter its boot block');
  assert.equal(m.prodosBlock.blockCount,8);
  assert.deepEqual(m.legacyMemory._main.slice(0x800,0x804),disk.slice(0,4));
});
