import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ProDOSBlockDevice} from './prodos_block.js';

function fixture() {
  const memory = {
    _main: new Uint8Array(0x10000), _aux: new Uint8Array(0x10000),
    aux_zp: false, aux_read: false, aux_write: false,
    add_read_hook() {}, add_write_hook() {},
    read(addr) {
      const aux = addr < 0x200 ? this.aux_zp : this.aux_read;
      return (aux ? this._aux : this._main)[addr];
    },
    write(addr, value) {
      (addr < 0x200 ? (this.aux_zp ? this._aux : this._main)
        : (this.aux_write ? this._aux : this._main))[addr] = value & 0xff;
    },
  };
  const device = new ProDOSBlockDevice(7, memory);
  const image = new Uint8Array(1024);
  image[512] = 0x5a;
  assert.equal(device.load_image('test.hdv', image), true);
  return {memory, device};
}

function request(memory, command) {
  for (const [addr, value] of [[0x42, command], [0x43, 0x70],
    [0x44, 0], [0x45, 8], [0x46, 1], [0x47, 0]]) memory.write(addr, value);
}

test('ProDOS block read uses auxiliary zero-page parameters and auxiliary buffer', () => {
  const {memory, device} = fixture();
  memory.aux_zp = memory.aux_write = true;
  request(memory, 1);
  assert.equal(memory._main[0x43], 0, 'main zero page remains stale');
  assert.equal(device.execute(), 0);
  assert.equal(memory._aux[0x800], 0x5a);
  assert.equal(memory._main[0x800], 0);
});

test('ProDOS block write reads the selected auxiliary buffer', () => {
  const {memory, device} = fixture();
  memory.aux_zp = memory.aux_write = true;
  memory.aux_read = true;
  request(memory, 2);
  memory._aux[0x800] = 0x6b;
  assert.equal(device.execute(), 0);
  assert.equal(device.image[512], 0x6b);
  assert.equal(device.dirty, true);
});

test('main-bank ProDOS requests continue to work', () => {
  const {memory, device} = fixture();
  request(memory, 1);
  assert.equal(device.execute(), 0);
  assert.equal(memory._main[0x800], 0x5a);
});

test('legacy firmware advertises the drive pair that the block interface accepts',()=>{
  const {memory,device}=fixture();
  assert.equal(device.read(0xc7fe)&0x10,0x10);
  device.load_image('second.hdv',new Uint8Array(device.image),{},1);
  for(const unit of [0x70,0xf0]) {
    request(memory,1);memory.write(0x43,unit);
    assert.equal(device.execute(),0);
    assert.equal(memory._main[0x800],0x5a);
  }
});
