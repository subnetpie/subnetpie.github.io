import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import createRuntime from './dist/emulator/dmd-runtime.mjs';
import {parsePac} from './dist/pac.mjs';
import {LiveColorizer} from './dist/live-colorizer.mjs';
const core=await createRuntime({wasmBinary:gunzipSync(await readFile('dist/emulator/dmd-runtime.wasm.gz')),print:()=>{},printErr:()=>{}});
try{
 for(const dir of ['','roms','nvram','cfg','memcard','inp','sta'])core.FS.mkdirTree('/pinmame/'+dir);
 core.FS.writeFile('/pinmame/roms/t2_l8.zip',new Uint8Array(await readFile('dist/library/t2_l8-complete.zip')));
 core._viewer_init();
 assert.equal(core.ccall('viewer_audit','string',['string'],['t2_l8']),'');
 console.log('Complete Terminator 2 ZIP passed every native ROM audit.');
 const colorizer=new LiveColorizer(await parsePac(new Uint8Array(await readFile('dist/library/terminator-2.pac'))));
 const frame=core._malloc(131072),meta=core._malloc(32),sound=core._malloc(65536*4);
 assert.equal(core.ccall('viewer_run','number',['string'],['t2_l8']),0);
 let frames=0,samples=0,peak=0,w=0,h=0;
 const start=performance.now();
 while(performance.now()-start<6000){
  await new Promise(resolve=>setTimeout(resolve,16));
  const n=core._viewer_frame(frame,meta);
  if(n){const m=Array.from(core.HEAP32.subarray(meta/4,meta/4+5));[w,h]=m;const data=new Uint8Array(w*h);data.set(core.HEAPU8.subarray(frame,frame+w*h));const planes=Array.from({length:m[3]},(_,i)=>new Uint8Array(core.HEAPU8.subarray(frame+w*h+i*m[4],frame+w*h+(i+1)*m[4])));colorizer.render(data,w,h,m[2],performance.now()-start,planes);frames++;}
  const count=core._viewer_audio(sound,65536,meta);samples+=count;
  for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(core.HEAPF32[sound/4+i]));
 }
 const state=core._viewer_running();const logs=core.ccall('viewer_logs','string');
 core._viewer_stop();
 console.log(JSON.stringify({state,frames,w,h,audioSamples:samples,audioPeak:peak,pacTriggers:colorizer.matches,lastPacTrigger:colorizer.lastMatch}));
 console.log(logs.split('\n').filter(s=>/error|fail|missing|disabled/i.test(s)).join('\n'));
 assert.equal(state,1);assert(frames>0);assert(samples>0);assert(peak>0,'Expected non-silent sound output');assert.equal(w,128);assert.equal(h,32);
}finally{core.PThread.terminateAllThreads();}
