import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AppleIIMemoryExpansion} from './memory_expansion.js';

class HookMemory {
  constructor(){this.readHooks=[];this.writeHooks=[];this.intCxRom=false;this.intC8Rom=false;this.slotRom=0x02;}
  add_read_hook(fn){this.readHooks.push(fn);}
  add_write_hook(fn){this.writeHooks.push(fn);}
  read(addr){for(const fn of this.readHooks){const v=fn(addr);if(v!==undefined)return v&0xff;}return 0xff;}
  write(addr,value){for(const fn of this.writeHooks){const v=fn(addr,value&0xff);if(v!==undefined)return v;}return undefined;}
}

test('IIgs memory expansion decodes only MAME A2Bus banks 00/01/E0/E1',()=>{
  const memory=new HookMemory();
  const rom=new Uint8Array(0x1000).fill(0x11);
  rom[0x100]=0x42;
  rom[0x800]=0x99;
  const card=new AppleIIMemoryExpansion(memory,{slot:1,rom});

  for(const bank of [0x00,0x01,0xe0,0xe1]){
    memory._a2C800Owner=null;
    assert.equal(memory.read((bank<<16)|0xc100),0x42);
    assert.equal(memory._a2C800Owner,card);
    assert.equal(memory.read((bank<<16)|0xc800),0x99);
  }

  for(const bank of [0x02,0x7f,0xfc,0xfd,0xfe,0xff]){
    memory._a2C800Owner=null;
    assert.equal(memory.read((bank<<16)|0xc100),0xff);
    assert.equal(memory.read((bank<<16)|0xc800),0xff);
    assert.equal(memory._a2C800Owner,null);
    assert.equal(memory.write((bank<<16)|0xc090,0x5a),undefined);
  }
});
