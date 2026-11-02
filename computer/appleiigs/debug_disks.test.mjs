import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMachine} from './test-support/headless.mjs';
import {createDebugAPI} from './debug_api.js';
import {createDiskWorkspaces} from './debug_disks.js';
import {decodeMedia,mountMedia} from './media.js';
test('DSK snapshot patch/export/undo preserves the running disk and checks bytes and revisions',()=>{
 const {board}=createMachine('iie'),d=createDiskWorkspaces(board),source=new Uint8Array(143360);source[512]=7;
 mountMedia(board,decodeMedia('game.dsk',source));const medium=board.floppy525._disks[0].medium;
 const w=d.execute('open_disk_workspace',{device:'disk2:d1'}),args={workspace:w.workspace,revision:0,offset:512,expected:[7],bytes:[8]};
 assert.throws(()=>d.execute('patch_disk',{...args,expected:[3]}),/do not match/);
 assert.equal(d.execute('patch_disk',args).revision,1);assert.equal(source[512],7);assert.equal(board.floppy525._disks[0].medium,medium);
 assert.throws(()=>d.execute('patch_disk',args),/revision/);
 const file=d.snapshot(w.workspace);assert.equal(file.name,'game-modified.dsk');assert.equal(file.data[512],8);assert.equal(decodeMedia(file.name,file.data).kind,'floppy');
 d.execute('undo_disk_patch',{workspace:w.workspace,revision:1});assert.equal(d.snapshot(w.workspace).data[512],7);
 board.floppy525._disks[0].medium=null;assert.throws(()=>d.execute('open_disk_workspace',{device:'disk2:d1'}),/Reinsert/);
});
test('2MG export contains modified snapshot bytes, not original or stale source bytes',()=>{
 const {board}=createMachine();const d=createDiskWorkspaces(board);board.prodosBlock.load_image('game.2mg',new Uint8Array(1024));board.prodosBlock.image[11]=4;
 const w=d.execute('open_disk_workspace',{device:'smartport:d1'});
 d.execute('patch_disk',{workspace:w.workspace,revision:0,offset:11,expected:[4],bytes:[9]});
 const exported=d.snapshot(w.workspace),decoded=decodeMedia(exported.name,exported.data);
 assert.equal(exported.name,'game-modified.2mg');assert.equal(decoded.data[11],9);assert.equal(board.prodosBlock.image[11],4);
 d.execute('open_disk_workspace',{device:'smartport:d1'});assert.throws(()=>d.execute('open_disk_workspace',{device:'smartport:d1'}),/limit 2/);
 d.execute('close_disk_workspace',{workspace:w.workspace});assert.throws(()=>d.snapshot(w.workspace),/Unknown/);
});
test('editing permission is independent of execution permission',async()=>{
 const {board}=createMachine();let editing=false;
 const api=createDebugAPI({board,screen:{},pause(){},resume(){},isRunning:()=>true,render(){},canControl:()=>true,canEdit:()=>editing});
 board.prodosBlock.load_image('x.hdv',new Uint8Array(512));const w=await api.execute('open_disk_workspace',{device:'smartport:d1'});
 const args={workspace:w.workspace,revision:0,offset:0,expected:[0],bytes:[1]};
 await assert.rejects(api.execute('patch_disk',args),/Enable disk editing/);editing=true;assert.equal((await api.execute('patch_disk',args)).revision,1);
});
