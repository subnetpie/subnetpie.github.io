import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {AppleIIMemoryExpansion} from "./memory_expansion.js?v=20261017-c800-latch1";
import {loadMachineProfile,saveMachineProfile} from "./machine_profile.js?v=20261017-memexp1";

const KEY="subnetpie.apple2.memexp.slot.v1";
const LABEL="Memory Expansion Card · 1 MB";
const VALID_SLOTS=[1,2,3,4,6,7];
const ROM_URL=new URL("./roms/341-0344a.bin",import.meta.url);
let CARD_ROM=null;

// The Apple memory expansion card is a ROM-bearing slot card. Load the
// 341-0344A firmware before this module finishes evaluating so ROM03 cannot
// race ahead and scan an empty Cn00 window during startup.
try{
  const response=await fetch(ROM_URL,{cache:"no-store"});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==0x1000)throw new Error(`expected 4096 bytes, got ${bytes.length}`);
  CARD_ROM=bytes;
}catch(error){
  console.error("[Memory Expansion] Unable to load 341-0344A ROM",error);
}

function validSlot(slot){
  slot=Number(slot);
  return VALID_SLOTS.includes(slot)?slot:0;
}

function loadSlot(){
  try{return validSlot(localStorage.getItem(KEY));}
  catch(_){return 0;}
}

function saveSlot(slot){
  slot=validSlot(slot);
  try{
    if(slot)localStorage.setItem(KEY,String(slot));
    else localStorage.removeItem(KEY);
  }catch(_){}
  try{
    const profile=loadMachineProfile();
    for(const n of VALID_SLOTS)if(profile.slots[n]==="memexp")profile.slots[n]="empty";
    if(slot)profile.slots[slot]="memexp";
    saveMachineProfile(profile);
  }catch(_){}
  return slot;
}

function applyCard(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const slot=loadSlot();
  if(!board.memoryExpansionCard)
    board.memoryExpansionCard=new AppleIIMemoryExpansion(board.memory,{slot:slot||1,enabled:!!slot,rom:CARD_ROM});
  board.memoryExpansionCard.setSlot(slot||1);
  board.memoryExpansionCard.setEnabled(!!slot);
  if(CARD_ROM && !board.memoryExpansionCard.rom)board.memoryExpansionCard.setRom(CARD_ROM);

  // Motherboard reset clears SLOTROM before installed devices rebuild their
  // state. Only assert our currently selected slot; do not clear an old slot
  // bit here because another card may own that bit after a configuration
  // change (for example a Mockingboard replacing the memory card in slot 4).
  if(slot && board.memoryExpansionCard.rom)board.memory.slotRom|=(1<<slot);
  board.memoryExpansionSlot=slot;
}

const originalReset=Motherboard.prototype.reset;
if(!Motherboard.prototype.__iigsMemoryExpansion){
  Motherboard.prototype.__iigsMemoryExpansion=true;
  Motherboard.prototype.reset=function(...args){
    const result=originalReset.apply(this,args);
    applyCard(this);
    if(this.memoryExpansionCard?.enabled)this.memoryExpansionCard.reset();
    return result;
  };
}

function installUi(){
  const dialog=document.getElementById("iigsConfigurationDialog");
  if(!dialog)return false;
  const selects=[...dialog.querySelectorAll("select[data-slot]")];
  if(!selects.length)return false;

  for(const select of selects){
    const slot=Number(select.dataset.slot);
    if(slot===5 || select.querySelector('option[value="memexp"]'))continue;
    const option=document.createElement("option");
    option.value="memexp";
    option.textContent=LABEL;
    select.append(option);
  }

  let draftSlot=loadSlot();

  const overlay=()=>{
    dialog.querySelectorAll('select[data-slot]').forEach(select=>{
      if(select.value==="memexp")select.value="empty";
    });
    if(!draftSlot)return;
    const select=dialog.querySelector(`select[data-slot="${draftSlot}"]`);
    if(select)select.value="memexp";
  };

  if(!dialog.dataset.memexpChangeCapture){
    dialog.dataset.memexpChangeCapture="1";
    dialog.addEventListener("change",event=>{
      const select=event.target.closest?.("select[data-slot]");
      if(!select)return;
      if(select.value==="memexp"){
        draftSlot=validSlot(select.dataset.slot);
        dialog.querySelectorAll('select[data-slot]').forEach(other=>{
          if(other!==select && other.value==="memexp")other.value="empty";
        });
        event.stopImmediatePropagation();
        return;
      }
      if(Number(select.dataset.slot)===draftSlot && select.value!=="memexp")draftSlot=0;
      queueMicrotask(overlay);
    },true);
  }

  if(!dialog.dataset.memexpOpenHook){
    dialog.dataset.memexpOpenHook="1";
    dialog.addEventListener("iigs-config-open",()=>{
      draftSlot=loadSlot();
      overlay();
    });
  }

  const save=document.getElementById("iigsConfigSave");
  if(save&&!save.dataset.memexpHook){
    save.dataset.memexpHook="1";
    save.addEventListener("click",()=>{
      saveSlot(draftSlot);
      const selected=[...dialog.querySelectorAll('select[data-slot]')]
        .find(select=>select.value==="memexp");
      if(selected)selected.value="empty";
    },true);
  }

  const defaults=document.getElementById("iigsConfigDefaults");
  if(defaults&&!defaults.dataset.memexpHook){
    defaults.dataset.memexpHook="1";
    defaults.addEventListener("click",()=>{draftSlot=0;saveSlot(0);},true);
  }

  overlay();
  return true;
}

if(!installUi()){
  const observer=new MutationObserver(()=>{if(installUi())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
