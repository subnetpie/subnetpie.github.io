import assert from 'node:assert/strict';
import {recipesForGame} from './dist/trigger-recipes.mjs';
import {TriggerRunner} from './dist/trigger-runner.mjs';
import {PopeyeMachine} from './dist/popeye-events.mjs';
import {T2MatrixInputs} from './dist/t2-matrix.mjs';
assert.equal(recipesForGame('pop_lx5').length,10);assert.equal(recipesForGame('t2_l8').length,14);assert.deepEqual(recipesForGame('other'),[]);
for(const [game,Machine] of [['pop_lx5',PopeyeMachine],['t2_l8',T2MatrixInputs]]){
 const states=new Map(),messages=[],machine=new Machine({setSwitch:(n,v)=>states.set(n,v)}),runner=new TriggerRunner(machine,game,m=>messages.push(m));
 const find=s=>recipesForGame(game).find(r=>r.id.endsWith('light-'+s)).id;
 assert.throws(()=>runner.run(find('launch'),0),/shooter/);
 assert.throws(()=>runner.run(find(game==='pop_lx5'?'ramp':'jets'),0),/launch/);
 runner.run(find('start'),0);runner.tick(11999);assert(!states.get(5),'Startup inputs must wait for boot');runner.tick(12000);assert(states.get(5));
 assert.throws(()=>runner.run(find('start'),12000),/current recipe/);runner.cancel();assert(!states.get(5));runner.tick(20000);assert(!states.get(13),'Cancelled recipe must not send later switches');
 machine.now=20000;machine.shooter=true;runner.run(find('launch'),20000);runner.tick(20000);assert(states.get(game==='pop_lx5'?23:34));
 runner.tick(20120);machine.playfield=1;machine.shooter=false;runner.tick(20121);assert.equal(messages.at(-1).phase,'completed');
 runner.run(find(game==='pop_lx5'?'ramp':'jets'),21000);runner.tick(21000);const first=game==='pop_lx5'?34:41;assert(states.get(first));runner.tick(21120);assert(!states.get(first));runner.tick(21250);assert(states.get(game==='pop_lx5'?35:42));runner.cancel();assert(!states.get(game==='pop_lx5'?35:42));
 assert.throws(()=>runner.run(recipesForGame(game==='pop_lx5'?'t2_l8':'pop_lx5')[0].id,22000),/belong/);
 machine.playfield=0;runner.run(find('start'),23000);runner.tick(40000);assert.equal(messages.at(-1).phase,'error');assert.equal(runner.held.size,0);
 if(game==='pop_lx5'){
  machine.playfield=1;machine.trough=5;machine.now=41000;runner.run(find('drain-left'),41000);runner.tick(41000);assert.equal(machine.playfield,0);machine.update(41600,()=>0);assert.equal(machine.trough,6);runner.cancel();
 }
 console.log(game+': recipes passed startup delay, prerequisites, timed pulses, launch confirmation, cancellation, timeout, game isolation and ball handling.');
}
