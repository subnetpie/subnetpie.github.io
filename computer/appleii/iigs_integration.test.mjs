import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMachine} from './test-support/headless.mjs';
import {fixture} from './test-support/woz-fixture.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('STATEREG restores bank selection without changing the LC write latch', () => {
  const {board:m}=createMachine();
  const b=m.memory, ram=m.legacyMemory;
  ram._main[0x20]=0x11; ram._aux[0x20]=0x22;
  ram._main[0x1000]=0x33; ram._aux[0x1000]=0x44;
  ram._aux_bb[0]=0x55;
  ram.bsr_write=false;
  b.write(0xe1c068,0xf7);
  assert.equal(b.read(0xc068),0xf7);
  assert.equal(b.read(0x20),0x22); assert.equal(b.read(0x1000),0x44);
  assert.equal(b.read(0xd000),0x55); assert.equal(ram.bsr_write,false);
  b.write(0xc068,8);
  assert.equal(b.read(0x20),0x11); assert.equal(b.read(0x1000),0x33);
  assert.equal(b.read(0xfffc),b.read(0xfffffc));
  b.write(0xc003,0); assert.equal(b.read(0xc068),0x28);
});

test('IIgs reset restores ROM vectors after a native program banks in RAM', () => {
  const {board:m}=createMachine();
  m.memory.write(0xc068,0xf7); m.memory.write(0xc035,0x3f);
  m.memory.write(0xc026,0x0d);
  m.legacyMemory._main[0xfffc]=0; m.legacyMemory._main[0xfffd]=0;
  m.reset();
  assert.equal(m.cpu.register.pc,m.memory.read_word(0xfffffc));
  assert.equal(m.memory.readState(),12);
  assert.equal(m.memory.shadow,0); assert.equal(m.memory.adb.readStatus()&0x20,0);
});


test('ROM03 GLU DATA_FULL clears only after KMSTATUS then DATA', () => {
  const {board:m}=createMachine();
  const b=m.memory, adb=b.adb;
  adb.writeStatus(0x10);
  adb.queue.push(0x5a); adb.updateIrq();
  assert.equal(b.intFlag&1,1);
  assert.equal(b.read(0xc026),0x5a);
  assert.equal(adb.queue.length,1,'DATA read alone must not clear DATA_FULL');
  assert.equal(b.intFlag&1,1);
  assert.equal(b.read(0xc027)&0x20,0x20);
  assert.equal(b.read(0xc026),0x5a);
  assert.equal(adb.queue.length,0,'KMSTATUS followed by DATA clears DATA_FULL');
  assert.equal(b.intFlag&1,0);
});

test('ROM03 keyboard latch spans C000-C00F and C010 clears strobe', () => {
  const {board:m}=createMachine();
  const b=m.memory, adb=b.adb;
  adb.writeStatus(0x04);
  adb.setKeyData(0x41,true);
  for(let a=0xc000;a<=0xc00f;a++) assert.equal(b.read(a),0xc1);
  assert.equal(b.intFlag&1,1,'key strobe IRQ must assert when enabled');
  assert.equal(b.read(0xc010),0xc1);
  assert.equal(adb.keyStrobe,false);
  assert.equal(b.intFlag&1,0,'C010 read must clear key strobe IRQ');
  assert.equal(b.read(0xc000),0x41);
});

test('IIgs key GLU exposes mouse, modifiers, status, and IRQs', () => {
  const {board:m}=createMachine();
  const b=m.memory, adb=b.adb;
  adb.setKeyModifiers(0x42);
  assert.equal(b.read(0xc025),0x42);

  // MAME keyglu_816_read returns X then Y and clears mouse-full/IRQ on Y.
  adb.writeStatus(0x40);
  adb.setMouseData(0x12,0x34);
  assert.equal(b.read(0xc027)&0x80,0x80);
  assert.equal(b.intFlag&1,1);
  assert.equal(b.read(0xc024),0x12);
  assert.equal(b.read(0xc027)&0x02,0x02);
  assert.equal(b.read(0xc024),0x34);
  assert.equal(b.read(0xc027)&0x82,0);
  assert.equal(b.intFlag&1,0);

  // DATA-full is reflected in SYSSTAT and participates in the ADB IRQ.
  adb.writeStatus(0x10);
  adb.queue.push(0x5a); adb.updateIrq();
  assert.equal(b.read(0xc027)&0x20,0x20);
  assert.equal(b.intFlag&1,1);
  assert.equal(b.read(0xc026),0x5a);
  assert.equal(b.intFlag&1,0);
});

