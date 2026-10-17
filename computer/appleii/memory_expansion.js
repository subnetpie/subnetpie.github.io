// Apple II Memory Expansion Card, matching MAME 0.289 a2memexp.cpp.
//
// The card exposes C0n0-C0nF registers, a slot-specific CnXX firmware page,
// and a C800-CFFF expansion ROM that is claimed only after this card's CnXX
// page is selected. The Apple card provides 1 MB of RAM.
export class AppleIIMemoryExpansion {
  constructor(memory,{slot=1,enabled=true,rom=null}={}) {
    this.memory=memory;
    this.slot=slot&7;
    this.enabled=!!enabled;
    this.regs=new Uint8Array(16);
    this.ram=new Uint8Array(1024*1024); this.ram.fill(0xff);
    this.addrMask=0xfffff;
    this.bankHiOr=0xf0;
    this.wptr=0;
    this.liveptr=0;
    this.c800Active=false;
    this.rom=null;
    if(rom)this.setRom(rom);
    this.readHook=this.read.bind(this);
    this.writeHook=this.write.bind(this);
    memory.add_read_hook(this.readHook);
    memory.add_write_hook(this.writeHook);
  }

  setEnabled(enabled){
    this.enabled=!!enabled;
    if(!this.enabled)this.c800Active=false;
  }
  setSlot(slot){
    this.slot=Math.max(1,Math.min(7,slot|0));
    this.c800Active=false;
  }
  setRom(data){
    const src=data instanceof Uint8Array?data:new Uint8Array(data);
    if(src.length!==0x1000)throw new Error('Apple II Memory Expansion ROM must be 4096 bytes');
    this.rom=new Uint8Array(src);
  }

  reset(){
    this.regs.fill(0);
    this.wptr=0;
    this.liveptr=0;
    this.c800Active=false;
  }

  updatePointerRegisters(){
    this.regs[0]=this.liveptr&0xff;
    this.regs[1]=(this.liveptr>>>8)&0xff;
    this.regs[2]=((this.liveptr>>>16)&0xff)|this.bankHiOr;
  }

  c0Base(){return 0xc080|(this.slot<<4);}
  cnBase(){return 0xc000|(this.slot<<8);}

  // IIgs compatibility: installed hooks run before the normal CnXX decoder,
  // so honor the IIgs internal/external slot-ROM selectors here rather than
  // allowing the card to override internal ROM unconditionally.
  slotRomVisible(){
    if(typeof this.memory?.intCxRom!=='boolean')return true;
    if(this.memory.intCxRom)return false;
    if(typeof this.memory.slotRom!=='number')return true;
    return !!(this.memory.slotRom&(1<<this.slot));
  }

  read(addr){
    if(!this.enabled)return undefined;
    const low=addr&0xffff;
    const base=this.c0Base();
    if(low>=base && low<=base+0x0f){
      const off=low&0x0f;
      if(off===3){
        const value=this.ram[this.liveptr&this.addrMask];
        this.liveptr=(this.liveptr+1)&0xffffff;
        this.updatePointerRegisters();
        return value;
      }
      return this.regs[off];
    }
    if(this.rom){
      const cn=this.cnBase();
      if(low>=cn && low<=cn+0xff && this.slotRomVisible()){
        this.c800Active=true;
        const slotImage=(this.slot&7)*0x100;
        return this.rom[slotImage+(low&0xff)];
      }
      if(low>=0xc800 && low<=0xcfff && this.c800Active){
        const value=this.rom[0x800+(low-0xc800)];
        // Apple II bus C800 ownership is released by an access to CFFF.
        if(low===0xcfff)this.c800Active=false;
        return value;
      }
    }
    return undefined;
  }

  write(addr,data){
    if(!this.enabled)return undefined;
    const low=addr&0xffff, base=this.c0Base();
    if(low<base || low>base+0x0f)return undefined;
    const off=low&0x0f, value=data&0xff;
    switch(off){
      case 0:
        this.wptr=(this.wptr&~0xff)|value;
        this.liveptr=this.wptr;
        this.updatePointerRegisters();
        break;
      case 1:
        this.wptr=(this.wptr&~0xff00)|(value<<8);
        this.liveptr=this.wptr;
        this.updatePointerRegisters();
        break;
      case 2:
        this.wptr=(this.wptr&~0xff0000)|(value<<16);
        this.liveptr=this.wptr;
        this.updatePointerRegisters();
        break;
      case 3:
        this.ram[this.liveptr&this.addrMask]=value;
        this.liveptr=(this.liveptr+1)&0xffffff;
        this.updatePointerRegisters();
        break;
      default:
        this.regs[off]=value;
        break;
    }
    return 0;
  }
}
