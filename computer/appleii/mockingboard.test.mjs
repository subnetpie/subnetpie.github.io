import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mockingboard,AY8913} from './mockingboard.js';
import {W65C02S} from './w65c02s.js';
function card(){let clock=0,line=false;const reads=[],writes=[];const m=new Mockingboard({add_read_hook:f=>reads.push(f),add_write_hook:f=>writes.push(f)},{clock:()=>clock,irq:s=>line=s});return {m,read:a=>reads[0](a),write:(a,v)=>writes[0](a,v),tick:n=>{clock+=n;m.sync(clock)},irq:()=>line};}
function ayWrite(c,base,r,v){c.write(base+3,255);c.write(base+2,255);c.write(base+1,r);c.write(base,7);c.write(base,4);c.write(base+1,v);c.write(base,6);c.write(base,4);}
test('both AY chips latch independent registers and support data readback',()=>{
 const c=card();ayWrite(c,0xc400,8,15);ayWrite(c,0xc480,8,7);
 assert.equal(c.m.ay[0].reg[8],15);assert.equal(c.m.ay[1].reg[8],7);
 c.write(0xc403,0);c.write(0xc400,5);assert.equal(c.read(0xc401),15);
 assert.equal(c.read(0xc300),undefined);assert.equal(c.read(0x02c400),undefined);
 c.write(0xc400,0);assert.equal(c.m.ay[0].reg[8],0);
});
test('VIA free-running timers, interrupt enables and acknowledgements are independent',()=>{
 const c=card();c.write(0xc40b,64);c.write(0xc40e,192);c.write(0xc404,8);c.write(0xc405,0);
 c.tick(9);assert.equal(c.irq(),false);c.tick(1);assert.equal(c.irq(),true);
 assert.equal(c.read(0xc40d),192);c.read(0xc404);assert.equal(c.irq(),false);
 c.tick(10);assert.equal(c.irq(),true);c.write(0xc40e,64);assert.equal(c.irq(),false);
 c.write(0xc48e,160);c.write(0xc488,3);c.write(0xc489,0);c.tick(5);assert.equal(c.irq(),true);c.read(0xc488);assert.equal(c.irq(),false);
});
test('tone is stereo, envelope terminates, noise varies, reset is silent',()=>{
 const c=card();ayWrite(c,0xc400,0,100);ayWrite(c,0xc400,7,62);ayWrite(c,0xc400,8,15);
 const samples=Array.from({length:300},(_,i)=>c.m.sample(i*46));assert.ok(samples.some(x=>x[0]>.05));assert.ok(samples.every(x=>x[1]===0));
 const ay=new AY8913();ay.address=13;ay.write(0);ay.advance(8*32*17);assert.equal(ay.envStep,0);assert.equal(ay.holding,true);
 const before=ay.noise;ay.advance(1000);assert.notEqual(ay.noise,before);
 c.m.reset();assert.deepEqual(c.m.sample(0),[0,0]);
});
test('65C02 hardware IRQ pushes return address/status, clears decimal and honors mask',()=>{
 const bytes=new Uint8Array(65536);const mem={read:a=>bytes[a&65535],write:(a,v)=>bytes[a&65535]=v,read_word:a=>bytes[a]|bytes[a+1]<<8};const cpu=new W65C02S(mem);cpu.reset();cpu.reg.pc=0x2345;cpu.reg.sp=255;cpu.reg.flag.d=true;cpu.reg.flag.i=false;bytes[65534]=0;bytes[65535]=0x40;bytes[0x4000]=0xea;
 cpu.irq(true);assert.equal(cpu.step(),7);assert.equal(cpu.reg.pc,0x4000);assert.equal(bytes[511],0x23);assert.equal(bytes[510],0x45);assert.equal(bytes[509]&16,0);assert.equal(cpu.reg.flag.d,false);assert.equal(cpu.step(),2);
});

