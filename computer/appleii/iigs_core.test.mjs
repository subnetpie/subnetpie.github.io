import assert from 'node:assert/strict';
import {test} from 'node:test';
import {W65C816} from './w65c816.js';
import {IIgsMemory} from './iigs_memory.js';

function machine(program) {
  const ram = new Uint8Array(0x1000000);
  ram.set(program, 0x800); ram[0xfffc] = 0; ram[0xfffd] = 8;
  const bus = {read: a => ram[a], write: (a,v) => {ram[a] = v;},
    read_word: a => ram[a] | ram[a+1] << 8};
  return {ram, cpu: new W65C816(bus)};
}

test('all 256 opcodes execute in both CPU modes', () => {
  const m = machine([]);
  for(const native of [false, true]) for(let op=0; op<256; op++) {
    m.cpu.reset(); m.cpu.register.e = !native;
    if(native) m.cpu.register.p = 0;
    m.ram.set([op,0,0,0], 0x800);
    assert.ok(m.cpu.step() > 0, `opcode ${op.toString(16)}, native=${native}`);
  }
});

test('native 16-bit arithmetic and SEP preserve accumulator high byte', () => {
  const {cpu} = machine([0x18,0xfb,0xc2,0x30,0xa9,0xff,0x12,0x18,0x69,1,0,0xe2,0x20,0xa9,0x56]);
  for(let i=0;i<6;i++) cpu.step();
  assert.equal(cpu.register.a,0x1300);
  cpu.step(); cpu.step();
  assert.equal(cpu.register.a,0x1356);
  assert.equal(cpu.register.e,false);
});

test('decimal ADC and SBC carry through packed BCD', () => {
  const {cpu} = machine([0xf8,0x18,0xa9,0x99,0x69,1,0xe9,1]);
  for(let i=0;i<4;i++) cpu.step();
  assert.equal(cpu.register.a,0); assert.equal(cpu.register.p&1,1);
  cpu.step(); assert.equal(cpu.register.a,0x99); assert.equal(cpu.register.p&1,0);
});

test('MVN resumes until the requested bytes are copied across banks', () => {
  const {cpu,ram} = machine([0x54,2,1]);
  Object.assign(cpu.register,{e:false,p:0,a:1,x:0x100,y:0x200});
  ram.set([0x41,0x42],0x10100);
  assert.equal(cpu.step(),7); assert.equal(cpu.register.pc,0x800);
  assert.equal(cpu.step(),7); assert.equal(cpu.register.pc,0x803);
  assert.deepEqual([...ram.slice(0x20200,0x20202)],[0x41,0x42]);
  assert.equal(cpu.register.a,0xffff); assert.equal(cpu.register.db,2);
});

test('PEA handles an emulation stack boundary', () => {
  const {cpu,ram} = machine([0xf4,0x34,0x12]);
  cpu.register.s=0x100; cpu.step();
  assert.equal(ram[0x100],0x12); assert.equal(ram[0xff],0x34);
  assert.equal(cpu.register.s,0x1fe);
});

function gsBus() {
  return new IIgsMemory({_aux:new Uint8Array(65536),read:()=>0,write(){}},null);
}
test('ADB version FIFO is shared through slow-bank I/O mirrors', () => {
  const bus=gsBus(); bus.write(0xe1c026,0x0d);
  assert.equal(bus.read(0x01c027)&0x20,0x20);
  assert.equal(bus.read(0xe0c026),6);
  assert.equal(bus.read(0xc027)&0x20,0);
});

test('ADB ROM03 sync consumes eight bytes before the next command', () => {
  const bus=gsBus();
  for(const byte of [7,0,0x32,0,0x23,0,0,0,0,0x0b]) bus.write(0xc026,byte);
  assert.deepEqual(Array.from({length:4},()=>bus.read(0xc026)),[0x82,0x32,0,0x23]);
});

test('IWM mode readback reports an empty drive', () => {
  const bus=gsBus(); bus.read(0xc0e8); bus.read(0xc0ed); bus.write(0xc0ef,0x17);
  assert.equal(bus.read(0xe1c0ee),0x97);
});


test('IWM repeated Q7L polling preserves active read decoder state', () => {
  const legacy={_main:new Uint8Array(65536),_aux:new Uint8Array(65536),_read_hooks:[],_write_hooks:[],read:()=>0xff,write:()=>{},reset(){}};
  const bus=new IIgsMemory(legacy,null);
  bus.iwmActive=true; bus.iwmMotor=true; bus.iwmRw=2;
  bus.iwmReadShift=0x55; bus.iwmReadBits=7; bus.iwmReadState=1; bus.iwmNextWindow=1234; bus.iwmData=0xa5;
  bus.iwmAccess(0xc0ee);
  assert.equal(bus.iwmRw,1);
  assert.equal(bus.iwmData,0);
  bus.iwmReadShift=0x42; bus.iwmReadBits=6; bus.iwmReadState=1; bus.iwmNextWindow=5678; bus.iwmData=0x81;
  bus.iwmAccess(0xc0ee);
  assert.equal(bus.iwmReadShift,0x42);
  assert.equal(bus.iwmReadBits,6);
  assert.equal(bus.iwmReadState,1);
  assert.equal(bus.iwmNextWindow,5678);
  assert.equal(bus.iwmData,0x81);
  bus.iwmQ6=true;
  bus.iwmAccess(0xc0ec);
  assert.equal(bus.iwmReadShift,0);
  assert.equal(bus.iwmReadState,1);
  assert.equal(bus.iwmNextWindow,5678);
});
