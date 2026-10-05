import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {Mockingboard} from "./mockingboard.js?v=20261004-mb-complete1";

const STORAGE_KEY="subnetpie.apple2.iigs.slot4.v1";
const VALID=new Set(["mouse","mockingboard","none"]);

function loadMode(){
  try {
    const value=localStorage.getItem(STORAGE_KEY)||"mouse";
    return VALID.has(value)?value:"mouse";
  } catch(_) { return "mouse"; }
}

function saveMode(mode){
  mode=VALID.has(mode)?mode:"none";
  try { localStorage.setItem(STORAGE_KEY,mode); } catch(_) {}
  return mode;
}

// Make the physical card decode authoritative when Slot 4 is explicitly set to
// Mockingboard. This is intentionally below the motherboard reset/firmware
// latches: ROM03 and compatibility software are free to change SLOTROM/INTCXROM
// without making a physically configured card disappear from $C400-$C4FF.
const originalHandles=Mockingboard.prototype.handles;
if(!Mockingboard.prototype.__iigsConfiguredSlot4Decode){
  Mockingboard.prototype.__iigsConfiguredSlot4Decode=true;
  Mockingboard.prototype.handles=function(addr){
    const bank=addr>>>16;
    const slot4=(bank===0||bank===1||bank===0xe0||bank===0xe1)&&
      (addr&0xff00)===0xc400;
    if(slot4 && loadMode()==="mockingboard")return true;
    return originalHandles.call(this,addr);
  };
}

function applySlot4(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const mode=loadMode();
  board.iigsSlot4Device=mode;

  if(mode==="mockingboard") board.memory.slotRom|=0x10;
  else board.memory.slotRom&=~0x10;

  if(board.mockingboard) {
    board.mockingboard.selected=()=>board.iigsSlot4Device==="mockingboard";
  }
}

const originalReset=Motherboard.prototype.reset;
if(!Motherboard.prototype.__iigsSlot4Devices){
  Motherboard.prototype.__iigsSlot4Devices=true;
  Motherboard.prototype.reset=function(...args){
    const result=originalReset.apply(this,args);
    applySlot4(this);
    return result;
  };
}

function installUI(){
  const dialog=document.getElementById("iigsConfigurationDialog");
  if(!dialog || dialog.__slot4DevicesInstalled)return;
  dialog.__slot4DevicesInstalled=true;
  const select=dialog.querySelector('select[data-slot="4"]');
  if(!select)return;

  const add=(value,label)=>{
    if([...select.options].some(option=>option.value===value))return;
    select.add(new Option(label,value));
  };
  add("mouse","Mouse · built-in ADB / slot 4 firmware");
  add("mockingboard","Mockingboard v2.2 + speech");

  const setDisplayMode=()=>{
    const baseValue=select.value;
    if(baseValue==="smartport" || baseValue==="disk2") {
      saveMode("none");
      return;
    }
    const mode=loadMode();
    if(mode==="mouse" || mode==="mockingboard")select.value=mode;
  };

  const originalOpen=dialog.openWithConfiguration;
  if(typeof originalOpen==="function") {
    dialog.openWithConfiguration=()=>{
      originalOpen();
      queueMicrotask(setDisplayMode);
    };
  }

  select.addEventListener("change",event=>{
    if(select.value==="mouse" || select.value==="mockingboard") {
      saveMode(select.value);
      event.stopImmediatePropagation();
    } else {
      saveMode("none");
    }
  },true);

  const save=document.getElementById("iigsConfigSave");
  save?.addEventListener("click",()=>{
    const value=select.value;
    saveMode(value==="mouse"||value==="mockingboard"?value:"none");
  },true);

  const defaults=document.getElementById("iigsConfigDefaults");
  defaults?.addEventListener("click",()=>{
    saveMode("mouse");
    queueMicrotask(()=>{select.value="mouse";});
  });

  setDisplayMode();
}

if(new URLSearchParams(location.search).get("machine")!=="iie") {
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installUI,{once:true});
  else installUI();
}
