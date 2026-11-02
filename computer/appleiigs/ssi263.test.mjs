import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SSI263} from './ssi263.js';
import {Mockingboard} from './mockingboard.js';
import {phonemeInfo,phonemePCM} from './vendor/ssi263-phonemes.js';
function speak(chip,phoneme=2,clock=0){chip.write(3,128,clock);chip.write(0,128|phoneme,clock);chip.write(2,0x90,clock);chip.write(3,15,clock);}
test('all recorded phonemes are bounded, audible, finite; pause and power-down are silent',()=>{
 assert.equal(phonemeInfo.length,62);assert.equal(phonemePCM.length,156566);
 for(let phoneme=0;phoneme<64;phoneme++){
  const chip=new SSI263();speak(chip,phoneme);const pcm=Array.from({length:1024},(_,i)=>chip.sample(i*chip.duration()/1024));
  assert.ok(pcm.every(Number.isFinite));
  const peak=Math.max(...pcm.map(Math.abs));assert.ok(peak<.5);
  if(phoneme===0)assert.equal(peak,0);else assert.ok(peak>.001,'phoneme '+phoneme);
  chip.write(3,128,0);assert.equal(chip.sample(0),0);
 }
});
test('completion uses emulated time, repeats after acknowledgement, respects IRQ disable',()=>{
 const edges=[];const chip=new SSI263({request:state=>edges.push(state)});speak(chip);
 const end=chip.deadline;chip.sync(end-1);assert.equal(chip.pending,false);chip.sync(end);assert.equal(chip.pending,true);assert.equal(edges.at(-1),true);
 const count=edges.length;chip.sync(end*2);assert.equal(edges.length,count);
 chip.write(1,7,end*2);assert.equal(edges.at(-1),false);chip.sync(end*3);assert.equal(edges.at(-1),true);
 chip.write(3,128,end*3);chip.write(0,2,end*3);chip.write(3,15,end*3);chip.sync(chip.deadline);assert.equal(chip.pending,true);assert.equal(edges.at(-1),false);
 chip.reset();assert.equal(chip.poweredDown,true);assert.equal(chip.pending,false);
});
test('rate/duration controls change completion time; amplitude scales output',()=>{
 const a=new SSI263(),b=new SSI263();speak(a);speak(b);b.write(2,0xe0,0);assert.ok(b.deadline<a.deadline);
 b.write(2,0x90,0);b.write(3,5,0);assert.ok(Math.abs(a.sample(1000)/3-b.sample(1000))<1e-10);
});
test('C440 speech routes to VIA B CA1, aliases VIA A and leaves timer IRQ asserted',()=>{
 let clock=0,line=false,write,read;
 const board=new Mockingboard({add_read_hook:f=>read=f,add_write_hook:f=>write=f},{clock:()=>clock,irq:s=>line=s});
 write(0xc48e,0x82);write(0xc48c,0x0c);
 write(0xc443,128);write(0xc440,0x82);write(0xc442,0x90);write(0xc443,15);
 assert.equal(board.via[0].r[3],15);assert.equal(board.speech[1].reg[3],15);
 write(0xc40e,192);write(0xc404,1);write(0xc405,0);
 clock=board.speech[1].deadline;board.sync(clock);assert.equal(read(0xc48d)&0x82,0x82);assert.equal(line,true);
 read(0xc481);assert.equal(read(0xc48d)&2,0);assert.equal(line,true,'VIA A timer remains asserted');
 read(0xc404);assert.equal(line,false);
 write(0xc441,0);clock+=board.speech[1].duration();board.sync(clock);assert.equal(read(0xc48d)&2,2);
 board.reset();assert.equal(line,false);
});

test('speech reaches the shared stereo audio queue on Apple II and IIgs',async()=>{
 const {createMachine}=await import('./test-support/headless.mjs');
 for(const type of ['apple2e','iigs']){
  const {board}=createMachine(type);if(type==='iigs')board.memory.write(0xc02d,16);
  for(const [reg,value] of [[3,128],[0,0x82],[2,0x90],[3,15]])board.memory.write(0xc440+reg,value);
  let left=0,right=0,frames=0;
  board.audio.ac={state:'running',currentTime:0};board.audio.docWorklet={port:{postMessage(msg){if(msg.type!=='samples')return;for(let i=0;i<msg.count;i++){const l=msg.samples[i*2],r=msg.samples[i*2+1];assert.ok(Number.isFinite(l)&&Number.isFinite(r));left=Math.max(left,Math.abs(l));right=Math.max(right,Math.abs(r));frames++;}}}};
  board.audio.end_segment(board.audio.cpu_hz*.12);assert.ok(frames>2000);assert.equal(left,0);assert.ok(right>.005&&right<1);
  board.reset();assert.equal(board.mockingboard.speech[1].poweredDown,true);
 }
});

test('frame timing stays latched while duration bits change, and IRQ-disable preserves mode',()=>{
 const c=new SSI263();c.write(0,0x42,0);c.write(2,0xa8,0);c.write(3,15,0);
 const frame=c.duration();c.write(0,0xc2,1);assert.equal(c.mode,1);assert.equal(c.duration(),frame);
 c.write(3,128,2);c.write(0,2,2);c.write(3,15,2);assert.equal(c.enabled,false);assert.equal(c.mode,1);assert.equal(c.duration(),frame);
});
test('pitch is independent of duration and rate; immediate and transitioned inflection differ',()=>{
 const c=new SSI263();speak(c);c.write(1,0x50,0);c.write(2,0xa8,0);c.sample(1);
 const pitch=c.pitchHz();assert.ok(Math.abs(pitch-1023000/(8*(4096-0xa80)))<1e-9);
 c.write(0,0x42,1);c.write(2,0xd8,1);c.sample(2);assert.equal(c.pitchHz(),pitch);
 c.write(1,0x70,2);c.sample(3);assert.ok(c.pitchHz()>pitch);
 c.write(3,128,4);c.write(0,0xc2,4);c.write(1,0x50,4);c.write(3,15,4);c.write(1,0x70,4);c.sample(1004);
 assert.ok(c.pitchHz()>pitch);assert.ok(c.pitchCode<0xb80);
});
test('articulation blends phoneme transitions and filter frequency affects timbre',()=>{
 const a=new SSI263(),b=new SSI263();speak(a);speak(b);a.sample(1000);b.sample(1000);
 a.write(3,0x0f,1000);b.write(3,0x7f,1000);a.write(0,0x91,1000);b.write(0,0x91,1000);
 assert.notEqual(a.sample(4000),b.sample(4000));
 const c=new SSI263(),d=new SSI263();speak(c);speak(d);c.write(4,0xe9,0);d.write(4,0x80,0);
 assert.notEqual(c.sample(1000),d.sample(1000));assert.equal(c.pitchHz(),d.pitchHz());
});
