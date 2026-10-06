import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {ProDOSBlockDevice} from "https://subnetpie.github.io/computer/appleii/prodos_block.js?v=20260930-persist1";
import {decodeMedia,isZip,readZipEntries} from "./media.js?v=20260930-gsos-drives";
import {mediaPersistenceKey,restorePersistentBlocks} from "./disk_persistence.js?v=20260930-persist1";
import {exportHardDrive} from "./disk_export.js?v=20260930-disk-save";

const SMARTPORT_DRIVES=4;

function blankDrive(){
  return {image:null,name:'',dirty:false,writeProtected:false,blockCount:0,changed:false,physical:null,persistenceKey:null};
}
function ensureSmartPortDrives(device){
  if(!device?.drives)return;
  while(device.drives.length<SMARTPORT_DRIVES)device.drives.push(blankDrive());
}

// Extend the existing controller without changing the legacy ProDOS two-drive
// entry point. Units 3/4 are SmartPort-only, exactly as real SmartPort devices
// beyond the two legacy ProDOS unit numbers are.
const oldLoad=ProDOSBlockDevice.prototype.load_image;
ProDOSBlockDevice.prototype.load_image=function(name,bin,options={},drive=0){
  ensureSmartPortDrives(this);
  return oldLoad.call(this,name,bin,options,drive);
};
const oldEject=ProDOSBlockDevice.prototype.eject;
ProDOSBlockDevice.prototype.eject=function(drive=0){
  ensureSmartPortDrives(this);
  if(!this.drives[drive])return;
  return oldEject.call(this,drive);
};
const oldReset=ProDOSBlockDevice.prototype.reset;
ProDOSBlockDevice.prototype.reset=function(...args){
  ensureSmartPortDrives(this);
  return oldReset.apply(this,args);
};

// Same SmartPort request engine as the base controller, but controller STATUS
// reports all four units instead of the original fixed pair.
ProDOSBlockDevice.prototype.executeSmartPort=function(){
  ensureSmartPortDrives(this);
  const read=a=>this.memory.read(a&0xffffff);
  const word=a=>read(a)|(read(a+1)<<8);
  const stack=n=>0x100|((this.smartStack+n)&255);
  const ret=read(stack(1))|(read(stack(2))<<8);
  const rawCommand=read(ret+1),extended=!!(rawCommand&0x40);
  const command=rawCommand&~0x40;
  const long=a=>(word(a)+(word(a+2)*65536))>>>0;
  const list=extended?long(ret+2):word(ret+2),next=(ret+(extended?5:3))&0xffff;
  this.memory.write(stack(1),next&255);this.memory.write(stack(2),next>>>8);
  this.smartCount=0;
  if(![0,1,2,4].includes(command))return 1;
  if(read(list)!==3)return 4;
  const unit=read(list+1),buffer=extended?long(list+2):word(list+2);
  const argument=list+(extended?6:4),code=read(argument);
  const bufferAddress=i=>(buffer+i)&(extended?0xffffff:0xffff);
  const output=bytes=>{
    bytes.forEach((v,i)=>this.memory.write(bufferAddress(i),v));
    this.smartCount=bytes.length;
  };
  if(unit===0){
    if(command===0&&code===0){output([this.drives.length,0x40,0,0,0,0,0,0]);return 0;}
    if(command===4&&code===0){for(const disk of this.drives)disk.changed=false;return 0;}
    return 0x21;
  }
  const disk=this.drives[unit-1];
  if(!disk)return 0x28;
  if(command===4){if(code!==0)return 0x21;disk.changed=false;return 0;}
  if(command===0){
    if(code!==0&&code!==3)return 0x21;
    const status=0xa0|(disk.writeProtected?4:0x40)|(disk.image?0x10:0);
    const bytes=[status,disk.blockCount&255,disk.blockCount>>>8,0];
    if(extended)bytes.push(0);
    if(code===3){
      const id='EMU DISK '+unit;
      bytes.push(id.length,...Array.from(id.padEnd(16),c=>c.charCodeAt(0)),disk.physical==='35'?1:2,0xc0,0,1);
    }
    output(bytes);
    if(code===0&&disk.changed){disk.changed=false;return 0x2e;}
    return 0;
  }
  if(disk.changed){disk.changed=false;return 0x2e;}
  if(!disk.image)return 0x2f;
  const block=extended?long(argument):word(argument)|(read(argument+2)<<16);
  if(block>=disk.blockCount)return 0x2d;
  if(command===2&&disk.writeProtected)return 0x2b;
  for(let i=0;i<512;i++){
    if(command===1)this.memory.write(bufferAddress(i),disk.image[block*512+i]);
    else disk.image[block*512+i]=read(bufferAddress(i));
  }
  if(command===2){disk.dirty=true;this.notifyWrite(unit-1,disk,block);}
  this.smartCount=512;return 0;
};

