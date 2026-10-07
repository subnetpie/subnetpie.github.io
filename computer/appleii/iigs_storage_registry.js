import {decodeMedia,isZip,readZipEntries} from './media.js?v=20260930-gsos-drives';
import {mediaPersistenceKey,restorePersistentBlocks} from './disk_persistence.js?v=20260930-persist1';
import {exportHardDrive} from './disk_export.js?v=20260930-disk-save';

const DB='appleii-iigs-mounted-media';
const STORE='mounts';
const SETTINGS='subnetpie.apple2.iigs.persistentBoot.v1';
const candidates=new Map();

const board=()=>window.__appleIIgsBoard;

function configuredSlot(device,fallback){
  const slots=board()?.iigsConfiguration?.slots;
  if(slots)for(let slot=1;slot<=7;slot++)if(slots[slot]===device)return slot;
  return fallback;
}

function endpoints(){
  const diskSlot=configuredSlot('disk2',6);
  const smartSlot=configuredSlot('smartport',7);
  return [
    {id:'iigs35:d1',persistenceId:'s5d1',slot:5,unit:1,index:0,controller:'iigs35',controllerLabel:'IIgs 3.5-inch',label:'3.5-inch Drive 1',mediaLabel:'800K 3.5-inch',accept:'800K 2MG / block image'},
    {id:'iigs35:d2',persistenceId:'s5d2',slot:5,unit:2,index:1,controller:'iigs35',controllerLabel:'IIgs 3.5-inch',label:'3.5-inch Drive 2',mediaLabel:'800K 3.5-inch',accept:'800K 2MG / block image'},
    {id:'disk2:d1',persistenceId:'s6d1',slot:diskSlot,unit:1,index:0,controller:'disk2',controllerLabel:'Disk II',label:'5.25-inch Drive 1',mediaLabel:'140K 5.25-inch',accept:'DSK / DO / WOZ / NIB'},
    {id:'disk2:d2',persistenceId:'s6d2',slot:diskSlot,unit:2,index:1,controller:'disk2',controllerLabel:'Disk II',label:'5.25-inch Drive 2',mediaLabel:'140K 5.25-inch',accept:'DSK / DO / WOZ / NIB'},
    {id:'smartport:d1',persistenceId:'s7d1',slot:smartSlot,unit:1,index:0,controller:'smartport',controllerLabel:'SmartPort / block',label:'SmartPort Drive 1',mediaLabel:'Block device',accept:'HDV / PO / hard-disk 2MG'},
    {id:'smartport:d2',persistenceId:'s7d2',slot:smartSlot,unit:2,index:1,controller:'smartport',controllerLabel:'SmartPort / block',label:'SmartPort Drive 2',mediaLabel:'Block device',accept:'HDV / PO / hard-disk 2MG'},
    {id:'smartport:d3',persistenceId:'s7d3',slot:smartSlot,unit:3,index:2,controller:'smartport',controllerLabel:'SmartPort / block',label:'SmartPort Drive 3',mediaLabel:'Block device',accept:'HDV / PO / hard-disk 2MG'},
    {id:'smartport:d4',persistenceId:'s7d4',slot:smartSlot,unit:4,index:3,controller:'smartport',controllerLabel:'SmartPort / block',label:'SmartPort Drive 4',mediaLabel:'Block device',accept:'HDV / PO / hard-disk 2MG'}
  ];
}

function endpoint(id){return endpoints().find(x=>x.id===id||x.persistenceId===id)||null;}
function physicalMedia(){const b=board();return b?(b.iigsPhysicalMedia??=(Object.create(null))):Object.create(null);}

function state(id){
  const ep=endpoint(id),b=board();
  if(!ep)return null;
  let media=null,name='',writeProtected=true,writable=false,dirty=false;
  if(ep.controller==='iigs35'){
    media=b?.memory?.floppy35Drives?.[ep.index]?.media||physicalMedia()[ep.id]||null;
    name=media?.name||'';writeProtected=media?!media.data||!!media.writeProtected:true;writable=!!media?.data;dirty=!!media?.dirty;
  }else if(ep.controller==='disk2'){
    const disk=b?.floppy525?._disks?.[ep.index];media=physicalMedia()[ep.id]||null;
    name=disk?.name||media?.name||'';writeProtected=true;writable=false;
  }else{
    const disk=b?.prodosBlock?.drives?.[ep.index];
    // Older persistence code also mirrors 800K 3.5 media through the block
    // device. That compatibility copy belongs to Slot 5 and must not make the
    // same image appear as a mounted Slot-7 SmartPort disk in the registry.
    if(disk?.image&&disk.physical!=='35'){
      media=physicalMedia()[ep.id]||null;
      name=disk.name||media?.name||'';writeProtected=!!disk.writeProtected;writable=true;dirty=!!disk.dirty;
    }
  }
  return {...ep,mounted:!!name,name:name.split('/').pop(),media,writeProtected,writable,dirty};
}

function validate(ep,media){
  if(ep.controller==='iigs35' && !(media.kind==='block'&&media.physical==='35'))
    throw new Error(`${ep.label} accepts 800K IIgs 3.5-inch images`);
  if(ep.controller==='disk2' && media.kind!=='floppy')
    throw new Error(`${ep.label} accepts 140K 5.25-inch floppy images`);
  if(ep.controller==='smartport' && !(media.kind==='block'&&media.physical!=='35'))
    throw new Error(`${ep.label} accepts SmartPort/ProDOS block images`);
}

function ensureSmartPort(b){
  if(!b?.prodosBlock?.drives)return;
  while(b.prodosBlock.drives.length<4)b.prodosBlock.drives.push({image:null,name:'',dirty:false,writeProtected:false,blockCount:0,changed:false,physical:null,persistenceKey:null});
}

