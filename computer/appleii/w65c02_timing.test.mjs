import assert from 'node:assert/strict';
import {test} from 'node:test';
import {W65C02S} from './w65c02s.js';

function makeCpu() {
  const mem = new Uint8Array(0x10000);
  const bus = {
    read: a => mem[a & 0xffff],
    write: (a,v) => { mem[a & 0xffff] = v & 0xff; },
    read_word: a => mem[a & 0xffff] | (mem[(a + 1) & 0xffff] << 8)
  };
  return {cpu:new W65C02S(bus), mem};
}

test('65C02 indexed reads charge page-cross cycle', () => {
  const {cpu,mem}=makeCpu();
  cpu.register.x=1;

  cpu.register.pc=0x0200;
  mem.set([0xbd,0xfe,0x20],0x0200); // LDA $20FE,X
  assert.equal(cpu.step(),4);

  cpu.register.pc=0x0300;
  mem.set([0xbd,0xff,0x20],0x0300); // LDA $20FF,X -> $2100
  assert.equal(cpu.step(),5);
});

test('65C02 indexed stores use fixed store timing', () => {
  const {cpu,mem}=makeCpu();
  cpu.register.x=1;
  cpu.register.a=0x5a;

  cpu.register.pc=0x0200;
  mem.set([0x9d,0xff,0x20],0x0200); // STA $20FF,X
  assert.equal(cpu.step(),5);
  assert.equal(mem[0x2100],0x5a);
});

test('65C02 taken branch charges page-cross cycle', () => {
  const {cpu,mem}=makeCpu();
  cpu.register.flag.z=false;

  cpu.register.pc=0x0200;
  mem.set([0xd0,0x02],0x0200);
  assert.equal(cpu.step(),3);

  cpu.register.pc=0x02fd;
  mem.set([0xd0,0x02],0x02fd); // base after operand $02FF -> $0301
  assert.equal(cpu.step(),4);
});

test('65C02 (zp),Y read and store timing matches page-cross rules', () => {
  const {cpu,mem}=makeCpu();
  cpu.register.y=1;
  mem[0x10]=0xff; mem[0x11]=0x20;

  cpu.register.pc=0x0200;
  mem.set([0xb1,0x10],0x0200); // LDA ($10),Y -> $2100
  assert.equal(cpu.step(),6);

  cpu.register.pc=0x0210;
  cpu.register.a=0xa5;
  mem.set([0x91,0x10],0x0210); // STA ($10),Y
  assert.equal(cpu.step(),6);
  assert.equal(mem[0x2100],0xa5);
});


test('65C02 subroutine and stack timings match hardware', () => {
  const {cpu,mem}=makeCpu();

  cpu.register.pc=0x0200;
  mem.set([0x20,0x00,0x03],0x0200); // JSR $0300
  assert.equal(cpu.step(),6);
  assert.equal(cpu.register.pc,0x0300);

  mem[0x0300]=0x60; // RTS
  assert.equal(cpu.step(),6);
  assert.equal(cpu.register.pc,0x0203);

  cpu.register.a=0x44;
  cpu.register.pc=0x0400;
  mem.set([0x48,0x68],0x0400); // PHA / PLA
  assert.equal(cpu.step(),3);
  cpu.register.a=0;
  assert.equal(cpu.step(),4);
  assert.equal(cpu.register.a,0x44);
});
