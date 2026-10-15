import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileObjectStyles,patchObjectStyle} from './object-style.js';
import {vectorStyle} from './vector-renderer.js';

test('object appearance resolves on existing vectors and preserves raw intensity',()=>{
 const objects={obstacle:{source:{cpu:['0x5c5c']},color:'magenta',brightness:1.2,lineGlow:1,fillSupported:true,fillOpacity:'25%'}};
 const settings=compileObjectStyles(objects);
 const v=[0,0,10,10,8,[],null,0,{asset:'obstacle',id:1}];
 const before=JSON.stringify(v);
 let style=vectorStyle(v,settings,true);
 assert.equal(style.fillOpacity,.25);assert.equal(style.brightness,1.2);assert.equal(style.glow,1);
 const next=patchObjectStyle(objects,'obstacle',{brightness:0,lineGlow:0});
 style=vectorStyle(v,compileObjectStyles(next),true);
 assert.equal(style.alpha,0);assert.equal(style.glow,0);
 assert.equal(objects.obstacle.brightness,1.2);assert.equal(JSON.stringify(v),before);
 const original=vectorStyle(v,settings,false);
 assert.equal(original.brightness,1);assert.equal(original.fillOpacity,0);assert.equal(original.displayIntensity,8);
});
test('rules reject unsupported fill, malformed values, typos and changed provenance',()=>{
 for(const rule of [{fillSupported:true},{fillOpacity:.25},{brightness:NaN},{lineGlow:-1},{colour:'red'}])
  assert.throws(()=>compileObjectStyles({tank:rule}));
 assert.throws(()=>compileObjectStyles({obstacle:{fillOpacity:'125%'}}));
 assert.throws(()=>compileObjectStyles({unknown:{}}));
 assert.throws(()=>patchObjectStyle({tank:{}},'tank',{source:{cpu:['0x0000']}}));
 assert.equal(compileObjectStyles({obstacle:{fillSupported:false,fillOpacity:.25}}).obstacle.fillOpacity,0);
});
import {Battlezone} from './runtime.js';
test('live edits and exports remain in sync without advancing emulation',()=>{
 const game=Object.create(Battlezone.prototype);let draws=0;game.draw=()=>draws++;
 game.setObjectStyles({obstacle:{color:'orange',fillSupported:true,fillOpacity:.32}});
 game.setObjectStyle('obstacle',{color:'magenta',lineGlow:1,fillOpacity:'25%'});
 assert.equal(game.assetSettings.obstacle.fillOpacity,.25);assert.equal(draws,2);
 assert.equal(JSON.parse(game.exportObjectStyles()).obstacle.color,'magenta');
 game.setAssetStyle('obstacle',{glow:0});
 assert.equal(JSON.parse(game.exportObjectStyles()).obstacle.lineGlow,0);
 const saved=game.exportObjectStyles();
 assert.throws(()=>game.setObjectStyle('obstacle',{brightness:-1}));
 assert.equal(game.exportObjectStyles(),saved);
});
