import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {M6502} from '../../../cpu/m6502.js';
import {BzoneAudio} from './audio.js';
import {PokeyRandom} from './pokey-random.js';
import {AssetTrace,ASSETS} from './assets.js';
import {TANK_FACES,tankPolygons} from './tank-fill.js';
import {renderVectors} from './vector-renderer.js';

test('all 21 supplied faces retain their indices and fill colors',()=>{
 const reference=JSON.parse(readFileSync(new URL('./reference-vector-tank-piece.json',import.meta.url)));
 const restored=[...TANK_FACES[2],...TANK_FACES[13].map(f=>({...f,indices:f.indices.map(i=>i+24)}))];
 assert.deepEqual(restored,reference.model.faces);
 assert.equal(restored.length,21);
});

function recordingCanvas(){
 const fills=[];let path=[];
 return {fills,save(){},restore(){},fillRect(){},beginPath(){path=[];},
 moveTo(x,y){path.push([[x,y]]);},lineTo(x,y){path.at(-1).push([x,y]);},closePath(){},
 fill(){fills.push({ink:this.fillStyle,alpha:this.globalAlpha,path:structuredClone(path)});},
 stroke(){},arc(){}};
}

test('face fill preserves the cannon gap, respects settings and original mode',()=>{
 const edges=[[14,20],[20,18],[18,15],[15,14],[14,17],[17,16],[16,19],[19,21],[21,17],[15,16],[19,18],[20,21]];
 const point=i=>[i*7,(i%3)*9+10];
 const vectors=edges.map(edge=>[...point(edge[0]),...point(edge[1]),15,[], 'green',0,{asset:'tank',type:2,id:1,tankEdge:edge}]);
 assert.equal(tankPolygons(vectors,2).length,5);
 const ctx=recordingCanvas();renderVectors(ctx,vectors);
 const fill=ctx.fills.find(f=>f.path.length===5);
 assert.equal(fill.ink,'#39ff14');assert.equal(fill.alpha,.32);
 const custom=recordingCanvas();renderVectors(custom,vectors,{settings:{tank:{color:'#ff0000',fillOpacity:.6}}});
 assert.equal(custom.fills.find(f=>f.path.length===5).ink,'#ff0000');
 assert.equal(custom.fills.find(f=>f.path.length===5).alpha,.6);
 for(const options of [{colorized:false},{settings:{tank:{brightness:0}}},{settings:{tank:{fillOpacity:0}}}]) {
  const canvas=recordingCanvas();renderVectors(canvas,vectors,options);
  assert.ok(!canvas.fills.some(f=>f.path.length===5));
 }
 assert.deepEqual(tankPolygons(vectors.slice(0,1),2),[]);
});

test('ROM tank faces follow projected vertices without changing CPU, RAM or AVG output',async()=>{
 const source=readFileSync(new URL('./script.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').split('const game=new Battlezone();')[0];
 const context={M6502,BzoneAudio,PokeyRandom,AssetTrace,ASSETS,console,document:{querySelector:()=>({getContext:()=>({})})}};
 vm.createContext(context);vm.runInContext(source+'\nBattlezone.prototype.bind=()=>{};Battlezone.prototype.draw=()=>{};globalThis.Battlezone=Battlezone;',context);
 context.Battlezone.prototype.rom=async n=>new Uint8Array(readFileSync(new URL('../bzone-old/roms/'+n,import.meta.url)));
 const game=new context.Battlezone(),baseline=new context.Battlezone();await game.init();await baseline.init();baseline.assetTrace.enabled=false;
 let bodies=0,dishes=0;const appearances=new Set();
 for(let f=0;f<900;f++) {
  for(const g of [game,baseline]){
   g.i.coin1=f>=45&&f<51?1:0;g.i.start1=f>=70&&f<76?1:0;
   g.i.lu=f>250?1:0;g.i.rd=f>250?1:0;g.i.fire=f>400?1:0;g.frame();
  }
  assert.equal(game.cpu.pc,baseline.cpu.pc);assert.equal(game.cpu.cycles,baseline.cpu.cycles);
  assert.deepEqual(game.mem,baseline.mem);
  assert.equal(JSON.stringify(game.vectors.map(v=>v.slice(0,6))),JSON.stringify(baseline.vectors.map(v=>v.slice(0,6))));
  const groups=new Map();
  for(const v of game.vectors)if(v[8].asset==='tank'&&TANK_FACES[v[8].type]) {
   const id=v[8].id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(v);
  }
  for(const vectors of groups.values()) {
   const type=vectors[0][8].type,polygons=tankPolygons(vectors,type);
   assert.ok(polygons.length>0&&polygons.length<=TANK_FACES[type].length);
   const vertices=new Set(vectors.flatMap(v=>v[8].tankEdge??[]));
   for(const face of TANK_FACES[type])for(const i of face.indices)assert.ok(vertices.has(i));
   if(type===2){bodies++;appearances.add(JSON.stringify(polygons[0].points));}else dishes++;
  }
 }
 assert.ok(bodies>100);assert.ok(dishes>100);assert.ok(appearances.size>10);
 console.log({bodies,dishes,distinctProjections:appearances.size});
});
