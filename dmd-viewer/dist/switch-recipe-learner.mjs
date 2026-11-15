import {popeyeSwitchByNumber} from './popeye-matrix.mjs';
import {t2SwitchByNumber} from './t2-matrix.mjs?v=t2-table-1';

export const inputMap=game=>game==='pop_lx5'?popeyeSwitchByNumber:game==='t2_l8'?t2SwitchByNumber:null;
const round=ms=>Math.round(ms/25)*25;
export function normaliseSteps(steps){return steps.map(s=>({atMs:Math.max(0,round(s.atMs)),switch:s.switch,holdMs:Math.max(25,round(s.holdMs))})).sort((a,b)=>a.atMs-b.atMs||a.switch-b.switch||a.holdMs-b.holdMs);}
export function learnedRecipe(game,steps,initialState={}){
 const map=inputMap(game);if(!map||!Array.isArray(steps)||!steps.length||steps.length>128)return null;
 if(steps.some(s=>!s||!Number.isFinite(s.atMs)||s.atMs<0||s.atMs>3600000||!Number.isFinite(s.holdMs)||s.holdMs<0||s.holdMs>3600000||!map.has(s.switch)||map.get(s.switch).managed||map.get(s.switch).unused))return null;
 const clean=normaliseSteps(steps),origin=Math.min(...clean.map(s=>s.atMs));for(const s of clean)s.atMs-=origin;
 const key=JSON.stringify([game,clean]);let hash=0xcbf29ce484222325n;for(const c of key)hash=BigInt.asUintN(64,(hash^BigInt(c.charCodeAt(0)))*0x100000001b3n);
 const state={trough:Math.max(0,Math.min(6,Number(initialState.trough)||0)),shooter:initialState.shooter===true,playfield:Math.max(0,Math.min(6,Number(initialState.playfield)||0))};
 return {id:'learned:'+game+':'+hash.toString(16),label:clean.map(s=>map.get(s.switch).label).join(' → ').slice(0,160),steps:clean,durationMs:Math.max(...clean.map(s=>s.atMs+s.holdMs))+1500,precondition:state.playfield?'Ball in play; reproduce the captured game mode.':state.shooter?'Ball in the shooter lane.':'Reproduce the captured idle/game state.',initialState:state,learned:true};
}

// Listen only to intentional viewer inputs, never to automatic ball/lamp outputs.
export class SwitchRecipeLearner {
 constructor({onBegin=()=>{},onFinish=()=>{},onCancel=()=>{},onPending=()=>{}}={}){Object.assign(this,{onBegin,onFinish,onCancel,onPending});this.active=null;this.enabled=true;}
 ensure(game,now,state){if(this.active&&this.active.game!==game)this.finish(now,true);if(!this.active)this.active={game,start:now,state:{...state},steps:[],held:new Map(),lastEnd:now,recipe:null};if(now<this.active.start){const a=this.active,shift=a.start-now;for(const s of a.steps)s.atMs+=shift;a.start=now;a.recipe=null;this.onCancel();}return this.active;}
 update(a){const next=learnedRecipe(a.game,a.steps,a.state);if(!next)return;if(a.recipe)Object.assign(a.recipe,next);else{a.recipe=next;this.onBegin(a.game,a.recipe,a.start);}this.onPending(a.steps.length,a.held.size);}
 room(){if(this.active?.steps.length>=128){this.cancel('Long input burst discarded. Use Finish recipe before 128 activations.');return false;}return true;}
 allowed(game,n){const s=inputMap(game)?.get(n);return s&&!s.managed&&!s.unused;}
 press(game,n,now,state){
  if(!this.enabled||!this.allowed(game,n)||this.active?.held.has(n)||((state.held||[]).includes(n)&&!this.active?.steps.some(s=>s.switch===n))||!this.room())return;const a=this.ensure(game,now,state);
  const offset=Math.max(0,now-a.start),last=a.steps.findLast(s=>s.switch===n&&s.pulse&&s.atMs<=offset&&s.atMs+s.holdMs>=offset);
  const step=last||{atMs:offset,switch:n,holdMs:25};if(!last)a.steps.push(step);delete step.pulse;a.held.set(n,step);a.lastEnd=now;this.update(a);
 }
 release(n,now){const a=this.active,step=a?.held.get(n);if(!step)return;step.holdMs=Math.max(0,now-a.start-step.atMs);a.held.delete(n);a.lastEnd=Math.max(a.lastEnd,now);this.update(a);}
 pulse(game,n,now,state,holdMs=120){
  if(!this.enabled||!this.allowed(game,n)||this.active?.held.has(n)||((state.held||[]).includes(n)&&!this.active?.steps.some(s=>s.switch===n))||!this.room())return;const a=this.ensure(game,now,state);
  const offset=Math.max(0,now-a.start),last=a.steps.findLast(s=>s.switch===n&&s.pulse&&s.atMs<=offset&&s.atMs+s.holdMs>=offset);
  if(last)last.holdMs=offset+holdMs-last.atMs;else a.steps.push({atMs:offset,switch:n,holdMs,pulse:true});a.lastEnd=Math.max(a.lastEnd,now+holdMs);this.update(a);
 }
 releaseAll(now){if(this.active)for(const n of [...this.active.held.keys()])this.release(n,now);}
 command(game,data,now,state={}){
  if(!this.enabled)return;this.advance(now);const n=Number(data.number);
  if(data.type==='matrix'){
   if(data.release){this.releaseAll(now);return;}
   if(data.pressed!==undefined){data.pressed?this.press(game,n,now,state):this.release(n,now);return;}
   if(data.hold){this.active?.held.has(n)||((state.held||[]).includes(n)&&!this.active?.steps.some(s=>s.switch===n))?this.release(n,now):this.press(game,n,now,state);}else this.pulse(game,n,now,state);
  }else if(data.type==='switch'){const number=game==='t2_l8'&&n===112?11:game==='t2_l8'&&n===114?12:n;data.state?this.press(game,number,now,state):this.release(number,now);}
  else if(data.type==='key'){
   const number=({31:1,32:2,33:5,34:6,35:7,26:8,27:13,93:game==='t2_l8'?12:114,94:game==='t2_l8'?11:112})[data.code];
   if(number)data.state?this.press(game,number,now,state):this.release(number,now);
   else if(data.code===78&&data.state){if(this.active?.held.has(22))this.release(22,now);else if(!(state.active||[]).includes(22))this.press(game,22,now,state);}
  }else if(data.type==='event'&&data.id==='launch')this.pulse(game,23,now,state);
  else if(data.type==='event'&&data.id==='begin-game'&&game==='pop_lx5'){
   const start=Math.max(now,12000);for(const [offset,number] of [[0,5],[400,1],[800,1],[1300,13]])this.pulse(game,number,start+offset,state);
  }
 }
 advance(now){const a=this.active;if(a&&!a.held.size&&now>=a.lastEnd+1500)this.finish(now);}
 finish(now,releaseHeld=false){const a=this.active;if(!a||(!releaseHeld&&a.held.size))return false;if(releaseHeld)this.releaseAll(now);if(!a.recipe)return false;this.active=null;this.onFinish(a.recipe,now);this.onPending(0,0);return true;}
 cancel(reason){if(this.active){this.active=null;this.onPending(0,0);this.onCancel(reason);}}
}
