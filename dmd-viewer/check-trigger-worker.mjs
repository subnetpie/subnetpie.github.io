import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
async function check(game,asset,prefix){
 const worker=new Worker(new URL('./check-rom-worker.mjs',import.meta.url));let phase='boot',bootTimer,lampsObserved=false;
 try{await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error(game+' recipe timed out at '+phase)),55000);
  const finish=(error)=>{clearTimeout(timeout);clearTimeout(bootTimer);error?reject(error):resolve()};
  worker.on('error',finish);worker.on('message',async d=>{
   try{
    if(d.type==='ready'){const bytes=await readFile('dist/library/'+asset);worker.postMessage({type:'start',game,files:[{name:game+'.zip',bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]});}
    if(d.type==='error')throw Error(d.message);
    if(d.type==='started'){bootTimer=setTimeout(()=>{if(game==='t2_l8')worker.postMessage({type:'reset'});phase='start';worker.postMessage({type:'recipe',id:'builtin:'+prefix+':light-start'});},game==='t2_l8'?18000:500);}
    if(d.type==='machine'&&d.lamps?.length)lampsObserved=true;
    if(d.type!=='recipe-status')return;
    if(d.phase==='error')throw Error(game+': '+d.text);
    if(d.phase!=='completed')return;
    if(phase==='start'){phase='launch';worker.postMessage({type:'recipe',id:'builtin:'+prefix+':light-launch'});}
    else if(phase==='launch'){phase='shot';worker.postMessage({type:'recipe',id:'builtin:'+prefix+':light-'+(game==='pop_lx5'?'ramp':'jets')});}
    else if(phase==='shot'){assert.match(d.text,/complete/);assert(lampsObserved,'Expected native lamp output for '+game);finish();}
   }catch(error){finish(error);}
  });
 });console.log(game+': real WASM recipe credits/start, coil-confirmed serve, launch and shot completed.');}finally{clearTimeout(bootTimer);await worker.terminate();}
}
await Promise.all([check('pop_lx5','pop_lx5.zip','popeye'),check('t2_l8','t2_l8-complete.zip','terminator-2')]);