// Register the actual board instance without modifying script.js. The main
// module resets immediately after construction, so this is available before a
// user can open the disk panel.
const priorReset=Motherboard.prototype.reset;
if(!Motherboard.prototype.__extraSmartPortDrives){
  Motherboard.prototype.__extraSmartPortDrives=true;
  Motherboard.prototype.reset=function(...args){
    const result=priorReset.apply(this,args);
    if(this.iigsEnabled&&this.prodosBlock){
      ensureSmartPortDrives(this.prodosBlock);
      window.__appleIIgsBoard=this;
    }
    return result;
  };
}

async function chooseArchive(name,entries){
  const dialog=document.getElementById('archiveDialog');
  const select=document.getElementById('archiveImages');
  if(!dialog||!select)return entries[0]||null;
  const title=document.getElementById('archiveName');
  if(title)title.textContent=name;
  select.replaceChildren();
  entries.forEach((entry,index)=>select.add(new Option(entry.name,String(index))));
  dialog.returnValue='';
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='load'?entries[Number(select.value)]:null),{once:true});
    dialog.showModal();
  });
}

async function mountExtraDrive(drive,name,buffer){
  const board=window.__appleIIgsBoard;
  if(!board?.iigsEnabled)throw new Error('Slot 7 extra drives require IIgs mode');
  let media;
  if(isZip(name,buffer)){
    const entries=readZipEntries(buffer);
    const selected=entries.length===1?entries[0]:await chooseArchive(name,entries);
    if(!selected)return false;
    media=decodeMedia(selected.name,selected.data);
    name=selected.name;
  }else media=decodeMedia(name,buffer);
  if(media.kind!=='block'||media.physical==='35')
    throw new Error('Slot 7 Drive '+(drive+1)+' accepts SmartPort/ProDOS block images (HDV, PO, hard-disk 2MG)');
  media.persistenceKey=mediaPersistenceKey(name,media.data);
  media.restoredBlocks=await restorePersistentBlocks(media.persistenceKey,media.data);
  ensureSmartPortDrives(board.prodosBlock);
  board.prodosBlock.load_image(name,media.data,media,drive);
  board.mountedMedia??=[];
  board.mountedMedia[drive]=media;
  refreshExtraDrives();
  return true;
}

function refreshExtraDrives(){
  const board=window.__appleIIgsBoard;
  for(const drive of [2,3]){
    const disk=board?.prodosBlock?.drives?.[drive];
    const media=board?.mountedMedia?.[drive];
    const name=document.getElementById('driveName'+drive);
    if(name)name.textContent=media?.name?.split('/').pop()||disk?.name?.split('/').pop()||'Empty';
    const eject=document.getElementById('ejectDrive'+drive);
    if(eject)eject.disabled=!disk?.image;
    const protect=document.getElementById('protectDrive'+drive);
    if(protect)protect.checked=!!disk?.writeProtected;
    const status=document.getElementById('writeStatus'+drive);
    if(status){
      if(disk?.persistenceKey){
        const restored=media?.restoredBlocks||0;
        status.textContent=disk.dirty?'Changes are being saved automatically in this browser.'
          :restored?'Restored saved changes from this browser.':'Writable — changes will be saved automatically.';
      }else status.textContent=disk?.dirty?'Modified in this session — download to keep changes.':'No writes in this session.';
    }
  }
}

