from pathlib import Path
import re

root=Path('computer/appleii')

# 1) Fix IIgs compatibility status reads. MAME 0.289 c000_r returns the
# machine-owned INTCXROM/SLOTC3ROM latches directly. Nox Archaist writes
# C00A then reads C017 before running its 128K aux-memory probe.
p=root/'iigs_memory.js'
s=p.read_text()
needle='''      if(io>=0xc000 && io<=0xc00f) return this.adb.readKeyData();\n      if(io===0xc010) return this.adb.readAnyKeyAndClearStrobe();\n      if(io===0xc068) return this.readState();\n'''
repl='''      if(io>=0xc000 && io<=0xc00f) return this.adb.readKeyData();\n      if(io===0xc010) return this.adb.readAnyKeyAndClearStrobe();\n      // MAME apple2gs_state::c000_r owns these latches in IIgs machine state.\n      // Do not fall through to IOManager's independent IIe Cx/C3 latches: Nox\n      // Archaist explicitly SETINTC3ROMs at C00A then verifies C017 is clear\n      // before entering its 128K auxiliary-memory test.\n      if(io===0xc015) return this.intCxRom ? 0x80 : 0x00;\n      if(io===0xc017) return this.slotC3Rom ? 0x80 : 0x00;\n      if(io===0xc068) return this.readState();\n'''
if s.count(needle)!=1:
    raise SystemExit('iigs_memory insertion point mismatch')
p.write_text(s.replace(needle,repl))

# 2) Ensure every runtime importer refers to one identical Motherboard module
# URL. A query-string mismatch creates a second ES-module instance/class and
# makes prototype-based IIgs configuration patches ineffective.
old_mb='https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1'
new_mb='https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261017-nox128k1'
importers=[
    'iigs_memory_expansion.js','iigs_slot_bus.js','iigs_slot4_devices.js',
    'display_speed_panel.js','script.js','iigs_extra_drives.js','iigs_configuration.js'
]
for name in importers:
    q=root/name
    t=q.read_text()
    if old_mb not in t:
        raise SystemExit(f'old Motherboard URL missing in {name}')
    q.write_text(t.replace(old_mb,new_mb))

# Motherboard itself must fetch the corrected IIgs memory implementation.
p=root/'motherboard.js'
s=p.read_text()
s2=re.sub(r'https://subnetpie\.github\.io/computer/appleii/iigs_memory\.js\?v=[^"\']+',
          'https://subnetpie.github.io/computer/appleii/iigs_memory.js?v=20261017-nox128k1',s,count=1)
if s2==s:
    raise SystemExit('motherboard iigs_memory import not updated')
p.write_text(s2)

# slot4 imports memory expansion itself; keep it on the same fresh module URL
# as controls-menu so only one patch module instance is evaluated.
p=root/'iigs_slot4_devices.js'
s=p.read_text()
s2=re.sub(r'\./iigs_memory_expansion\.js\?v=[^"\']+',
          './iigs_memory_expansion.js?v=20261017-nox128k1',s)
if s2==s:
    raise SystemExit('slot4 memory expansion import not updated')
p.write_text(s2)

# 3) Bust the direct control-loader URLs for every module whose Motherboard
# import changed, and the top-level script URL in index.html.
p=root/'controls-menu.js'
s=p.read_text()
asset_updates={
    'config':'./iigs_configuration.js?v=20261017-nox128k1',
    'slot4':'./iigs_slot4_devices.js?v=20261017-nox128k1',
    'memoryExpansion':'./iigs_memory_expansion.js?v=20261017-nox128k1',
    'slotBus':'./iigs_slot_bus.js?v=20261017-nox128k1',
    'extraDrives':'./iigs_extra_drives.js?v=20261017-nox128k1',
    'speed':'./display_speed_panel.js?v=20261017-nox128k1',
}
for key,value in asset_updates.items():
    s2=re.sub(rf"({re.escape(key)}:)('[^']*')", lambda m: m.group(1)+repr(value), s, count=1)
    if s2==s:
        raise SystemExit(f'controls-menu asset {key} not updated')
    s=s2
p.write_text(s)

p=root/'index.html'
s=p.read_text()
s2=re.sub(r'\./script\.js\?v=[^"\']+', './script.js?v=20261017-nox128k1', s, count=1)
if s2==s:
    raise SystemExit('index script cache key not updated')
p.write_text(s2)

# 4) Regression reproducing the actual Nox startup assumption and proving
# independent main/aux 64K halves without requiring any slot memory card.
test=root/'nox_128k.test.mjs'
test.write_text(r'''import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsMemory} from './iigs_memory.js';

function legacyForNox(){
  const legacy={
    _main:new Uint8Array(65536), _aux:new Uint8Array(65536),
    _read_hooks:[], _write_hooks:[],
    aux_zp:false, aux_read:false, aux_write:false,
    bsr_read:false, bsr_write:false, bsr_bank2:false,
    dms_80store:false, dms_page2:false, dms_hires:false,
    read(){return 0xff;}, write(){}, reset(){}
  };
  // Deliberately emulate the stale legacy C3 status value that previously
  // masked the IIgs machine latch. Correct IIgsMemory must not consult it.
  legacy._read_hooks.push(addr=>addr===0xc017 ? 0x80 : undefined);
  return legacy;
}

test('Nox Archaist IIgs C00A/C017 preflight reaches the 128K probe',()=>{
  const bus=new IIgsMemory(legacyForNox(),null);
  bus.write(0xc00b,0); // external C3 first, to prove C00A changes the latch
  assert.equal(bus.read(0xc017)&0x80,0x80);
  bus.write(0xc00a,0); // SETINTC3ROM, exactly as Nox does
  assert.equal(bus.read(0xc017)&0x80,0x00);
});

test('IIgs provides independent main and auxiliary 64K compatibility RAM',()=>{
  const bus=new IIgsMemory(legacyForNox(),null);

  bus.write(0xc004,0); // RAMWRT main
  bus.write(0xc002,0); // RAMRD main
  bus.write(0x0800,0x11);
  bus.write(0x0c00,0x33);

  bus.write(0xc005,0); // RAMWRT aux
  bus.write(0xc003,0); // RAMRD aux
  bus.write(0x0800,0xee);
  bus.write(0x0c00,0xee);
  assert.equal(bus.read(0x0800),0xee);
  assert.equal(bus.read(0x0c00),0xee);

  // Core of Nox's relocated aux-memory probe: mutate one aux location and
  // verify the other is independent.
  bus.write(0x0c00,0xdc);
  assert.equal(bus.read(0x0c00),0xdc);
  assert.equal(bus.read(0x0800),0xee);

  bus.write(0xc004,0); // RAMWRT main
  bus.write(0xc002,0); // RAMRD main
  assert.equal(bus.read(0x0800),0x11);
  assert.equal(bus.read(0x0c00),0x33);
});
''')

print('Nox 128K IIgs compatibility fix staged')
