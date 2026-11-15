// Execute local emulator recipes; retain metadata only, never pixels or PCM.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import createRuntime from './dist/emulator/dmd-runtime.mjs';
import {PopeyeMachine} from './dist/popeye-events.mjs';
import {T2MatrixInputs} from './dist/t2-matrix.mjs';
import {popeyeInitialNvram} from './dist/popeye-initial-nvram.mjs';
import {parsePac} from './dist/pac.mjs';
import {LiveColorizer} from './dist/live-colorizer.mjs';
import {animationGroups} from './dist/animation-groups.mjs';
import {recipesForGame} from './dist/trigger-recipes.mjs';
import {TriggerRunner} from './dist/trigger-runner.mjs';
import {RecipeEventList} from './dist/recipe-event-list.mjs';
const list=new RecipeEventList();
for(const [game,prefix,asset] of [['pop_lx5','popeye','pop_lx5.zip'],['t2_l8','terminator-2','t2_l8-complete.zip']]){
 const core=await createRuntime({wasmBinary:gunzipSync(await readFile('dist/emulator/dmd-runtime.wasm.gz')),print(){},printErr(){}});
 try{
  for(const dir of ['','roms','nvram','cfg','memcard','inp','sta'])core.FS.mkdirTree('/pinmame/'+dir);
  core.FS.writeFile('/pinmame/roms/'+game+'.zip',await readFile('dist/library/'+asset));
  if(game==='pop_lx5')core.FS.writeFile('/pinmame/nvram/pop_lx5.nv',popeyeInitialNvram());
  core._viewer_init();assert.equal(core.ccall('viewer_audit','string',['string'],[game]),'');
  const machine=game==='pop_lx5'?new PopeyeMachine({setSwitch:(n,v)=>core._viewer_switch(n,v)}):new T2MatrixInputs({setSwitch:(n,v)=>core._viewer_switch(n===11?112:n===12?114:n,v)});
  const pac=await parsePac(await readFile('dist/library/'+prefix+'.pac')),groups=animationGroups(pac.scenes),colorizer=new LiveColorizer(pac);
  let origin=performance.now(),now=0,previousMatch=0,failure=null;
  const runner=new TriggerRunner(machine,game,event=>{if(event.phase==='running'&&event.stage==='inputs')list.begin(game,event.id,now);else if(event.phase==='completed')list.complete(now);else if(event.phase==='error'){list.cancel();failure=Error(event.text);}});
  const fp=core._malloc(131072),mp=core._malloc(32),ap=core._malloc(262144);
  assert.equal(core.ccall('viewer_run','number',['string'],[game]),0);
  async function tick(){
   now=performance.now()-origin;machine.update(now,n=>core._viewer_solenoid(n));runner.tick(now);
   if(core._viewer_frame(fp,mp)){
    const [w,h,depth,count,size]=core.HEAP32.subarray(mp/4,mp/4+5),raw=core.HEAPU8.subarray(fp,fp+w*h),planes=Array.from({length:count},(_,i)=>core.HEAPU8.subarray(fp+w*h+i*size,fp+w*h+(i+1)*size));
    colorizer.render(raw,w,h,depth,now,planes);
    if(previousMatch!==colorizer.matches){previousMatch=colorizer.matches;const scene=colorizer.active?.scene,group=groups.get(scene);list.observeEvent(scene?(group?.key||'scene:'+scene.offset):'palette:'+colorizer.lastMatch,group?.label||scene?.name||colorizer.lastMatch);}
   }
   const count=core._viewer_audio(ap,65536,mp);if(count)list.observeAudio(core.HEAPF32.subarray(ap/4,ap/4+count));
   list.advance(now);if(failure)throw failure;await new Promise(r=>setTimeout(r,8));
  }
  async function wait(ms){const end=performance.now()+ms;while(performance.now()<end)await tick();}
  console.log(game+': auditing and booting ROM; no media will be written.');
  await wait(game==='pop_lx5'?14000:18000);
  if(game==='t2_l8'){core._viewer_reset();machine.now=0;machine.reset();origin=performance.now();now=0;colorizer.reset();previousMatch=0;await wait(12000);}
  for(const recipe of recipesForGame(game)){
   const repetitions=recipe.id.endsWith('light-bumpers')||recipe.id.endsWith('light-jets')?2:1;
   for(let repeat=0;repeat<repetitions;repeat++){
    runner.run(recipe.id,now);const limit=performance.now()+30000;
    do{await tick();if(performance.now()>limit)throw Error('Recipe observation timed out: '+recipe.label);}while(runner.active||list.active);
   }
   const entry=list.export().entries.find(e=>e.game===game&&e.id===recipe.id);assert(entry);console.log(JSON.stringify({game,label:entry.label,runs:entry.runs,sound:entry.soundObserved,peak:entry.audioPeak,events:entry.events.map(e=>e.label)}));
  }
 }finally{core._viewer_stop();core.PThread.terminateAllThreads();}
}
const catalog=list.export();assert.equal(catalog.entries.length,18);assert(catalog.entries.some(e=>e.runs===2));
const text=JSON.stringify(catalog,null,2)+'\n';await writeFile('dist/recipe-events.json',text);await writeFile(homedir()+'/Downloads/DMD-trigger-events.json',text);
const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
await writeFile(homedir()+'/Downloads/DMD-trigger-events.csv',['Game,Recipe,Sound observed,Runs,Triggered DMD events',...catalog.entries.map(e=>[e.game,e.label,e.soundObserved,e.runs,e.events.map(v=>v.label).join('; ')].map(quote).join(','))].join('\n')+'\n');
console.log(JSON.stringify({uniqueRecipes:catalog.entries.length,soundObserved:catalog.entries.filter(e=>e.soundObserved).length,bytes:Buffer.byteLength(text),duplicatesMerged:catalog.entries.filter(e=>e.runs>1).length}));
