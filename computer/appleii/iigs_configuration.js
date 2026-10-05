import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {ProDOSBlockDevice} from "https://subnetpie.github.io/computer/appleii/prodos_block.js?v=20260930-persist1";
import {Floppy525} from "https://subnetpie.github.io/computer/appleii/FloppyWoz525.js";
import {Floppy35} from "./floppy35.js?v=20260928-trackcache1";

const STORAGE_KEY = "subnetpie.apple2.iigs.configuration.v1";
const DEVICE_LABELS = Object.freeze({
  empty: "Empty",
  smartport: "SmartPort / hard disk",
  disk2: "Disk II · 5.25-inch",
  iigs35: "IIgs built-in · 3.5-inch"
});
const TARGET_LABELS = Object.freeze({
  auto: "Auto — choose from image type",
  smartport: "SmartPort / hard disk",
  "35": "3.5-inch IWM",
  "525": "5.25-inch Disk II"
});

function defaultConfiguration() {
  return {
    version: 1,
    slots: {1:"empty",2:"empty",3:"empty",4:"empty",5:"iigs35",6:"disk2",7:"smartport"},
    driveTargets: ["auto","auto"]
  };
}

function normalizeConfiguration(value) {
  const out=defaultConfiguration();
  const input=value && typeof value === "object" ? value : {};
  const validSlotDevice=new Set(["empty","smartport","disk2"]);
  const claimed=new Set();
  for(const slot of [7,6,4,3,2,1]) {
    const requested=input.slots?.[slot];
    if(!validSlotDevice.has(requested) || requested==="empty") {
      out.slots[slot]="empty";
      continue;
    }
    if(claimed.has(requested)) out.slots[slot]="empty";
    else { out.slots[slot]=requested; claimed.add(requested); }
  }
  // Slot 5 is the IIgs built-in 3.5-inch SmartPort/IWM assignment in the
  // hardware currently emulated. It remains reserved until dynamic slot-5
  // firmware routing is implemented.
  out.slots[5]="iigs35";
  if(!claimed.has("smartport")) out.slots[7]="smartport";
  if(!claimed.has("disk2")) {
    if(out.slots[6]==="empty") out.slots[6]="disk2";
    else {
      const free=[4,3,2,1,7].find(slot=>out.slots[slot]==="empty");
      if(free) out.slots[free]="disk2";
    }
  }
  const validTarget=new Set(Object.keys(TARGET_LABELS));
  for(let drive=0;drive<2;drive++) {
    const target=input.driveTargets?.[drive];
    out.driveTargets[drive]=validTarget.has(target)?target:"auto";
  }
  return out;
}

export function loadIIgsConfiguration() {
  try { return normalizeConfiguration(JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")); }
  catch(_) { return defaultConfiguration(); }
}

export function saveIIgsConfiguration(config) {
  const normalized=normalizeConfiguration(config);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized));
  return normalized;
}

function findSlot(config, device, fallback) {
  for(let slot=7;slot>=1;slot--) if(config.slots[slot]===device)return slot;
  return fallback;
}

