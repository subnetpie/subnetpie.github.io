import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dom=new JSDOM(readFileSync('index.html','utf8'),{url:'https://subnetpie.github.io/dmd-viewer/'});
Object.assign(globalThis,{document:dom.window.document,Option:dom.window.Option,location:dom.window.location,requestAnimationFrame:()=>{},crossOriginIsolated:true,addEventListener:()=>{}});
dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},arc(){},fill(){}});
let requests=[];
globalThis.fetch=async url=>{if(String(url).endsWith('/recipe-events.json'))return new Response(readFileSync('dist/recipe-events.json'));if(String(url).includes('/library/learned/'))throw Error('Recorded media must not be fetched');const name=String(url).split('/').pop();requests.push(name);return new Response(readFileSync('dist/library/'+name))};
class Worker{constructor(){Worker.last=this}postMessage(data){this.data=data}terminate(){}}
globalThis.Worker=Worker;
const app=await import('./dist/app.mjs');await app.includedStartup;
const $=id=>document.getElementById(id);
class Audio{state='running';async resume(){Audio.unlocked=true}}
globalThis.AudioContext=Audio;
assert.equal($('romPanel').hidden,false);
assert.equal(document.body.classList.contains('simple-player'),true);
$('includedGame').value='popeye';await $('includedGame').onchange();
assert.deepEqual(requests.sort(),['pop_lx5.zip','popeye.pac']);assert.equal($('romGame').value,'pop_lx5');
assert.equal(Worker.last.data.game,'pop_lx5');assert.equal(Worker.last.data.files[0].bytes.byteLength,3391042);assert.equal(Audio.unlocked,true);
Worker.last.onmessage({data:{type:'started',info:'Popeye LX5'}});
assert.equal($('romEvents'),null);assert.equal($('romPlayfield').hidden,false);assert.equal(document.querySelectorAll('[data-playfield-switch]').length,68);assert.equal($('romMatrix').hidden,true);assert.equal(document.querySelectorAll('[data-popeye-switch]').length,80);
Worker.last.onmessage({data:{type:'machine',trough:6,shooter:false,playfield:0,event:'Ready',busy:false,starting:false}});
assert.equal($('romCoinStart').disabled,false);await $('romCoinStart').onclick();assert.equal(Worker.last.data.id,'begin-game');
assert.equal(document.querySelector('[data-input-view=shots]'),null);
const bumper=document.querySelector('[data-playfield-switch="16"]');assert.equal(bumper.disabled,false);
Worker.last.onmessage({data:{type:'machine',trough:5,shooter:false,playfield:1,event:'Launched',busy:false,starting:false}});
bumper.onclick();assert.deepEqual(Worker.last.data,{type:'matrix',number:16,hold:false});

document.querySelector('[data-input-view=matrix]').click();assert.equal($('romMatrix').hidden,false);assert.equal($('romEvents'),null);
const ramp=document.querySelector('[data-popeye-switch="34"]');ramp.onclick();assert.deepEqual(Worker.last.data,{type:'matrix',number:34,hold:false});$('romMatrixMode').value='hold';ramp.onclick();assert.equal(Worker.last.data.hold,true);
Worker.last.onmessage({data:{type:'machine',trough:5,shooter:false,playfield:1,event:'Ramp',busy:false,starting:false,active:[24,34],held:[34]}});assert.equal(ramp.getAttribute('aria-pressed'),'true');Worker.last.onmessage({data:{type:'machine',trough:5,shooter:false,playfield:1,event:'Lamp check',active:[34],held:[34],lamps:[11,76,71]}});assert(document.querySelector('[data-lamp="11"]').classList.contains('lamp-on'));assert(document.querySelector('[data-lamp="71"]').classList.contains('lamp-on'));assert(!document.querySelector('[data-lamp="12"]').classList.contains('lamp-on'));assert(document.querySelector('.playfield-diagram img').src.includes('/dist/playfield/popeye-main.webp'));const touch=document.querySelector('[data-playfield-switch="34"]');assert.equal(touch.disabled,false);touch.onclick();assert.equal(Worker.last.data.number,34);$('romPlayfieldZoom').value=200;$('romPlayfieldZoom').oninput();assert.equal($('romPlayfieldZoomValue').textContent,'200%');assert.equal($('romMatrixRelease').disabled,false);$('romMatrixRelease').onclick();assert.equal(Worker.last.data.release,true);

