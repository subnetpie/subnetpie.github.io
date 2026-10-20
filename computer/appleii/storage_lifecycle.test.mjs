// Hardware reference: MAME 0.289 iwm_device::read and
// floppy_image_device::init_floppy_load/call_unload/wpt_r:
// https://github.com/mamedev/mame/blob/mame0289/src/devices/machine/iwm.cpp
// https://github.com/mamedev/mame/blob/mame0289/src/devices/imagedev/floppy.cpp
// These are hardware-path regressions; no GEOS application image is required.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,ejectMedia} from './media.js';
import {fixture} from './test-support/woz-fixture.mjs';

globalThis.window = new EventTarget();
await import('./iigs_storage_registry.js');
const registry=window.__appleIIgsStorage;
const floppy=()=>decodeMedia('data.dsk',new Uint8Array(143360));
const block=()=>decodeMedia('data.hdv',new Uint8Array(512));
const disk35=()=>({...decodeMedia('data.po',new Uint8Array(819200)),physical:'35'});
function machine(){const {board}=createMachine('iigs');window.__appleIIgsBoard=board;return board;}

for(const [id,makeMedia] of [['disk2:d1',floppy],['iigs35:d1',disk35],['smartport:d1',block]]) {
  test(`registry eject clears legacy aliases and compatibility state: ${id}`,async()=>{
    const b=machine(),media=makeMedia();
    mountMedia(b,media,0,{preserveSession:true});
    b.iigsPhysicalMedia={[id]:media};
    const other=floppy();mountMedia(b,other,1,{preserveSession:true});
    await registry.eject(id);
    assert.ok(b.mountedMedia[0]===null,'legacy alias cleared');
    assert.equal(registry.state(id).mounted,false);
    assert.ok(b.prodosBlock.drives[0].image===null);
    assert.equal(b.floppy525._disks[0].medium,null);
    assert.ok(b.memory.floppy35Drives[0].media===null);
    assert.equal(b.mountedMedia[1],other);
    await registry.eject(id); // repeated eject must remain empty
  });
}

test('legacy eject clears registry records for all devices at the drive index',()=>{
  const b=machine(),media=floppy();
  mountMedia(b,media,0,{preserveSession:true});
  b.iigsPhysicalMedia={'disk2:d1':media,'smartport:d1':block(),'iigs35:d1':disk35(),'disk2:d2':floppy()};
  ejectMedia(b,0);
  for(const id of ['disk2:d1','smartport:d1','iigs35:d1'])assert.equal(registry.state(id).mounted,false,id);
  assert.ok(b.iigsPhysicalMedia['disk2:d2']);
});

test('physical eject leaves independently mounted devices at the same index alone',async()=>{
  const b=machine(),hard=block();
  mountMedia(b,hard,0,{preserveSession:true});
  const media=floppy();
  await registry.mountFile('disk2:d1',{name:media.name,arrayBuffer:async()=>media.data.buffer});
  await registry.eject('disk2:d1');
  assert.equal(b.mountedMedia[0],hard);
  assert.ok(b.prodosBlock.drives[0].image);
  assert.equal(registry.state('smartport:d1').mounted,true);
});

test('block eject removes media metadata and retains unacknowledged change',()=>{
  const b=machine(),media=disk35();media.persistenceKey='old-image';
  mountMedia(b,media,0,{preserveSession:true});
  b.prodosBlock.eject(0);b.prodosBlock.eject(0);
  const d=b.prodosBlock.drives[0];
  assert.equal(d.physical,null);assert.equal(d.persistenceKey,null);
  assert.equal(d.changed,true);
  assert.equal(b.prodosBlock.enabled,true,'firmware remains callable after hot eject');
});

test('IWM 5.25 status polling observes empty / protected / empty without reset',()=>{
  const b=machine(),m=b.memory;
  m.read(0xc0e9);m.read(0xc0ed);
  assert.equal(m.read(0xc0ee)&0xa0,0x20,'empty drive sensor is uncovered');
  const regs={...b.cpu.register},disk=b.floppy525._active_disk;
  disk.head_pos=8;
  mountMedia(b,floppy(),0,{preserveSession:true});
  assert.equal(m.read(0xc0ee)&0xa0,0xa0,'inserted read-only medium blocks sensor');
  assert.equal(m.read(0xc0ec),0xff,'data stream available after status polling');
  ejectMedia(b,0);assert.equal(m.read(0xc0ed)&0xa0,0x20,'odd-address status read');
  assert.equal(m.read(0xc0ee)&0xa0,0x20);
  assert.equal(disk.motor_on,true);assert.equal(disk.head_pos,8);
  assert.deepEqual({...b.cpu.register},regs);
});

for(const version of [1,2])test(`WOZ${version} hot insertion starts at current cycle`,()=>{
  const b=machine();let cycles=0xf0000000;
  b.floppy525._get_cycles=()=>cycles;
  b.memory.read(0xc0e9);
  const media=decodeMedia('late.woz',fixture(version,[0xd5,0xaa,0x96]));
  mountMedia(b,media,0,{preserveSession:true});
  const medium=b.floppy525._active_disk.medium;
  assert.equal(medium._last_cycle,cycles);
  cycles+=32;assert.equal(b.memory.read(0xc0ec),0xd5);
  cycles+=32;assert.equal(b.memory.read(0xc0ec),0xaa);
});

test('registry replacement updates a corresponding legacy label',async()=>{
 const b=machine();mountMedia(b,floppy(),0,{preserveSession:true});
 await registry.mountFile('disk2:d1',{name:'replacement.dsk',arrayBuffer:async()=>new Uint8Array(143360).buffer});
 assert.equal(b.mountedMedia[0].name,'replacement.dsk');
 assert.equal(registry.state('disk2:d1').name,'replacement.dsk');
});
test('empty SmartPort eject leaves the 3.5 compatibility mirror mounted',async()=>{
 const b=machine(),media=disk35();mountMedia(b,media,0,{preserveSession:true});
 await registry.eject('smartport:d1');
 assert.equal(b.mountedMedia[0],media);
 assert.ok(b.prodosBlock.drives[0].image);
 assert.equal(registry.state('iigs35:d1').mounted,true);
});

for(const unit of [3,4])test('registry eject clears SmartPort unit '+unit+' and disables saved mount',async()=>{
 const b=machine(),id='smartport:d'+unit,calls=[];
 window.__appleIIgsPersistence={setKeep:async(...args)=>calls.push(args)};
 try {
  await registry.mountFile(id,{name:'extra.hdv',arrayBuffer:async()=>new Uint8Array(512).buffer});
  b.mountedMedia??=[];b.mountedMedia[unit-1]=b.iigsPhysicalMedia[id];
  await registry.eject(id);
  assert.ok(b.mountedMedia[unit-1]===null);
  assert.ok(b.prodosBlock.drives[unit-1].image===null);
  assert.equal(registry.state(id).mounted,false);
  assert.deepEqual(calls,[['s7d'+unit,false]]);
 } finally {delete window.__appleIIgsPersistence;}
});
