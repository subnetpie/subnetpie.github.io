import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AppleAudio} from './apple_audio.js';
import {createMachine} from './test-support/headless.mjs';
function capture(a) {
 const pcm=[];a.ac={state:'running',currentTime:0};
 a.docWorklet={port:{postMessage(m){if(m.type==='samples')for(let i=0;i<m.count;i++)pcm.push(m.samples[i*2]);}}};
 return pcm;
}
function tone(jitter) {
 const a=new AppleAudio(2800),pcm=capture(a);let clock=0;
 for(let frame=0;frame<30;frame++) {
  a.ac.currentTime+=jitter?(frame%3===0?0.04:0.007):1/60;
  a.begin_segment(clock);
  for(let i=0;i<20;i++){clock+=1400;a.click(clock);}
  a.end_segment(clock);
 }
 a.begin_segment(clock);a.end_segment(clock+2800000);
 return pcm;
}
test('speaker tone is independent of browser frame jitter and settles to silence',()=>{
 const regular=tone(false),jitter=tone(true);
 assert.deepEqual(jitter,regular);
 assert.ok(regular.some(v=>v>0.2)&&regular.some(v=>v< -0.2));
 assert.ok(regular.slice(-100).every(v=>Math.abs(v)<1e-6));
});
test('IIgs ROM startup beep reaches PCM with repeated alternating speaker pulses',()=>{
 const {board:m}=createMachine();
 m.video_iigs.context.putImageData=()=>{};m.video_iigs.context.fillRect=()=>{};
 const pcm=capture(m.audio);let edges=0;const click=m.audio.click.bind(m.audio);
 m.audio.click=c=>{edges++;click(c);};
 for(let i=0;i<90;i++)m.clock(46667);
 let crossings=0;for(let i=1;i<pcm.length;i++)if(pcm[i-1]>0.01&&pcm[i]< -0.01)crossings++;
 assert.ok(edges>60);assert.ok(crossings>30,'startup beep must contain sustained alternating pulses');
 assert.ok(pcm.slice(-100).every(v=>Math.abs(v)<1e-5));
});
test('IIe speaker PCM is flushed at the end of a machine slice',()=>{
 const {board:m}=createMachine('iie');const pcm=capture(m.audio);
 m.audio.click(0);m.clock(20000);assert.ok(pcm.length>100);assert.ok(pcm.some(v=>v>0.1));
});
test('late audio unlock does not pop from an already-held speaker level',()=>{
 const previous=globalThis.window;
 try {
  globalThis.window={AudioContext:class {
   constructor(){this.state='running';this.currentTime=0;this.destination={};}
   createGain(){return {connect(){}};}
  }};
  const a=new AppleAudio(2800);a.click(100);a.init();const pcm=capture(a);
  a.begin_segment(10000);a.end_segment(20000);
  assert.ok(pcm.every(v=>v===0));
 } finally {globalThis.window=previous;}
});
