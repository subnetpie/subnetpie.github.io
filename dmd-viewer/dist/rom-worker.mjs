import createRuntime from './emulator/dmd-runtime.mjs?v=popeye-events-1';
import {PopeyeMachine} from './popeye-events.mjs?v=matrix-1';
import {popeyeInitialNvram} from './popeye-initial-nvram.mjs';
let core,timer,framePtr,audioPtr,metaPtr,machine=null,gameName='',paused=false,lastPoll=0,simTime=0,lastMachineState='',lastMatrixScan=0;
const call=(name,result,types=[],args=[])=>core.ccall('viewer_'+name,result,types,args);
function poll(){
  const now=performance.now(),delta=lastPoll?Math.min(100,now-lastPoll):0;lastPoll=now;
  if(gameName==='pop_lx5'&&core._viewer_running()){
    machine??=new PopeyeMachine({setSwitch:(number,state)=>core._viewer_switch(number,state)});
    if(!paused){simTime+=delta;machine.update(simTime,n=>core._viewer_solenoid(n));}
    if(now-lastMatrixScan>=50){lastMatrixScan=now;const state=machine.snapshot(n=>core._viewer_get_switch(n)),json=JSON.stringify(state);if(json!==lastMachineState){lastMachineState=json;postMessage({type:'machine',...state});}}
  }
  const size=core._viewer_frame(framePtr,metaPtr);
  if(size){const meta=Array.from(core.HEAP32.subarray(metaPtr/4,metaPtr/4+5)),pixels=meta[0]*meta[1],data=new Uint8Array(pixels);data.set(core.HEAPU8.subarray(framePtr,framePtr+pixels));const planes=[];for(let i=0;i<meta[3];i++){const plane=new Uint8Array(meta[4]);plane.set(core.HEAPU8.subarray(framePtr+pixels+i*meta[4],framePtr+pixels+(i+1)*meta[4]));planes.push(plane)}postMessage({type:'frame',w:meta[0],h:meta[1],depth:meta[2],data,planes},[data.buffer,...planes.map(p=>p.buffer)]);}
  const count=core._viewer_audio(audioPtr,65536,metaPtr);
  if(count){const meta=Array.from(core.HEAP32.subarray(metaPtr/4,metaPtr/4+2)),data=new Float32Array(count);data.set(core.HEAPF32.subarray(audioPtr/4,audioPtr/4+count));postMessage({type:'audio',channels:meta[0],rate:meta[1],data},[data.buffer]);}
  const text=call('logs','string');if(text)postMessage({type:'log',text});
  if(!core._viewer_running()){clearInterval(timer);postMessage({type:'stopped'});}
}
async function start({files,game}){
  gameName=game;machine=null;paused=false;lastPoll=0;simTime=0;lastMachineState='';
  const response=await fetch(new URL('./emulator/dmd-runtime.wasm.gz',import.meta.url),{cache:'no-cache'});if(!response.ok)throw Error('Could not download the browser emulator.');
  const wasmBinary=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  core=await createRuntime({wasmBinary,print:text=>postMessage({type:'log',text}),printErr:text=>postMessage({type:'log',text}),onAbort:text=>postMessage({type:'error',message:String(text)})});
  for(const dir of ['','roms','nvram','cfg','memcard','sta','inp'])core.FS.mkdirTree('/pinmame/'+dir);
  for(const file of files){if(!/^[a-z0-9_-]+\.zip$/i.test(file.name))throw Error('Keep the original ROM set ZIP name, such as t2_l8.zip.');core.FS.writeFile('/pinmame/roms/'+file.name.toLowerCase(),new Uint8Array(file.bytes));}
  if(game==='pop_lx5')core.FS.writeFile('/pinmame/nvram/pop_lx5.nv',popeyeInitialNvram());
  call('init',null);
  if(call('game','number',['string'],[game])!==0)throw Error('Unknown PinMAME ROM set: '+game+'. Keep the original ROM ZIP name.');
  const info=call('game_info','string');
  const problems=call('audit','string',['string'],[game]);if(problems)throw Error('ROM set is incomplete or does not match this revision:\n'+problems+'Add its parent ROM ZIP if needed.');
  framePtr=core._malloc(131072);audioPtr=core._malloc(65536*4);metaPtr=core._malloc(32);
  const status=call('run','number',['string'],[game]);if(status!==0)throw Error('PinMAME could not start (status '+status+').');
  postMessage({type:'started',info});timer=setInterval(poll,8);
}
onmessage=async({data})=>{
  try{
    if(data.type==='start')await start(data);
    else if(core){
      if(data.type==='event'){try{if(!machine||paused)throw Error('Resume the running Popeye game first.');postMessage({type:'event-status',text:data.id==='begin-game'?machine.beginGame():machine.event(data.id)});}catch(error){postMessage({type:'event-status',text:error.message,error:true});}}
      if(data.type==='matrix'){try{if(!machine||paused)throw Error('Resume the running Popeye game first.');postMessage({type:'event-status',text:data.release?(machine.releaseHeld(),'Held switches released.'):machine.trigger(data.number,!!data.hold)});}catch(error){postMessage({type:'event-status',text:error.message,error:true});}}
      if(data.type==='key')core._viewer_key(data.code,data.state);
      if(data.type==='switch')core._viewer_switch(data.number,data.state);
      if(data.type==='pause'){paused=data.paused;if(paused)machine?.releaseHeld();lastPoll=0;core._viewer_pause(paused?1:0);}
      if(data.type==='reset'){machine?.reset();core._viewer_reset();}
      if(data.type==='stop'){clearInterval(timer);core._viewer_stop();postMessage({type:'stopped'});}
    }
  }catch(error){postMessage({type:'error',message:error.message||String(error)});}
};
