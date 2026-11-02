import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261019-storage2";
import {ProDOSBlockDevice} from "./prodos_block.js?v=20261019-storage2";
import {loadIIgsConfiguration} from "./iigs_configuration.js?v=20261019-storage2";

// iigs_configuration.js makes the SmartPort ROM slot-relocatable, but its
// historical buildRom copy still used JSR Cn80 for the initial ROM03 boot.
// ROM03 can enter a slot ROM with a stack state that is not safe for that JSR;
// prodos_block.js therefore switched boot to an inline hardware request. Keep
// the configurable-slot behavior while preserving that ROM03-safe boot path.
function installRom03SafeSmartPortBoot(){
  const p=ProDOSBlockDevice.prototype;
  if(p.__rom03SafeConfigurableBoot)return;
  p.__rom03SafeConfigurableBoot=true;

  p.buildRom=function(){
    const slot=this.slot&7;
    this.romBase=0xc000|(slot<<8);
    this.ioBase=0xc080|(slot<<4);
    const io=this.ioBase&0xffff,lo=io&255,hi=io>>>8;
    this.rom.fill(0xea);
    // Match the corrected ProDOS card signature used by the base device.
    // ROM03's slot scan expects the final identification byte at Cn07 to be $3C.
    this.rom.set([0x24,0x20,0x24,0x00,0x24,0x03,0x24,0x3c],0x00);

    // Boot block 0 directly through the card hardware window. Clear the Apple
    // II compatibility RAM selectors first so $0800 is bank-0 main memory,
    // matching the corrected base ProDOSBlockDevice implementation.
    this.rom.set([
      0xa9,0x00,
      0x8d,0x08,0xc0,
      0x8d,0x02,0xc0,
      0x8d,0x04,0xc0,
      0xa9,0x01,0x85,0x42,
      0xa9,slot<<4,0x85,0x43,
      0xa9,0x00,0x85,0x44,
      0xa9,0x08,0x85,0x45,
      0xa9,0x00,0x85,0x46,0x85,0x47,
      0xad,lo,hi,
      0xd0,0x07,
      0xa2,slot<<4,
      0x86,0x43,
      0x4c,0x01,0x08,
      0x60
    ],0x08);

    // ProDOS driver at Cn80.
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

    // Standard/extended SmartPort entry.
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
}
installRom03SafeSmartPortBoot();

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
