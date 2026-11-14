import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import createRuntime from './dist/emulator/dmd-runtime.mjs';
import {PopeyeMachine} from './dist/popeye-events.mjs';
import {popeyeInitialNvram} from './dist/popeye-initial-nvram.mjs';
import {parsePac} from './dist/pac.mjs';
import {LiveColorizer} from './dist/live-colorizer.mjs';
const core=await createRuntime({wasmBinary:gunzipSync(await readFile('dist/emulator/dmd-runtime.wasm.gz')),print(){},printErr(){}});
try{
  for(const d of ['','roms','nvram','cfg','memcard','inp','sta'])core.FS.mkdirTree('/pinmame/'+d);
  core.FS.writeFile('/pinmame/roms/pop_lx5.zip',await readFile('dist/library/pop_lx5.zip'));
  core.FS.writeFile('/pinmame/nvram/pop_lx5.nv',popeyeInitialNvram());core._viewer_init();
  assert.equal(core.ccall('viewer_audit','string',['string'],['pop_lx5']),'');
  assert.equal(core.ccall('viewer_run','number',['string'],['pop_lx5']),0);
  const machine=new PopeyeMachine({setSwitch:(n,v)=>core._viewer_switch(n,v)});
  const colorizer=new LiveColorizer(await parsePac(await readFile('dist/library/popeye.pac')));
  const frame=core._malloc(131072),meta=core._malloc(32),audio=core._malloc(262144);
  const began=performance.now();let phase=0,frames=0,samples=0,peak=0,phaseAt=0,secondServe=false;
  machine.beginGame();
  while(performance.now()-began<32000){
    const t=performance.now()-began;machine.update(t,n=>core._viewer_solenoid(n));
    if(phase===0&&machine.shooter){phase=1;phaseAt=t;machine.event('launch');console.log('ROM trough coil served a ball.');}
    if(phase===1&&machine.playfield&&!machine.snapshot().busy){phase=2;phaseAt=t;machine.event('bumpers');console.log('ROM launch coil launched the ball; bumper sequence fired.');}
    if(phase===2&&t-phaseAt>3000&&!machine.snapshot().busy){phase=3;machine.event('drain-left');console.log('Drain returned the ball to the trough.');}
    if(phase===3&&machine.shooter){secondServe=true;break;}
    if(core._viewer_frame(frame,meta)){
      frames++;const m=Array.from(core.HEAP32.subarray(meta/4,meta/4+5)),[w,h,depth]=m;
      const raw=core.HEAPU8.slice(frame,frame+w*h),planes=Array.from({length:m[3]},(_,i)=>core.HEAPU8.slice(frame+w*h+i*m[4],frame+w*h+(i+1)*m[4]));
      colorizer.render(raw,w,h,depth,t,planes);assert.equal(w,128);assert.equal(h,32);
    }
    const count=core._viewer_audio(audio,65536,meta);samples+=count;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(core.HEAPF32[audio/4+i]));
    await new Promise(r=>setTimeout(r,8));
  }
  assert.equal(secondServe,true,'ROM must serve the next ball after draining');
  assert(frames>100);assert(samples>0);assert(peak>0);assert(colorizer.matches>0);
  assert.equal(machine.trough,5);assert.equal(machine.playfield,0);assert(machine.shooter);
  core._viewer_stop();console.log(JSON.stringify({frames,samples,peak,pacTriggers:colorizer.matches,secondServe}));
}finally{core.PThread.terminateAllThreads();}
