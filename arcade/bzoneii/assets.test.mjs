import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {AssetTrace,shapeAsset} from './assets.js';

const root=new URL('../../',import.meta.url);
const source=readFileSync(new URL('script.js',import.meta.url),'utf8');
async function boot(traced=true) {
  const sandbox={console:{log(){},error(...args){throw Error(args.join(' '));}},
    document:{querySelector:()=>({getContext:()=>({})})},window:{},
    fetch:async path=>({ok:true,arrayBuffer:async()=>readFileSync(new URL(path.replace('../bzone/','bzone/'),new URL('arcade/',root)))})};
  vm.createContext(sandbox);
  const cpu=readFileSync(new URL('cpu/m6502.js',root),'utf8').replace('export class','class');
  const assets=readFileSync(new URL('assets.js',import.meta.url),'utf8').replaceAll('export ','');
  const game=source.replace(/^import .*;\r?\n/gm,'').replace(/const game=new Battlezone\(\);[\s\S]*$/,'');
  vm.runInContext(cpu+'\n'+assets+'\n'+game+`
    Battlezone.prototype.bind=function(){};
    Battlezone.prototype.draw=function(){};
    BzoneAudio.prototype.start=function(){};
    globalThis.game=new Battlezone();`,sandbox);
  await sandbox.game.init();
  if(!traced) sandbox.game.assetTrace.enabled=false;
  return sandbox.game;
}

const game=await boot(), control=await boot(false);
assert.equal(game.assetTrace.enabled,true,'repository ROM revision is recognized');
const seen=new Map(),slots=new Set(),positions=new Map();
for(let frame=0;frame<2400;frame++) {
  // Attract, insert coin, start, then rotate/fire to exercise landscape and entities.
  for(const g of [game,control]) {
    g.i.coin1=frame>=800&&frame<810?1:0;
    g.i.start1=frame>=830&&frame<840?1:0;
    g.i.lu=frame>=850?1:0;g.i.rd=frame>=850?1:0;
    g.i.fire=frame>=850?1:0;
    g.frame();
  }
  assert.deepEqual(Buffer.from(game.mem),Buffer.from(control.mem),'metadata must not change emulated RAM');
  assert.equal(game.cpu.pc,control.cpu.pc);
  assert.equal(game.cpu.cycles,control.cpu.cycles);
  assert.equal(game.vectors.length,control.vectors.length);
  for(let i=0;i<game.vectors.length;i++) {
    const v=game.vectors[i],ref=control.vectors[i];
    assert.equal(JSON.stringify(v.slice(0,6)),JSON.stringify(ref.slice(0,6)),'geometry/intensity/clipping unchanged');
    const asset=v[8]?.asset??'unclassified';
    seen.set(asset,(seen.get(asset)||0)+1);
    const expected={mountains:'purple',moon:'blue',obstacle:'orange',crosshair:'red',volcanoSpark:'red',logo:'blue',hudRadar:'red',score:'red',highScore:'orange',enemyInRange:'lightOrange',enemyDirection:'lightOrange'};
    assert.equal(v[6],expected[asset]??'green');
    if(asset==='obstacle') {
      assert.equal(shapeAsset(v[8].type),'obstacle');slots.add(v[8].record);
      assert.ok(v[8].shape===0x74cb||v[8].shape===0x74d7);
    }
    if(asset==='moon') assert.ok(v[7]>=0x1054&&v[7]<0x10c4);
    if(!positions.has(asset)) positions.set(asset,new Set());
    positions.get(asset).add(Math.round(v[0]));
  }
}
for(const asset of ['mountains','moon','obstacle','crosshair','volcanoSpark','logo','hudRadar','score','highScore','enemyInRange','enemyDirection','unclassified'])
  assert.ok(seen.get(asset)>0,`runtime must exercise ${asset}`);
assert.ok(slots.size>1,'multiple obstacle records are captured');
assert.ok(positions.get('moon').size>10,'moon retains identity while scrolling');

// Reused display-list slots lose old provenance; another ROM fails closed.
const trace=game.assetTrace;
trace.scopes=[];trace.bytes[2]={asset:'obstacle'};trace.write(0x2002);
assert.equal(trace.instruction(2,{asset:'mountains'}),null);
assert.equal(new AssetTrace(new Uint8Array(32768)).enabled,false);

// Return matching must survive NMI and ignore an identical PC at the wrong SP.
const mem=new Uint8Array(game.mem), t=new AssetTrace(mem);
const cpu={pc:0x50ff,s:0xf0};t.beforeStep(cpu);
cpu.pc=0x5102;cpu.s=0xed;t.beforeStep(cpu);assert.equal(t.scopes.length,1);
cpu.s=0xf0;t.beforeStep(cpu);assert.equal(t.scopes.length,0);

// HUD radar owns its graphics, but not the nested ENEMY IN RANGE text call.
mem[0x1ef]=0xce;mem[0x1f0]=0x50;
cpu.pc=0x6ae9;cpu.s=0xee;t.beforeStep(cpu);t.write(0x2002);
assert.equal(t.bytes[2].asset,'hudRadar');
mem[0x1ed]=0x4e;mem[0x1ee]=0x6c;
cpu.pc=0x6c98;cpu.s=0xec;cpu.x=0x10;t.beforeStep(cpu);t.write(0x2004);
assert.equal(t.bytes[4].asset,'enemyInRange');assert.equal(t.bytes[4].textId,0x10);
cpu.pc=0x6c4f;cpu.s=0xee;t.beforeStep(cpu);t.write(0x2006);
assert.equal(t.bytes[6].asset,'hudRadar');
cpu.pc=0x50cf;cpu.s=0xf0;t.beforeStep(cpu);t.write(0x2008);
assert.equal(t.bytes[8],null);

// The same nested ROM primitive inherits each caller, and VRTS restores it.
const synthetic=await boot();
function words(addr,list) {
  for(const word of list) {synthetic.mem[addr++]=word&255;synthetic.mem[addr++]=word>>>8;}
}
words(0x2000,[0x7000,0x60f0,0xac00,0xac00,0x2000]);
words(0x3800,[0xac04,0x0000,0xe010,0xc000]);
words(0x3808,[0x0000,0xe010,0xc000]);
const obstacle={id:1,asset:'obstacle'},crosshair={id:2,asset:'crosshair'};
synthetic.assetTrace.bytes[4]=obstacle;
synthetic.assetTrace.bytes[6]=crosshair;
synthetic.runAVG();
assert.deepEqual(Array.from(synthetic.vectors,v=>v[6]),['orange','orange','red','red']);
assert.deepEqual(Array.from(synthetic.vectors,v=>v[8].id),[1,1,2,2]);
synthetic.assetTrace.bytes[6]=null;synthetic.runAVG();
assert.deepEqual(Array.from(synthetic.vectors,v=>v[6]),['orange','orange','green','green']);
console.log('2400 frames: semantic assets, CPU/RAM/geometry parity, reuse, ROM guard, return scope passed');
console.log(Object.fromEntries(seen));

