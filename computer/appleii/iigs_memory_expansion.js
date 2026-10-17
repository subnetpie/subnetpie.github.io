import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {AppleIIMemoryExpansion} from "./memory_expansion.js?v=20261017-memexp1";
import {loadMachineProfile,saveMachineProfile} from "./machine_profile.js?v=20261017-memexp1";

const KEY="subnetpie.apple2.memexp.slot.v1";
const LABEL="Memory Expansion Card · 1 MB";

function loadSlot(){
  try{
    const n=Number(localStorage.getItem(KEY));
    return [1,2,3,4,6,7].includes(n)?n:0;
  }catch(_){return 0;}
}

function saveSlot(slot){
  slot=[1,2,3,4,6,7].includes(slot)?slot:0;
  try{
    if(slot)localStorage.setItem(KEY,String(slot));
    else localStorage.removeItem(KEY);
  }catch(_){}
  try{
    const profile=loadMachineProfile();
    for(const n of [1,2,3,4,6,7])if(profile.slots[n]==="memexp")profile.slots[n]="empty";
    if(slot)profile.slots[slot]="memexp";
    saveMachineProfile(profile);
  }catch(_){}
  return slot;
}

function applyCard(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const slot=loadSlot();
  if(!board.memoryExpansionCard)
    board.memoryExpansionCard=new AppleIIMemoryExpansion(board.memory,{slot:slot||1,enabled:!!slot});
  board.memoryExpansionCard.setSlot(slot||1);
  board.memoryExpansionCard.setEnabled(!!slot);
  if(slot){
    // Selecting a physical external card corresponds to "Your Card" for
    // ROM03's slot-ROM selection latch. The C0nX register interface remains
    // available regardless of whether the optional 341-0344A ROM is present.
    board.memory.slotRom|=(1<<slot);
  }
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

  const overlay=()=>{
    const slot=loadSlot();
    if(!slot)return;
    const select=dialog.querySelector(`select[data-slot="${slot}"]`);
    if(select)select.value="memexp";
  };

  dialog.addEventListener("change",event=>{
    const select=event.target.closest?.("select[data-slot]");
    if(!select || select.value!=="memexp")return;
    dialog.querySelectorAll('select[data-slot]').forEach(other=>{
      if(other!==select && other.value==="memexp")other.value="empty";
    });
  });

  const save=document.getElementById("iigsConfigSave");
  if(save&&!save.dataset.memexpHook){
    save.dataset.memexpHook="1";
    save.addEventListener("click",()=>{
      const selected=[...dialog.querySelectorAll('select[data-slot]')]
        .find(select=>select.value==="memexp");
      const slot=saveSlot(selected?Number(selected.dataset.slot):0);
      // The legacy configuration module predates memexp and normalizes unknown
      // values to Empty. Feed it Empty while persisting the real card choice
      // separately; this keeps its SmartPort/Disk II uniqueness rules intact.
      if(selected)selected.value="empty";
      if(slot)queueMicrotask(()=>saveSlot(slot));
    },true);
  }

  const defaults=document.getElementById("iigsConfigDefaults");
  if(defaults&&!defaults.dataset.memexpHook){
    defaults.dataset.memexpHook="1";
    defaults.addEventListener("click",()=>saveSlot(0),true);
  }

  const button=document.getElementById("buttonIIgsConfiguration");
  if(button&&!button.dataset.memexpHook){
    button.dataset.memexpHook="1";
    button.addEventListener("click",()=>{queueMicrotask(overlay);setTimeout(overlay,0);},true);
  }
  overlay();
  return true;
}

if(!installUi()){
  const observer=new MutationObserver(()=>{if(installUi())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
