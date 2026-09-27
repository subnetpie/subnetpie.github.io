import {IIgsADB} from "./iigs_adb.js";
import {IIgsDOC} from "./iigs_doc.js";
import {IIgsSCC} from "./iigs_scc.js";
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
    this.romBank = false;
    this.intCxRom = false;
    this.clockCtl = 0x00;
    this.intEnable = 0x00;
    this.intFlag = 0x00;
    this.adb = new IIgsADB();
    // IIgs SCC/DOC glue state. Serial transport and DOC synthesis are separate
    // device concerns; these registers provide the machine-visible bus contract.
    this.scc = new IIgsSCC();
    this.doc = new IIgsDOC();
    this.iwmMode = 0; this.iwmQ6 = false; this.iwmQ7 = false; this.iwmMotor = false;
  }

  setTrace(fn) { this.trace = fn; }
  add_read_hook(fn) { if(!this.readHooks.includes(fn)) this.readHooks.push(fn); }
  add_write_hook(fn) { if(!this.writeHooks.includes(fn)) this.writeHooks.push(fn); }

  loadROM(data) {
    const src = data instanceof Uint8Array ? data : new Uint8Array(data);
    if(src.length !== 0x20000 && src.length !== 0x40000)
      throw new Error("IIgs ROM must be 128K or 256K");
    this.rom = new Uint8Array(src);
    // The bank-$00 reset and compatibility vectors map the final ROM bank.
    // Keep the existing language-card RAM switching, replacing only its ROM.
    const last = this.rom.length - 0x10000;
    this.legacy._rom_cd = this.rom.subarray(last + 0xc000, last + 0xe000);
    this.legacy._rom_ef = this.rom.subarray(last + 0xe000, last + 0x10000);
  }

  // IIgs ROM is visible at the top of the 24-bit space. 128K ROM03 maps
  // into $FE/$FF; larger development images may occupy $FC-$FF.
  romRead(addr) {
    if(!this.rom) return undefined;
    const base = 0x1000000 - this.rom.length;
    if(addr >= base) return this.rom[addr - base];
    return undefined;
  }

  readState() {
    const m = this.legacy;
    return (m.aux_zp ? 0x80 : 0) | (m.dms_page2 ? 0x40 : 0) |
      (m.aux_read ? 0x20 : 0) | (m.aux_write ? 0x10 : 0) |
      (m.bsr_read ? 0 : 8) | (m.bsr_bank2 ? 4 : 0) |
      (this.romBank ? 2 : 0) | (this.intCxRom ? 1 : 0);
  }

  writeState(value) {
    const m = this.legacy;
    m.aux_zp = value & 0x80;
    m.aux_read = value & 0x20;
    m.aux_write = value & 0x10;
    m.bsr_read = !(value & 8);
    m.bsr_bank2 = value & 4;
    this.romBank = !!(value & 2);
    // MAME $C068 routes bit 6 through video scr_w(), so PAGE2 changes
    // affect both memory selection and the compatibility renderer.
    const oldPage2=!!m.dms_page2;
    m.dms_page2 = !!(value & 0x40);
    if(oldPage2!==m.dms_page2 && this.video && this.video.legacy &&
       this.video.legacy.refresh) this.video.legacy.refresh();
    this.intCxRom = !!(value & 1);
  }

  setVblFlag() { this.intFlag |= 0x08; }
  setQuarterFlag() { this.intFlag |= 0x10; }

  iwmAccess(addr, value) {
    const op = addr & 15;
    if(op === 8) this.iwmMotor = false;
    if(op === 9) this.iwmMotor = true;
    if(op === 12 || op === 13) this.iwmQ6 = !!(op & 1);
    if(op === 14 || op === 15) this.iwmQ7 = !!(op & 1);
    if(value !== undefined) {
      if(this.iwmQ6 && this.iwmQ7 && !this.iwmMotor) this.iwmMode = value & 31;
      this.legacy.write(addr, value);
      return 0;
    }
    const data = this.legacy.read(addr);
    if(addr & 1) return 0;
    if(this.iwmQ6 && !this.iwmQ7) return this.iwmMode | (this.iwmMotor ? 32 : 0) | ((!this.floppy?._active_disk.medium || this.floppy._active_disk.write_protect) ? 128 : 0);
    if(!this.iwmQ6 && this.iwmQ7) return 0x80; // write handshake ready
    return data;
  }

  read(addr) {
    addr &= 0xffffff;
    const originalBank = addr >>> 16, originalOff = addr & 0xffff;
    // $C035 bit 6 inhibits the bank-$00/$01 I/O and language-card window.
    // Banks $E0/$E1 always retain Mega II I/O/LC decoding.
    const iolcEnabled = !(this.shadow & 0x40);
    if(originalBank === 0xe0 || originalBank === 0xe1 ||
       (iolcEnabled && originalBank === 0x00) ||
       (iolcEnabled && originalBank === 0x01 && originalOff < 0xd000)) {
      if(originalOff >= 0xc000) addr = originalOff;
    }
    if((addr>>>16)===0 && (addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
      const io=addr&0xffff;
      if(io===0xc068) return this.readState();
      if(io===0xc026) return this.adb.readData();
      if(io===0xc027) return this.adb.readStatus();
      if(io===0xc029) return this.video ? this.video.readNewVideo() : 0;
      if(io===0xc02b) return this.langSel;
      if(io===0xc02d) return this.slotRom;
      if(io===0xc031) return this.diskReg;
      if(io===0xc034) return this.clockCtl;
      if(io===0xc035) return this.shadow;
      if(io===0xc036) return this.speed;
      if(io===0xc037) return this.dmaBank;
      if(io>=0xc038 && io<=0xc03b) return this.scc.read(io-0xc038);
      if(io===0xc03c) return this.doc.getControl();
      if(io===0xc03d) return this.doc.readData();
      if(io===0xc03e) return this.doc.addressLow();
      if(io===0xc03f) return this.doc.addressHigh();
      if(io===0xc041) return this.intEnable;
      if(io===0xc046) return this.intFlag;
    }
    if(addr >= 0xc0e0 && addr <= 0xc0ef) return this.iwmAccess(addr);
    // MAME c100_r/c400_r: INTCXROM forces the internal ROM over slot
    // CnXX firmware. Our external slot devices are read hooks, so suppress
    // those hooks across C100-C7FF while the internal-ROM latch is set.
    const lowAddr=addr&0xffff;
    const slotNum=(lowAddr>>>8)&0x0f;
    const slotWindow=(addr>>>16)===0 && lowAddr>=0xc100 && lowAddr<=0xc7ff;
    // MAME c100_r/c400_r: internal ROM wins if INTCXROM is set or the
    // corresponding SLOTROMSEL bit is clear.
    const internalSlotRom=slotWindow &&
      (this.intCxRom || !(this.slotRom & (1<<slotNum)));
    if(!internalSlotRom) {
      for(const fn of this.readHooks) {
        const v=fn(addr);
        if(v !== undefined) return v & 0xff;
      }
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
      // MAME 0.289 apple2gs_map: $01:0000-$BFFF is fast-side bank-1
      // motherboard RAM. Shadowing to slow $E1 is handled on writes.
      v=this.ram[addr];
    } else if(bank===0x01 && off>=0xd000 && !(this.shadow&0x40)) {
      // Bank $01 has an independent fast-side language card.
      if(!this.legacy.bsr_read && this.rom) {
        v=this.romRead(0xff0000|off);
      } else if(off<0xe000) {
        v=this.ram[0x010000 | (this.legacy.bsr_bank2 ? 0xc000 : 0xd000) | (off&0x0fff)];
      } else {
        v=this.ram[0x010000 | off];
      }
    } else if(bank===0x01 && off>=0xc000 && (this.shadow&0x40)) {
      // MAME bank1_c000_r: with IOLC inhibited, bank-1 C000-FFFF is
      // fast RAM with the hardware E000-FFFF address transform.
      let lcOff=off-0xc000;
      if(lcOff&0x2000) lcOff^=0x1000;
      v=this.ram[0x01c000+lcOff];
    } else if(bank===0x00 && off>=0xc000 && (this.shadow&0x40)) {
      // MAME bank0_c000_r: IOLC-inhibited bank 0 uses the same E000-FFFF
      // transform, with RAMRD selecting bank-1 (aux) versus bank-0 backing.
      let lcOff=off-0xc000;
      if(lcOff&0x2000) lcOff^=0x1000;
      v=this.ram[(this.legacy.aux_read ? 0x01c000 : 0x00c000)+lcOff];
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
    const originalBank = addr >>> 16, originalOff = addr & 0xffff;
    const iolcEnabled = !(this.shadow & 0x40);
    if(originalBank===0xe0 || originalBank===0xe1 ||
       (iolcEnabled && originalBank===0x00) ||
       (iolcEnabled && originalBank===0x01 && originalOff<0xd000)) {
      if(originalOff>=0xc000) addr=originalOff;
    }
    if((addr>>>16)===0 && (addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
      const io=addr&0xffff;
      // IIgs FPI compatibility soft switches (MAME c000_w).
      if(io===0xc000){this.legacy.dms_80store=false;return;}
      if(io===0xc001){this.legacy.dms_80store=true;return;}
      if(io===0xc002){this.legacy.aux_read=false;return;}
      if(io===0xc003){this.legacy.aux_read=true;return;}
      if(io===0xc004){this.legacy.aux_write=false;return;}
      if(io===0xc005){this.legacy.aux_write=true;return;}
      if(io===0xc006){this.intCxRom=false;return;}
      if(io===0xc007){this.intCxRom=true;return;}
      if(io===0xc068){this.writeState(val);return;}
      if(io===0xc026){this.adb.writeData(val);return;}
      if(io===0xc027){this.adb.writeStatus(val);return;}
      if(io===0xc029){if(this.video)this.video.writeNewVideo(val&0xe1);return;}
      if(io===0xc02b){this.langSel=val&0xf8;return;}
      if(io===0xc02d){this.slotRom=val&0xf6;return;}
      if(io===0xc031){this.diskReg=val&0xc0;return;}
      if(io===0xc034){this.clockCtl=val&0x7f;return;}
      if(io===0xc035){this.shadow=val;return;}
      if(io===0xc036){this.speed=val;return;}
      if(io===0xc037){this.dmaBank=val;return;}
      if(io>=0xc038 && io<=0xc03b){this.scc.write(io-0xc038,val);return;}
      if(io===0xc03c){this.doc.setControl(val);return;}
      if(io===0xc03d){this.doc.writeData(val);return;}
      if(io===0xc03e){this.doc.setAddressLow(val);return;}
      if(io===0xc03f){this.doc.setAddressHigh(val);return;}
      if(io===0xc041){this.intEnable=val&0x1f;return;}
      if(io===0xc047){this.intFlag&=~0x18;return;}
    }
    if(addr >= 0xc0e0 && addr <= 0xc0ef) {this.iwmAccess(addr,val);return;}
    const lowAddr=addr&0xffff;
    const slotNum=(lowAddr>>>8)&0x0f;
    const slotWindow=(addr>>>16)===0 && lowAddr>=0xc100 && lowAddr<=0xc7ff;
    const internalSlotRom=slotWindow &&
      (this.intCxRom || !(this.slotRom & (1<<slotNum)));
    if(!internalSlotRom) {
      for(const fn of this.writeHooks) {
        const r=fn(addr,val);
        if(r !== undefined) return;
      }
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
      else if(off>=0x0800 && off<0x0c00 && !(this.shadow&0x20)) this.slowE0[off]=val;
      else if(off>=0x2000 && off<0x4000 && !(this.shadow&0x02)) this.slowE0[off]=val;
      else if(off>=0x4000 && off<0x6000 && !(this.shadow&0x04)) this.slowE0[off]=val;
    } else if(bank===0x01 && off>=0xd000 && !(this.shadow&0x40)) {
      // MAME lc_01_w: bank-1 LC writes use private fast RAM and honor
      // the shared LC write-enable latch.
      if(this.legacy.bsr_write) {
        if(off<0xe000)
          this.ram[0x010000 | (this.legacy.bsr_bank2 ? 0xc000 : 0xd000) | (off&0x0fff)]=val;
        else
          this.ram[0x010000 | off]=val;
      }
    } else if(bank===0x01 && off>=0xc000 && (this.shadow&0x40)) {
      // MAME bank1_c000_w: same transformed backing as reads.
      let lcOff=off-0xc000;
      if(lcOff&0x2000) lcOff^=0x1000;
      this.ram[0x01c000+lcOff]=val;
    } else if(bank===0x00 && off>=0xc000 && (this.shadow&0x40)) {
      // MAME bank0_c000_w: RAMWRT independently selects aux/main backing.
      let lcOff=off-0xc000;
      if(lcOff&0x2000) lcOff^=0x1000;
      this.ram[(this.legacy.aux_write ? 0x01c000 : 0x00c000)+lcOff]=val;
    } else if(bank===0x01 && off<0xc000) {
      this.ram[addr]=val;
      const textPage2Shadow = off>=0x0800 && off<0x0c00 && !(this.shadow & 0x20);
      const shrShadow = !(this.shadow & 0x08);
      const hiresPage1Shadow = off>=0x2000 && off<0x4000 &&
        !(this.shadow & 0x02) && !(this.shadow & 0x10);
      const hiresPage2Shadow = off>=0x4000 && off<0x6000 &&
        !(this.shadow & 0x04) && !(this.shadow & 0x10);
      if(textPage2Shadow || (off>=0x2000 && off<0xa000 &&
         (shrShadow || hiresPage1Shadow || hiresPage2Shadow))) {
        this.slowE1[off]=val;
        if(this.video) this.video.dirty=true;
      }
    } else if(addr < this.ram.length) {
      this.ram[addr]=val;
      // SPEED bit 4 extends the selected display shadow ranges to every
      // fast RAM bank. Even banks shadow to $E0, odd banks to $E1.
      if((this.speed & 0x10) && bank<=0x7f) {
        const slow = (bank & 1) ? this.slowE1 : this.slowE0;
        const text1 = off>=0x0400 && off<0x0800 && !(this.shadow&0x01);
        const text2 = off>=0x0800 && off<0x0c00 && !(this.shadow&0x20);
        const hires1 = off>=0x2000 && off<0x4000 && !(this.shadow&0x02) &&
          (!(bank&1) ? true : !(this.shadow&0x10));
        const hires2 = off>=0x4000 && off<0x6000 && !(this.shadow&0x04) &&
          (!(bank&1) ? true : !(this.shadow&0x10));
        const shr = (bank&1) && off>=0x2000 && off<0xa000 && !(this.shadow&0x08);
        if(text1 || text2 || hires1 || hires2 || shr) {
          slow[off]=val;
          if((bank&1) && this.video) this.video.dirty=true;
        }
      }
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
    if(cold) {
      this.ram.fill(0); this.slowE0.fill(0); this.slowE1.fill(0);
      this.legacy.reset();
    }
    const m = this.legacy;
    m.aux_zp = m.aux_read = m.aux_write = false;
    m.dms_80store = m.dms_page2 = m.dms_hires = false;
    // MAME machine_reset calls scr_w(0): keep the compatibility renderer in
    // sync with the PAGE2 latch instead of only resetting memory selection.
    if(this.video && this.video.legacy && this.video.legacy.refresh)
      this.video.legacy.refresh();
    m.bsr_read = false; m.bsr_bank2 = true; m.bsr_write = true;
    this.shadow = 0; this.speed = 0x80; this.dmaBank = 0;
    this.slotRom = 0; this.langSel = 0; this.diskReg = 0;
    this.clockCtl = 0; this.intEnable = 0; this.intFlag = 0;
    this.romBank = false; this.intCxRom = false;
    this.scc.reset(); this.doc.reset();
    this.adb.reset();
    this.iwmMode = 0; this.iwmQ6 = this.iwmQ7 = this.iwmMotor = false;
  }
}