function driveSection(drive){
  const n=drive+1;
  return `
    <section class="diskDrive smartport-extra" aria-labelledby="driveTitle${drive}">
      <h3 id="driveTitle${drive}">Slot 7 · SmartPort Drive ${n}</h3>
      <p id="driveName${drive}" class="diskName">Empty</p>
      <input type="file" id="filedialogInsert${n}" hidden>
      <label class="mediaChoice" for="filedialogInsert${n}"><strong>Insert into SmartPort Drive ${n}</strong><span>HDV, PO or hard-disk 2MG · keep running</span></label>
      <div id="hardDriveOptions${drive}">
        <label><input type="checkbox" id="protectDrive${drive}"> Write protect</label>
        <p id="writeStatus${drive}" role="status">No writes in this session.</p>
        <button id="saveDrive${drive}" type="button">Download image</button>
      </div>
      <button id="ejectDrive${drive}" type="button">Eject SmartPort Drive ${n}</button>
    </section>`;
}

function installUI(){
  const dialog=document.getElementById('mediaDialog');
  if(!dialog||dialog.__smartPortExtraDrives)return;
  dialog.__smartPortExtraDrives=true;
  const cancelForm=dialog.querySelector('form[method="dialog"]');
  const holder=document.createElement('div');
  holder.id='smartPortExtraDrives';
  holder.innerHTML=driveSection(2)+driveSection(3);
  dialog.insertBefore(holder,cancelForm||null);

  for(const drive of [2,3]){
    const input=document.getElementById('filedialogInsert'+(drive+1));
    input.addEventListener('change',event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=async()=>{
        try{await mountExtraDrive(drive,file.name,reader.result);}
        catch(err){alert(err?.message||String(err));}
      };
      reader.readAsArrayBuffer(file);
      event.target.value='';
    });
    document.getElementById('protectDrive'+drive).addEventListener('change',event=>{
      const disk=window.__appleIIgsBoard?.prodosBlock?.drives?.[drive];
      if(disk)disk.writeProtected=event.target.checked;
    });
    document.getElementById('ejectDrive'+drive).addEventListener('click',()=>{
      const board=window.__appleIIgsBoard;
      if(!board)return;
      board.prodosBlock.eject(drive);
      if(board.mountedMedia)board.mountedMedia[drive]=null;
      refreshExtraDrives();
    });
    document.getElementById('saveDrive'+drive).addEventListener('click',()=>{
      const board=window.__appleIIgsBoard;
      if(!board)return;
      try{
        const snapshot=exportHardDrive(board,drive);
        const url=URL.createObjectURL(new Blob([snapshot.data],{type:'application/octet-stream'}));
        const link=document.createElement('a');link.href=url;link.download=snapshot.name;
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch(err){alert(err?.message||String(err));}
    });
  }
  document.getElementById('buttonLoad')?.addEventListener('click',()=>queueMicrotask(refreshExtraDrives));
  refreshExtraDrives();
}

function updateConfigurationSummary(){
  const summary=document.getElementById('iigsSmartPortSummary');
  if(summary&&/drives?\s*1\s*\/\s*2/i.test(summary.textContent||''))
    summary.textContent=(summary.textContent||'').replace(/drives?\s*1\s*\/\s*2/i,'drives 1–4');
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installUI();updateConfigurationSummary();},{once:true});
else{installUI();updateConfigurationSummary();}
new MutationObserver(updateConfigurationSummary).observe(document.documentElement,{childList:true,subtree:true});
