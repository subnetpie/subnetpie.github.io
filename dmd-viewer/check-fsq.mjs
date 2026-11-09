import assert from 'node:assert/strict';
import {parsePalMappings,parseFsq} from './dist/fsq.mjs';
const u16=n=>[n>>8&255,n&255],u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
function frame(size=512,depth=2,delay=40){return [...u32(delay),...u16(depth),...u16(size),...u32(0),...Array.from({length:depth},(_,i)=>[0,1<<i,...Array(size-1).fill(0)]).flat()]}
function file(frames){return Uint8Array.from([70,83,81,32,3,0,1,...u16(frames.length),...frames.flat()])}
const pal={mappings:[{offset:7,mode:1,paletteId:0}],palettes:[{id:0,colors:Array.from({length:64},(_,i)=>[i,i,i])}]};
let scenes=parseFsq(file([frame()]),pal);assert.equal(scenes[0].frames[0].data[0],1);assert.equal(scenes[0].frames[0].data[1],2);assert.equal(scenes[0].frames[0].delay,40);assert.equal(scenes[0].colors.length,64);
scenes=parseFsq(file([frame(256)]),pal);assert.equal(scenes[0].frames[0].data[1024],1);assert.equal(scenes[0].frames[0].data[0],0);
scenes=parseFsq(file([frame()]),{...pal,mappings:[{offset:7,mode:2,paletteId:0}]});assert.equal(scenes[0].frames[0].data[0],4);assert.equal(scenes[0].frames[0].data[1],8);assert.equal(scenes[0].partial,true);
scenes=parseFsq(file([frame(512,3,0),frame()]),{...pal,mappings:[{offset:7,mode:5,paletteId:0}]});assert.equal(scenes[0].frames.length,1);
const encodedPal=Uint8Array.from([1,...u16(1),...u16(0),...u16(1),1,0,0,0,...u16(1),...u32(123),1,...u16(0),...u32(7)]);assert.equal(parsePalMappings(encodedPal).mappings[0].offset,7);
assert.throws(()=>parseFsq(file([frame()]).slice(0,-1),pal),/Truncated/);
assert.throws(()=>parseFsq(file([frame()]),null),/matching PAL/);
console.log('Passed: FSQ v3 offsets, PAL mappings, LSB pixels, color-mask planes, metadata frames, 128x16 padding, invalid input.');
