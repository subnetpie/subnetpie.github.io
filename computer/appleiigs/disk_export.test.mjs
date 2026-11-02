import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMachine} from './test-support/headless.mjs';
import {decodeMedia,mountMedia} from './media.js';
import {exportHardDrive} from './disk_export.js';
for(const ext of ['hdv','2mg'])test(`${ext} guest writes export and reload on either hard drive`,()=>{
 const {board}=createMachine();
 for(let drive=0;drive<2;drive++) {
  board.prodosBlock.load_image('disk.'+ext,new Uint8Array(2048),{},drive);
  const b=board.memory;
  [2,0x70|(drive<<7),0,8,1,0].forEach((v,i)=>b.write(0x42+i,v));
  for(let i=0;i<512;i++)b.write(0x800+i,(i+drive)&255);
  assert.equal(board.prodosBlock.execute(),0);
  const disk=board.prodosBlock.drives[drive];
  assert.equal(disk.dirty,true);
  const saved=exportHardDrive(board,drive);
  assert.equal(saved.name,'disk-saved.'+ext);
  const decoded=decodeMedia(saved.name,saved.data);
  assert.deepEqual(decoded.data,disk.image);
  disk.writeProtected=true;b.write(0x800,99);
  assert.equal(board.prodosBlock.execute(),0x2b);
  assert.equal(disk.image[512],drive);
  mountMedia(board,decoded,drive);
  assert.equal(board.prodosBlock.drives[drive].image[513],drive+1);
 }
});
