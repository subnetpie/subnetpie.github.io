import assert from 'node:assert/strict';
import {test} from 'node:test';

// Install the same IIgs prototype/configuration layers as the browser without
// constructing the DOM-only configuration UI.
globalThis.window={};
globalThis.location={search:'?machine=iie'};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

await import('./iigs_configuration.js');
await import('./iigs_slot_bus.js');
const {createMachine}=await import('./test-support/headless.mjs');
const {hasMountedMedia,bootTargetMounted,coldBootStorage}=await import('./iigs_insert_boot.js');

test('HDV insertion stays hot and explicit Boot cold-starts ROM03',()=>{
  const {board:m}=createMachine('iigs');

  assert.equal(hasMountedMedia(m),false,'machine must begin with no mounted media');
  assert.ok(m.prodosBlock.drives.every(d=>!d.image),'all SmartPort drives start empty');
  assert.ok(m.floppy525._disks.every(d=>!d.medium),'both 5.25-inch drives start empty');
  assert.ok(m.memory.floppy35Drives.every(d=>!d.media),'both 3.5-inch drives start empty');

  // Block 0 is deliberately tiny: ROM03's slot firmware loads it at $0800,
  // enters at $0801, writes a marker, then loops. Reaching $0300 proves the
  // real ROM03 scan found Slot 7 and executed the selected HDV boot sector.
  const image=new Uint8Array(2*512);
  image.set([
    0x01,                   // ProDOS boot block signature / entry padding
    0xa9,0xa5,             // $0801: LDA #$A5
    0x8d,0x00,0x03,        //        STA $0300
    0x4c,0x06,0x08         //        JMP $0806
  ]);

  assert.equal(m.prodosBlock.load_image('inserted.hdv',image,{},0),true);
  assert.equal(hasMountedMedia(m),true);
  assert.equal(bootTargetMounted(m,'s7d1'),true);

  // Insertion is a hot-swap. Running the existing machine must not silently
  // turn the Insert action into a power cycle or execute the new boot block.
  m.clock(500000);
  assert.notEqual(m.memory.read(0x0300),0xa5,
    'inserting media alone unexpectedly rebooted the machine');

  const selected=[];
  assert.equal(coldBootStorage(m,'s7d1',target=>selected.push(target)),true,
    'explicit Boot must cold-reset the selected mounted device');
  assert.deepEqual(selected,['s7d1','s7d1'],
    'boot target must be applied before and after controller reset');

  let executed=false;
  for(let i=0;i<30&&!executed;i++){
    m.clock(500000);
    executed=m.memory.read(0x0300)===0xa5;
  }
  assert.ok(executed,
    'ROM03 did not execute the HDV boot sector after explicit cold boot');

  assert.ok(m.prodosBlock.drives[0].image,'booted HDV remains mounted');
  assert.ok(m.prodosBlock.drives.slice(1).every(d=>!d.image),'other SmartPort drives remain empty');
  assert.ok(m.floppy525._disks.every(d=>!d.medium),'5.25-inch drives remain empty');
  assert.ok(m.memory.floppy35Drives.every(d=>!d.media),'3.5-inch drives remain empty');
});

test('explicit boot rejects empty or invalid physical targets',()=>{
  const {board:m}=createMachine('iigs');
  assert.equal(bootTargetMounted(m,'s5d1'),false);
  assert.equal(bootTargetMounted(m,'s6d1'),false);
  assert.equal(bootTargetMounted(m,'s7d1'),false);
  assert.equal(coldBootStorage(m,'s7d1'),false);
  assert.equal(coldBootStorage(m,'auto'),false);
});