test('ROM03 expansion RAM mirrors only above the power-of-two ghost boundary', () => {
  const {board:m}=createMachine();
  const b=m.memory;
  assert.equal(b.ram.length,0x200000);
  assert.equal(b.motherboardRam,0x100000);
  assert.equal(b.ghostMask,0x0fffff);
  assert.equal(b.ghostStart,0x200000);
  b.write(0x100123,0x5a);
  assert.equal(b.read(0x200123),0x5a);
  b.write(0x300456,0xa5);
  assert.equal(b.read(0x100456),0xa5);
  assert.equal(b.read(0x800000),0x80,'banks outside the expansion ghost window float');
});

test('ROM03 non-power-of-two expansion leaves holes at ff before ghost mirrors', async () => {
  const {IIgsMemory}=await import('./iigs_memory.js');
  const legacy={
    _main:new Uint8Array(65536), _aux:new Uint8Array(65536),
    read:()=>0, write(){}, reset(){},
    aux_zp:false, aux_read:false, aux_write:false,
    dms_80store:false, dms_page2:false, dms_hires:false,
    bsr_read:false, bsr_bank2:true, bsr_write:true
  };
  const b=new IIgsMemory(legacy,null,0x280000); // 1 MB motherboard + 1.5 MB expansion
  assert.equal(b.ghostMask,0x1fffff);
  assert.equal(b.ghostStart,0x300000);
  b.write(0x100321,0x66);
  assert.equal(b.read(0x280000),0xff,'non-power-of-two expansion hole must read ff');
  assert.equal(b.read(0x300321),0x66,'ghost range mirrors installed expansion');
});

test('IIgs INTEN gates IRQ without clearing VBL and quarter status', () => {
  const {board:m}=createMachine();
  const b=m.memory;
  b.write(0xc041,0x18);
  b.setVblFlag(); b.setQuarterFlag();
  assert.equal(b.read(0xc046)&0x19,0x19);
  b.write(0xc041,0x00);
  assert.equal(b.read(0xc046)&0x18,0x18,'INTEN must preserve pending status');
  assert.equal(b.read(0xc046)&0x01,0,'disabled sources must deassert IRQ');
  b.write(0xc047,0);
  assert.equal(b.read(0xc046)&0x18,0,'CLRVBLINT clears both status bits');
});

test('IIgs VBL follows the video clock with active-high polarity', () => {
  const {board:m}=createMachine();
  assert.equal(m.memory.read(0xc019),0);
  m.video_iigs.tick(2800000*192/(60*262)+1);
  assert.equal(m.memory.read(0xe1c019),0x80);
  m.video_iigs.tick(2800000*70/(60*262));
  assert.equal(m.memory.read(0xc019),0);
});

for(const machine of ['iie','iigs']) {
  test(`${machine} paddle timers use elapsed CPU time and latch each trigger`, () => {
    const {board:m,joystick}=createMachine(machine);
    const unit=10.8*(machine==='iigs'?2.8:1.0205);
    joystick.axis0=100; joystick.axis1=200;
    m.memory.write(0xc070,0);
    for(let i=0;i<1000;i++)assert.equal(m.memory.read(0xc064),0x80);
    m.cycles=Math.ceil(unit*100);
    assert.equal(m.memory.read(0xc064),0);
    assert.equal(m.memory.read(0xc065),0x80);
    m.memory.read(0xc070); // X starts again; the running Y timer is unchanged.
    m.cycles=Math.ceil(unit*200);
    assert.equal(m.memory.read(0xc065),0);
    m.cycles=Math.ceil(unit*201);
    assert.equal(m.memory.read(0xc064),0);
  });
}

test('hidden hi-res page writes survive a page flip', () => {
  const {board:m,pixels}=createMachine('iie');
  m.memory.read(0xc050); m.memory.read(0xc057);
  m.memory.read(0xc055); m.memory.read(0xc054); // initialize both cached pages
  const blank=digest(pixels);
  m.memory.write(0x4000,0x7f);
  assert.equal(digest(pixels),blank,'hidden page must stay hidden');
  m.memory.read(0xc055);
  assert.notEqual(digest(pixels),blank,'page flip must reveal the updated pixels');
});

