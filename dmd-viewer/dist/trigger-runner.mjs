import {recipesForGame} from './trigger-recipes.mjs';

// Scheduled on emulator time so tab throttling cannot strand a held switch.
export class TriggerRunner {
 constructor(machine,game,notify=()=>{}){Object.assign(this,{machine,game,notify});this.active=null;this.held=new Set();}
 run(id,now){
  if(this.active)throw Error('Wait for the current recipe or cancel it first.');
  const recipe=recipesForGame(this.game).find(r=>r.id===id);if(!recipe)throw Error('Recipe does not belong to this game.');
  const type=id.split('light-').at(-1),m=this.machine;
  if(m.pending?.some?.(p=>p.event||p.begin))throw Error('Wait for the current shot or startup sequence.');
  if((type==='start'||type==='attract')&&(m.playfield||m.shooter))throw Error('Reset the ROM before starting this recipe.');
  if(type==='launch'&&!m.shooter)throw Error('Start a game and wait for a ball in the shooter lane.');
  if(!['start','attract','launch'].includes(type)&&!m.playfield)throw Error('Start a game and launch a ball before running a shot recipe.');
  if((m.held||m.holds).size)throw Error('Release held switches before running a recipe.');
  const delay=type==='start'?Math.max(0,(this.game==='pop_lx5'?m.bootAt:12000)-now):0;
  const events=recipe.steps.flatMap(s=>[{at:s.atMs,number:s.switch,state:true},{at:s.atMs+s.holdMs,number:s.switch,state:false}]).sort((a,b)=>a.at-b.at||Number(a.state)-Number(b.state));
  this.active={recipe,type,start:now+delay,events,index:0,deadline:now+delay+(type==='start'?15000:type==='launch'?8000:recipe.durationMs),drain:false};
  this.notify({phase:'running',id,text:recipe.label+(delay?' — waiting for ROM startup':' — running')});
 }
 tick(now){
  const a=this.active;if(!a||now<a.start)return;const m=this.machine;
  try{
   if(!a.observing){a.observing=true;this.notify({phase:'running',stage:'inputs',id:a.recipe.id,text:a.recipe.label+' — observing triggered events and sound'});}
   // Let the existing ball model return a drained ball to the trough.
   if(this.game==='pop_lx5'&&a.type==='drain-left'&&!a.drain){m.event('drain-left');a.drain=true;a.index=a.events.length;}
   while(a.index<a.events.length&&now-a.start>=a.events[a.index].at){const e=a.events[a.index++];m.setHeld(e.number,e.state);if(e.state)this.held.add(e.number);else this.held.delete(e.number);}
   const sent=a.index===a.events.length;
   if(sent&&((a.type==='start'&&m.shooter)||(a.type==='launch'&&m.playfield))){this.finish('completed',a.recipe.label+' — '+(a.type==='start'?'ball ready to launch':'ball in play'));return;}
   if(now>=a.deadline){if(['start','launch'].includes(a.type))this.finish('error','The ROM did not '+(a.type==='start'?'serve':'launch')+' a ball. Check the DMD and reset the ROM if needed.');else this.finish('completed',a.recipe.label+' — complete');}
  }catch(error){this.finish('error',error.message);}
 }
 finish(phase,text){const id=this.active?.recipe.id;for(const n of this.held)this.machine.setHeld(n,false);this.held.clear();this.active=null;if(id)this.notify({phase,id,text});}
 cancel(){if(this.active)this.finish('cancelled','Recipe cancelled; held recipe switches released.');}
}
