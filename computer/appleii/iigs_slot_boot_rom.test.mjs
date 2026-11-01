import assert from 'node:assert/strict';
import {test} from 'node:test';

// Load the same prototype layers the browser installs, but suppress DOM-only
// configuration UI construction. The bug fixed here existed only after
// iigs_configuration.js replaced ProDOSBlockDevice.buildRom().
globalThis.window={};
globalThis.location={search:'?machine=iie'};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

const {ProDOSBlockDevice}=await import('./prodos_block.js');
await import('./iigs_configuration.js');
await import('./iigs_slot_bus.js');

function device(slot){
  return new ProDOSBlockDevice(slot,{
    add_read_hook(){},
    add_write_hook(){}
  });
}

function contains(bytes,pattern){
  outer: for(let i=0;i<=bytes.length-pattern.length;i++){
    for(let j=0;j<pattern.length;j++)if(bytes[i+j]!==pattern[j])continue outer;
    return true;
  }
  return false;
}

test('browser-configured SmartPort slot ROM uses ROM03-safe inline boot request',()=>{
  const d=device(7);
  const boot=d.rom.slice(0x08,0x50);

  assert.ok(contains(boot,[0xa9,0x00,0x8d,0x08,0xc0,0x8d,0x02,0xc0,0x8d,0x04,0xc0]),
    'boot stub must force bank-0 main RAM selectors before loading block 0');
  assert.ok(contains(boot,[0xad,0xf0,0xc0]),
    'slot 7 boot must execute the request directly through $C0F0');
  assert.equal(contains(boot,[0x20,0x80,0xc7]),false,
    'ROM03 boot must not JSR C780 using firmware entry stack state');
});

test('ROM03-safe boot request follows a relocated SmartPort slot',()=>{
  const d=device(7);
  d.setSlot(6);
  const boot=d.rom.slice(0x08,0x50);

  assert.equal(d.romBase,0xc600);
  assert.equal(d.ioBase,0xc0e0);
  assert.ok(contains(boot,[0xad,0xe0,0xc0]),
    'relocated slot 6 boot must use the slot 6 hardware window');
  assert.equal(contains(boot,[0x20,0x80,0xc6]),false);
});