const replayPath=process.env.TOTAL_REPLAY_IMAGE;
test('Total Replay boots on IIgs, accepts a search, and launches Battlezone',
  {skip:!replayPath}, () => {
    const {board:m,pixels}=createMachine();
    m.clock(3000000); // The browser starts ROM before the file picker is used.
    let reads=0;const execute=m.prodosBlock.execute.bind(m.prodosBlock);
    m.prodosBlock.execute=()=>{reads++;return execute();};
    assert.ok(m.prodosBlock.load_image('Total Replay',readFileSync(replayPath)));
    m.reset(true); // Same path used by Drive.load_media().
    m.clock(10000000);
    assert.ok(reads>=100,'ROM must boot the disk and read the menu assets');
    assert.equal(m.cpu.register.e,true,'compatibility program must enter emulation mode');
    const menu=digest(pixels);
    assert.ok(pixels.some((v,i)=>i%4!==3&&v>100),'menu must render visible pixels');
    for(const c of 'BATTLEZONE') {
      m.keyboard.key_down(c.charCodeAt(0));m.clock(1000000);m.keyboard.key_up();
    }
    assert.notEqual(digest(pixels),menu,'search must update the visible page');
    const before=reads;
    m.keyboard.key_down(13);m.clock(100000);m.keyboard.key_up();m.clock(10000000);
    assert.ok(reads>before,'Return must read the selected game');
    assert.ok(m.cpu.register.pc>=0x800&&m.cpu.register.pc<0xc000,'game must execute in RAM');
    assert.ok(pixels.some((v,i)=>i%4!==3&&v>100),'game title must render');
  });

test('IIgs reset matches MAME ROM03 power-on register defaults', () => {
  const {board:m}=createMachine();
  const b=m.memory;
  assert.equal(b.shadow,0x00);
  assert.equal(b.speed,0x80);
  assert.equal(b.readState(),0x0c);
  assert.equal(m.video_iigs.readNewVideo(),0x01);
  assert.equal(b.intEnable,0x00);
  assert.equal(b.intFlag,0x00);
  assert.equal(b.adb.readStatus(),0x00);
  assert.equal(m.legacyMemory.bsr_read,false);
  assert.equal(m.legacyMemory.bsr_bank2,true);
  assert.equal(m.legacyMemory.bsr_write,true);
  assert.equal(m.legacyMemory._bsr_write_count,0);
});

test('ROM03 leaves its power-on delay loop during headless execution', () => {
  const {board:m}=createMachine();
  let sawDelay=false, leftDelay=false;
  m.cpu.setTrace(e=>{
    const pc=e.pc&0xffff;
    if(pc>=0xfcd9 && pc<=0xfce5) sawDelay=true;
    else if(sawDelay) leftDelay=true;
  });
  for(let i=0;i<20&&!leftDelay;i++)m.clock(250000);
  assert.ok(sawDelay,'ROM03 must execute the FCD9-FCE5 power-on delay');
  assert.ok(leftDelay,'ROM03 delay loop must complete rather than stall permanently');
});

for(const format of ['dsk','woz1','woz2']) {
  test(`IIgs ROM cold-boots a ${format} floppy`, () => {
    const {board:m}=createMachine();
    const disk=new Uint8Array(143360);
    disk.set([1,0x4c,1,8]); // One-sector boot program loops at $0801.
    let image=disk;
    if(format!=='dsk') {
      const track=[];
      for(let s=0;s<16;s++)track.push(...m.floppy525.sector_62encode(disk,0,s));
      image=fixture(format==='woz1'?1:2,track);
    }
    assert.ok(m.floppy525.load_image(0,'boot.'+format,image));
    let booted=false;
    m.cpu.setTrace(e=>{if(e.pc===0x801)booted=true;});
    for(let i=0;i<20&&!booted;i++)m.clock(500000);
    assert.ok(booted,'system ROM must reach the loaded boot sector');
    assert.deepEqual(Uint8Array.from({length:256},(_,i)=>m.memory.read(0x800+i)),disk.slice(0,256));
  });
}

test('IIgs legacy video reads slow RAM and follows shadow and direct writes', () => {
  const {board:m,pixels}=createMachine();
  assert.equal(m.memory.slowE0,m.legacyMemory._main);
  assert.equal(m.memory.slowE1,m.legacyMemory._aux);
  m.memory.write(0xc050,0); m.memory.write(0xc057,0);
  m.memory.write(0x2000,0x7f);
  const visible=digest(pixels);
  assert.equal(m.memory.slowE0[0x2000],0x7f);
  m.memory.write(0xc035,0x02); // Inhibit main HGR page 1 shadowing.
  m.memory.write(0x2000,0);
  assert.equal(m.memory.read(0x2000),0);
  assert.equal(m.memory.slowE0[0x2000],0x7f);
  assert.equal(digest(pixels),visible,'fast-only write must not change video');
  m.memory.write(0xe02000,0);
  assert.notEqual(digest(pixels),visible,'direct slow-bank write must redraw video');
});
