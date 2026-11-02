import {ProDOSBlockDevice,blockDeviceCore} from './prodos_block.js?v=20261102-35boot1';

// Give the two physical 800K drives a Slot-5 block firmware entry. The IWM
// and block driver share the same media bytes; no hard-disk slot is reused.
export class Floppy35BlockDevice extends ProDOSBlockDevice {
  constructor(memory,floppies) {
    super(5,memory);
    this.floppies=floppies;
    this.bootDrive=0;
    this.drives=floppies.map(floppy=>({
      changed:false,lastMedia:null,
      get image(){return floppy.media?.data??null;},
      get name(){return floppy.media?.name??'';},
      get blockCount(){return (floppy.media?.data.length??0)>>>9;},
      get writeProtected(){return floppy.writeProtected;},
      get physical(){return '35';},
      get persistenceKey(){return floppy.media?.persistenceKey;},
      get dirty(){return !!floppy.media?.dirty;},
      set dirty(value){if(floppy.media)floppy.media.dirty=value;}
    }));
    Object.defineProperty(this,'enabled',{get:()=>this.present||this.drives.some(d=>d.image)});
  }
  buildRom(){
    blockDeviceCore.buildRom.call(this);
    this.bootRom=this.rom.slice();
    this.bootRom.set([0x4c,0x00,0xc5],8);
  }
  // ROM03's empty Slot-6 fallback polls forever before reaching Slot 5.
  // While the hard-disk card is empty, forward its initial boot entry to
  // Slot 5. Retire the forwarding signature as soon as block 0 is loaded.
  bootFallback(addr){return this.bootPending&&this.drives.some(d=>d.image)?this.bootRom[addr&255]:undefined;}
  read(addr){
    if(!(addr>=this.romBase&&addr<this.romBase+256) && !(addr>=this.ioBase&&addr<=this.ioBase+6))return undefined;
    this.syncMedia();
    if(!this.enabled)return undefined;
    return blockDeviceCore.read.call(this,addr);
  }
  write(addr,value){
    if(addr<this.ioBase||addr>this.ioBase+6)return undefined;
    this.syncMedia();return this.enabled?blockDeviceCore.write.call(this,addr,value):undefined;
  }
  syncMedia(){
    for(let i=0;i<this.drives.length;i++) {
      const disk=this.drives[i],media=this.floppies[i].media;
      if(disk.lastMedia!==media){disk.changed=true;disk.lastMedia=media;}
    }
    if(this.drives.some(d=>d.image))this.present=true;
  }
  execute(){
    this.syncMedia();
    const result=blockDeviceCore.execute.call(this);
    if(result===0 && this.memory.read(0x42)===1)this.bootPending=false;
    return result;
  }
  executeSmartPort(){this.syncMedia();return blockDeviceCore.executeSmartPort.call(this);}
  notifyWrite(drive,disk,block){
    const floppy=this.floppies[drive];
    floppy.trackByteCache=new Array(160);floppy.trackCellCache=new Array(160);
    super.notifyWrite(drive,disk,block);
  }
  selectBoot(drive){this.bootDrive=drive===1?1:0;this.buildRom();}
  reset(){
    this.syncMedia();
    for(const disk of this.drives)disk.changed=false;
    this.present=this.drives.some(d=>d.image);
    this.bootPending=this.enabled;
    this.buildRom();
    if(this.enabled)this.memory.slotRom|=1<<5;
    else this.memory.slotRom&=~(1<<5);
  }
}
