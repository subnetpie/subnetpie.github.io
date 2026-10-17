import assert from 'node:assert/strict';
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
