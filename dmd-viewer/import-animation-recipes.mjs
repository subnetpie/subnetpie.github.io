// Import only recipes that add a new named animation; retain no source media.
import {readFile,writeFile} from 'node:fs/promises';
import {triggerRecipes,recipesForGame} from './dist/trigger-recipes.mjs?v=animation-import-1';
import {RecipeEventList,recipeKey} from './dist/recipe-event-list.mjs';
import {parsePac} from './dist/pac.mjs';
import {animationGroups} from './dist/animation-groups.mjs';
import {animationIdentity} from './dist/animation-identity.mjs';
const path=process.argv[2];if(!path)throw Error('Usage: node import-animation-recipes.mjs exported-recipes.json');
const incoming=new RecipeEventList(),catalog=new RecipeEventList();incoming.load(JSON.parse(await readFile(path,'utf8')));catalog.load(JSON.parse(await readFile('dist/recipe-events.json','utf8')));
const rows=incoming.export().entries,known=new Set(catalog.export().entries.flatMap(e=>e.events.map(v=>v.key))),candidates=new Map();
for(const game of new Set(rows.map(r=>r.game))){
 const collection=triggerRecipes.games.find(g=>g.pair.split('.zip:')[0]===game),pac=await parsePac(await readFile('dist/library/'+collection.pair.split(':')[1])),groups=animationGroups(pac.scenes),allowed=new Set();
 for(const scene of pac.scenes){allowed.add(animationIdentity(game,'',scene.name).key);const group=groups.get(scene);if(group)allowed.add(animationIdentity(game,'',group.label).key);}
 for(const row of rows.filter(r=>r.game===game))row.events=row.events.filter(e=>allowed.has(e.key));
}
for(const row of rows)for(const event of row.events)if(!known.has(event.key)){
 if(!candidates.has(event.key))candidates.set(event.key,{game:row.game,event,rows:[]});candidates.get(event.key).rows.push(row);
}
const added=[],reused=[];
for(const {game,event,rows} of candidates.values()){
 const service=/^Service-/i.test(event.label),end=r=>Math.max(...r.steps.map(s=>s.atMs+s.holdMs));
 rows.sort((a,b)=>(service?Number(b.steps[0]?.switch===8)-Number(a.steps[0]?.switch===8):0)||a.steps.length-b.steps.length||end(a)-end(b)||JSON.stringify(a.steps).localeCompare(JSON.stringify(b.steps)));
 const source=rows[0],existing=recipesForGame(game).find(r=>recipeKey(game,r)===recipeKey(game,source));
 let recipe=existing;
 if(existing){
  existing.expectedAnimations=[...new Set([...(existing.expectedAnimations||[]),event.label])];
  if(event.label==='PullTrigger')existing.label='Ball launch / Pull trigger';
  reused.push({animation:event.label,recipe:existing.id});
 }else{
  const collection=triggerRecipes.games.find(g=>g.pair.split('.zip:')[0]===game);if(!collection)continue;
  recipe={id:'builtin:'+collection.game+':animation-'+event.label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),label:event.label,switches:source.steps.map(s=>s.switch),steps:source.steps.map(s=>({...s})),durationMs:Math.max(5000,end(source)+1500),kind:service?'service':'shot',precondition:service?'Use the same idle/service-menu state as the capture. Service screens depend on the current menu.':'Start a game and launch a ball; the captured game mode is required.',initialState:source.initialState,expectedAnimations:[event.label],contributed:true};
  collection.samples.push(recipe);added.push({animation:event.label,recipe:recipe.id,sourceId:source.id});
 }
 const key=recipeKey(game,recipe),prior=catalog.entries.get(key);
 const events=new Map([...(prior?.events||[]).map(e=>[e.key,e]),[event.key,event]]);
 catalog.entries.set(key,{...(prior||source),key,id:recipe.id,label:recipe.label,steps:recipe.steps,durationMs:recipe.durationMs,precondition:recipe.precondition,events:[...events.values()],learned:false,learnedRuns:0,runs:Math.max(prior?.runs||0,source.runs||0),soundObserved:!!prior?.soundObserved||source.soundObserved,audioPeak:Math.max(prior?.audioPeak||0,source.audioPeak||0)});
}
if(added.length||reused.length){
 await writeFile('dist/trigger-recipes.mjs','// Built-in switch recipes; no media downloads.\nexport const triggerRecipes='+JSON.stringify(triggerRecipes)+';\nexport function recipesForGame(game){return triggerRecipes.games.find(g=>g.pair.split(\'.zip:\')[0]===game)?.samples||[];}\n');
 await writeFile('dist/recipe-events.json',JSON.stringify(catalog.export(),null,2)+'\n');
}
console.log(JSON.stringify({inputRecipes:rows.length,added,reused,skippedWithoutNamedAnimation:rows.filter(r=>!r.events.length).length,totalRecipes:triggerRecipes.games.reduce((n,g)=>n+g.samples.length,0),totalAnimations:catalog.export().events.length},null,2));