async function chooseArchive(name,entries){
  if(entries.length===1)return entries[0];
  const dialog=document.getElementById('archiveDialog'),select=document.getElementById('archiveImages');
  if(!dialog||!select)return entries[0]||null;
  const title=document.getElementById('archiveName');if(title)title.textContent=name;
  select.replaceChildren();entries.forEach((entry,index)=>select.add(new Option(entry.name,String(index))));
  dialog.returnValue='';
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='load'?entries[Number(select.value)]:null),{once:true});
    dialog.showModal();
  });
}

async function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function putRecord(record){
  if(!globalThis.indexedDB)return;
  const db=await openDB();
  await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
}
function keepEnabled(id){
  try{return !!JSON.parse(localStorage.getItem(SETTINGS)||'{}').keep?.[id];}catch(_){return false;}
}

async function mountFile(id,file){
  const ep=endpoint(id),b=board();if(!ep||!b?.iigsEnabled)throw new Error('IIgs storage is not ready');
  const original=new Uint8Array(await file.arrayBuffer());let source=original,name=file.name,entryName='';
  if(isZip(name,source)){
    const selected=await chooseArchive(name,readZipEntries(source));if(!selected)return false;
    entryName=selected.name;source=selected.data;name=selected.name;
  }
  const media=decodeMedia(name,source);validate(ep,media);
  if(media.kind==='block'){
    media.persistenceKey=mediaPersistenceKey(name,media.data);
    media.restoredBlocks=await restorePersistentBlocks(media.persistenceKey,media.data);
  }

  // The physical registry owns routing. Clear the old two-logical-drive route
  // filters so choosing S5/S6/S7 cannot be redirected by legacy preferences.
  if(b.prodosBlock)b.prodosBlock._iigsDriveTargets=null;
  if(b.floppy525)b.floppy525._iigsDriveTargets=null;
  b.memory?.floppy35Drives?.forEach(d=>{d._iigsDriveTargets=null;});

  if(ep.controller==='iigs35'){
    if(!b.memory.floppy35Drives[ep.index].mount(media))throw new Error('Unable to mount '+name);
  }else if(ep.controller==='disk2'){
    if(!b.floppy525.load_image(ep.index,media.name,media.data,media))throw new Error('Unable to mount '+name);
  }else{
    ensureSmartPort(b);
    if(!b.prodosBlock.load_image(media.name,media.data,media,ep.index))throw new Error('Unable to mount '+name);
  }
  physicalMedia()[ep.id]=media;
  candidates.set(ep.persistenceId,{id:ep.persistenceId,name:file.name,entryName:entryName||undefined,data:original.buffer,updatedAt:Date.now()});
  if(keepEnabled(ep.persistenceId))await putRecord(candidates.get(ep.persistenceId));
  window.dispatchEvent(new CustomEvent('iigs-storage-changed',{detail:{id:ep.id,action:'mount'}}));
  return true;
}

function eject(id){
  const ep=endpoint(id),b=board();if(!ep||!b)return false;
  if(ep.controller==='iigs35')b.memory?.floppy35Drives?.[ep.index]?.eject();
  else if(ep.controller==='disk2'){
    const disk=b.floppy525?._disks?.[ep.index];if(disk){disk.medium=null;disk.name='';}
  }else b.prodosBlock?.eject(ep.index);
  delete physicalMedia()[ep.id];
  window.dispatchEvent(new CustomEvent('iigs-storage-changed',{detail:{id:ep.id,action:'eject'}}));
  return true;
}

function setWriteProtected(id,value){
  const ep=endpoint(id),b=board();if(!ep||!b)return false;
  if(ep.controller==='iigs35'){
    const media=b.memory?.floppy35Drives?.[ep.index]?.media;if(media)media.writeProtected=!!value;
  }else if(ep.controller==='smartport'){
    const disk=b.prodosBlock?.drives?.[ep.index];if(disk)disk.writeProtected=!!value;
  }else return false;
  window.dispatchEvent(new CustomEvent('iigs-storage-changed',{detail:{id:ep.id,action:'protect'}}));
  return true;
}

async function setKeep(id,value){
  const ep=endpoint(id);if(!ep)return false;
  await window.__appleIIgsPersistence?.setKeep?.(ep.persistenceId,!!value);
  if(value&&candidates.has(ep.persistenceId))await putRecord(candidates.get(ep.persistenceId));
  return true;
}

function setBoot(id){
  const ep=id==='auto'?null:endpoint(id);
  return window.__appleIIgsPersistence?.setBoot?.(ep?.persistenceId||'auto');
}

function download(id){
  const ep=endpoint(id),b=board(),s=state(id);if(!ep||!b||!s?.mounted)return false;
  let data,name;
  if(ep.controller==='smartport'){
    const snapshot=exportHardDrive(b,ep.index);data=snapshot.data;name=snapshot.name;
  }else if(ep.controller==='iigs35'){
    data=s.media.data;name=(s.name||`slot5-drive${ep.unit}.po`).replace(/\.2mg$/i,'.po');
  }else return false;
  const url=URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  return true;
}

function groups(){
  const out=[];
  for(const ep of endpoints()){
    let g=out.find(x=>x.slot===ep.slot&&x.controller===ep.controller);
    if(!g){g={slot:ep.slot,controller:ep.controller,label:ep.controllerLabel,devices:[]};out.push(g);}
    g.devices.push(ep);
  }
  return out.sort((a,b)=>a.slot-b.slot);
}

window.__appleIIgsStorage={endpoints,groups,endpoint,state,mountFile,eject,setWriteProtected,setKeep,setBoot,download};
window.dispatchEvent(new Event('iigs-storage-registry-ready'));