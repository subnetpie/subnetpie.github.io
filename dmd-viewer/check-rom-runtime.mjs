import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import createRuntime from './dist/emulator/dmd-runtime.mjs';
const core=await createRuntime({wasmBinary:gunzipSync(await readFile(new URL('./dist/emulator/dmd-runtime.wasm.gz',import.meta.url))),print:()=>{},printErr:()=>{}});
try{
  for(const path of ['','roms','nvram','cfg','inp','sta','memcard'])core.FS.mkdirTree('/pinmame/'+path);
  core._viewer_init();
  assert(core.HEAPU8 instanceof Uint8Array);
  for(const game of ['t2_l8','pop_lx5']){
    assert.equal(core.ccall('viewer_game','number',['string'],[game]),0);
    assert.match(core.ccall('viewer_game_info','string'),game==='t2_l8'?/Terminator/i:/Popeye/i);
    assert.match(core.ccall('viewer_audit','string',['string'],[game]),/ROM audit state/);
  }
  assert.notEqual(core.ccall('viewer_game','number',['string'],['not_a_game']),0);
  assert.notEqual(core.ccall('viewer_run','number',['string'],['not_a_game']),0);
  assert.equal(core._viewer_running(),0);
  const frame=core._malloc(65536),meta=core._malloc(16),audio=core._malloc(65536*4);
  assert.equal(core._viewer_frame(frame,meta),0);assert.equal(core._viewer_audio(audio,65536,meta),0);
  core._free(frame);core._free(meta);core._free(audio);
  assert.equal(core.ccall('viewer_run','number',['string'],['t2_l8']),0);
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.match(core.ccall('viewer_logs','string'),/required files are missing/);core._viewer_stop();
  assert.equal(core._viewer_running(),0);
  console.log('WASM runtime: module loading, T2/Popeye drivers, ROM audits, invalid-game handling, bridge buffers, and native emulation-thread startup/stop passed.');
}finally{core.PThread?.terminateAllThreads?.();}
