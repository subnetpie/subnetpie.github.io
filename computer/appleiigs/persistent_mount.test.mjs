import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBrowserMachine} from './test-support/browser-machine.mjs';
const {saveIIgsConfiguration}=await import('./iigs_configuration.js?v=20261102-35boot1');
const {mountRecord}=await import('./iigs_persistent_boot.js?v=20261108-startup-mount1');

function record(id,name,size,marker=0) {
  const data=new Uint8Array(size);
  data.set([1,0xa9,marker,0x8d,0,3,0x4c,6,8]);
  return {id,name,data:data.buffer};
}

for(const [id,endpoint,name,size,legacyTarget] of [
  ['s7d1','smartport:d1','startup.hdv',1024,'35'],
  ['s7d2','smartport:d2','second.hdv',1024,'525'],
  ['s5d1','iigs35:d1','floppy.po',819200,'smartport'],
  ['s6d1','disk2:d1','floppy.dsk',143360,'35']
]) {
  test('saved physical endpoint overrides stale generic routing: '+id,async()=>{
    const {board,storage}=createBrowserMachine();
    saveIIgsConfiguration({...board.iigsConfiguration,driveTargets:[legacyTarget,legacyTarget]});
    board.reset(true);
    const media=await mountRecord(board,record(id,name,size,0x5a));
    assert.equal(storage.state(endpoint).mounted,true);
    assert.equal(storage.state(endpoint).media,media);
    assert.equal(storage.state(endpoint).name,name);
    board.reset(true);
    assert.equal(storage.state(endpoint).mounted,true,'reset retains restored media');
  });
}

for(const boot of ['auto','s7d1','s7d2']) {
  test('ROM03 boots a restored hard disk with saved routing: '+boot,async()=>{
    const {board,storage}=createBrowserMachine();
    saveIIgsConfiguration({...board.iigsConfiguration,driveTargets:['35','35']});
    board.reset(true);
    const id=boot==='s7d2'?'s7d2':'s7d1';
    await mountRecord(board,record(id,'startup.hdv',1024,0x5a));
    storage.setBoot(boot);board.reset(true);storage.setBoot(boot);
    for(let i=0;i<30&&board.memory.read(0x300)!==0x5a;i++)board.clock(500000);
    assert.equal(board.memory.read(0x300),0x5a,'restored disk executes through ROM03');
  });
}

test('rejected saved mounts do not create a mounted label',async()=>{
  const {board,storage}=createBrowserMachine();
  const load=board.prodosBlock.load_image;
  board.prodosBlock.load_image=()=>false;
  try {
    await assert.rejects(mountRecord(board,record('s7d1','startup.hdv',1024)),/Unable to restore/);
    assert.equal(storage.state('smartport:d1').mounted,false);
    assert.equal(board.mountedMedia?.[0],undefined);
    assert.equal(board.iigsPhysicalMedia?.['smartport:d1'],undefined);
  } finally {
    board.prodosBlock.load_image=load;
  }
});

test('unknown saved endpoint is rejected before changing the board',async()=>{
  const {board}=createBrowserMachine();
  await assert.rejects(mountRecord(board,record('s7d9','startup.hdv',1024)),/Unknown saved drive/);
});
