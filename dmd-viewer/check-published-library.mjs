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
$('includedGame').value='popeye';$('includedPlayback').value='rom';await $('loadIncludedGame').onclick();
assert.deepEqual(requests.sort(),['pop_lx5.zip','popeye.pac']);assert.equal($('romPanel').hidden,false);assert.equal($('romGame').value,'pop_lx5');assert.equal($('romStart').disabled,false);
$('includedSound').checked=false;await $('includedSound').oninput();assert.equal($('romSound').checked,false);
// A muted ROM starts without requiring Web Audio at all.
await $('romStart').onclick();assert.equal(Worker.last.data.game,'pop_lx5');assert.equal(Worker.last.data.files[0].bytes.byteLength,3391042);
Worker.last.onmessage({data:{type:'started',info:'Popeye LX5'}});await $('romPause').onclick();assert.equal($('romState').textContent,'PAUSED');
class Audio{state='running';async resume(){Audio.unlocked=true}}
globalThis.AudioContext=Audio;
$('romSound').checked=true;await $('romSound').oninput();assert.equal($('includedSound').checked,true);assert.equal(Audio.unlocked,true);
$('romStop').onclick();
requests=[];$('includedGame').value='terminator-2';await $('loadIncludedGame').onclick();assert.deepEqual(requests.sort(),['t2_l8-complete.zip','terminator-2.pac']);assert.match($('includedStatus').textContent,/all three L3 sound ROMs/);assert.equal($('includedStatus').hidden,false);assert.equal($('romGame').value,'t2_l8');await $('romStart').onclick();assert.equal(Worker.last.data.game,'t2_l8');assert.equal(Worker.last.data.files[0].name,'t2_l8.zip');$('romStop').onclick();assert.equal($('includedPlayback').disabled,false);
requests=[];$('includedGame').value='popeye';globalThis.fetch=async()=>new Response('',{status:503});await $('loadIncludedGame').onclick();assert.match($('includedStatus').textContent,/503/);assert.equal($('romGame').value,'t2_l8');assert.equal($('loadIncludedGame').disabled,false);
console.log('Published library passed: bundled Popeye and Terminator 2 ROM + sound downloads and worker handoffs, synchronized sound controls, muted startup/resume without Web Audio, live audio unlock, and download-failure recovery.');
