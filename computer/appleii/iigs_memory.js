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
    this.readHooks = [];
    this.writeHooks = [];
    this.trace = null;
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
        v=this.ram[((bank-0xe0)<<16)|off];
    } else if(bank===0x00 && off>=0xc000 && off<=0xcfff) {
      // Mega II I/O lives in bank 00. IOManager is installed as a 24-bit hook;
      // fall back to legacy memory for slot/ROM behavior.
      v=this.legacy.read(off);
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
    for(const fn of this.writeHooks) {
      const r=fn(addr,val);
      if(r !== undefined) return;
    }

    const bank=addr>>>16, off=addr&0xffff;
    if(bank===0xe0 || bank===0xe1) {
      if(bank===0xe1 && off>=0x2000 && off<0xa000 && this.video)
        this.video.writeBankE1(off,val);
      else
        this.ram[((bank-0xe0)<<16)|off]=val;
    } else if(bank===0x00 && off>=0xc000 && off<=0xcfff) {
      this.legacy.write(off,val);
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
    if(cold) this.ram.fill(0);
  }
}
