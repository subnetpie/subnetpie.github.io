import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {M6502} from '../../cpu/m6502.js';
import {BzoneAudio} from './audio.js';
import {PokeyRandom} from './pokey-random.js';
import {AssetTrace,ASSETS} from './assets.js';
const root=new URL('../../',import.meta.url).pathname;
test('Battlezone ROM boots, plays, drives sound latches and produces unclipped audio',async()=>{
let src=readFileSync(root+'/arcade/bzone/script.js','utf8').replace(/^import .*;\n/gm,'').split('const game=new Battlezone();')[0];
const canvas={getContext:()=>({})};
const context={M6502,BzoneAudio,PokeyRandom,AssetTrace,ASSETS,console,document:{querySelector:()=>canvas}};
vm.createContext(context);vm.runInContext(src+'\nBattlezone.prototype.bind=()=>{};Battlezone.prototype.draw=()=>{};globalThis.Battlezone=Battlezone;',context);
context.Battlezone.prototype.rom=async n=>new Uint8Array(readFileSync(root+'/arcade/bzone-old/roms/'+n));
globalThis.window={AudioContext:class{constructor(){this.sampleRate=48000;this.state='running';}createScriptProcessor(){return {connect(){}}}}};
const g=new context.Battlezone();await g.init();g.audio.start();
const writes=[],latches=new Set(),sk=new Set();
const wr=g.audio.write.bind(g.audio),ctrl=g.audio.control.bind(g.audio);
g.audio.write=(r,d)=>{writes.push([g.cpu.cycles,r,d]);if(r===15)sk.add(d);wr(r,d);};
g.audio.control=d=>{latches.add(d);ctrl(d);};
const samples=[];
for(let frame=0;frame<1230;frame++) {
 g.i.coin1=frame>=45&&frame<51?1:0;g.i.start1=frame>=70&&frame<76?1:0;
 g.i.fire=frame>90?1:0;g.i.lu=g.i.ru=frame>200&&frame<500?1:0;
 g.frame();
 while(g.audio.count){samples.push(g.audio.queue[g.audio.readIndex]);g.audio.readIndex=(g.audio.readIndex+1)%g.audio.queue.length;g.audio.count--;}
}
let peak=0,energy=0,nonzero=0;for(const s of samples){if(!Number.isFinite(s))throw Error('NaN');peak=Math.max(peak,Math.abs(s));energy+=s*s;if(s!==0)nonzero++;}
console.log({cycles:g.cpu.cycles,seconds:g.cpu.cycles/1512000,samples:samples.length,peak,rms:Math.sqrt(energy/samples.length),nonzero,writes:writes.length,latches:[...latches],sk:[...sk],overruns:g.audio.overruns});
assert.ok(writes.length>1000);
assert.ok(peak>0.1&&peak<=1);
assert.ok(nonzero>samples.length/2);
assert.ok([...latches].some(d=>d&4));
assert.ok([...latches].some(d=>d&1));
assert.ok([...latches].some(d=>d&16));
assert.ok([...latches].some(d=>d&128));
assert.deepEqual([...sk],[0,7]);
assert.equal(g.audio.overruns,0);
assert.ok(Math.abs(samples.length-g.cpu.cycles*48000/1512000)<1);
});
