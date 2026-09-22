import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Z80 } from './z80.js';
function machine(bytes = []) {
 const memory = new Uint8Array(65536); memory.set(bytes);
 const cpu = new Z80(a => memory[a], (a,v) => memory[a] = v);
 cpu.SP = 0x9000; return {cpu, memory};
}
test('reset follows MAME device_reset, without resetting IM or total cycles', () => {
 const {cpu} = machine(); cpu.IM=2;cpu.A=17;cpu.cycles=99;cpu.setIrqLine(true);cpu.pulseNmi();cpu.reset();
 assert.equal(cpu.PC,0);assert.equal(cpu.IM,2);assert.equal(cpu.A,17);assert.equal(cpu.cycles,99);assert.equal(cpu.irqLine,true);assert.equal(cpu.nmiPending,false);assert.equal(cpu.IFF1,false);assert.equal(cpu.IFF2,false);
 cpu.setReset(true);const r=cpu.R;assert.equal(cpu.step(),4);assert.equal(cpu.PC,0);assert.equal(cpu.R,r);cpu.setReset(false);
});
test('M1, operand hooks, PC wrap, and refresh bit 7',()=>{
 const {cpu}=machine();cpu.PC=65535;cpu.R=255;const reads=[];
 cpu.setInstructionReaders(a=>{reads.push(['op',a]);return 0x01},a=>{reads.push(['arg',a]);return a===0?0x34:0x12});
 assert.equal(cpu.step(),10);assert.equal(cpu.BC,0x1234);assert.equal(cpu.PC,2);assert.equal(cpu.R,0x80);assert.deepEqual(reads,[['op',65535],['arg',0],['arg',1]]);
});
test('EI delay, EI/EI extension, and DI cancellation',()=>{
 for(const [bytes,expected] of [[[251,0],[1,2,56]],[[251,251,0],[1,2,3,56]],[[251,243,0],[1,2,3,4]]]){
 const {cpu}=machine(bytes);cpu.IM=1;cpu.requestIrq(255);for(const pc of expected){cpu.step();assert.equal(cpu.PC,pc)}
 }
});
test('HOLD acknowledges once; asserted IRQ line persists; R increments',()=>{
 const {cpu}=machine();cpu.IM=1;cpu.IFF1=true;cpu.requestIrq();let ack=0;cpu.onIrqAcknowledge=()=>{ack++};
 assert.equal(cpu.step(),13);assert.equal(cpu.irqPending,false);assert.equal(cpu.R,1);assert.equal(ack,1);
 cpu.setIrqLine(true);cpu.IFF1=true;cpu.step();assert.equal(cpu.irqLine,true);cpu.clearIrq();assert.equal(cpu.irqLine,false);
});
test('MAME IM0 RST, NOP, packed CALL and JP responses',()=>{
 for(const [vector,cycles,pc,stack] of [[255,13,56,true],[0,2,0,false],[0xcd1234,19,0x1234,true],[0xc35678,12,0x5678,false]]){
 const {cpu}=machine();cpu.IFF1=true;cpu.requestIrq(vector);assert.equal(cpu.step(),cycles);assert.equal(cpu.PC,pc);assert.equal(cpu.SP,stack?0x8ffe:0x9000);
 }
});
test('IM2 uses odd vector addresses and wraps pointer read',()=>{
 const {cpu,memory}=machine();cpu.IM=2;cpu.I=255;memory[65535]=0x34;memory[0]=0x12;cpu.IFF1=true;cpu.requestIrq(255);
 assert.equal(cpu.step(),19);assert.equal(cpu.PC,0x1234);
});
test('NMI edges can nest and do not overwrite IFF2; RETN restores it',()=>{
 const {cpu,memory}=machine();cpu.IFF1=false;cpu.IFF2=true;cpu.pulseNmi();assert.equal(cpu.step(),11);assert.equal(cpu.IFF2,true);
 cpu.pulseNmi();assert.equal(cpu.step(),11);assert.equal(cpu.SP,0x8ffc);assert.equal(cpu.R,2);
 memory.set([0xed,0x45],0x66);cpu.step();assert.equal(cpu.IFF1,true);cpu.clearInterrupt(true);assert.equal(cpu.nmiPending,false);
});
test('HALT exit and LD A,I interrupt parity quirk',()=>{
 const {cpu}=machine([0xed,0x57,0x76]);cpu.IFF1=cpu.IFF2=true;cpu.step();assert(cpu.F&4);cpu.requestIrq(255);cpu.step();assert.equal(cpu.F&4,0);
 const m=machine([0x76]);m.cpu.step();assert.equal(m.cpu.halted,true);m.cpu.pulseNmi();m.cpu.step();assert.equal(m.cpu.halted,false);assert.equal(m.memory[0x8ffe],1);
});
test('wait cycles do not execute instructions or increment R',()=>{
 const {cpu}=machine();cpu.addStall(5);cpu.addStall(7);assert.equal(cpu.step(),12);assert.equal(cpu.PC,0);assert.equal(cpu.R,0);assert.equal(cpu.step(),4);
});
test('repeated index prefixes, ignored DD/ED, indexed CB refresh',()=>{
 const {cpu}=machine([0xdd,0xfd,0x21,0x34,0x12]);assert.equal(cpu.step(),18);assert.equal(cpu.IY,0x1234);assert.equal(cpu.R,3);
 const b=machine([0xdd,0xed,0x44]);b.cpu.A=1;assert.equal(b.cpu.step(),12);assert.equal(b.cpu.A,255);
 const d=machine([0xdd,0xcb,0,0x46]);d.cpu.IX=0x8000;assert.equal(d.cpu.step(),20);assert.equal(d.cpu.R,2);
});
test('opcode families return finite timings without missing method calls',()=>{
 for(const prefix of [[],[0xcb],[0xed],[0xdd],[0xfd]])for(let op=0;op<256;op++){
 const {cpu}=machine([...prefix,op,0,0,0]);const cycles=cpu.step();assert(Number.isFinite(cycles)&&cycles>0,`${prefix}:${op}`);assert(cpu.PC>=0&&cpu.PC<=65535);
 }
});
test('all five entry pages use the shared module; HTML controls stay exposed',async()=>{
 for(const name of ['galaga','bosco','scramble','pacman','mspacman']){
 const script=await readFile(new URL(`../arcade/${name}/script.js`,import.meta.url),'utf8');const html=await readFile(new URL(`../arcade/${name}/index.html`,import.meta.url),'utf8');
 assert.match(script,/import \{ Z80 \} from "\.\.\/\.\.\/cpu\/z80.js"/);assert(!script.includes('class Z80'));assert(!html.includes('WbRWLBJ'));assert.match(html,/<script type="module" src="\.\/script.js"/);
 if(name.includes('pacman')){assert(!script.includes('cpu.fetchOpcode ='));assert(!script.includes('cpu.irqPending ='));assert.match(script,/Object.assign\(window, \{ insertCoin1, start1Player/)}
 }
});