test('Apple II and IIgs route slot registers and mix stereo PCM through existing audio queue',async()=>{
 const {createMachine}=await import('./test-support/headless.mjs');
 for(const type of ['apple2e','iigs']){
  const {board}=createMachine(type);
  if(type==='iigs')board.memory.write(0xc02d,16); // Control Panel: slot 4 = Your Card
  const c={write:(a,v)=>board.memory.write(a,v)};
  ayWrite(c,0xc400,0,100);ayWrite(c,0xc400,7,62);ayWrite(c,0xc400,8,15);
  let peak=0,rightPeak=0,count=0;
  board.audio.ac={state:'running',currentTime:0};
  board.audio.docWorklet={port:{postMessage(msg){if(msg.type!=='samples')return;for(let i=0;i<msg.count;i++){peak=Math.max(peak,Math.abs(msg.samples[i*2]));rightPeak=Math.max(rightPeak,Math.abs(msg.samples[i*2+1]));count++;}}}};
  board.audio.end_segment(board.audio.cpu_hz/10);
  assert.ok(count>1000);assert.ok(peak>.05&&peak<1);assert.equal(rightPeak,0);
  board.memory.write(0xc40e,192);board.memory.write(0xc404,4);board.memory.write(0xc405,0);board.mockingboard.sync(100);
  assert.equal(board.mockingboard.via[0].irq,true);
  if(type==='iigs'){assert.equal(board.iigsIrq.mockingboard,true);board.memory.setExternalIrq('doc',true);board.memory.read(0xc404);assert.equal(board.iigsIrq.mega,true);}
  board.reset();assert.equal(board.mockingboard.via[0].irq,false);
 }
});

test('AY reset invalidates the address latch until a new register is selected',()=>{
 const c=card();ayWrite(c,0xc400,2,7);c.write(0xc400,0);c.write(0xc400,4);
 c.write(0xc401,0x42);c.write(0xc400,6);c.write(0xc400,4);
 assert.ok(c.m.ay[0].reg.every(value=>value===0));
});
test('one-shot T1 keeps reloading with visible FFFF but produces only one interrupt',()=>{
 const c=card();c.write(0xc404,4);c.write(0xc405,0);c.write(0xc40e,192);
 c.tick(6);assert.equal(c.read(0xc405),255);assert.equal(c.read(0xc404),255);assert.equal(c.irq(),false);
 c.tick(1);assert.equal(c.read(0xc404),4);c.tick(6);assert.equal(c.read(0xc404),4);assert.equal(c.irq(),false);
});
test('indexed 65C02 stores acknowledge timer through the mirrored VIA register',()=>{
 const {m,write,read,tick}=card();const bytes=new Uint8Array(65536);
 const bus={read:a=>read(a)??bytes[a],write:(a,v)=>{if(write(a,v)===undefined)bytes[a]=v;},read_word:a=>bytes[a]|bytes[a+1]<<8};
 const cpu=new W65C02S(bus);cpu.reset();cpu.reg.pc=0x200;cpu.reg.x=4;bytes.set([0x9d,0x40,0xc4],0x200);
 write(0xc404,0);write(0xc405,0);tick(2);assert.equal(m.via[0].r[13]&64,64);
 assert.equal(cpu.step(),5);assert.equal(m.via[0].r[13]&64,0);
});
test('SC-01A speech uses VIA1 PB, CB2 falling strobe and CB1 A/R like MAME 0.289',()=>{
 const c=card(),v=c.m.via[0];
 c.write(0xc402,0xff);                 // VIA1 DDRB output
 c.write(0xc40e,0x90);                 // enable CB1 interrupt
 c.write(0xc40c,0xf0);                 // CB1 positive edge, CB2 manual high
 c.write(0xc400,0x80|0x20);            // inflection 2, phone A (0x20)
 c.write(0xc40c,0xd0);                 // CB2 high->low: SC-01A strobe
 assert.equal(c.m.speech.phone,0x20);
 assert.equal(c.m.speech.inflection,2);
 assert.equal(c.m.speech.arState,false);
 assert.equal(v.r[13]&0x10,0,'falling A/R must not fire positive-edge CB1 IRQ');
 c.tick(300000);
 assert.equal(c.m.speech.arState,true);
 assert.equal(v.r[13]&0x10,0x10,'speech completion must raise CB1 interrupt');
 assert.equal(c.irq(),true);
 c.read(0xc400);
 assert.equal(v.r[13]&0x10,0,'ORB access acknowledges CB1');
 assert.equal(c.irq(),false);
});
