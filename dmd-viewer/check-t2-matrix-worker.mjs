import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const worker=new Worker(new URL('./check-rom-worker.mjs',import.meta.url));
const file=await readFile('dist/library/t2_l8-complete.zip');
let frames=0,phase=0;
try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('T2 matrix native test timed out at phase '+phase)),18000);
worker.on('error',reject);worker.on('message',d=>{
 if(d.type==='ready')worker.postMessage({type:'start',game:'t2_l8',files:[{name:'t2_l8.zip',bytes:file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength)}]});
 
 if(d.type==='error'){clearTimeout(timeout);reject(Error(d.message));}
 if(d.type==='frame'){frames++;if(phase===0&&frames===25){phase=1;worker.postMessage({type:'matrix',number:71,hold:true});}}
 if(d.type!=='machine')return;
 if(phase===0&&frames>20){phase=1;worker.postMessage({type:'matrix',number:71,hold:true});}
 else if(phase===1&&d.active.includes(71)){phase=2;worker.postMessage({type:'matrix',release:true});}
 else if(phase===2&&!d.active.includes(71)){phase=3;worker.postMessage({type:'matrix',number:62,hold:false});}
 else if(phase===3&&d.active.includes(62)){phase=4;}
 else if(phase===4&&!d.active.includes(62)){phase=5;worker.postMessage({type:'matrix',number:12,hold:true});}
 else if(phase===5&&d.active.includes(12)){phase=6;worker.postMessage({type:'matrix',release:true});}
 else if(phase===6&&!d.active.includes(12)){clearTimeout(timeout);resolve();}
 });});console.log(JSON.stringify({result:'T2 matrix native worker passed',target71HoldRelease:true,ramp62Pulse:true,leftFlipper12:true,frames}));}
finally{await worker.terminate();}
