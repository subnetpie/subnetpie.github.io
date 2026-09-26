// Apple IIgs 24-bit memory/bus.
//
// This is deliberately separate from memory.js: the IIe keeps its exact
// 16-bit Mega II memory implementation while the IIgs CPU sees a real
// 24-bit address space. Banks $E0/$E1 are the slow/Mega II banks. SHR is
// physically linear in $E1:2000-$9FFF.

export class IIgsMemory {
  constructor(legacyMemory, video, ramBytes = 0x200000) {
    this.legacy = legacyMemory;
    this.video = video;
    this.ram = new Uint8Array(Math.max(0x20000, Math.min(ramBytes, 0x800000)));
    this.rom = null;
    this.slowE0 = new Uint8Array(0x10000);
    this.slowE1 = new Uint8Array(0x10000);
    if(this.video) this.video.attachBankE1(this.slowE1);
    this.readHooks = [];
    this.writeHooks = [];
    this.trace = null;
    this.shadow = 0x00;
    this.speed = 0x80;
    this.dmaBank = 0x00;
    this.slotRom = 0x00;
    this.langSel = 0x00;
    this.diskReg = 0x00;
    this.clockCtl = 0x00;
  }

  setTrace(fn) { this.trace = fn; }
  add_read_hook(fn) { if(!this.readHooks.includes(fn)) this.readHooks.push(fn); }
  add_write_hook(fn) { if(!this.writeHooks.includes(fn)) this.writeHooks.push(fn); }

  loadROM(data) {
    const src = data instanceof Uint8Array ? data : new Uint8Array(data);
    if(src.length !== 0x20000 && src.length !== 0x40000)
      throw new Error("IIgs ROM must be 128K or 256K");
    this.rom = new Uint8Array(src);
  }

  // IIgs ROM is visible at the top of the 24-bit space. 128K ROM03 maps
  // into $FE/$FF; larger development images may occupy $FC-$FF.
  romRead(addr) {
    if(!this.rom) return undefined;
    const base = 0x1000000 - this.rom.length;
    if(addr >= base) return this.rom[addr - base];
    return undefined;
  }

  read(addr) {
    addr &= 0xffffff;
    if((addr>>>16)===0 && (addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
      const io=addr&0xffff;
      if(io===0xc02b) return this.langSel;
      if(io===0xc02d) return this.slotRom;
      if(io===0xc031) return this.diskReg;
      if(io===0xc034) return this.clockCtl;
      if(io===0xc035) return this.shadow;
      if(io===0xc036) return this.speed;
      if(io===0xc037) return this.dmaBank;
    }
    for(const fn of this.readHooks) {
      const v=fn(addr);
      if(v !== undefined) return v & 0xff;
    }

    const rv=this.romRead(addr);
    if(rv !== undefined) return rv;

    const bank=addr>>>16, off=addr&0xffff;
    let v;
    if(bank===0xe0 || bank===0xe1) {
      // Slow RAM banks. $E1 SHR storage is shared directly with the VGC.
      if(bank===0xe1 && off>=0x2000 && off<0xa000 && this.video)
        v=this.video.readBankE1(off);
      else
        v=(bank===0xe0 ? this.slowE0 : this.slowE1)[off];
    } else if(bank===0x00) {
      // Bank $00 is the Mega II compatibility window. The IIgs ROM mirrors
      // into $D000-$FFFF while the language-card RAM read switch is off.
      // Leave all other reads (including RAM-selected reads) to Mega II.
      if(off>=0xd000 && this.rom && !this.legacy.bsr_read)
        v=this.romRead(0xff0000|off);
      else
        v=this.legacy.read(off);
    } else if(bank===0x01 && off<0xc000) {
      // Bank $01 exposes the auxiliary 64K used by Mega II double/80-column modes.
      v=this.legacy._aux[off];
    } else if(addr < this.ram.length) {
      v=this.ram[addr];
    } else {
      v=0xff;
    }
    if(this.trace) this.trace("R",addr,v);
    return v;
  }

  write(addr,val) {
    addr &= 0xffffff; val &= 0xff;
    if((addr>>>16)===0 && (addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
      const io=addr&0xffff;
      if(io===0xc02b){this.langSel=val;return;}
      if(io===0xc02d){this.slotRom=val;return;}
      if(io===0xc031){this.diskReg=val;return;}
      if(io===0xc034){this.clockCtl=val;return;}
      if(io===0xc035){this.shadow=val;return;}
      if(io===0xc036){this.speed=val&0x9f;return;}
      if(io===0xc037){this.dmaBank=val;return;}
    }
    for(const fn of this.writeHooks) {
      const r=fn(addr,val);
      if(r !== undefined) return;
    }

    const bank=addr>>>16, off=addr&0xffff;
    if(bank===0xe0 || bank===0xe1) {
      if(bank===0xe1 && off>=0x2000 && off<0xa000 && this.video)
        this.video.writeBankE1(off,val);
      else
        (bank===0xe0 ? this.slowE0 : this.slowE1)[off]=val;
    } else if(bank===0x00) {
      this.legacy.write(off,val);
      // IIgs display shadowing: classic display writes in bank $00 are copied
      // to the corresponding slow-memory bank unless inhibited by $C035.
      if(off>=0x0400 && off<0x0800 && !(this.shadow&0x01)) this.slowE0[off]=val;
      else if(off>=0x2000 && off<0x4000 && !(this.shadow&0x02)) this.slowE0[off]=val;
      else if(off>=0x4000 && off<0x6000 && !(this.shadow&0x04)) this.slowE0[off]=val;
    } else if(bank===0x01 && off<0xc000) {
      this.legacy._aux[off]=val;
      if(off>=0x2000 && off<0xa000 && !(this.shadow&0x08)) {
        this.slowE1[off]=val;
        if(this.video) this.video.dirty=true;
      }
    } else if(addr < this.ram.length) {
      this.ram[addr]=val;
    }
    if(this.trace) this.trace("W",addr,val);
  }

  read_word(addr) {
    return this.read(addr) | (this.read((addr+1)&0xffffff)<<8);
  }
  read_long(addr) {
    return this.read_word(addr) | (this.read((addr+2)&0xffffff)<<16);
  }
  reset(cold=false) {
    if(cold) { this.ram.fill(0); this.slowE0.fill(0); this.slowE1.fill(0); }
  }
}
