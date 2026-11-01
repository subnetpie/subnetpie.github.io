import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia,readZipEntries} from './media.js';

const gsosPath=process.env.ACTION_GS_ZIP;

test('IIgs boots mounted GS/OS image to a live Finder desktop',{
  skip:!gsosPath
},()=>{
  const {board:m,pixels}=createMachine();
  m.video_iigs.context.putImageData=()=>{};
  m.video_iigs.context.fillRect=()=>{};

  const [entry]=readZipEntries(readFileSync(gsosPath));
  mountMedia(m,decodeMedia(entry.name,entry.data));
  m.reset(true);

  let finderReady=false;
  for(let i=0;i<4200&&!finderReady;i++) {
    m.clock(46667);
    const shr=(m.video_iigs.readNewVideo()&0x80)!==0;
    const mouseIrq=(m.memory.adb.readStatus()&0x40)!==0;
    const oneSecondIrq=(m.video_iigs.readVGCINT()&0x04)!==0;
    finderReady=shr&&mouseIrq&&oneSecondIrq;
  }

  assert.ok(finderReady,
    'GS/OS must enable Super Hi-Res, ADB mouse IRQs, and the VGC one-second interrupt');

  // Avoid a brittle framebuffer hash: Finder contains a clock and a movable
  // pointer. Instead prove the mounted image reached a graphical desktop by
  // sampling enough distinct RGB colours from the rendered frame.
  const colours=new Set();
  for(let y=0;y<480&&colours.size<8;y+=4) {
    for(let x=0;x<640&&colours.size<8;x+=4) {
      const at=(y*640+x)*4;
      colours.add(`${pixels[at]},${pixels[at+1]},${pixels[at+2]}`);
    }
  }
  assert.ok(colours.size>=8,'Finder frame must contain a graphical SHR desktop');

  assert.ok(m.prodosBlock.drives[0]?.image,'boot SmartPort image remains mounted');
});
