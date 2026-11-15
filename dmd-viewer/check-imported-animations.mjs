import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {animationIdentity} from './dist/animation-identity.mjs';
import {recipesForGame} from './dist/trigger-recipes.mjs?v=animation-import-1';
import {RecipeEventList,recipeKey} from './dist/recipe-event-list.mjs';
import {TriggerRunner} from './dist/trigger-runner.mjs';
import {T2MatrixInputs} from './dist/t2-matrix.mjs';
const list=new RecipeEventList();list.load(JSON.parse(readFileSync('dist/recipe-events.json','utf8')));
assert.equal(recipesForGame('pop_lx5').length,10);assert.equal(recipesForGame('t2_l8').length,14);assert.equal(list.export().events.length,24);
const imported=recipesForGame('t2_l8').filter(r=>r.contributed);assert.equal(imported.length,6);assert.equal(new Set(recipesForGame('t2_l8').map(r=>recipeKey('t2_l8',r))).size,14);
for(const recipe of imported){const entry=list.export().entries.find(e=>e.id===recipe.id);assert(entry);assert(!entry.learned);assert.equal(entry.events.length,1);assert.deepEqual(recipe.expectedAnimations,entry.events.map(e=>e.label));}
for(const label of ['Door Opening_UD72','Door4_84','Door5_84','Door6_84','Door7_84','Door8_84'])assert.equal(animationIdentity('t2_l8','scene',label).key,'t2_l8:animation:door opening');
assert.notEqual(animationIdentity('pop_lx5','','Door4_84').key,animationIdentity('t2_l8','','Door4_84').key);
const launch=recipesForGame('t2_l8').find(r=>r.id.endsWith('light-launch'));assert(launch.expectedAnimations.includes('PullTrigger'));assert.equal(recipesForGame('t2_l8').filter(r=>r.steps.length===1&&r.steps[0].switch===34).length,1);
const machine=new T2MatrixInputs({setSwitch(){}}),messages=[],runner=new TriggerRunner(machine,'t2_l8',e=>messages.push(e));
const service=imported.find(r=>r.kind==='service');runner.run(service.id,20000);runner.tick(20000);assert(machine.held.size>0);runner.tick(20200);assert.equal(machine.held.size,0);runner.cancel();
machine.playfield=1;assert.throws(()=>runner.run(service.id,21000),/Reset/);machine.playfield=0;const shot=imported.find(r=>r.kind==='shot');assert.throws(()=>runner.run(shot.id,22000),/launch/);machine.playfield=1;runner.run(shot.id,23000);runner.tick(23000);runner.cancel();assert.equal(machine.held.size,0);
console.log('Imported animations passed: six new recipes, reused PullTrigger, one door-opening family, no duplicate timed inputs, metadata-only catalog, and correct service/ball-state guards.');
