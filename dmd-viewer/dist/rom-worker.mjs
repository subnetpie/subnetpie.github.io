import {MachineActivity,t2CoilNames} from './machine-activity.mjs';
import createRuntime from './emulator/dmd-runtime.mjs?v=lamps-t2-2';
import {PopeyeMachine} from './popeye-events.mjs?v=flippers-1';
import {T2MatrixInputs} from './t2-matrix.mjs?v=t2-gun-1';
import {popeyeLamps} from './popeye-playfield.mjs?v=flippers-1';
import {t2Lamps} from './t2-playfield.mjs';
import {popeyeInitialNvram} from './popeye-initial-nvram.mjs';
import {TriggerRunner} from './trigger-runner.mjs?v=playfield-adoption-1';
let recipeRunner=null;
const activity=new MachineActivity(),switchStates=new Map(),flasherUntil=new Map();let previousCoils=new Set();
function setMachineSwitch(number,value){core._viewer_switch(gameName==='t2_l8'?(number===11?112:number===12?114:number):number,value);if(machine&&switchStates.get(number)!==!!value)activity.add('sensor',number+' · '+(value?'closed':'open'),simTime);switchStates.set(number,!!value);}
let core,timer,framePtr,audioPtr,metaPtr,machine=null,gameName='',paused=false,lastPoll=0,simTime=0,lastMachineState='',lastMatrixScan=0,hasRun=false,startRequestedAt=0,startInfo='';
const call=(name,result,types=[],args=[])=>core.ccall('viewer_'+name,result,types,args);
function poll(){
  const now=performance.now(),delta=lastPoll?Math.min(100,now-lastPoll):0;lastPoll=now;
  if(!core._viewer_running()){if(!hasRun&&now-startRequestedAt<15000)return;clearInterval(timer);postMessage({type:'stopped'});return;}
  if(!hasRun){hasRun=true;postMessage({type:'started',info:startInfo});}
  if(['pop_lx5','t2_l8'].includes(gameName)&&core._viewer_running()){
    machine??=gameName==='pop_lx5'?new PopeyeMachine({setSwitch:setMachineSwitch}):new T2MatrixInputs({setSwitch:setMachineSwitch});
    recipeRunner??=new TriggerRunner(machine,gameName,data=>postMessage({type:'recipe-status',...data}));
    const coils=new Set(Array.from({length:32},(_,i)=>i+1).filter(n=>core._viewer_solenoid(n)));
    if(!paused){simTime+=delta;for(const n of coils)if(n>=17&&n<=27)flasherUntil.set(n,simTime+80);for(const [n,end] of flasherUntil)if(simTime>=end)flasherUntil.delete(n);for(const n of new Set([...coils,...previousCoils]))if(coils.has(n)!==previousCoils.has(n))activity.add('coil',n+' · '+(gameName==='t2_l8'?t2CoilNames[n]||'Flasher / output':'Output')+' · '+(coils.has(n)?'on':'off'),simTime);previousCoils=coils;machine.update(simTime,n=>coils.has(n));recipeRunner.tick(simTime);}
    if(now-lastMatrixScan>=50){lastMatrixScan=now;const state=machine.snapshot(n=>core._viewer_get_switch(n));state.solenoids=[...coils];state.flashers=[...flasherUntil.keys()];state.lamps=(gameName==='pop_lx5'?popeyeLamps:t2Lamps).filter(l=>!l.unused&&core._viewer_lamp(l.number)).map(l=>l.number);const json=JSON.stringify(state);if(json!==lastMachineState){lastMachineState=json;postMessage({type:'machine',...state});}const rows=activity.drain();if(rows.length)postMessage({type:'activity',rows});}
  }
  const size=core._viewer_frame(framePtr,metaPtr);
  if(size){const meta=Array.from(core.HEAP32.subarray(metaPtr/4,metaPtr/4+5)),pixels=meta[0]*meta[1],data=new Uint8Array(pixels);data.set(core.HEAPU8.subarray(framePtr,framePtr+pixels));const planes=[];for(let i=0;i<meta[3];i++){const plane=new Uint8Array(meta[4]);plane.set(core.HEAPU8.subarray(framePtr+pixels+i*meta[4],framePtr+pixels+(i+1)*meta[4]));planes.push(plane)}postMessage({type:'frame',simTime,w:meta[0],h:meta[1],depth:meta[2],data,planes},[data.buffer,...planes.map(p=>p.buffer)]);}
  const count=core._viewer_audio(audioPtr,65536,metaPtr);
  if(count){const meta=Array.from(core.HEAP32.subarray(metaPtr/4,metaPtr/4+2)),data=new Float32Array(count);data.set(core.HEAPF32.subarray(audioPtr/4,audioPtr/4+count));postMessage({type:'audio',channels:meta[0],rate:meta[1],data},[data.buffer]);}
  const text=call('logs','string');if(text)postMessage({type:'log',text});
  if(!core._viewer_running()){clearInterval(timer);postMessage({type:'stopped'});}
}
async function start({files,game}){
  activity.clear();flasherUntil.clear();switchStates.clear();previousCoils=new Set();gameName=game;machine=null;recipeRunner=null;paused=false;lastPoll=0;simTime=0;lastMachineState='';hasRun=false;lastMatrixScan=0;
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
  startInfo=info;startRequestedAt=performance.now();
  const status=call('run','number',['string'],[game]);if(status!==0)throw Error('PinMAME could not start (status '+status+').');
  timer=setInterval(poll,8);
}
onmessage=async({data})=>{
  try{
    if(data.type==='start')await start(data);
    else if(core){
      if(data.type==='recipe'){try{if(!recipeRunner||paused||!core._viewer_running())throw Error('Resume the running game first.');recipeRunner.run(data.id,simTime);}catch(error){postMessage({type:'recipe-status',phase:'error',text:error.message});}}
      if(data.type==='cancel-recipe')recipeRunner?.cancel();
      if(['event','matrix','key','switch'].includes(data.type))recipeRunner?.cancel();
      if(data.type==='event'){try{if(!machine||paused||gameName!=='pop_lx5')throw Error('Resume the running Popeye game first.');postMessage({type:'event-status',text:data.id==='begin-game'?machine.beginGame():machine.event(data.id)});}catch(error){postMessage({type:'event-status',text:error.message,error:true});}}
      if(data.type==='matrix'){activity.add('input',data.release?'Release held inputs':(data.number+' · '+(data.pressed!==undefined?(data.pressed?'press':'release'):data.hold?'hold / release':'pulse')),simTime);try{if(!machine||paused)throw Error('Resume the running game first.');postMessage({type:'event-status',text:data.release?(machine.releaseHeld(),'Held switches released.'):data.pressed!==undefined?machine.setHeld(data.number,!!data.pressed):machine.trigger(data.number,!!data.hold)});}catch(error){postMessage({type:'event-status',text:error.message,error:true});}}
      if(data.type==='key'){activity.add('input','Cabinet key '+data.code+' · '+(data.state?'press':'release'),simTime);core._viewer_key(data.code,data.state);}
      if(data.type==='switch'){activity.add('input','Manual switch '+data.number+' · '+(data.state?'closed':'open'),simTime);core._viewer_switch(data.number,data.state);}
      if(data.type==='pause'){paused=data.paused;if(paused){recipeRunner?.cancel();machine?.releaseHeld();}lastPoll=0;core._viewer_pause(paused?1:0);}
      if(data.type==='reset'){activity.clear();flasherUntil.clear();previousCoils=new Set();recipeRunner?.cancel();simTime=0;lastPoll=0;if(machine){machine.now=0;machine.reset();}core._viewer_reset();}
      if(data.type==='stop'){recipeRunner?.cancel();clearInterval(timer);core._viewer_stop();postMessage({type:'stopped'});}
    }
  }catch(error){postMessage({type:'error',message:error.message||String(error)});}
};