// The existing block-card firmware was originally specialized for slot 7.
// Make its slot-ROM and $C08x I/O window derive from this.slot so the card can
// be assigned to another expansion slot without changing its media engine.
function installBlockSlotSupport() {
  const p=ProDOSBlockDevice.prototype;
  if(p.__iigsConfigSlotSupport)return;
  p.__iigsConfigSlotSupport=true;

  p.buildRom=function() {
    const slot=this.slot&7;
    this.romBase=0xc000|(slot<<8);
    this.ioBase=0xc080|(slot<<4);
    const io=this.ioBase&0xffff, lo=io&255, hi=io>>>8;
    this.rom.fill(0xea);
    this.rom.set([0x24,0x20,0x24,0x00,0x24,0x03,0x24,0x00],0x00);
    this.rom.set([
      0xa9,0x01,0x85,0x42,
      0xa9,slot<<4,0x85,0x43,
      0xa9,0x00,0x85,0x44,
      0xa9,0x08,0x85,0x45,
      0xa9,0x00,0x85,0x46,0x85,0x47,
      0x20,0x80,0xc0|slot,
      0xb0,0x07,
      0xa2,slot<<4,
      0x86,0x43,
      0x4c,0x01,0x08,
      0x60
    ],0x08);
    this.rom.set([
      0xad,lo,hi,
      0xd0,0x0e,
      0xa5,0x42,
      0xd0,0x06,
      0xae,(lo+1)&255,hi,
      0xac,(lo+2)&255,hi,
      0xa9,0x00,
      0x18,
      0x60,
      0x38,
      0x60
    ],0xa0);
    this.rom.set([0x4c,0xa0,0xc0|slot],0x80);
    this.rom.set([
      0xba,
      0x8e,(lo+3)&255,hi,
      0xad,(lo+4)&255,hi,
      0xae,(lo+5)&255,hi,
      0xac,(lo+6)&255,hi,
      0xc9,0x01,0x60
    ],0x83);
    this.rom[0xfb]=0x80;
    this.rom[0xfe]=0x17;
    this.rom[0xff]=0x80;
  };

  p.setSlot=function(slot) {
    slot=Math.max(1,Math.min(7,slot|0));
    if(this.slot===slot && this.ioBase===(0xc080|(slot<<4)))return;
    this.slot=slot;
    this.buildRom();
  };

  p.read=function(addr) {
    if(addr>=this.romBase && addr<=this.romBase+0xff) {
      if(!this.enabled)return 0;
      const off=addr&0xff;
      if(off===0xfc)return this.blockCount&0xff;
      if(off===0xfd)return (this.blockCount>>>8)&0xff;
      return this.rom[off];
    }
    const io=this.ioBase;
    if(addr===io+4)return this.executeSmartPort();
    if(addr===io+5)return this.smartCount&255;
    if(addr===io+6)return this.smartCount>>>8;
    if(addr===io)return this.execute();
    if(addr===io+1)return this.drives[this.statusDrive].blockCount&0xff;
    if(addr===io+2)return (this.drives[this.statusDrive].blockCount>>>8)&0xff;
    return undefined;
  };

  p.write=function(addr,val) {
    const io=this.ioBase;
    if(addr===io+3)this.smartStack=val;
    if(addr>=io && addr<=io+6)return 0;
    return undefined;
  };

  const load=p.load_image;
  p.load_image=function(name,bin,options={},drive=0) {
    const targets=this._iigsDriveTargets;
    if(targets) {
      const target=targets[drive]||"auto";
      const medium=options.physical==="35"?"35":"smartport";
      if(target!=="auto" && target!==medium)return false;
    }
    return load.call(this,name,bin,options,drive);
  };
}

function installDriveTargetSupport() {
  const fp=Floppy525.prototype;
  if(!fp.__iigsConfigTargets) {
    fp.__iigsConfigTargets=true;
    const load=fp.load_image;
    fp.load_image=function(drive,...args) {
      const target=this._iigsDriveTargets?.[drive]||"auto";
      if(target!=="auto" && target!=="525")return false;
      return load.call(this,drive,...args);
    };
  }
  const p35=Floppy35.prototype;
  if(!p35.__iigsConfigTargets) {
    p35.__iigsConfigTargets=true;
    const mount=p35.mount;
    p35.mount=function(media) {
      if(this._iigsDriveTargets && this._iigsDriveIndex>=0) {
        const target=this._iigsDriveTargets[this._iigsDriveIndex]||"auto";
        if(target!=="auto" && target!=="35")
          throw new Error(`Drive ${this._iigsDriveIndex+1} is configured for ${TARGET_LABELS[target]||target}`);
      }
      return mount.call(this,media);
    };
  }
}

function applyConfiguration(board) {
  if(!board?.iigsEnabled)return;
  const config=loadIIgsConfiguration();
  const smartPortSlot=findSlot(config,"smartport",7);
  const diskIISlot=findSlot(config,"disk2",6);
  board.iigsConfiguration=config;

  if(board.prodosBlock) {
    board.prodosBlock._iigsDriveTargets=config.driveTargets;
    board.prodosBlock.setSlot(smartPortSlot);
  }
  if(board.floppy525) {
    board.floppy525._iigsDriveTargets=config.driveTargets;
    board.floppy525._slot=diskIISlot;
    board.floppy525._addr_sel=0xc080|(diskIISlot<<4);
    board.floppy525._addr_io=0xc000|(diskIISlot<<8);
  }
  if(board.memory?.floppy35Drives) {
    board.memory.floppy35Drives.forEach((drive,index)=>{
      drive._iigsDriveIndex=index;
      drive._iigsDriveTargets=config.driveTargets;
    });
  }
}

