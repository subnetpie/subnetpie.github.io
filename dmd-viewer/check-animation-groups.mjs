import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {animationGroups,joinAnimationParts} from './dist/animation-groups.mjs';
import {parsePac} from './dist/pac.mjs';
const scene=(name,n,colors)=>({name,w:128,h:32,offset:n,colors,frames:[{data:Uint8Array.of(n),delay:100}]});
const parts=[scene('Starring-Arnie03',3,[[3,0,0]]),scene('Other',4),scene('Starring-Arnie01',1,[[1,0,0]]),scene('Starring-Arnie02',2,[[2,0,0]]),scene('T800',8),scene('T1000',10)];
const joined=joinAnimationParts(parts);assert.equal(joined.length,4);assert.equal(joined[0].name,'Starring-Arnie');assert.deepEqual(joined[0].frames.map(f=>f.data[0]),[1,2,3]);assert.deepEqual(joined[0].frames[1].colors,[[2,0,0]]);assert.equal(joined[0].frames.reduce((n,f)=>n+f.delay,0),300);
assert.equal(animationGroups(parts).size,3);
for(const file of ['popeye.pac','terminator-2.pac']){
 const decoded=await parsePac(readFileSync('dist/library/'+file));const combined=joinAnimationParts(decoded.scenes);
 assert(combined.length<decoded.scenes.length);
 const family=combined.find(s=>s.name===(file==='popeye.pac'?'FP4_skill shot':'Starring-Arnie'));
 assert(family?.parts.length>10);assert.equal(family.frames.length,family.parts.reduce((n,p)=>n+p.scene.frames.length,0));
 console.log(file+': '+decoded.scenes.length+' stored parts -> '+combined.length+' animation selections');
}
console.log('Animation grouping passed: numeric order, per-part colors, preserved timing, separate unrelated names, and real Popeye/T2 families.');
