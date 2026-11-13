import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {RomHistory} from './dist/rom-history.mjs';
const frame=value=>({data:Uint8Array.of(value),w:1,h:1,levels:2,colors:[[0,0,0],[0,255,0]]});
const history=new RomHistory({maxDuration:1000,maxBytes:10000});
history.recordFrame(0,frame(0),'a','First');history.recordFrame(400,frame(1),'b','Second');
history.recordAudio(500,{data:Float32Array.from({length:500},(_,i)=>i),channels:1,rate:1000});
history.recordFrame(700,frame(0),'c','Third');
const second=history.clip(2);assert.equal(second.start,400);assert.equal(second.audio[0].data.length,100);assert.equal(second.audio[0].data[0],400);
assert.equal(second.frames[0].data[0],1);
history.recordFrame(2000,frame(1),'d','Fourth');assert(history.clips.every(c=>c.end>=c.start));assert(history.bytes<=10000);
const bounded=new RomHistory({maxBytes:100,maxDuration:500});
for(let t=0;t<2000;t+=100){bounded.recordFrame(t,frame(1),'a','Test');bounded.recordAudio(t,{data:new Float32Array(20),channels:1,rate:1000});assert(bounded.bytes<=100);}
bounded.clear();assert.equal(bounded.bytes,0);assert.equal(bounded.clips.length,0);
const packets=new RomHistory();
packets.recordFrame(0,frame(0),'a','Test');
for(let i=0;i<3;i++)packets.recordAudio(10,{data:new Float32Array(10),channels:1,rate:1000});
assert.deepEqual(packets.audio.map(a=>[a.start,a.end]),[[0,10],[10,20],[20,30]],'Batched audio packets must not overlap');

// Exercise the actual player with recorded frames/audio and a controllable clock.
const dom=new JSDOM('<section id="romPanel"></section><input id="pacKey">');
let clock=1000,raf;const scheduled=[];
Object.assign(globalThis,{document:dom.window.document,Option:dom.window.Option,requestAnimationFrame:fn=>{raf=fn},crossOriginIsolated:true,addEventListener:()=>{}});
Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});
dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},arc(){},fill(){}});
class Audio {
  state='running';get currentTime(){return clock/1000}async resume(){}
  createBuffer(channels,count,rate){const data=Array.from({length:channels},()=>new Float32Array(count));return {duration:count/rate,getChannelData:c=>data[c],data};}
  createGain(){return {gain:{value:1},connect(){}}}
  createBufferSource(){return {connect(){},disconnect(){},stop(){this.stopped=true},start(when){scheduled.push({when,buffer:this.buffer,node:this})}}}
}
class Worker{constructor(){Worker.last=this;this.messages=[]}postMessage(data){this.messages.push(data)}terminate(){this.terminated=true}}
Object.assign(globalThis,{AudioContext:Audio,Worker});
const {createRomViewer}=await import('./dist/rom-viewer.mjs');
const viewer=createRomViewer({setMode(){}}),$=id=>document.getElementById(id);
await viewer.accept([new File([new Uint8Array(10)],'pop_lx5.zip'),new File([readFileSync('dist/library/popeye.pac')],'Popeye.pac')]);
viewer.setActive(true);await viewer.start();const worker=Worker.last;
worker.onmessage({data:{type:'started',info:'Popeye'}});
assert.equal($('romPreviousAnimation').disabled,true);
for(let i=0;i<=100;i++){
  clock=1000+i*100;
  worker.onmessage({data:{type:'frame',w:8,h:1,depth:2,data:new Uint8Array(8).fill(i%2),planes:[]}});raf(clock);
  worker.onmessage({data:{type:'audio',data:new Float32Array(100).fill(i),channels:1,rate:1000}});
}
assert.equal($('romPreviousAnimation').disabled,false);
const before=scheduled.length;await $('romPreviousAnimation').onclick();assert.equal($('romState').textContent,'REPLAYING');
assert(worker.messages.some(m=>m.type==='pause'&&m.paused));
clock+=30;raf(clock);assert(scheduled.length>before,'Replay must schedule captured PCM');
assert(scheduled.at(-1).buffer.data[0].some(v=>v>0),'Replay retains original sound samples');
await $('romPreviousAnimation').onclick();assert.equal($('romPreviousAnimation').disabled,true);assert.equal($('romNextAnimation').disabled,false);
await $('romPause').onclick();assert.equal($('romState').textContent,'REPLAY PAUSED');const pausedCount=scheduled.length;clock+=500;raf(clock);assert.equal(scheduled.length,pausedCount);
await $('romPause').onclick();assert.equal($('romState').textContent,'REPLAYING');
await $('romNextAnimation').onclick();assert.equal($('romNextAnimation').disabled,true);
await $('romLive').onclick();assert.equal($('romState').textContent,'RUNNING');assert.equal($('romLive').disabled,true);assert.equal(worker.messages.at(-1).paused,false);
await $('romPreviousAnimation').onclick();$('romReset').onclick();assert.equal($('romState').textContent,'RUNNING');assert.equal($('romPreviousAnimation').disabled,true);
viewer.stop();assert.equal($('romAnimation').disabled,true);assert.equal(worker.terminated,true);
console.log('Animation replay passed: captured PCM, color frames, clip boundaries, memory limits, previous/next, pause/resume, return to live, and reset/stop cleanup.');
