import assert from 'node:assert/strict';
import {parsePal,parseVni,parseDump,parseRaw,heatshrink} from './dist/formats.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const u16=n=>[n>>8&255,n&255],u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
const palette=Uint8Array.from([2,...u16(1),...u16(7),...u16(4),1,0,0,0,80,10,0,180,55,0,255,140,30]);
assert.equal(parsePal(palette).palettes[0].colors[3][0],255);
assert.equal(parsePal(palette).palettes[0].default,true);
assert.throws(()=>parsePal(palette.slice(0,-1)),/Truncated/);
function literals(data){const bits=data.flatMap(b=>[1,...Array.from({length:8},(_,i)=>b>>(7-i)&1)]);while(bits.length%8)bits.push(0);return Uint8Array.from(Array.from({length:bits.length/8},(_,i)=>bits.slice(i*8,i*8+8).reduce((v,b)=>v*2+b,0)))}
function fixture(version,compressed=false){const name=[...new TextEncoder().encode('Binary test')];const plane0=Array(512).fill(0),plane1=Array(512).fill(0);plane0[0]=128;plane1[0]=64;const planes=[0,...plane0,1,...plane1];return Uint8Array.from([86,80,73,78,...u16(version),...u16(1),...(version>=2?u32(0):[]),...u16(name.length),...name,...Array(16).fill(0),...u16(1),...(version>=2?[...u16(7),...u16(0)]:[]),...(version>=3?[0]:[]),...(version>=4?[...u16(128),...u16(32)]:[]),...(version>=5?u16(0):[]),...u16(512),...u16(40),...(version>=4?u32(0):[]),2,...(version>=3?[+compressed]:[]),...(compressed?[...u32(literals(planes).length),...literals(planes)]:planes)])}
for(let v=1;v<=5;v++){for(const packed of v>=3?[false,true]:[false]){const scenes=parseVni(fixture(v,packed));assert.equal(scenes[0].frames[0].data[0],1);assert.equal(scenes[0].frames[0].data[1],2);assert.equal(scenes[0].frames[0].delay,40);assert.equal(scenes[0].frames[0].data[2],0)}}
assert.throws(()=>parseVni(fixture(5).slice(0,-1)),/Truncated/);
// Literal A followed by a distance-1 / length-3 backreference.
const bits='1'+'01000001'+'0'+'0000000000'+'00010';const padded=bits.padEnd(Math.ceil(bits.length/8)*8,'0');const packed=Uint8Array.from(padded.match(/.{8}/g),b=>parseInt(b,2));assert.deepEqual([...heatshrink(packed,4)],[65,65,65,65]);
const row='0123'.repeat(32);const dump='00000000\n'+Array(32).fill(row).join('\n')+'\n\n00000028\n'+Array(32).fill(row).join('\n')+'\n';const d=parseDump(dump);assert.equal(d[0].frames.length,2);assert.equal(d[0].frames[0].delay,40);assert.equal(d[0].frames[0].data[3],3);
assert.throws(()=>parseDump('not a dump'),/Unrecognized/);
assert.equal(parseRaw(Uint8Array.from([128,...Array(1023).fill(0)]),128,32,'2')[0].frames[0].data[0],1);
assert.throws(()=>parseRaw(new Uint8Array(17),128,32,'indexed'),/multiple/);
mkdirSync('dist/samples',{recursive:true});writeFileSync('dist/samples/test-pattern.vni',fixture(5,true));writeFileSync('dist/samples/test-palette.pal',palette);writeFileSync('dist/samples/test-dump.txt',dump);
console.log('Passed: PAL, VNI v1–5, compressed frames, bit order, timestamps, raw planes, and malformed input. Sample files generated.');
