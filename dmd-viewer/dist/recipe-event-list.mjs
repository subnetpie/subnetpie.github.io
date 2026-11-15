import {recipesForGame} from './trigger-recipes.mjs?v=animation-import-1';
import {animationIdentity} from './animation-identity.mjs';
import {learnedRecipe,normaliseSteps} from './switch-recipe-learner.mjs?v=switch-learning-1';

const format='dmd-trigger-event-list';
export const recipeKey=(game,recipe)=>JSON.stringify([game,normaliseSteps(recipe.steps).map(s=>[s.atMs,s.switch,s.holdMs])]);
// Only scalar measurements and recipe instructions cross the persistence boundary.
export class RecipeEventList {
 constructor(onChange=()=>{}){this.entries=new Map();this.active=null;this.onChange=onChange;}
 begin(game,id,now){
  const recipe=recipesForGame(game).find(r=>r.id===id);if(!recipe)return;
  this.active={game,recipe,kind:'preset',start:now,finishAt:Infinity,events:new Map(),peak:0,samples:0,completed:false};
 }
 beginManual(game,recipe,now){this.active={game,recipe,kind:'manual',start:now,finishAt:Infinity,events:new Map(),peak:0,samples:0,completed:false};}
 finishManual(now){if(this.active?.kind==='manual'){this.active.completed=true;return this.finish(now);}}
 observeEvent(key,label,now=Infinity){const a=this.active;if(a&&now>=a.start&&key&&a.events.size<128){const event=animationIdentity(a.game,key,String(label).slice(0,160));a.events.set(event.key,event.label);}}
 observeAudio(data,now=Infinity){const a=this.active;if(!a||now<a.start)return;for(const value of data)if(Number.isFinite(value))a.peak=Math.max(a.peak,Math.abs(value));a.samples+=data.length;}
 complete(now){const a=this.active;if(a){a.completed=true;a.finishAt=Math.max(a.start+a.recipe.durationMs,now+750);}}
 advance(now){if(this.active?.completed&&now>=this.active.finishAt)this.finish(now);}
 cancel(){this.active=null;}
 finish(now){
  const a=this.active;if(!a?.completed)return;this.active=null;
  const key=recipeKey(a.game,a.recipe),previous=this.entries.get(key),events=new Map((previous?.events||[]).map(e=>[e.key,e.label]));
  for(const [k,v] of a.events)if(events.size<128||events.has(k))events.set(k,v);
  const source=previous||a.recipe,entry={key,game:a.game,id:source.id,label:source.label,steps:source.steps.map(s=>({...s})),durationMs:source.durationMs,precondition:source.precondition,runs:(previous?.runs||0)+1,learned:!!previous?.learned||a.kind==='manual',learnedRuns:(previous?.learnedRuns||0)+(a.kind==='manual'?1:0),events:[...events].map(([key,label])=>({key,label})),soundObserved:!!previous?.soundObserved||a.peak>0.001,audioPeak:Math.max(previous?.audioPeak||0,a.peak),audioSamplesObserved:(previous?.audioSamplesObserved||0)+a.samples,observationMs:Math.max(0,Math.round(now-a.start))};
  if(a.recipe.initialState||previous?.initialState)entry.initialState=previous?.initialState||a.recipe.initialState;
  this.entries.set(key,entry);this.onChange(this.export());return entry;
 }
 export({learnedOnly=false}={}){
  const entries=[...this.entries.values()].filter(e=>!learnedOnly||e.learned).sort((a,b)=>a.game.localeCompare(b.game)||a.label.localeCompare(b.label)),unique=new Map();
  for(const entry of entries)for(const event of entry.events){
   const key=JSON.stringify([entry.game,event.label.trim().toLowerCase()]);
   const item=unique.get(key)||{key,game:entry.game,label:event.label,recipeIds:[],soundObservedDuringRecipes:false};
   if(!item.recipeIds.includes(entry.id))item.recipeIds.push(entry.id);item.soundObservedDuringRecipes||=entry.soundObserved;unique.set(key,item);
  }
  return {format,version:1,note:'Timed trigger recipes and observed event/sound metadata only. Sound was observed during the recipe; background music may contribute. No sound command IDs, PCM, DMD pixels, or media are stored. Re-run recipes in the emulator to hear sound; game state affects results.',entries,events:[...unique.values()]};
 }
 load(data){
  if(data?.format!==format||data.version!==1||!Array.isArray(data.entries))return;
  for(const item of data.entries){
   if(!item)continue;const preset=recipesForGame(item.game).find(r=>r.id===item.id),recipe=preset||((item.learned===true||String(item.id).startsWith('learned:'))?learnedRecipe(item.game,item.steps,item.initialState):null);if(!recipe)continue;
   // Whitelist fields: imported metadata cannot introduce samples or extra steps.
   const events=Array.isArray(item.events)?item.events.filter(e=>e&&typeof e.key==='string'&&typeof e.label==='string').slice(0,128).map(e=>animationIdentity(item.game,e.key.slice(0,180),e.label.slice(0,160))):[];
   const entry={key:recipeKey(item.game,recipe),game:item.game,id:recipe.id,label:recipe.label,steps:recipe.steps.map(s=>({...s})),durationMs:recipe.durationMs,precondition:recipe.precondition,runs:Math.max(0,Math.min(1e9,Number(item.runs)||0)),learned:item.learned===true||!preset,learnedRuns:Math.max(0,Math.min(1e9,Number(item.learnedRuns)||0)),events:[...new Map(events.map(e=>[e.key,e])).values()],soundObserved:item.soundObserved===true,audioPeak:Math.max(0,Math.min(100,Number(item.audioPeak)||0)),audioSamplesObserved:Math.max(0,Math.min(1e15,Number(item.audioSamplesObserved)||0)),observationMs:Math.max(0,Math.min(3600000,Number(item.observationMs)||0))};
   if(recipe.initialState)entry.initialState=recipe.initialState;
   else if(item.initialState&&item.learned){const learned=learnedRecipe(item.game,recipe.steps,item.initialState);if(learned)entry.initialState=learned.initialState;}
   const old=this.entries.get(entry.key);
   if(!old)this.entries.set(entry.key,entry);
   else{
    const events=new Map([...entry.events,...old.events].map(e=>[e.key,e]));
    this.entries.set(entry.key,{...(entry.runs>old.runs?entry:old),learned:entry.learned||old.learned,learnedRuns:Math.max(entry.learnedRuns,old.learnedRuns),soundObserved:entry.soundObserved||old.soundObserved,audioPeak:Math.max(entry.audioPeak,old.audioPeak),events:[...events.values()].slice(0,128),...(old.initialState?{initialState:old.initialState}:entry.initialState?{initialState:entry.initialState}:{})});
   }
  }
 }
}
