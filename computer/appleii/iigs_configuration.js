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
          <p class="iigs-config-note">Choose which emulated controller each Load dialog drive accepts.</p>
          <label class="iigs-drive-route">Drive 1<select id="iigsDriveTarget0"></select></label>
          <label class="iigs-drive-route">Drive 2<select id="iigsDriveTarget1"></select></label>
          <div class="iigs-storage-map">
            <div><b>SmartPort</b><span id="iigsSmartPortSummary"></span></div>
            <div><b>3.5-inch</b><span>Slot 5 · drives 1/2</span></div>
            <div><b>Disk II</b><span id="iigsDiskIISummary"></span></div>
          </div>
        </section>
      </div>
      <p class="iigs-config-warning">Saving restarts the emulator so ROM 03 scans the new slot layout. Mount disks after the restart.</p>
      <footer>
        <button type="button" id="iigsConfigDefaults">Defaults</button>
        <span></span>
        <button value="cancel">Cancel</button>
        <button type="button" id="iigsConfigSave" class="primary">Save & Restart</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  const style=document.createElement("style");
  style.textContent=`
    .iigs-config{width:min(900px,94vw);max-height:92dvh;overflow:auto;padding:0;border:2px solid #343434;border-radius:7px;background:#b7bab9;color:#111;font:16px/1.25 system-ui,sans-serif;box-shadow:0 14px 50px #000b}
    .iigs-config::backdrop{background:#000b}
    .iigs-config *{box-sizing:border-box;touch-action:manipulation}
    .iigs-config form{padding:18px}
    .iigs-config-head{display:grid;grid-template-columns:220px 1fr 220px;align-items:center;margin-bottom:18px}
    .iigs-config-head>div{display:flex;align-items:center;gap:10px;font:28px Georgia,serif}.iigs-config-head strong{font-size:42px}.iigs-config-head h2{grid-column:2;text-align:center;margin:0;font-size:25px}
    .iigs-config-grid{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(330px,1.2fr);gap:28px}.iigs-config h3{margin:0 0 8px;font-size:18px}
    .iigs-slot-list{padding:6px;background:#006332;border:1px solid #365c45}.iigs-slot-row{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:6px;margin:5px 0}.iigs-slot-row>span{text-align:center;font-weight:700}.iigs-slot-row select{width:100%;min-height:42px;border:2px solid #d8f5dc;background:#078cc6;color:#fff;padding:5px;font-size:15px}.iigs-slot-row.fixed select{background:#737b7c}
    .iigs-drive-route{display:grid;grid-template-columns:82px 1fr;align-items:center;gap:8px;margin:10px 0}.iigs-drive-route select{min-height:42px;font-size:15px;padding:5px}
    .iigs-config-note,.iigs-config-warning{font-size:13px}.iigs-storage-map{margin-top:18px;padding:12px;background:#929594;display:grid;gap:10px}.iigs-storage-map div{display:flex;justify-content:space-between;gap:14px;padding:10px;background:#ecece8;border:1px solid #777}.iigs-storage-map span{text-align:right}
    .iigs-config footer{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid #777}.iigs-config button{min-height:42px;padding:6px 16px;font-size:15px}.iigs-config .primary{background:#0c5;color:#021;border:2px outset #7f9;font-weight:700}
    #buttonIIgsConfiguration{width:100%;margin:.45rem 0;min-height:46px;background:#315d48;color:#fff;border:2px solid #173b2b;border-radius:7px;font-weight:700}
    @media(max-width:680px){.iigs-config-head{grid-template-columns:1fr}.iigs-config-head>div{justify-content:center}.iigs-config-head h2{grid-column:1}.iigs-config-grid{grid-template-columns:1fr}.iigs-config footer{grid-template-columns:1fr 1fr}.iigs-config footer span{display:none}}
  `;
  document.head.append(style);

  const rows=document.getElementById("iigsSlotRows");
  for(let slot=7;slot>=1;slot--) {
    const row=document.createElement("label");
    row.className="iigs-slot-row"+(slot===5?" fixed":"");
    const options=slot===5
      ? `<option value="iigs35">${DEVICE_LABELS.iigs35}</option>`
      : `<option value="empty">${DEVICE_LABELS.empty}</option><option value="smartport">${DEVICE_LABELS.smartport}</option><option value="disk2">${DEVICE_LABELS.disk2}</option>`;
    row.innerHTML=`<span>${slot}</span><select data-slot="${slot}" ${slot===5?"disabled":""}>${options}</select>`;
    rows.append(row);
  }
  for(let drive=0;drive<2;drive++) {
    const select=document.getElementById("iigsDriveTarget"+drive);
    for(const [value,label] of Object.entries(TARGET_LABELS))select.add(new Option(label,value));
  }

  const readForm=()=>{
    const config=defaultConfiguration();
    dialog.querySelectorAll("select[data-slot]").forEach(select=>config.slots[select.dataset.slot]=select.value);
    config.slots[5]="iigs35";
    config.driveTargets=[document.getElementById("iigsDriveTarget0").value,document.getElementById("iigsDriveTarget1").value];
    return normalizeConfiguration(config);
  };
  const render=config=>{
    config=normalizeConfiguration(config);
    dialog.querySelectorAll("select[data-slot]").forEach(select=>select.value=config.slots[select.dataset.slot]);
    document.getElementById("iigsDriveTarget0").value=config.driveTargets[0];
    document.getElementById("iigsDriveTarget1").value=config.driveTargets[1];
    document.getElementById("iigsSmartPortSummary").textContent="Slot "+findSlot(config,"smartport",7);
    document.getElementById("iigsDiskIISummary").textContent="Slot "+findSlot(config,"disk2",6)+" · drives 1/2";
  };
  dialog.addEventListener("change",event=>{
    const select=event.target.closest("select[data-slot]");
    if(select && (select.value==="smartport" || select.value==="disk2")) {
      dialog.querySelectorAll(`select[data-slot]`).forEach(other=>{
        if(other!==select && other.value===select.value)other.value="empty";
      });
    }
    render(readForm());
  });
  document.getElementById("iigsConfigDefaults").addEventListener("click",()=>render(defaultConfiguration()));
  document.getElementById("iigsConfigSave").addEventListener("click",()=>{
    saveIIgsConfiguration(readForm());
    location.reload();
  });
  dialog.addEventListener("close",()=>{});
  dialog.openWithConfiguration=()=>{render(loadIIgsConfiguration());dialog.showModal();};
}

function installConfigurationButton() {
  buildConfigurationDialog();
  const media=document.getElementById("mediaDialog");
  if(!media || document.getElementById("buttonIIgsConfiguration"))return;
  const button=document.createElement("button");
  button.type="button";
  button.id="buttonIIgsConfiguration";
  button.textContent="IIgs System Configuration · Slots & Drives";
  button.addEventListener("click",()=>{
    media.close();
    document.getElementById("iigsConfigurationDialog").openWithConfiguration();
  });
  const title=document.getElementById("mediaTitle");
  title?.insertAdjacentElement("afterend",button);
}

if(new URLSearchParams(location.search).get("machine")!=="iie") {
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installConfigurationButton,{once:true});
  else installConfigurationButton();
}
