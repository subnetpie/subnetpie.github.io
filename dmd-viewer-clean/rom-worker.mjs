import createRuntime from './emulator/dmd-runtime.mjs';
import {PopeyeMachine} from '../dmd-viewer/dist/popeye-events.mjs';
import {T2MatrixInputs} from '../dmd-viewer/dist/t2-matrix.mjs?v=t2-table-1';
import {popeyeInitialNvram} from '../dmd-viewer/dist/popeye-initial-nvram.mjs';
import {t2InitialNvram} from './t2-initial-nvram.mjs';
import {games,shared} from './games.mjs';
let core,machine,game,timer,frame,audio,meta,time=0,last=0,lastStateAt=0,startedAt=0,started=false,paused=false,doorClosed=false,t2Reset=false;
const ready=()=>started&&time>=(game.set==='t2_l8'?30000:12000);
function state(){const s=machine.snapshot(n=>core._viewer_get_switch(n));s.lamps=game.lamps.filter(l=>!l.unused&&core._viewer_lamp(l.number)).map(l=>l.number);postMessage({type:'state',...s,ready:ready(),paused,doorClosed});}
function poll(){
 const now=performance.now(),delta=last?Math.min(100,now-last):0;last=now;
 if(!core._viewer_running()){if(!started&&now-startedAt<15000)return;clearInterval(timer);postMessage({type:'error',message:'The game stopped.'});return;}
 if(!started){started=true;postMessage({type:'started'});}
 if(!paused){time+=delta;if(game.set==='t2_l8'&&!t2Reset&&time>=18000){t2Reset=true;machine.reset();core._viewer_reset();}machine.update(time,n=>core._viewer_solenoid(n));core._viewer_switch(22,doorClosed?1:0);}
 if(now-lastStateAt>=50){lastStateAt=now;state();}
 if(core._viewer_frame(frame,meta)){
  const [w,h,depth,count,size]=core.HEAP32.subarray(meta/4,meta/4+5),pixels=w*h,data=core.HEAPU8.slice(frame,frame+pixels),planes=Array.from({length:count},(_,i)=>core.HEAPU8.slice(frame+pixels+i*size,frame+pixels+(i+1)*size));
  postMessage({type:'frame',w,h,depth,time,data,planes},[data.buffer,...planes.map(p=>p.buffer)]);
 }
 const count=core._viewer_audio(audio,65536,meta);if(count&&!paused){const [channels,rate]=core.HEAP32.subarray(meta/4,meta/4+2),data=core.HEAPF32.slice(audio/4,audio/4+count);postMessage({type:'audio',channels,rate,data},[data.buffer]);}
}
async function start({set,bytes}){
 game=games.find(g=>g.set===set);if(!game)throw Error('Unknown game.');
 const response=await fetch(new URL('emulator/dmd-runtime.wasm.gz',shared));if(!response.ok)throw Error('Could not load the emulator.');
 const wasmBinary=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 core=await createRuntime({wasmBinary,print(){},printErr(){},onAbort:()=>postMessage({type:'error',message:'The emulator could not start.'})});
 for(const directory of ['','roms','nvram','cfg','memcard','sta','inp'])core.FS.mkdirTree('/pinmame/'+directory);
 core.FS.writeFile('/pinmame/roms/'+set+'.zip',new Uint8Array(bytes));core.FS.writeFile('/pinmame/nvram/'+set+'.nv',set==='pop_lx5'?popeyeInitialNvram():t2InitialNvram());
 core._viewer_init();const problems=core.ccall('viewer_audit','string',['string'],[set]);if(problems)throw Error('The game ROM set is incomplete.');
 frame=core._malloc(131072);audio=core._malloc(262144);meta=core._malloc(32);
 machine=set==='pop_lx5'?new PopeyeMachine({setSwitch:(n,v)=>core._viewer_switch(n,v)}):new T2MatrixInputs({setSwitch:(n,v)=>core._viewer_switch(n===11?112:n===12?114:n,v)});
 startedAt=performance.now();if(core.ccall('viewer_run','number',['string'],[set])!==0)throw Error('Could not start the selected game.');timer=setInterval(poll,8);
}
onmessage=async({data})=>{
 try{
  if(data.type==='start')await start(data);
  else if(core&&machine){
   if(data.type==='input'&&ready()&&!paused){const item=game.map.get(data.number);if(!item||item.managed||item.unused||data.number===22)return;
    if(game.set==='pop_lx5'&&data.pressed&&machine.playfield&&[74,85].includes(data.number))machine.event(data.number===74?'drain-left':'drain-right');
    else if(game.set==='t2_l8'&&data.pressed&&machine.playfield&&[25,28].includes(data.number))machine.trigger(data.number);
    else machine.setHeld(data.number,!!data.pressed);
   }
   if(data.type==='door'&&ready()&&!paused){doorClosed=!doorClosed;core._viewer_switch(22,doorClosed?1:0);state();}
   if(data.type==='pause'){paused=!!data.paused;machine.releaseHeld();core._viewer_pause(paused?1:0);last=0;state();}
   if(data.type==='stop'){clearInterval(timer);machine.releaseHeld();core._viewer_stop();postMessage({type:'stopped'});}
  }
 }catch(error){clearInterval(timer);postMessage({type:'error',message:error.message||String(error)});}
};
