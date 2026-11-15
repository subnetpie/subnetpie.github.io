import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {deleteStoredRecordings} from './dist/recording-cleanup.mjs';
import {recipesForGame} from './dist/trigger-recipes.mjs';
function open(name){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{for(const store of ['frames','audio','clips'])r.result.createObjectStore(store);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const old=await open('dmd-learned-animations');const tx=old.transaction(['frames','audio','clips'],'readwrite');
for(const name of ['frames','audio','clips'])tx.objectStore(name).put(new Uint8Array(1000),1);
await new Promise(resolve=>tx.oncomplete=resolve);
const preferences=await open('unrelated-preferences');preferences.close();let blocked=false;
await deleteStoredRecordings(()=>{blocked=true;old.close();});assert(blocked,'Open legacy tabs must report blocked deletion');
const databases=await indexedDB.databases();assert(!databases.some(d=>d.name==='dmd-learned-animations'));assert(databases.some(d=>d.name==='unrelated-preferences'));
await deleteStoredRecordings();
for(const path of ['dist/library/learned','dist/library/popeye-sound-effects.zip','dist/built-in-animations.mjs','dist/rom-history.mjs','dist/saved-rom-history.mjs','dist/animation-export.mjs'])assert(!existsSync(path),path+' must not ship');
const player=readFileSync('dist/rom-viewer.mjs','utf8');assert(!/recordFrame|recordAudio|recordTriggers|romExportAll|romAnimation|SavedRomHistory/.test(player));
assert.equal(recipesForGame('pop_lx5').length,10);assert.equal(recipesForGame('t2_l8').length,8);
console.log('Recording removal passed: stored frames/audio/clips deleted, open legacy tabs handled, unrelated data preserved, recorder/replay/export removed, all 18 live recipes retained.');
