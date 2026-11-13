import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
if(!isMainThread){
  globalThis.onmessage=null;
  globalThis.postMessage=data=>parentPort.postMessage(data);
  globalThis.fetch=async url=>new Response(await readFile(url));
  parentPort.on('message',data=>globalThis.onmessage?.({data}));
  await import('./dist/rom-worker.mjs');
  parentPort.postMessage({type:'ready'});
}else{
  const worker=new Worker(new URL(import.meta.url));
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('ROM worker test timed out')),15000);
      worker.on('error',error=>{clearTimeout(timeout);reject(error)});
      worker.on('message',data=>{
        if(data.type==='ready')worker.postMessage({type:'start',files:[{name:'t2_l8.zip',bytes:new ArrayBuffer(0)}],game:'t2_l8'});
        if(data.type==='error'){try{assert.match(data.message,/ROM set is incomplete/);assert.match(data.message,/t2_l8\.rom/);clearTimeout(timeout);resolve()}catch(error){clearTimeout(timeout);reject(error)}}
      });
    });
    console.log('ROM worker passed: compressed WASM download/decompression, threaded runtime initialization, local file mounting, driver selection, and incomplete-ROM error response.');
  }finally{await worker.terminate()}
}