installBlockSlotSupport();
installDriveTargetSupport();

// script.js calls reset immediately after constructing the motherboard and
// again for a booting media load. Applying here makes the saved control-panel
// configuration effective before ROM slot scanning begins.
const originalReset=Motherboard.prototype.reset;
if(!Motherboard.prototype.__iigsConfigurationReset) {
  Motherboard.prototype.__iigsConfigurationReset=true;
  Motherboard.prototype.reset=function(...args) {
    applyConfiguration(this);
    return originalReset.apply(this,args);
  };
}

function buildConfigurationDialog() {
  if(document.getElementById("iigsConfigurationDialog"))return;
  const dialog=document.createElement("dialog");
  dialog.id="iigsConfigurationDialog";
  dialog.className="iigs-config";
  dialog.innerHTML=`
    <form method="dialog" id="iigsConfigurationForm">
      <header class="iigs-config-head">
        <div><strong></strong><span>Apple IIgs</span></div>
        <h2>Edit System Configuration</h2>
      </header>
      <div class="iigs-config-grid">
        <section>
          <h3>Slots</h3>
          <div id="iigsSlotRows" class="iigs-slot-list"></div>
        </section>
        <section>
          <h3>Storage / drive routing</h3>
          <label>Drive 1<select id="iigsDriveTarget0"></select></label>
          <label>Drive 2<select id="iigsDriveTarget1"></select></label>
        </section>
      </div>
      <footer>
        <button type="button" id="iigsConfigDefaults">Defaults</button>
        <span></span>
        <button value="cancel">Cancel</button>
        <button type="button" id="iigsConfigSave">Save & Restart</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  const rows=dialog.querySelector("#iigsSlotRows");
  for(let slot=7;slot>=1;slot--) {
    const row=document.createElement("label");
    row.innerHTML=`<span>Slot ${slot}</span><select data-slot="${slot}"></select>`;
    const select=row.querySelector("select");
    for(const [value,label] of Object.entries(DEVICE_LABELS)) {
      if(slot!==5 && value==="iigs35")continue;
      const option=new Option(label,value);
      if(slot===5 && value!=="iigs35")option.disabled=true;
      select.add(option);
    }
    rows.append(row);
  }
  for(let drive=0;drive<2;drive++) {
    const select=dialog.querySelector(`#iigsDriveTarget${drive}`);
    for(const [value,label] of Object.entries(TARGET_LABELS))select.add(new Option(label,value));
  }

  const fill=()=>{
    const config=loadIIgsConfiguration();
    dialog.querySelectorAll("select[data-slot]").forEach(select=>{
      select.value=config.slots[select.dataset.slot]||"empty";
    });
    config.driveTargets.forEach((value,index)=>{
      dialog.querySelector(`#iigsDriveTarget${index}`).value=value;
    });
  };

  dialog.openWithConfiguration=()=>{ fill(); dialog.showModal(); };

  dialog.querySelector("#iigsConfigDefaults").addEventListener("click",()=>{
    const defaults=defaultConfiguration();
    dialog.querySelectorAll("select[data-slot]").forEach(select=>select.value=defaults.slots[select.dataset.slot]||"empty");
    defaults.driveTargets.forEach((value,index)=>dialog.querySelector(`#iigsDriveTarget${index}`).value=value);
  });

  dialog.querySelector("#iigsConfigSave").addEventListener("click",()=>{
    const config={version:1,slots:{},driveTargets:[]};
    dialog.querySelectorAll("select[data-slot]").forEach(select=>{config.slots[select.dataset.slot]=select.value;});
    config.driveTargets[0]=dialog.querySelector("#iigsDriveTarget0").value;
    config.driveTargets[1]=dialog.querySelector("#iigsDriveTarget1").value;
    saveIIgsConfiguration(config);
    dialog.close();
    location.reload();
  });

  fill();
}

if(new URLSearchParams(location.search).get("machine")!=="iie") {
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",buildConfigurationDialog,{once:true});
  else buildConfigurationDialog();
}
