import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {AppleIIMemoryExpansion} from "./memory_expansion.js?v=20261017-c800-latch1";
import {loadIIgsConfiguration} from "./iigs_configuration.js?v=20261017-memexp-config1";

const ROM_URL=new URL("./roms/341-0344a.bin",import.meta.url);
let CARD_ROM=null;

// The Apple Memory Expansion Card carries a 4 KiB firmware ROM. Load it
// before this module finishes evaluating so the selected slot is complete
// before ROM03 begins executing.
try{
  const response=await fetch(ROM_URL,{cache:"no-store"});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==0x1000)throw new Error(`expected 4096 bytes, got ${bytes.length}`);
  CARD_ROM=bytes;
}catch(error){
  console.error("[Memory Expansion] Unable to load 341-0344A ROM",error);
}

function configuredSlot(){
  const config=loadIIgsConfiguration();
  for(const slot of [7,6,4,3,2,1])if(config.slots?.[slot]==="memexp")return slot;
  return 0;
}

function applyCard(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const slot=configuredSlot();
  if(!board.memoryExpansionCard)
    board.memoryExpansionCard=new AppleIIMemoryExpansion(board.memory,{slot:slot||1,enabled:!!slot,rom:CARD_ROM});
  board.memoryExpansionCard.setSlot(slot||1);
  board.memoryExpansionCard.setEnabled(!!slot);
  if(CARD_ROM && !board.memoryExpansionCard.rom)board.memoryExpansionCard.setRom(CARD_ROM);
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
