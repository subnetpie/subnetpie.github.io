import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

// Resolve the browser's absolute module URL locally for the headless test.
const source = await readFile(new URL('./FloppyWoz525.js', import.meta.url), 'utf8');
const romURL = new URL('./rom/disk16-p5_341-0027.js', import.meta.url).href;
const {Floppy525} = await import('data:text/javascript;base64,' + Buffer.from(
  source.replace('https://subnetpie.github.io/computer/appleii/rom/disk16-p5_341-0027.js', romURL)
).toString('base64'));
const {W65C02S} = await import('./w65c02s.js');
const {Memory} = await import('./memory.js');
const {rom_342_0304_cd} = await import('./rom/342-0304-cd.js');
const {rom_342_0303_ef} = await import('./rom/342-0303-ef.js');

function fixture(version, track, trackId = 0) {
  const blocks = Math.ceil(track.length / 512);
  const out = Buffer.alloc(version === 1 ? 256 + (trackId + 1) * 6656 : 1536 + blocks * 512);
  out.write(`WOZ${version}`); out.set([255, 10, 13, 10], 4);
  out.write('INFO', 12); out.writeUInt32LE(60, 16);
  out[20] = version; out[21] = 1; out[22] = 1;
  out.write('TMAP', 80); out.writeUInt32LE(160, 84);
  out.fill(255, 88, 248); out[88] = trackId; out[89] = trackId;
  out.write('TRKS', 248); out.writeUInt32LE(out.length - 256, 252);
  if(version === 1) {
    const at = 256 + trackId * 6656;
    out.set(track, at);
    out.writeUInt16LE(track.length, at + 6646);
    out.writeUInt16LE(track.length * 8, at + 6648);
  } else {
    const at = 256 + trackId * 8;
    out.writeUInt16LE(3, at); out.writeUInt16LE(blocks, at + 2);
    out.writeUInt32LE(track.length * 8, at + 4);
    out.set(track, 1536);
  }
  return out;
}

function machine() {
  let cycles = 0;
  const mem = new Memory(rom_342_0304_cd, rom_342_0303_ef);
  const floppy = new Floppy525(6, mem, () => {}, () => cycles);
  const cpu = new W65C02S(mem);
  return {mem, floppy, cpu, at(c) { cycles = c; }, step() { cycles += cpu.step(); }, cycles() { return cycles; }};
}

for(const version of [1, 2]) {
  test(`WOZ${version}: latch exposes partial data between completed bytes`, () => {
    const m = machine();
    assert.ok(m.floppy.load_image(0, 'timing.woz', fixture(version, [0xd5, 0xaa, 0x96])));
    m.at(32); assert.equal(m.mem.read(0xc0ec), 0xd5);
    m.at(36); assert.equal(m.mem.read(0xc0ec), 0xd5);
    m.at(40); assert.equal(m.mem.read(0xc0ec) & 0x80, 0);
    m.at(64); assert.equal(m.mem.read(0xc0ec), 0xaa);
    m.at(96); assert.equal(m.mem.read(0xc0ec), 0x96);
  });

  test(`WOZ${version}: Disk II ROM boots and decodes all 256 sector bytes`, () => {
    const m = machine();
    const disk = new Uint8Array(143360);
    for(let i = 0; i < 256; i++) disk[i] = (i * 73 + 19) & 255;
    disk[0] = 1; // Boot ROM loads one sector and transfers to $0801.
    const track = [];
    for(let s = 0; s < 16; s++) track.push(...m.floppy.sector_62encode(disk, 0, s));
    assert.ok(m.floppy.load_image(0, 'boot.woz', fixture(version, track)));
    m.cpu.reset(); m.cpu.register.pc = 0xc600;
    while(m.cycles() < 2000000 && m.cpu.register.pc !== 0x801) m.step();
    assert.equal(m.cpu.register.pc, 0x801, 'boot ROM must reach loaded sector');
    assert.deepEqual(m.mem._main.slice(0x800, 0x900), disk.slice(0, 256));
  });
}

test('WOZ1: TMAP can reference a track record above index 34', () => {
  const m = machine();
  assert.ok(m.floppy.load_image(0, 'half-tracks.woz', fixture(1, [0xd5], 40)));
  m.at(32); assert.equal(m.mem.read(0xc0ec), 0xd5);
});

test('DSK boot remains functional', () => {
  const m = machine();
  const disk = new Uint8Array(143360); disk[0] = 1;
  assert.ok(m.floppy.load_image(0, 'boot.dsk', disk));
  m.cpu.reset(); m.cpu.register.pc = 0xc600;
  while(m.cycles() < 2000000 && m.cpu.register.pc !== 0x801) m.step();
  assert.equal(m.cpu.register.pc, 0x801);
  assert.deepEqual(m.mem._main.slice(0x800, 0x900), disk.slice(0, 256));
});

// Start at the system reset vector, including the slot-7 card and I/O switches.
// Direct C600 tests alone miss boot-priority failures before Disk II is entered.
const {ProDOSBlockDevice} = await import('./prodos_block.js');
const {IOManager} = await import('./io_manager.js');
for(const version of [1, 2]) {
  test(`WOZ${version}: system reset skips empty slot 7 and boots the floppy`, () => {
    const m = machine();
    const hardDrive = new ProDOSBlockDevice(7, m.mem);
    const display = new Proxy({}, {get: () => () => {}});
    const io = new IOManager(m.mem, {key: 0, strobe() {}}, display, display,
      display, display, () => {}, {});
    io.reset();
    const disk = new Uint8Array(143360);
    for(let i = 0; i < 256; i++) disk[i] = (i * 73 + 19) & 255;
    disk[0] = 1;
    const track = [];
    for(let s = 0; s < 16; s++) track.push(...m.floppy.sector_62encode(disk, 0, s));
    assert.ok(m.floppy.load_image(0, 'reset-boot.woz', fixture(version, track)));
    m.cpu.reset(); m.cpu.register.pc = m.mem.read_word(0xfffc);
    let enteredFloppy = false;
    while(m.cycles() < 3000000 && m.cpu.register.pc !== 0x801) {
      assert.notEqual(m.cpu.register.pc, 0xc700, 'must not boot empty hard drive');
      if(m.cpu.register.pc === 0xc600) enteredFloppy = true;
      m.step();
    }
    assert.ok(enteredFloppy);
    assert.equal(m.cpu.register.pc, 0x801);
    assert.deepEqual(m.mem._main.slice(0x800, 0x900), disk.slice(0, 256));
    assert.equal(hardDrive.image, null);
  });
}

test('mounted hard drive retains its boot signature and block reads', () => {
  const m = machine();
  const hardDrive = new ProDOSBlockDevice(7, m.mem);
  assert.equal(m.mem.read(0xc701), 0);
  const image = new Uint8Array(512); image[0] = 1; image[1] = 0x60;
  assert.ok(hardDrive.load_image('test.po', image));
  assert.deepEqual([1,3,5,7].map(off => m.mem.read(0xc700 + off)), [0x20,0,3,0x3c]);
  m.cpu.reset(); m.cpu.register.pc = 0xc700;
  while(m.cycles() < 10000 && m.cpu.register.pc !== 0x801) m.step();
  assert.equal(m.cpu.register.pc, 0x801);
  assert.deepEqual(m.mem._main.slice(0x800, 0xa00), image);
});
