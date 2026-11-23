import assert from 'node:assert/strict';
import {t2Switches,t2SwitchByNumber,T2MatrixInputs} from './dist/t2-matrix.mjs';
import {popeyeLamps,popeyeHotspots} from './dist/popeye-playfield.mjs';
import {popeyeSwitchByNumber} from './dist/popeye-matrix.mjs';
import {t2Lamps,t2Hotspots,t2OtherInputs} from './dist/t2-playfield.mjs';
assert.equal(t2Switches.length,72);assert.equal(new Set(t2Switches.map(s=>s.number)).size,72);
for(let c=1;c<=8;c++)for(let r=1;r<=8;r++)assert(t2SwitchByNumber.has(c*10+r));
assert.equal(t2Switches.filter(s=>s.bank).length,5);assert.equal(t2SwitchByNumber.get(62).label,'Left ramp made');assert(t2SwitchByNumber.get(81).unused);
const states=new Map(),input=new T2MatrixInputs({setSwitch:(n,v)=>states.set(n,v)});
input.trigger(71,true);assert.equal(states.get(71),1);assert(input.snapshot(n=>states.get(n)).held.includes(71));input.releaseHeld();assert.equal(states.get(71),0);
input.trigger(62);input.update(119);assert.equal(states.get(62),1);input.update(120);assert.equal(states.get(62),0);assert.equal(states.get(24),1);
assert.throws(()=>input.trigger(81),/unused/);assert.throws(()=>input.trigger(15),/managed/);input.trigger(72,true);input.reset();assert.equal(states.get(72),0);
assert.equal(popeyeLamps.length,64);assert.equal(new Set(popeyeLamps.map(l=>l.number)).size,64);
for(const l of popeyeLamps)if(l.area!=='backbox')assert(l.x>=0&&l.x<=100&&l.y>=0&&l.y<=100);
assert.equal(popeyeHotspots.length,68);for(const h of popeyeHotspots){assert(popeyeSwitchByNumber.has(h.number));assert(h.x>=0&&h.x<=100&&h.y>=0&&h.y<=100);}
console.log('Playfield/T2 passed: 64 lamp locations, 68 touch targets, T2 chart numbering, target bank, unused/automatic guards, pulse/hold and release.');

input.update(200,n=>n===4);assert.equal(input.trough,2);input.update(550,()=>0);assert(input.shooter);
input.update(560,n=>n===9);assert.equal(input.playfield,1);assert.equal(input.shooter,false);
input.trigger(25);input.update(1060,()=>0);assert(input.outhole);input.update(1070,n=>n===3);assert.equal(input.trough,3);assert.equal(input.outhole,false);

assert.equal(popeyeHotspots.filter(h=>h.flipper).length,8);
assert.equal(t2Lamps.length,64);assert.equal(new Set(t2Lamps.map(l=>l.number)).size,64);assert.deepEqual(t2Lamps.filter(l=>l.unused).map(l=>l.number),[18]);assert.equal(t2Lamps.find(l=>l.number===52).area,'head');
for(const l of t2Lamps)if(l.area==='main'){assert(l.x>0&&l.x<100&&l.y>0&&l.y<100);for(const point of l.extra||[])assert(point.x>0&&point.x<100&&point.y>0&&point.y<100);}
assert.equal(t2Hotspots.length,46);assert.equal(new Set(t2Hotspots.map(h=>h.number)).size,46);for(const h of t2Hotspots){assert(t2SwitchByNumber.has(h.number));assert(!t2SwitchByNumber.get(h.number).unused);assert(h.x>0&&h.x<100&&h.y>0&&h.y<100);}
const located=new Set([...t2Hotspots.map(h=>h.number),...t2OtherInputs]);assert.equal(located.size,60);assert.deepEqual([...located].sort((a,b)=>a-b),t2Switches.filter(s=>!s.unused).map(s=>s.number).sort((a,b)=>a-b));assert.deepEqual(t2Hotspots.filter(h=>h.flipper).map(h=>h.number),[11,12]);
console.log('T2 table passed: all 64 lamp addresses, 63 used outputs, repeated bulbs, head lamp, 46 playfield switches and 14 other inputs cover every used switch.');
input.setHeld(71,true);input.setHeld(71,true);assert.equal(states.get(71),1);input.setHeld(71,false);assert.equal(states.get(71),0);

assert.equal(t2Hotspots.filter(h=>h.number===76).length,1);assert(!t2OtherInputs.includes(76));assert.equal(t2SwitchByNumber.get(76).label,'Ball popper');
