import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createBrowserMachine} from './test-support/browser-machine.mjs';
import {createKeyboardInput,resetWithKeyboard} from './keyboard_input.js?v=20261102-keyboard-reset1';
const {mountRecord}=await import('./iigs_persistent_boot.js?v=20261102-35boot1');

const file=(name,data)=>({name,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
function floppy(marker){
  const data=new Uint8Array(819200);
  data.set([1,0xa9,marker,0x8d,0,3,0x4c,6,8]);return data;
}
function runUntil(board,ready,limit=30){for(let i=0;i<limit&&!ready();i++)board.clock(500000);assert.ok(ready());}

test('hard-drive eject followed by 3.5-inch Drive 1 mount cold-boots the floppy',async()=>{
  const {board,storage,joystick}=createBrowserMachine();
  await storage.mountFile('smartport:d1',file('old.hdv',new Uint8Array(1024)));
  await storage.eject('smartport:d1');
  const data=floppy(0x5a);
  await storage.mountFile('iigs35:d1',file('boot.po',data));
  storage.setBoot('s5d1');
  const input=createKeyboardInput(board.keyboard,board.memory.adb,joystick);
  input.toggle('control');input.toggle('command');
  resetWithKeyboard(board,input);
  runUntil(board,()=>board.memory.read(0x300)===0x5a);
  assert.equal(storage.state('smartport:d1').mounted,false);
  assert.equal(storage.state('iigs35:d1').mounted,true);
  assert.equal(board.floppy35Block.drives[0].image,board.memory.floppy35Drives[0].media.data);
  assert.equal(board.floppy35Block.bootPending,false,'temporary boot forwarding retires after boot');
  assert.equal(board.memory.read(0xc700),0,'empty hard-disk card stays empty after boot');
});

test('disk-panel Boot cold-resets and boots the selected 3.5-inch Drive 2',async()=>{
  const {board,storage,joystick}=createBrowserMachine();
  await storage.mountFile('iigs35:d1',file('first.po',floppy(0x11)));
  await storage.mountFile('iigs35:d2',file('second.po',floppy(0x22)));
  const input=createKeyboardInput(board.keyboard,board.memory.adb,joystick);
  board.memory.ram[0x20000]=0xa5;
  const source=readFileSync(new URL('./unified_drive_manager.js',import.meta.url),'utf8');
  const start=source.indexOf("        const ep=svc.endpoint(id),target=");
  const end=source.indexOf("      if(button.hasAttribute('data-storage-more'))",start);
  const handler=source.slice(start,end).replace(/\n      \}\s*$/,'');
  await vm.runInNewContext(`(async()=>{${handler}})()`,{
    svc:storage,id:'iigs35:d2',queueMicrotask:fn=>fn(),
    MouseEvent:class{constructor(type,props){Object.assign(this,props);}},
    document:{getElementById:()=>({dispatchEvent:e=>resetWithKeyboard(board,input,e)})}
  });
  assert.equal(board.memory.ram[0x20000],0,'Boot is a cold reset');
  runUntil(board,()=>board.memory.read(0x300)===0x22);
  assert.equal(board.memory.read(0x43),0xd0,'boot unit identifies Slot 5 Drive 2');
});

test('Slot-5 block reads and writes share physical media without changing hard disks',async()=>{
  const {board,storage}=createBrowserMachine();
  await storage.mountFile('smartport:d1',file('hard.hdv',new Uint8Array(1024).fill(0x77)));
  await storage.mountFile('iigs35:d1',file('data.po',floppy(0)));
  const hard=board.prodosBlock.drives[0].image,media=board.memory.floppy35Drives[0].media;
  media.data[512]=0x66;
  const command=(cmd)=>{[cmd,0x50,0,8,1,0].forEach((v,i)=>board.memory.write(0x42+i,v));return board.memory.read(0xc0d0);};
  assert.equal(command(1),0);assert.equal(board.memory.read(0x800),0x66);
  board.memory.write(0x800,0x55);assert.equal(command(2),0);
  assert.equal(media.data[512],0x55);assert.equal(media.dirty,true);
  storage.setWriteProtected('iigs35:d1',true);assert.equal(command(2),0x2b);
  await storage.eject('iigs35:d1');assert.equal(command(1),0x2f);
  assert.equal(board.prodosBlock.drives[0].image,hard);assert.equal(hard[0],0x77);
});

test('restoring a saved 3.5-inch disk preserves a hard disk at the same unit index',async()=>{
  const {board,storage}=createBrowserMachine();
  await storage.mountFile('smartport:d1',file('hard.hdv',new Uint8Array(1024).fill(0x77)));
  const hard=board.prodosBlock.drives[0].image;
  await mountRecord(board,{id:'s5d1',name:'floppy.po',data:floppy(0x5a).buffer});
  assert.equal(board.prodosBlock.drives[0].image,hard);
  assert.equal(board.floppy35Block.drives[0].image,board.memory.floppy35Drives[0].media.data);
});

test('Tass Times reaches a rendered Super Hi-Res title after the hard drive is ejected',{
  skip:!process.env.TASS_TIMES_ZIP
},async()=>{
  const {board,storage}=createBrowserMachine();
  await storage.mountFile('smartport:d1',file('old.hdv',new Uint8Array(1024)));
  await storage.eject('smartport:d1');
  await storage.mountFile('iigs35:d1',file('Tass.zip',readFileSync(process.env.TASS_TIMES_ZIP)));
  storage.setBoot('s5d1');board.reset(true);storage.setBoot('s5d1');
  let reads=0;board.floppy35Block.setTrace(()=>reads++);
  runUntil(board,()=>{
    if(!board.video_iigs.isSuperHires()||reads<=100)return false;
    board.video_iigs.refresh(true);
    const colours=new Set(),pixels=board.video_iigs.image.data;
    for(let i=0;i<pixels.length&&colours.size<8;i+=4)colours.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return colours.size>=8;
  },120);
  board.video_iigs.refresh(true);
  const colours=new Set(),pixels=board.video_iigs.image.data;
  for(let i=0;i<pixels.length;i+=4)colours.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
  assert.ok(colours.size>=8,'the actual renderer produces the loaded title artwork');
  assert.equal(storage.state('smartport:d1').mounted,false);
});
