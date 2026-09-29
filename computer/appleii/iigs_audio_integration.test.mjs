import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,readZipEntries} from './media.js';

for(const [name,path,frames,zip] of [
  ['Thexder',process.env.THEXDER_ZIP,1800,true],
  ['Arkanoid',process.env.ARKANOID_IMAGE,4200,false]
])test(`${name} generates finite, changing DOC PCM through the browser audio queue`,{skip:!path},()=>{
  const {board:m}=createMachine();
  // This test checks audio; skip pixel copying in the headless Canvas mock.
  m.video_iigs.context.putImageData=()=>{};m.video_iigs.context.fillRect=()=>{};
  let data=readFileSync(path),filename=name+'.2mg';
  if(zip){const [entry]=readZipEntries(data);data=entry.data;filename=entry.name;}
  mountMedia(m,decodeMedia(filename,data));m.reset(true);
  let samples=0,nonzero=0,changes=0,peak=0,last=0;
  m.audio.ac={state:'running',currentTime:0};
  m.audio.docWorklet={port:{postMessage(msg){
    if(msg.type!=='samples')return;
    for(let i=0;i<msg.count*2;i++) {
      const value=msg.samples[i];assert.ok(Number.isFinite(value));
      samples++;if(value)nonzero++;if(value!==last)changes++;
      peak=Math.max(peak,Math.abs(value));last=value;
    }
  }}};
  for(let i=0;i<frames;i++) {
    m.clock(46667);m.audio.ac.currentTime=m.cycles/2800000;
    if(i===1180)m.keyboard.key_down(32);
    if(i===1200)m.keyboard.key_up();
  }
  assert.ok(samples>1000000);assert.ok(nonzero>10000);assert.ok(changes>10000);
  assert.ok(peak>0.001&&peak<0.6,'game mix must be audible without clipping');
  assert.equal(m.video_iigs.isSuperHires(),true);
  assert.equal(m.cpu.register.e,false);
});
