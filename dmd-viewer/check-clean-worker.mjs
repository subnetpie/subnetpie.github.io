import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
if(!isMainThread){
 globalThis.onmessage=null;globalThis.postMessage=data=>parentPort.postMessage(data);globalThis.fetch=async url=>new Response(await readFile(url));
 parentPort.on('message',data=>globalThis.onmessage?.({data}));await import('../dmd-viewer-clean/rom-worker.mjs');parentPort.postMessage({type:'test-ready'});
}else{
 for(const [set,file,launch] of [['pop_lx5','pop_lx5.zip',23],['t2_l8','t2_l8-complete.zip',34]]){
  const worker=new Worker(new URL(import.meta.url));let state,frames=0,audio=0,peak=0,error;
  const wait=async predicate=>{const until=Date.now()+45000;while(!predicate()){if(error)throw error;if(Date.now()>until)throw Error(set+' timed out '+JSON.stringify(state));await new Promise(r=>setTimeout(r,50));}};
  const pulse=async n=>{worker.postMessage({type:'input',number:n,pressed:true});await new Promise(r=>setTimeout(r,250));worker.postMessage({type:'input',number:n,pressed:false});await new Promise(r=>setTimeout(r,300));};
  try{
   worker.on('error',e=>error=e);worker.on('message',data=>{if(data.type==='test-ready')readFile(new URL('dist/library/'+file,import.meta.url)).then(bytes=>worker.postMessage({type:'start',set,bytes}));if(data.type==='state')state=data;if(data.type==='frame')frames++;if(data.type==='audio'){audio++;for(const value of data.data)peak=Math.max(peak,Math.abs(value));}if(data.type==='error')error=Error(data.message);});
   await wait(()=>state?.ready);assert.equal(state.doorClosed,false);
   await pulse(5);await pulse(1);await pulse(1);await pulse(13);await wait(()=>state.shooter);await pulse(launch);await wait(()=>state.playfield>0);
   assert.ok(frames>20);assert.ok(audio>20&&peak>.001);assert.ok(state.lamps.length);worker.postMessage({type:'door'});await wait(()=>state.doorClosed===true);worker.postMessage({type:'pause',paused:true});await wait(()=>state.paused);assert.deepEqual(state.held,[]);
   console.log(set+': live DMD, audible ROM output, coin/start/launch, lamps, door and pause passed.');
  }finally{await worker.terminate();}
 }
}
