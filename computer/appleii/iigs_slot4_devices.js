import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261004-mb-complete1";
import {Mockingboard} from "https://subnetpie.github.io/computer/appleii/mockingboard.js?v=20261005-mame0289-sc01a1";
import "./iigs_memory_expansion.js?v=20261017-memexp-config1";

import {loadIIgsConfiguration} from "./iigs_configuration.js?v=20261017-memexp-config1";

function loadMode(){
  const value=loadIIgsConfiguration().slots[4];
  return value==="mouse" || value==="mockingboard" ? value : "none";
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

function installLegacyMockingboardIrqVector(board){
  if(!board?.iigsEnabled || !board.memory?.read_vector ||
     board.memory.__legacyMockingboardIrqVector)return;

  const readIIgsVector=board.memory.read_vector.bind(board.memory);
  board.memory.__legacyMockingboardIrqVector=true;
  board.memory.read_vector=function(addr){
    if((addr&0xffff)===0xfffe &&
       board.iigsSlot4Device==="mockingboard" &&
       board.iigsIrq?.mockingboard &&
       board.cpu?.register?.e)
      return this.read_word(addr&0xffff);
    return readIIgsVector(addr);
  };
}

function applySlot4(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const mode=loadMode();
  board.iigsSlot4Device=mode;

  if(mode==="mockingboard") board.memory.slotRom|=0x10;
  else board.memory.slotRom&=~0x10;

  if(board.mockingboard)board.mockingboard.selected=()=>board.iigsSlot4Device==="mockingboard";
  installLegacyMockingboardIrqVector(board);
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
