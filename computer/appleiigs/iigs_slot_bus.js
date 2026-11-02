import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261017-nox128k1";
import {ProDOSBlockDevice} from "./prodos_block.js?v=20260930-persist1";
import {loadIIgsConfiguration} from "./iigs_configuration.js?v=20261017-slotbus1";

// MAME 0.289 keeps SLOTROMSEL/SLOTC3ROM and the C800 owner in machine state,
// not in the individual cards. This module is the single IIgs policy point
// that seeds configured external slots after a machine reset.
function diskIIMounted(board){
  return !!board?.floppy525?._disks?.some?.(disk=>disk?.medium);
}

function externalVisible(board,device){
  if(device==="memexp")return !!board.memoryExpansionCard?.rom;
  if(device==="mockingboard")return true;
  if(device==="disk2")return diskIIMounted(board);
  if(device==="smartport")return !!board.prodosBlock?.enabled;
  return false;
}

export function applyIIgsSlotBusPolicy(board){
  if(!board?.iigsEnabled || !board.memory)return;
  const config=loadIIgsConfiguration();
  let mask=0;
  let slot3=false;

  for(const slot of [1,2,3,4,6,7]){
    const device=config.slots?.[slot]||"empty";
    if(!externalVisible(board,device))continue;
    if(slot===3)slot3=true;
    else mask|=1<<slot;
  }

  // SLOTROMSEL is physically masked to $F6 in MAME; slot 3 is separate.
  board.memory.slotRom=mask&0xf6;
  board.memory.slotC3Rom=slot3;
  board.memory._a2C800Owner=null;
  board.iigsConfiguredSlotRomMask=board.memory.slotRom;
}

// ProDOSBlockDevice historically reasserted SLOTROMSEL from inside reset.
// Preserve its media/change state behavior but keep machine registers owned by
// the IIgs bus policy. This compatibility wrapper can disappear once the base
// block device is made machine-agnostic.
if(!ProDOSBlockDevice.prototype.__mameMachineOwnedSlotRom){
  ProDOSBlockDevice.prototype.__mameMachineOwnedSlotRom=true;
  const reset=ProDOSBlockDevice.prototype.reset;
  ProDOSBlockDevice.prototype.reset=function(...args){
    const memory=this.memory;
    const slotRom=memory?.slotRom;
    const slotC3Rom=memory?.slotC3Rom;
    const result=reset.apply(this,args);
    if(typeof slotRom==="number")memory.slotRom=slotRom;
    if(typeof slotC3Rom==="boolean")memory.slotC3Rom=slotC3Rom;
    return result;
  };
}

const originalReset=Motherboard.prototype.reset;
if(!Motherboard.prototype.__iigsSlotBusPolicy){
  Motherboard.prototype.__iigsSlotBusPolicy=true;
  Motherboard.prototype.reset=function(...args){
    const result=originalReset.apply(this,args);
    applyIIgsSlotBusPolicy(this);
    return result;
  };
}
