import {decodeMedia,isZip,readZipEntries} from './media.js?v=20260930-gsos-drives';
import {mediaPersistenceKey,restorePersistentBlocks} from './disk_persistence.js?v=20260930-persist1';
import {ProDOSBlockDevice} from 'https://subnetpie.github.io/computer/appleii/prodos_block.js?v=20260930-persist1';

const DB='appleii-iigs-mounted-media';
const STORE='mounts';
const SETTINGS='subnetpie.apple2.iigs.persistentBoot.v1';
const records=new Map();
const candidates=new Map();
const targetIds=['s5d1','s5d2','s6d1','s6d2','s7d1','s7d2','s7d3','s7d4'];

function settings(){
  try {
    const v=JSON.parse(localStorage.getItem(SETTINGS)||'{}');
    return {boot:targetIds.includes(v.boot)?v.boot:'auto',keep:v.keep&&typeof v.keep==='object'?v.keep:{}};
  } catch(_) { return {boot:'auto',keep:{}}; }
}
function saveSettings(v){try{localStorage.setItem(SETTINGS,JSON.stringify(v));}catch(_){}}
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function put(record){
  if(!globalThis.indexedDB)return;
  const db=await openDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();records.set(record.id,record);
}
async function remove(id){
  if(!globalThis.indexedDB)return;
  const db=await openDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();records.delete(id);
}
async function all(){
  if(!globalThis.indexedDB)return [];
  const db=await openDB();
  const out=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
  db.close();out.forEach(r=>records.set(r.id,r));return out;
}

function targetFor(drive,media){
  if(drive>=2)return 's7d'+(drive+1);
  if(media.kind==='floppy')return 's6d'+(drive+1);
  if(media.kind==='block'&&media.physical==='35')return 's5d'+(drive+1);
  if(media.kind==='block')return 's7d'+(drive+1);
  return null;
}
async function decodeStored(record){
  let source=new Uint8Array(record.data), name=record.name;
  if(isZip(name,source)){
    const entries=readZipEntries(source);
    const entry=record.entryName?entries.find(x=>x.name===record.entryName):entries.length===1?entries[0]:null;
    if(!entry)throw new Error('Persistent ZIP needs the previously selected disk entry');
    source=entry.data;name=entry.name;
  }
  const media=decodeMedia(name,source);
  if(media.kind==='block'){
    media.persistenceKey=mediaPersistenceKey(name,media.data);
    media.restoredBlocks=await restorePersistentBlocks(media.persistenceKey,media.data);
  }
  return media;
}
function ensureSP(board){while(board.prodosBlock.drives.length<4)board.prodosBlock.drives.push({image:null,name:'',dirty:false,writeProtected:false,blockCount:0,changed:false,physical:null,persistenceKey:null});}
async function mountRecord(board,record){
  const media=await decodeStored(record);const d=Number(record.id.slice(3))-1;
  if(record.id.startsWith('s7')){
    if(media.kind!=='block'||media.physical==='35')throw new Error(record.id+' is not SmartPort media');
    ensureSP(board);board.prodosBlock.load_image(media.name,media.data,media,d);
  } else if(record.id.startsWith('s5')){
    if(media.kind!=='block'||media.physical!=='35')throw new Error(record.id+' is not 3.5-inch media');
    board.prodosBlock.load_image(media.name,media.data,media,d);board.memory.floppy35Drives[d].mount(media);
  } else if(record.id.startsWith('s6')){
    if(media.kind!=='floppy')throw new Error(record.id+' is not 5.25-inch media');
    board.floppy525.load_image(d,media.name,media.data,media);
  }
  board.mountedMedia??=[];
  if(record.id.startsWith('s7'))board.mountedMedia[d]=media;
  return media;
}

// Legacy ProDOS boot entry is only two-unit aware. When a SmartPort unit is
// selected as the startup disk, route legacy drive-1 boot calls to that unit;
// native SmartPort calls retain units 1-4 exactly as mounted.
const originalExecute=ProDOSBlockDevice.prototype.execute;
if(!ProDOSBlockDevice.prototype.__persistentBootExecute){
  ProDOSBlockDevice.prototype.__persistentBootExecute=true;
  ProDOSBlockDevice.prototype.execute=function(){
    const selected=this._bootSmartPortDrive;
    if(!(Number.isInteger(selected)&&selected>=0&&selected<this.drives.length))return originalExecute.call(this);
    const command=this.memory.read(0x42),unit=this.memory.read(0x43);
    const requested=unit>>>7;
    const drive=requested===0?selected:requested;
    this.statusDrive=drive;
    const disk=this.drives[drive];
    if(!disk?.image&&command!==0)return 0x2f;
    const buffer=this.memory.read(0x44)|(this.memory.read(0x45)<<8);
    const block=this.memory.read(0x46)|(this.memory.read(0x47)<<8);
    if((unit&0x70)!==((this.slot&7)<<4))return 0x28;
    if(command===0)return 0;
    if(command!==1&&command!==2)return 0x27;
    if(command===2&&disk.writeProtected)return 0x2b;
    if(block>=disk.blockCount)return 0x27;
    const offset=block<<9;
    if(command===1){for(let i=0;i<512;i++)this.memory.write((buffer+i)&0xffff,disk.image[offset+i]);}
    else {for(let i=0;i<512;i++)disk.image[offset+i]=this.memory.read((buffer+i)&0xffff);disk.dirty=true;this.notifyWrite(drive,disk,block);}
    return 0;
  };
}

