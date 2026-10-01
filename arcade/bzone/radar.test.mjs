import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {M6502} from '../../cpu/m6502.js';
import {BzoneAudio} from './audio.js';
import {PokeyRandom} from './pokey-random.js';
import {AssetTrace,ASSETS} from './assets.js';

test('radar uses ROM provenance, never short-vector length, for contacts',()=>{
 const trace=new AssetTrace(new Uint8Array(32768));trace.enabled=true;
 const radar={asset:'hudRadar',id:1};
 for(const [pc,position] of [[0x1542,'3'],[0x1548,'6'],[0x154e,'9'],[0x155c,'12']]) {
  const origin=trace.instruction(pc+1,radar);
  assert.equal(origin.asset,'radarTicks');assert.equal(origin.clockPosition,position);
  assert.equal(trace.styleInstruction(origin,{x1:0,y1:0,x2:1,y2:0,visible:true}).color,'green');
 }
 assert.equal(trace.styleInstruction(radar,{x1:0,y1:0,x2:0,y2:0,visible:true}).asset,'hudRadar');
 trace.scopes.push({origin:radar,end:0x7000,sp:0xff});
 trace.beforeStep({pc:0x6c33,s:0xfb});trace.write(0x2000);
 assert.equal(trace.bytes[0].asset,'enemyBlip');
 trace.beforeStep({pc:0x6c3b,s:0xf8}); // interrupted stack cannot pop contact scope
 assert.equal(trace.scopes.at(-1).origin.asset,'enemyBlip');
 trace.beforeStep({pc:0x6c38,s:0xfb});trace.write(0x2002);
 assert.equal(trace.bytes[2].asset,'enemyBlip');
 trace.beforeStep({pc:0x6c3b,s:0xfb});trace.write(0x2004);
 assert.equal(trace.bytes[4].asset,'hudRadar');
});

test('ROM radar has four green compass ticks and separate red contacts without geometry changes',async()=>{
 const source=readFileSync(new URL('./script.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split('const game=new Battlezone();')[0];
 const canvas={getContext:()=>({})};
 const context={M6502,BzoneAudio,PokeyRandom,AssetTrace,ASSETS,console,document:{querySelector:()=>canvas}};
 vm.createContext(context);vm.runInContext(source+'\nBattlezone.prototype.bind=()=>{};Battlezone.prototype.draw=()=>{};globalThis.Battlezone=Battlezone;',context);
 context.Battlezone.prototype.rom=async n=>new Uint8Array(readFileSync(new URL('../bzone-old/roms/'+n,import.meta.url)));
 const game=new context.Battlezone();await game.init();
 const positions=new Set();let blips=0,ticks=0,sweeps=0;const strengths=new Set();
 for(let f=0;f<600;f++) {
  game.i.coin1=f>=45&&f<51?1:0;game.i.start1=f>=70&&f<76?1:0;
  game.i.lu=f>200?1:0;game.i.rd=f>200?1:0;
  game.frame();
  for(const v of game.vectors) {
   if(v[8].asset==='radarTicks'){
    ticks++;positions.add(v[8].clockPosition);assert.equal(v[6],'green');
    assert.ok([0x1542,0x1548,0x154e,0x155c].includes(v[7]&~1));
   }
   if(v[8].asset==='radarSweep'){sweeps++;assert.equal(v[8].cpuPC,0x6b34);}
   if(v[8].asset==='enemyBlip'){
    strengths.add(v[8].radarStrength);
    blips++;assert.equal(v[6],'red');assert.equal(v[8].cpuPC,0x6c33);
    assert.equal(v[0],v[2]);assert.equal(v[1],v[3]);
   }
  }
  if(f%60===0){
   // Re-render the same emulated display list with provenance disabled.
   game.runAVG();const original=JSON.stringify(game.vectors.map(v=>v.slice(0,6)));
   game.assetTrace.enabled=false;game.runAVG();
   assert.equal(JSON.stringify(game.vectors.map(v=>v.slice(0,6))),original);
   game.assetTrace.enabled=true;
  }
 }
 assert.deepEqual([...positions].sort(),['12','3','6','9']);
 assert.ok(sweeps>100);assert.ok(strengths.has(1));assert.ok(Math.min(...strengths)<.5);
 assert.ok(ticks>100);assert.ok(blips>0,'the run must actually encounter contacts');
 console.log({ticks,blips,positions:[...positions]});
});
