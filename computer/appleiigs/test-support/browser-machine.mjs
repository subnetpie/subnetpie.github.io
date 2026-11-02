import {createMachine} from './headless.mjs';
import {readFile} from 'node:fs/promises';
const networkFetch=globalThis.fetch;
globalThis.fetch=async(url,...args)=>{
  if(String(url).startsWith('file:')) {
    const bytes=await readFile(new URL(url));
    return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  }
  return networkFetch(url,...args);
};
const sample=createMachine();
const rom=sample.board.memory.rom;
const settings=new Map();
globalThis.window=new EventTarget();
globalThis.location={search:'?machine=iie'}; // Skip DOM-only configuration UI.
globalThis.localStorage={getItem:k=>settings.get(k)??null,setItem:(k,v)=>settings.set(k,String(v)),removeItem:k=>settings.delete(k)};
globalThis.MutationObserver=class{observe(){}};
function prepareDocument(){
  document.readyState='loading';document.addEventListener=()=>{};
  document.getElementById=()=>null;document.querySelectorAll=()=>[];document.documentElement={};
}
prepareDocument();
await import('../iigs_configuration.js?v=20261102-35boot1');
await import('../iigs_slot4_devices.js?v=20261102-35boot1');
await import('../iigs_slot_bus.js?v=20261102-35boot1');
await import('../iigs_extra_drives.js?v=20261102-35boot1');
await import('../iigs_persistent_boot.js?v=20261102-35boot1');
await import('../iigs_storage_registry.js?v=20261102-35boot1');
const {Motherboard}=await import('../motherboard.js?v=20261102-35boot1');

export function createBrowserMachine(){
  settings.clear();
  const {joystick}=createMachine();prepareDocument();
  const canvas=document.createElement('canvas');
  const board=new Motherboard(2800,canvas,joystick,()=>{},'iigs');
  board.loadIIgsROM(rom);board.reset(true);
  board.video_iigs.context.putImageData=()=>{};board.video_iigs.context.fillRect=()=>{};
  window.__appleIIgsBoard=board;
  return {board,joystick,storage:window.__appleIIgsStorage};
}
