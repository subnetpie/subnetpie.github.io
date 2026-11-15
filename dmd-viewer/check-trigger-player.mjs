import 'fake-indexeddb/auto';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
let clock=0,raf;
const dom=new JSDOM('<section id="romPanel"></section><input id="pacKey">',{url:'https://subnetpie.github.io/dmd-viewer/'});
Object.assign(globalThis,{document:dom.window.document,localStorage:dom.window.localStorage,Option:dom.window.Option,requestAnimationFrame(fn){raf=fn},crossOriginIsolated:true,addEventListener(){}});
dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},arc(){},fill(){}});
class Worker{constructor(){Worker.last=this;this.messages=[]}postMessage(data){this.messages.push(data)}terminate(){}}
Object.assign(globalThis,{Worker});globalThis.fetch=async url=>new Response(readFileSync(url));
let downloadBlob,downloadName;URL.createObjectURL=blob=>{downloadBlob=blob;return 'blob:recipe-test'};dom.window.HTMLAnchorElement.prototype.click=function(){downloadName=this.download;};
const {createRomViewer}=await import('./dist/rom-viewer.mjs');
const viewer=createRomViewer({setMode(){}}),$=id=>document.getElementById(id);await viewer.setSound(false);viewer.setActive(true);
for(const [rom,pac,count] of [['pop_lx5','popeye',10],['t2_l8','terminator-2',8]]){
 await viewer.accept([new File([new Uint8Array(10)],rom+'.zip'),new File([readFileSync('dist/library/'+pac+'.pac')],pac+'.pac')]);
 assert.equal($('romRecipe').options.length,count);assert($('romRunRecipe').disabled);await viewer.start();const w=Worker.last;
 w.onmessage({data:{type:'started',info:rom}});assert($('romRunRecipe').disabled);
 w.onmessage({data:{type:'machine',active:[],held:[],trough:3,shooter:false,playfield:0,event:'Ready'}});
 assert(!$('romRunRecipe').disabled);$('romRecipe').value='builtin:'+pac+':light-start';$('romRecipe').onchange();assert.match($('romRecipeHint').textContent,/Credits and start/);
 await $('romRunRecipe').onclick();assert.equal(w.messages.at(-1).type,'recipe');assert.equal(w.messages.at(-1).id,$('romRecipe').value);assert($('romRunRecipe').disabled);assert(!$('romCancelRecipe').disabled);
 $('romCancelRecipe').onclick();assert.equal(w.messages.at(-1).type,'cancel-recipe');w.onmessage({data:{type:'recipe-status',phase:'cancelled',text:'Cancelled'}});assert(!$('romRunRecipe').disabled);
 await $('romRunRecipe').onclick();await $('romPause').onclick();assert(w.messages.some(m=>m.type==='cancel-recipe'));assert($('romRunRecipe').disabled);assert($('romCancelRecipe').disabled);
 await $('romPause').onclick();assert(!$('romRunRecipe').disabled);w.onmessage({data:{type:'recipe-status',phase:'running',stage:'inputs',id:$('romRecipe').value,text:'Observing'}});w.onmessage({data:{type:'audio',data:Float32Array.of(.2),rate:44100,channels:1}});w.onmessage({data:{type:'recipe-status',phase:'completed',id:$('romRecipe').value,text:'Complete'}});assert($('romRunRecipe').disabled,'Keep the observation window until sound and events settle');for(let i=0;i<75;i++){clock+=100;raf(clock);}assert(!$('romRunRecipe').disabled);assert(!$('romExportRecipeList').disabled);assert.match($('romRecipeList').textContent,/sound observed/);w.onmessage({data:{type:'recipe-status',phase:'error',text:'Wait for a ball'}});assert.match($('romRecipeStatus').textContent,/Wait for a ball/);assert($('romRecipeStatus').classList.contains('error'));
 const input=document.querySelector('[data-playfield-switch="'+(rom==='pop_lx5'?34:61)+'"]');
 for(let repeat=0;repeat<2;repeat++){
  input.onclick();assert.match($('romLearnStatus').textContent,/Learning 1 switch activation/);w.onmessage({data:{type:'recipe-status',phase:'cancelled',text:'Old preset cancelled'}});w.onmessage({data:{type:'audio',data:Float32Array.of(.3),rate:44100,channels:1}});
  for(let i=0;i<20;i++){clock+=100;raf(clock);}
  assert.equal($('romLearnedCount').textContent,'1 learned');
 }
 assert(!$('romExportLearnedRecipes').disabled);$('romExportLearnedRecipes').onclick();assert.equal(downloadName,'dmd-learned-trigger-recipes.json');const learned=JSON.parse(await downloadBlob.text());assert(learned.entries.every(e=>e.learned));const row=learned.entries.find(e=>e.game===rom);assert.equal(row.learnedRuns,2);assert.equal(row.steps.length,1);assert.equal(row.soundObserved,true);assert(!/"pcm"|"frames"|"data"/.test(JSON.stringify(learned)));
 const saved=JSON.parse(localStorage.getItem('dmd-trigger-event-list-v1'));assert(saved.entries.some(e=>e.game===rom&&e.learned));
 w.onmessage({data:{type:'machine',active:[61],held:[],trough:2,shooter:false,playfield:1,event:'Automatic state',lamps:[11]}});for(let i=0;i<20;i++){clock+=100;raf(clock);}assert.equal($('romLearnedCount').textContent,'1 learned');
 viewer.stop();assert($('romRunRecipe').disabled);assert($('romCancelRecipe').disabled);
}
console.log('Recipe UI passed: per-game options, machine readiness, run/cancel messages, duplicate protection, pause/stop cleanup and error status.');

const restored=createRomViewer({setMode(){}});await restored.accept([new File([new Uint8Array(10)],'t2_l8.zip'),new File([readFileSync('dist/library/terminator-2.pac')],'terminator-2.pac')]);assert.equal($('romLearnedCount').textContent,'1 learned');assert(!$('romExportLearnedRecipes').disabled);$('romExportLearnedRecipes').onclick();assert.equal(JSON.parse(await downloadBlob.text()).entries.length,2);restored.stop();console.log('Manual learning UI passed: table inputs, duplicate merging, stale-preset cancellation isolation, JSON-only export, reload persistence, and automatic-output exclusion.');
