import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {decodeMedia,parse2IMG,prodosToDOS,readZipEntries,isZip,mountMedia} from './media.js';
import {zipSync} from './vendor/fflate.js';
import {createMachine} from './test-support/headless.mjs';
import {Floppy35} from './floppy35.js';

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
    assert.equal(media.kind,'floppy35','Arkanoid image must decode as a native IIgs 3.5-inch floppy');
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

test('IIgs native 3.5 sector reaches CPU through flux and IWM $C0EC',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512);
  for(let i=0;i<disk.length;i++)disk[i]=(i*29+(i>>>8)*7)&0xff;
  const media=decodeMedia('iwm-e2e.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true;
  b.iwmQ6=false; b.iwmQ7=false; b.iwmMode=0; b.iwmData=0;

  const seen=[]; let last=-1;
  // Sample like ROM code: wait for a high-bit value, consume it, then wait
  // for the latch to change before accepting another byte.
  for(let i=0;i<180000 && seen.length<1800;i++) {
    b.tickIwm(3,2800000);
    const v=b.iwmAccess(0xc0ec);
    if((v&0x80) && v!==last) { seen.push(v); last=v; }
    else if(!(v&0x80)) last=-1;
  }
  let ap=-1;
  for(let i=0;i+8<seen.length;i++)
    if(seen[i]===0xd5&&seen[i+1]===0xaa&&seen[i+2]===0x96){ap=i;break;}
  assert.ok(ap>=0,'CPU-visible IWM bytes must contain an address prologue');
  const track=Floppy35.decodeGcrByte(seen[ap+3]);
  const sector=Floppy35.decodeGcrByte(seen[ap+4]);
  assert.equal(track,0); assert.ok(sector>=0&&sector<12);

  let dp=-1;
  for(let i=ap+8;i+710<seen.length;i++)
    if(seen[i]===0xd5&&seen[i+1]===0xaa&&seen[i+2]===0xad){dp=i;break;}
  assert.ok(dp>=0,'CPU-visible IWM bytes must contain a data prologue');
  assert.equal(Floppy35.decodeGcrByte(seen[dp+3]),sector);
  const field=b.floppy35.decodeSectorField(Uint8Array.from(seen),dp+4);
  assert.ok(field,'CPU-visible native GCR field must pass checksum');
  const off=b.floppy35.sectorOffset(0,0,sector);
  assert.deepEqual(field.subarray(12),disk.subarray(off,off+512));
});

test('IIgs 800K native GCR fields round-trip payload across zones and heads',()=>{
  const disk=new Uint8Array(1600*512);
  for(let i=0;i<disk.length;i++)disk[i]=(i*37+(i>>>9)*11)&0xff;
  const media=decodeMedia('roundtrip.2mg',wrap(disk,1)), f=new Floppy35();
  assert.ok(f.mount(media));
  for(const track of [0,16,32,48,64,79]) for(const head of [0,1]) {
    f.track=track; f.head=head; f.cacheKey='';
    const bytes=f.buildTrack(), ns=f.sectorCount(track);
    for(let p=0;p<bytes.length-4;p++) if(bytes[p]===0xd5&&bytes[p+1]===0xaa&&bytes[p+2]===0xad) {
      const sid=Floppy35.decodeGcrByte(bytes[p+3]);
      const field=f.decodeSectorField(bytes,p+4);
      assert.ok(field,'GCR data checksum must decode');
      const expected=disk.subarray(f.sectorOffset(track,head,sid),f.sectorOffset(track,head,sid)+512);
      assert.deepEqual(field.subarray(12),expected);
    }
    assert.ok(ns>=8&&ns<=12);
  }
});

test('IIgs ROM03 native 800K boot trace reaches 3.5 controller',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const media=decodeMedia('boot.2mg',wrap(new Uint8Array(1600*512),1));
  mountMedia(m,media);
  const io=[]; b.setTrace((rw,addr,value)=>{
    if((addr===0xc031)||(addr>=0xc0e0&&addr<=0xc0ef)) io.push([rw,addr,value]);
  });
  m.reset(true); m.clock(2000000);
  const diskreg=io.filter(x=>x[0]==='W'&&x[1]===0xc031);
  const iwm=io.filter(x=>x[1]>=0xc0e0&&x[1]<=0xc0ef);
  assert.ok(diskreg.some(x=>(x[2]&0x40)!==0),'ROM03 must select 35SEL while boot-scanning native 800K media');
  assert.ok(iwm.length>0,'ROM03 must access IWM while scanning native 800K media');
});

test('IIgs IWM phase softswitches seek the selected native 3.5 drive',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const media=decodeMedia('disk.2mg',wrap(new Uint8Array(1600*512),1));
  mountMedia(m,media);
  b.diskReg=0x40;
  b.iwmAccess(0xc0e9); // motor on / drive 1
  assert.equal(b.iwmDevSel,1);
  b.iwmAccess(0xc0e1); // phase 0 on
  b.iwmAccess(0xc0e3); // phase 1 on -> mask 3, quarter-track 1
  assert.equal(b.iwmPhases,3);
  assert.equal(b.floppy35.track,0); assert.equal(b.floppy35.subtrack,1);
  b.iwmAccess(0xc0e0); // phase 0 off -> mask 2, quarter-track 2
  assert.equal(b.iwmPhases,2);
  assert.equal(b.floppy35.subtrack,2);
});

