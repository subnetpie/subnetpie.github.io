import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS,PALETTE,assetStyle,updateAssetSettings} from './assets.js';
import {renderVectors,vectorStyle} from './vector-renderer.js';
const vector=(asset,x1=10,y1=10,x2=30,y2=10)=>[x1,y1,x2,y2,15,[], 'stale-color',0,{asset,id:1},0,0,0];
function context() {
 const calls=[];let path=[];
 return {calls,save(){},restore(){},beginPath(){path=[];},moveTo(...p){path.push(['move',...p]);},lineTo(...p){path.push(['line',...p]);},closePath(){},arc(...p){path.push(['arc',...p]);},
 fillRect(){},fill(){calls.push({kind:'fill',ink:this.fillStyle,alpha:this.globalAlpha,path:path.slice(),mode:this.globalCompositeOperation});},
 stroke(){calls.push({kind:'stroke',ink:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth,path:path.slice(),mode:this.globalCompositeOperation});}};
}
test('every asset uses the same settings on core strokes, halos, points and endpoints',()=>{
 for(const name of Object.keys(ASSETS)) {
  const settings={[name]:{color:'#123abc',brightness:.5,glow:.7,displayIntensity:15}};
  for(const v of [vector(name),vector(name,10,10,10,10)]) {
   const ctx=context();renderVectors(ctx,[v],{settings});
   assert.ok(ctx.calls.length>0,name);
   assert.ok(ctx.calls.every(c=>c.ink==='#123abc'),name);
   assert.ok(ctx.calls.every(c=>c.alpha>=0&&c.alpha<=.5),name);
   const zero=context();renderVectors(zero,[v],{settings:{[name]:{...settings[name],brightness:0}}});
   assert.equal(zero.calls.length,0,name+' zero brightness');
  }
 }
});
test('zero glow removes halo passes, while brightness above one still boosts unsaturated light',()=>{
 for(const name of ['highScore','enemyBlip','radarTicks','horizon','tank']) {
  const noGlow=context();renderVectors(noGlow,[vector(name)],{settings:{[name]:{glow:0}}});
  assert.equal(noGlow.calls.filter(c=>c.kind==='stroke').length,1);
  assert.equal(noGlow.calls.filter(c=>c.kind==='fill').length,2);
  const render=brightness=>{const c=context();renderVectors(c,[vector(name)],{settings:{[name]:{brightness,glow:.35,displayIntensity:15}}});return c.calls;};
  const one=render(1),two=render(2);
  assert.equal(two[0].alpha,one[0].alpha*2,name);
 }
});
test('obstacle fill follows the same color and brightness, including zero',()=>{
 const vectors=[vector('obstacle',0,0,20,0),vector('obstacle',20,0,10,20),vector('obstacle',10,20,0,0)];
 const c=context();renderVectors(c,vectors,{settings:{obstacle:{color:'blue',brightness:.5,glow:0,fillOpacity:.4}}});
 const fill=c.calls.find(x=>x.mode==='source-over');
 assert.equal(fill.ink,PALETTE.blue);assert.equal(fill.alpha,.2);
 const dark=context();renderVectors(dark,vectors,{settings:{obstacle:{brightness:0}}});assert.equal(dark.calls.length,0);
});
test('settings update cached vectors immediately and reject invalid patches atomically',()=>{
 const settings={},v=vector('highScore');
 updateAssetSettings(settings,'highScore',{color:'blue',brightness:.2,glow:0});
 assert.equal(vectorStyle(v,settings).ink,PALETTE.blue);
 updateAssetSettings(settings,'highScore',{color:'purple'});
 assert.equal(vectorStyle(v,settings).ink,PALETTE.purple);
 assert.equal(vectorStyle(v,settings).brightness,.2);
 const before=JSON.stringify(settings);
 assert.throws(()=>updateAssetSettings(settings,'highScore',{color:'red',glow:NaN}));
 assert.equal(JSON.stringify(settings),before);
 assert.throws(()=>updateAssetSettings(settings,'bogus',{color:'red'}));
 assert.throws(()=>updateAssetSettings(settings,'highScore',{cpuPC:1}));
 assert.equal(assetStyle('horizon',5,{horizon:{displayIntensity:null}}).displayIntensity,5);
 assert.equal(vectorStyle(vector('bogus')).ink,PALETTE.green);
});
test('original mode uses source intensity and table-defined original colors',()=>{
 const settings={radarTicks:{color:'blue',brightness:0,glow:4,displayIntensity:15}};
 const v=vector('radarTicks');v[4]=6;
 const s=vectorStyle(v,settings,false);
 assert.equal(s.ink,PALETTE.red);assert.equal(s.displayIntensity,6);assert.equal(s.brightness,1);assert.equal(s.fillOpacity,0);
 const c=context();renderVectors(c,[v],{settings,colorized:false});assert.ok(c.calls.length>0);
});

test('radar contact glow follows the ROM sweep envelope and respects live settings',()=>{
 const v=vector('enemyBlip');v[8].radarStrength=1;
 const full=vectorStyle(v);
 v[8].radarStrength=.25;
 const faded=vectorStyle(v);
 assert.equal(faded.alpha,full.alpha/4);assert.equal(faded.glow,full.glow/4);
 v[8].radarStrength=1;assert.deepEqual(vectorStyle(v),full);
 assert.equal(vectorStyle(v,{enemyBlip:{glow:0}}).glow,0);
 assert.equal(vectorStyle(v,{enemyBlip:{brightness:0}}).alpha,0);
});

test('sweep trails decay with emulated time without copying ticks or multiplying paused redraws',async()=>{
 const {RadarPersistence}=await import('./vector-renderer.js');
 const p=new RadarPersistence(),a=[vector('radarSweep'),vector('radarTicks')],b=[vector('radarSweep',10,10,20,30)];
 assert.equal(p.vectors(a,0).length,2);
 const second=p.vectors(b,.025);assert.equal(second.length,2);
 const initial=second[0][8].trailStrength;
 assert.ok(initial>0&&initial<1);
 assert.deepEqual(p.vectors(b,.025),second);
 const later=p.vectors(b,.1);assert.ok(later[0][8].trailStrength<initial);
 assert.equal(p.vectors(b,.3).length,1);
 assert.equal(p.vectors(a,.4,false),a);assert.equal(p.history.length,0);
 assert.equal(p.vectors([],1).length,0);
});
