import {recipesForGame} from './trigger-recipes.mjs';

const format='dmd-trigger-event-list';
export const recipeKey=(game,recipe)=>JSON.stringify([game,recipe.steps.map(s=>[s.atMs,s.switch,s.holdMs])]);
// Only scalar measurements and recipe instructions cross the persistence boundary.
export class RecipeEventList {
 constructor(onChange=()=>{}){this.entries=new Map();this.active=null;this.onChange=onChange;}
 begin(game,id,now){
  const recipe=recipesForGame(game).find(r=>r.id===id);if(!recipe)return;
  this.active={game,recipe,start:now,finishAt:Infinity,events:new Map(),peak:0,samples:0,completed:false};
 }
 observeEvent(key,label){const a=this.active;if(a&&key&&a.events.size<128)a.events.set(String(key),String(label).slice(0,160));}
 observeAudio(data){const a=this.active;if(!a)return;for(const value of data)if(Number.isFinite(value))a.peak=Math.max(a.peak,Math.abs(value));a.samples+=data.length;}
 complete(now){const a=this.active;if(a){a.completed=true;a.finishAt=Math.max(a.start+a.recipe.durationMs,now+750);}}
 advance(now){if(this.active?.completed&&now>=this.active.finishAt)this.finish(now);}
 cancel(){this.active=null;}
 finish(now){
  const a=this.active;if(!a?.completed)return;this.active=null;
  const key=recipeKey(a.game,a.recipe),previous=this.entries.get(key),events=new Map((previous?.events||[]).map(e=>[e.key,e.label]));
  for(const [k,v] of a.events)if(events.size<128||events.has(k))events.set(k,v);
  const entry={key,game:a.game,id:a.recipe.id,label:a.recipe.label,steps:a.recipe.steps.map(s=>({...s})),durationMs:a.recipe.durationMs,precondition:a.recipe.precondition,runs:(previous?.runs||0)+1,events:[...events].map(([key,label])=>({key,label})),soundObserved:!!previous?.soundObserved||a.peak>0.001,audioPeak:Math.max(previous?.audioPeak||0,a.peak),audioSamplesObserved:(previous?.audioSamplesObserved||0)+a.samples,observationMs:Math.round(now-a.start)};
  this.entries.set(key,entry);this.onChange(this.export());return entry;
 }
 export(){
  const entries=[...this.entries.values()].sort((a,b)=>a.game.localeCompare(b.game)||a.label.localeCompare(b.label)),unique=new Map();
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
   const recipe=recipesForGame(item.game).find(r=>r.id===item.id);if(!recipe)continue;
   // Whitelist fields: imported metadata cannot introduce samples or extra steps.
   const entry={key:recipeKey(item.game,recipe),game:item.game,id:recipe.id,label:recipe.label,steps:recipe.steps.map(s=>({...s})),durationMs:recipe.durationMs,precondition:recipe.precondition,runs:Math.max(0,Math.min(1e9,Number(item.runs)||0)),events:Array.isArray(item.events)?item.events.slice(0,128).map(e=>({key:String(e.key).slice(0,180),label:String(e.label).slice(0,160)})):[],soundObserved:item.soundObserved===true,audioPeak:Math.max(0,Math.min(100,Number(item.audioPeak)||0)),audioSamplesObserved:Math.max(0,Math.min(1e15,Number(item.audioSamplesObserved)||0)),observationMs:Math.max(0,Math.min(3600000,Number(item.observationMs)||0))};
   const old=this.entries.get(entry.key);if(!old||entry.runs>old.runs)this.entries.set(entry.key,entry);
  }
 }
}