test('IIgs 800K 2MG mounts only on native 3.5 drive, not synthetic slot 7',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('Arkanoid.2mg',wrap(disk,1));
  assert.equal(media.kind,'floppy35');
  mountMedia(m,media); m.reset(true);
  assert.equal(b.floppy35Media,media);
  assert.equal(b.floppy35.media,media);
  assert.equal(m.prodosBlock.image,null);
});

test('IIgs ROM03 can see mounted ProDOS slot-7 boot firmware after reset',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('Arkanoid.2mg',wrap(disk,1));
  mountMedia(m,media); m.reset(true);
  assert.equal(b.slotRom,0,'ROM03 reset default keeps SLOTROMSEL clear');
  assert.equal(b.read(0xc700),0x24,'mounted external slot-7 signature must override internal ROM');
  assert.equal(b.read(0xc708),0xa9,'slot-7 boot entry must be visible to firmware scanner');
  m.prodosBlock.eject();
  assert.notEqual(b.read(0xc708),0xa9,'ejected card must fall back to internal slot ROM');
});

test('IIgs reset clears native IWM decoder state but preserves mounted 800K media',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('Arkanoid.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.iwmReadShift=0x55; b.iwmReadBits=7; b.iwmReadState=1; b.iwmReadClock=1234;
  b.iwmNextWindow=1300; b.iwmSyncUpdate=1400; b.iwmAsyncUpdate=1500;
  b.floppy35.cellPos=321; b.floppy35.rawBits=[1,0,1];
  m.reset(true);
  assert.equal(b.floppy35Media,media);
  assert.equal(b.floppy35.media,media);
  assert.equal(b.iwmReadShift,0); assert.equal(b.iwmReadBits,0); assert.equal(b.iwmReadState,0);
  assert.equal(b.iwmReadClock,0); assert.equal(b.iwmNextWindow,0);
  assert.equal(b.iwmSyncUpdate,0); assert.equal(b.iwmAsyncUpdate,0);
  assert.equal(b.floppy35.cellPos,0); assert.deepEqual(b.floppy35.rawBits,[]);
});

test('IIgs IWM sync latch supports Arkanoid high-bit polling',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('Arkanoid.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true; b.iwmQ6=false; b.iwmQ7=false; b.iwmMode=0;
  let ready=false;
  for(let i=0;i<200&&!ready;i++) {
    b.tickIwm(28,2800000);
    ready=!!(b.iwmAccess(0xc0ec)&0x80);
  }
  assert.ok(ready,'LDA $C0EC / BPL-style polling must eventually observe a synchronized byte');
});

test('IIgs IWM decodes 3.5 media through flux transition windows',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true; b.iwmQ6=false; b.iwmQ7=false;
  b.iwmData=0;
  b.tickIwm(56000,2800000);
  assert.ok(b.iwmReadClock>0);
  assert.ok((b.iwmData&0x80)!==0,'synchronized GCR data must latch with high bit set');
  const v=b.iwmData, p=b.floppy35.cellPos;
  assert.equal(b.iwmAccess(0xc0ec),v);
  assert.equal(b.floppy35.cellPos,p,'register polling must not move flux position');
});

test('IIgs IWM 3.5 read register is a timed shift-register latch',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true; b.iwmQ6=false; b.iwmQ7=false;
  b.iwmData=0;
  assert.equal(b.iwmAccess(0xc0ec),0);
  assert.equal(b.iwmAccess(0xc0ec),0,'polling without time must not consume media');
  b.tickIwm(28000,2800000);
  const latched=b.iwmAccess(0xc0ec);
  assert.notEqual(latched,0,'elapsed rotation must feed the IWM read latch');
  b.iwmQ6=true;
  b.iwmAccess(0xc0ec);
  assert.equal(b.iwmReadShift,0,'Q6H status access resets MAME read shift state');
});

test('IIgs 3.5-inch GCR uses MAME cell counts and self-sync transitions',()=>{
  const {board:m}=createMachine(); const f=m.memory.floppy35;
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1)); f.mount(media);
  assert.deepEqual([0,16,32,48,64].map(t=>f.cellCount(t)),
    [Math.floor(30318342/394),Math.floor(30318342/429),Math.floor(30318342/472),
     Math.floor(30318342/525),Math.floor(30318342/590)]);
  const cells=f.trackCells();
  assert.equal(cells.length,f.cellCount(0));
  assert.ok(cells.slice(0,48).some(v=>v===0),'self-sync field must contain inserted zero cells');
});

test('IIgs 3.5-inch rotation uses MAME Sony speed zones',()=>{
  const {board:m}=createMachine(); const f=m.memory.floppy35;
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1)); f.mount(media);
  assert.deepEqual([0,16,32,48,64].map(t=>f.rpm(t)),[394,429,472,525,590]);
});

test('IIgs 3.5-inch data register is clock-driven, not read-driven',()=>{
  const {board:m}=createMachine(), b=m.memory;
  const disk=new Uint8Array(1600*512), media=decodeMedia('800k.2mg',wrap(disk,1));
  mountMedia(m,media); b.floppy35.mount(media);
  b.diskReg=0x40; b.iwmActive=true; b.iwmMotor=true; b.iwmQ6=false; b.iwmQ7=false;
  const a=b.iwmAccess(0xc0ec), p=b.floppy35.cellPos;
  assert.equal(b.iwmAccess(0xc0ec),a); assert.equal(b.floppy35.cellPos,p);
  b.tickIwm(28000,2800000);
  assert.notEqual(b.floppy35.cellPos,p);
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
