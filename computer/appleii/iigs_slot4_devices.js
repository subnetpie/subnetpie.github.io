import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";

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

function applySlot4(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const mode=loadMode();
  board.iigsSlot4Device=mode;

  // Persist the control-panel hardware choice even if ROM03 or compatibility
  // software later rewrites SLOTROM ($C02D). A configured external Mockingboard
  // must remain physically present at $C400-$C4FF for Apple II software probes.
  if(mode==="mockingboard") board.memory.slotRom|=0x10;
  else board.memory.slotRom&=~0x10;

  // Motherboard's default IIgs Mockingboard gate also checks the live SLOTROM /
  // INTCXROM state. That can make an explicitly configured card disappear after
  // boot when compatibility software changes those firmware-selection latches.
  // Once Slot 4 is configured as Mockingboard, make the actual card decode
  // authoritative until the user changes the saved Slot 4 device.
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
      // The base slot configuration does not yet know these two values. Keep
      // this choice local and prevent its normalizer from replacing it.
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
