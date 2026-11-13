import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dom=new JSDOM(readFileSync('index.html','utf8'),{url:'https://subnetpie.github.io/dmd-viewer/'});
Object.assign(globalThis,{document:dom.window.document,Option:dom.window.Option,location:dom.window.location,requestAnimationFrame:()=>{},crossOriginIsolated:true,addEventListener:()=>{}});
dom.window.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},arc(){},fill(){}});
let requests=[];
globalThis.fetch=async url=>{const name=String(url).split('/').pop();requests.push(name);return new Response(readFileSync('dist/library/'+name))};
class Worker{constructor(){Worker.last=this}postMessage(data){this.data=data}terminate(){}}
globalThis.Worker=Worker;
await import('./dist/app.mjs');
const $=id=>document.getElementById(id);
class Audio{state='running';async resume(){Audio.unlocked=true}}
globalThis.AudioContext=Audio;
assert.equal($('romPanel').hidden,false);
assert.equal(document.body.classList.contains('simple-player'),true);
$('includedGame').value='popeye';await $('includedGame').onchange();
assert.deepEqual(requests.sort(),['pop_lx5.zip','popeye.pac']);assert.equal($('romGame').value,'pop_lx5');
assert.equal(Worker.last.data.game,'pop_lx5');assert.equal(Worker.last.data.files[0].bytes.byteLength,3391042);assert.equal(Audio.unlocked,true);
Worker.last.onmessage({data:{type:'started',info:'Popeye LX5'}});
$('includedSound').checked=false;await $('includedSound').oninput();assert.equal($('romSound').checked,false);
await $('romPause').onclick();assert.equal($('romState').textContent,'PAUSED');
$('romSound').checked=true;await $('romSound').oninput();assert.equal($('includedSound').checked,true);
// Switching the dropdown stops the old worker and starts the new matched pair.
requests=[];const oldWorker=Worker.last;$('includedGame').value='terminator-2';await $('includedGame').onchange();
assert.deepEqual(requests.sort(),['t2_l8-complete.zip','terminator-2.pac']);assert.notEqual(Worker.last,oldWorker);
assert.equal(Worker.last.data.game,'t2_l8');assert.equal(Worker.last.data.files[0].name,'t2_l8.zip');
assert.match($('includedStatus').textContent,/Terminator 2.*live color DMD and sound/);
// Play can restart without downloading the selected assets again, muted and without Audio.
requests=[];globalThis.AudioContext=undefined;$('includedSound').checked=false;await $('includedSound').oninput();await $('loadIncludedGame').onclick();assert.deepEqual(requests,[]);assert.equal(Worker.last.data.game,'t2_l8');
$('advancedTools').onclick();assert.equal(document.body.classList.contains('simple-player'),false);$('advancedTools').onclick();assert.equal(document.body.classList.contains('simple-player'),true);
requests=[];$('includedGame').value='popeye';globalThis.fetch=async()=>new Response('',{status:503});await $('includedGame').onchange();assert.match($('includedStatus').textContent,/503/);assert.equal($('loadIncludedGame').disabled,false);assert.equal($('includedGame').disabled,false);
console.log('Published player passed: one-dropdown game startup, matched ROM/color/sound bundles, switching games, synchronized sound, muted restart, advanced tools, and failed-download recovery.');
