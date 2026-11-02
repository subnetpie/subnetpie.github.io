import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {AppleAudio} from './apple_audio.js';
function ring(rate=48000) {
  let Processor;
  vm.runInNewContext(readFileSync(new URL('./doc_audio_worklet.js',import.meta.url),'utf8'),{
    AudioWorkletProcessor:class{constructor(){this.port={};}},sampleRate:rate,
    registerProcessor:(name,p)=>Processor=p
  });
  const p=new Processor();
  const send=(count,left=0.5,right=-0.25)=>p.port.onmessage({data:{type:'samples',count,samples:Float32Array.from({length:count*2},(_,i)=>i&1?right:left)}});
  const render=(n=128)=>{const out=[new Float32Array(n),new Float32Array(n)];p.process([], [out]);return out;};
  return {p,send,render};
}
for(const rate of [44100,48000])test(`worklet buffers frame jitter and resamples at ${rate} Hz`,()=>{
  const {p,send,render}=ring(rate);
  send(300);assert.ok(render()[0].every(v=>v===0));
  send(700);const before=p.count;const [l,r]=render(256);
  assert.ok(l[255]>0.49&&r[255]<-0.24);
  assert.ok(Math.abs((before-p.count)-256*22050/rate)<=1);
  for(let i=0;i<60;i++){
    send(i&1?441:294); // alternating 20ms / 13.3ms delivery
    assert.ok(render(Math.round(rate/60))[0].every(v=>v>0.49));
  }
});
test('worklet bounds stale backlog, fades underruns, and clears both channels',()=>{
  const {p,send,render}=ring();send(10000);
  assert.ok(p.count<=p.maxQueue);render();
  const [l]=render(5000);assert.ok(Math.abs(l.at(-1))<1e-6);
  assert.equal(p.primed,false);
  send(1000);p.port.onmessage({data:{type:'clear'}});
  assert.ok(render().every(channel=>channel.every(v=>v===0)));
});
test('audio reset stops queued fallback buffers and clears the worklet',()=>{
  const a=new AppleAudio(2800);let stopped=0,cleared=0;
  a.docSources.add({stop(){stopped++;}});
  a.docWorklet={port:{postMessage(m){if(m.type==='clear')cleared++;}}};
  a.docSignalLeft=1;a.reset();
  assert.equal(stopped,1);assert.equal(cleared,1);
  assert.equal(a.docSignalLeft,0);assert.equal(a.docSources.size,0);
});