function applyBoot(board,boot){
  board.prodosBlock._bootSmartPortDrive=null;
  if(/^s7d[1-4]$/.test(boot))board.prodosBlock._bootSmartPortDrive=Number(boot.at(-1))-1;
  // Slot 5/6 drive 2 boot selection is modeled by selecting drive 2 as the
  // controller's initial unit. Firmware may subsequently select either drive.
  if(/^s6d[12]$/.test(boot)&&board.floppy525)board.floppy525._drive=Number(boot.at(-1))-1;
  if(/^s5d[12]$/.test(boot)&&board.memory)board.memory.iwmControlDrive2=boot.endsWith('2');
}

async function restore(board){
  const s=settings(),items=await all();let mounted=0;
  for(const r of items){if(!s.keep[r.id])continue;try{await mountRecord(board,r);mounted++;}catch(err){console.warn('[persistent mount]',r.id,err);}}
  applyBoot(board,s.boot);
  if(mounted){
    board.reset(true);
    applyBoot(board,s.boot);
  }
  window.dispatchEvent(new CustomEvent('iigs-persistent-drives-restored',{detail:{mounted,boot:s.boot}}));
}

async function waitForBoard(){
  for(let i=0;i<100;i++){
    const b=window.__appleIIgsBoard;
    if(b?.iigsEnabled){
      // Let ROM03 finish loading before the restore/reset that boots media.
      await new Promise(r=>setTimeout(r,350));
      await restore(b);return;
    }
    await new Promise(r=>setTimeout(r,50));
  }
}

function label(id){return ({s5d1:'Slot 5 · 3.5-inch Drive 1',s5d2:'Slot 5 · 3.5-inch Drive 2',s6d1:'Slot 6 · 5.25-inch Drive 1',s6d2:'Slot 6 · 5.25-inch Drive 2',s7d1:'Slot 7 · SmartPort Drive 1',s7d2:'Slot 7 · SmartPort Drive 2',s7d3:'Slot 7 · SmartPort Drive 3',s7d4:'Slot 7 · SmartPort Drive 4'})[id]||id;}
function installConfigBoot(){
  const dialog=document.getElementById('iigsConfigurationDialog');if(!dialog||dialog.querySelector('#iigsBootFrom'))return;
  const section=dialog.querySelector('.iigs-config-grid section:last-child')||dialog.querySelector('section:last-child');if(!section)return;
  const wrap=document.createElement('label');wrap.className='iigs-drive-route';wrap.innerHTML='<span>Boot from</span><select id="iigsBootFrom"></select>';
  const select=wrap.querySelector('select');select.add(new Option('Automatic — normal slot scan','auto'));for(const id of targetIds)select.add(new Option(label(id),id));select.value=settings().boot;
  select.addEventListener('change',()=>{const s=settings();s.boot=select.value;saveSettings(s);});section.prepend(wrap);
}
function addKeepControl(section,id){
  if(!section||section.querySelector('.persistent-mount-toggle'))return;
  const l=document.createElement('label');l.className='persistent-mount-toggle';const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!settings().keep[id];l.append(cb,document.createTextNode(' Keep mounted after reload'));
  cb.addEventListener('change',async()=>{const s=settings();s.keep[id]=cb.checked;saveSettings(s);if(!cb.checked){await remove(id);return;}const c=candidates.get(id);if(c)await put(c);});
  const choice=section.querySelector('.mediaChoice');(choice?.parentNode||section).insertBefore(l,choice?.nextSibling||null);
}
function installKeepUI(){
  const dlg=document.getElementById('mediaDialog');if(!dlg)return;
  addKeepControl(document.getElementById('driveTitle0')?.closest('section'),'s7d1');
  addKeepControl(document.getElementById('driveTitle1')?.closest('section'),'s7d2');
  addKeepControl(document.getElementById('driveTitle2')?.closest('section'),'s7d3');
  addKeepControl(document.getElementById('driveTitle3')?.closest('section'),'s7d4');
}
async function captureFile(input,drive){
  const file=input.files?.[0];if(!file)return;const data=new Uint8Array(await file.arrayBuffer());
  if(isZip(file.name,data)){const entries=readZipEntries(data);if(entries.length!==1)return;const media=decodeMedia(entries[0].name,entries[0].data);const id=targetFor(drive,media);if(!id)return;candidates.set(id,{id,name:file.name,entryName:entries[0].name,data:data.buffer,updatedAt:Date.now()});if(settings().keep[id])await put(candidates.get(id));return;}
  const media=decodeMedia(file.name,data),id=targetFor(drive,media);if(!id)return;const rec={id,name:file.name,data:data.buffer,updatedAt:Date.now()};candidates.set(id,rec);if(settings().keep[id])await put(rec);
}
function installCapture(){
  const pairs=[['filedialog1',0],['filedialogInsert',0],['filedialogInsert2',1],['filedialogInsert3',2],['filedialogInsert4',3]];
  for(const [id,d] of pairs){const el=document.getElementById(id);if(el&&!el.__persistentCapture){el.__persistentCapture=true;el.addEventListener('change',()=>captureFile(el,d).catch(console.warn),true);}}
}
function install(){installConfigBoot();installKeepUI();installCapture();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{install();waitForBoard();},{once:true});else{install();waitForBoard();}
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
