import assert from 'node:assert/strict';
import {test} from 'node:test';
// Load the browser module before the headless harness registers its URL loader.
// A fork that still depends on the live appleii modules must fail this check.
const {Motherboard}=await import('./motherboard.js?v=20261102-disk-lifecycle1');
const {createMachine}=await import('./test-support/headless.mjs');

test('fork configuration patches the controller used by the browser motherboard', async () => {
  const {joystick}=createMachine();
  const storage=new Map();
  globalThis.localStorage={
    getItem:key=>storage.get(key)??null,
    setItem:(key,value)=>storage.set(key,String(value)),
    removeItem:key=>storage.delete(key)
  };
  globalThis.location={search:''};
  document.readyState='loading';
  document.addEventListener=()=>{};
  await import('./iigs_configuration.js?v=20261102-disk-lifecycle1');
  const board=new Motherboard(2800,document.createElement('canvas'),joystick,()=>{},'iigs');
  assert.equal(typeof board.prodosBlock.setSlot,'function');
  assert.doesNotThrow(()=>board.reset());
  assert.equal(board.prodosBlock.slot,7);
  storage.set('subnetpie.apple2.iigs.configuration.v1',JSON.stringify({
    version:3,slots:{4:'mouse',5:'iigs35',6:'disk2',7:'smartport'},driveTargets:['auto','auto']
  }));
  assert.doesNotThrow(()=>board.reset());
  assert.equal(board.prodosBlock.ioBase,0xc0f0);
});
