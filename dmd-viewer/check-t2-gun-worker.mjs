import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const worker=new Worker(new URL('./check-rom-worker.mjs',import.meta.url));
let phase='boot',bootTimer,phaseTimer,lastGun,activity=[],frames=0;
try{await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(Error('T2 native gun timed out at '+phase+' '+JSON.stringify(lastGun))),85000);
 const finish=error=>{clearTimeout(timeout);clearTimeout(bootTimer);clearTimeout(phaseTimer);error?reject(error):resolve();};
 worker.on('error',finish);worker.on('message',async d=>{try{
  if(d.type==='ready'){const bytes=await readFile('dist/library/t2_l8-complete.zip');worker.postMessage({type:'start',game:'t2_l8',files:[{name:'t2_l8.zip',bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]});}
  if(d.type==='started')bootTimer=setTimeout(()=>{worker.postMessage({type:'reset'});phase='start';worker.postMessage({type:'recipe',id:'builtin:terminator-2:light-start'});},18000);
  if(d.type==='error'||d.type==='event-status'&&d.error)throw Error(d.message||d.text);
  if(d.type==='frame')frames++;
  if(d.type==='activity')activity.push(...d.rows);
  if(d.type==='recipe-status'){
   if(d.phase==='error')throw Error(d.text);
   if(d.phase==='completed'&&phase==='start'){phase='launch';worker.postMessage({type:'recipe',id:'builtin:terminator-2:light-launch'});}
   else if(d.phase==='completed'&&phase==='launch'){phase='popper';worker.postMessage({type:'matrix',number:77,hold:false});phaseTimer=setTimeout(()=>worker.postMessage({type:'matrix',number:76,hold:false}),250);}
  }
  if(d.type==='machine'){
   lastGun=d.gun;
   if(phase==='popper'&&d.gun?.loaded)phase='aim';
   if(phase==='aim'&&d.gun?.loaded&&d.gun.position>=100&&d.gun.position<160){phase='fire';worker.postMessage({type:'matrix',number:34,hold:false});}
   if(phase==='fire'&&d.gun?.firing)phase='return';
   if(phase==='return'&&d.playfield&& !d.gun.loaded&&!d.gun.firing){assert(d.active.includes(33)||d.gun.position>3);assert(frames>0);assert(activity.some(e=>e.type==='coil'&&e.detail.startsWith('1 ·')&&e.detail.endsWith('on')));assert(activity.some(e=>e.type==='coil'&&e.detail.startsWith('2 ·')&&e.detail.endsWith('on')));finish();}
  }
 }catch(error){finish(error);}});
});console.log(JSON.stringify({result:'T2 real-ROM skull → gun → trigger → playfield passed',frames,events:activity.length,gun:lastGun}));}
finally{clearTimeout(bootTimer);clearTimeout(phaseTimer);await worker.terminate();}