document.querySelector('[data-input-view=table]').click();assert.equal($('romPlayfield').hidden,false);assert.equal($('romMatrix').hidden,true);
assert.equal(document.querySelectorAll('.playfield-flipper-input').length,4);
for(const n of [112,114,116,118]){
 const f=document.querySelector('[data-playfield-switch="'+n+'"]');
 f.dispatchEvent(new dom.window.Event('pointerdown'));assert.deepEqual(Worker.last.data,{type:'matrix',number:n,pressed:true});
 f.dispatchEvent(new dom.window.Event('pointercancel'));assert.deepEqual(Worker.last.data,{type:'matrix',number:n,pressed:false});
 f.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space'}));assert.equal(Worker.last.data.pressed,true);
 f.dispatchEvent(new dom.window.Event('blur'));assert.equal(Worker.last.data.pressed,false);
}
assert.equal(document.querySelector('[data-playfield-switch="111"]').disabled,true);
document.querySelector('[data-input-view=service]').click();assert.equal($('romManualInputs').hidden,false);assert.equal($('romPlayfield').hidden,true);assert.equal(Worker.last.data.release,true);
document.querySelector('[data-input-view=table]').click();
$('includedSound').checked=false;await $('includedSound').oninput();assert.equal($('romSound').checked,false);
await $('romPause').onclick();assert.equal($('romState').textContent,'PAUSED');assert.equal(bumper.disabled,true);
$('romSound').checked=true;await $('romSound').oninput();assert.equal($('includedSound').checked,true);
// Switching the dropdown stops the old worker and starts the new matched pair.
requests=[];const oldWorker=Worker.last;$('includedGame').value='terminator-2';await $('includedGame').onchange();
assert.deepEqual(requests.sort(),['t2_l8-complete.zip','terminator-2.pac']);assert.notEqual(Worker.last,oldWorker);
assert.equal(Worker.last.data.game,'t2_l8');assert.equal(Worker.last.data.files[0].name,'t2_l8.zip');assert.equal($('romEvents'),null);assert.equal($('romPlayfield').hidden,false);assert.equal($('romMatrix').hidden,true);assert.equal($('romPlayfieldTitle').textContent,'Terminator 2 playfield');assert.equal($('romMatrixTitle').textContent,'Terminator 2 switch matrix');assert.equal(document.querySelectorAll('[data-popeye-switch]').length,72);assert.equal(document.querySelector('[data-popeye-switch="81"]').disabled,true);
assert.equal(document.querySelectorAll('[data-playfield-switch]').length,60);assert.equal(document.querySelectorAll('.playfield-diagram [data-playfield-switch]').length,45);assert(document.querySelector('.playfield-diagram img').src.includes('/dist/playfield/t2-main.webp'));
Worker.last.onmessage({data:{type:'started',info:'Terminator 2'}});
Worker.last.onmessage({data:{type:'machine',active:[24,61],held:[61],trough:2,shooter:false,playfield:1,event:'Left ramp',lamps:[11,22,51,52,84]}});
for(const n of [11,22,51,52,84])assert([...document.querySelectorAll('[data-lamp="'+n+'"]')].every(l=>l.classList.contains('lamp-on')));
assert.equal(document.querySelectorAll('[data-lamp="22"]').length,2);assert.equal(document.querySelectorAll('[data-lamp="51"]').length,2);assert.match($('romPlayfieldStatus').textContent,/5 \/ 63 lamps on/);
const t2Ramp=document.querySelector('[data-playfield-switch="61"]');assert.equal(t2Ramp.getAttribute('aria-pressed'),'true');$('romPlayfieldMode').value='pulse';$('romPlayfieldMode').onchange();t2Ramp.onclick();assert.deepEqual(Worker.last.data,{type:'matrix',number:61,hold:false});
for(const n of [15,16,17,18,24,78])assert(document.querySelector('[data-playfield-switch="'+n+'"]').disabled);
for(const n of [11,12]){const f=document.querySelector('[data-playfield-switch="'+n+'"]');f.dispatchEvent(new dom.window.Event('pointerdown'));assert.deepEqual(Worker.last.data,{type:'matrix',number:n,pressed:true});f.dispatchEvent(new dom.window.Event('pointercancel'));assert.deepEqual(Worker.last.data,{type:'matrix',number:n,pressed:false});}
document.querySelector('[data-input-view=matrix]').click();assert.equal($('romMatrix').hidden,false);document.querySelector('[data-input-view=table]').click();assert.equal($('romPlayfield').hidden,false);
assert.equal($('includedStatus').hidden,true);assert.equal(document.getElementById('loadIncludedGame'),null);
// Play can restart without downloading the selected assets again, muted and without Audio.
requests=[];globalThis.AudioContext=undefined;$('includedSound').checked=false;await $('includedSound').oninput();await $('includedGame').onchange();assert.deepEqual(requests,[]);assert.equal(Worker.last.data.game,'t2_l8');
$('advancedTools').onclick();assert.equal(document.body.classList.contains('simple-player'),false);$('advancedTools').onclick();assert.equal(document.body.classList.contains('simple-player'),true);
requests=[];$('includedGame').value='popeye';globalThis.fetch=async()=>new Response('',{status:503});await $('includedGame').onchange();assert.match($('includedStatus').textContent,/503/);assert.equal($('includedGame').disabled,false);
console.log('Published player passed: one-dropdown game startup, matched ROM/color/sound bundles, switching games, synchronized sound, muted restart, advanced tools, and failed-download recovery.');
