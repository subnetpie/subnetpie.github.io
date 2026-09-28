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
    this.motherboardRam = 0x100000;
    const expansion = Math.max(0, this.ram.length - this.motherboardRam);
    this.ghostMask = expansion ? (2 ** Math.ceil(Math.log2(expansion)) - 1) : 0;
    this.ghostStart = expansion ? this.motherboardRam + this.ghostMask + 1 : 0x800000;
    this.rom = null;
    // Mega II displays and the slow bus must share the same video RAM.
    // Fast bank 00/01 RAM remains independent in this.ram.
    this.slowE0 = legacyMemory._main;
    this.slowE1 = legacyMemory._aux;
    if(this.video) this.video.attachBankE1(this.slowE1);
    this.readHooks = [];
    this.writeHooks = [];
    this.trace = null;
    this.shadow = 0x00;
    this.speed = 0x80;
    this.slotRom = 0x00;
    this.langSel = 0x00;
    this.diskReg = 0x00;
    this.romBank = false;
    this.intCxRom = false;
    this.slotC3Rom = false;
    this.intC8Rom = false;
    this.clockCtl = 0x00;
    this.clockData = 0x00;
    this.rtc = {ce:1,clk:0,data:0,out:0,dir:0,byte:0,bits:0,state:0,cmd:0,xpaddr:0,writeProtect:false,pram:new Uint8Array(256),seconds:new Uint8Array(4)};
    this.intEnable = 0x00;
    this.intFlag = 0x00;
    this.irq = null;
    this.vblIrq = false;
    this.quarterIrq = false;
    this.externalIrq = {vgc:false, doc:false, scc:false, adb:false};
    this.adb = new IIgsADB(state => this.setExternalIrq("adb",state));
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

  // MAME ROM03 installs the 256K firmware at $FC0000-$FFFFFF.
  // The ROM03 chip pair is assembled into a 256K image by the loader.
  romRead(addr) {
    if(!this.rom) return undefined;
    const base = 0xfc0000;
    if(addr >= base && addr < base + this.rom.length) return this.rom[addr - base];
    return undefined;
  }

  rtcByte(data) {
    const r=this.rtc;
    if(r.state===1) {
      r.xpaddr=((r.cmd&7)<<5)|((data&0x7c)>>2);
      if(r.cmd&0x80){r.dir=1;r.byte=r.pram[r.xpaddr];r.bits=8;r.state=0;}
      else {r.state=3;r.byte=0;r.bits=0;}
      return;
    }
    if(r.state===3){if(!r.writeProtect)r.pram[r.xpaddr]=data;r.state=0;return;}
    if(r.state===2) {
      r.state=0;
      const a=(r.cmd>>2)&0x1f;
      if(r.writeProtect && a!==13)return;
      if(a<8)r.seconds[a&3]=data;
      else if((a>=8&&a<=11)||(a>=16&&a<=31))r.pram[a]=data;
      else if(a===13)r.writeProtect=!!(data&0x80);
      return;
    }
    r.cmd=data;
    if((data&0x78)===0x38){r.state=1;r.byte=0;r.bits=0;return;}
    const a=(data>>2)&0x1f;
    if(data&0x80) {
      r.dir=1;r.bits=8;r.state=0;
      r.byte=a<8?r.seconds[a&3]:(((a>=8&&a<=11)||(a>=16&&a<=31))?r.pram[a]:0);
    } else {r.dir=0;r.state=2;r.byte=0;r.bits=0;}
  }

  rtcShift(bit) {
    const r=this.rtc;
    if(r.ce)return;
    if(r.dir) {
      if(r.bits>0)r.out=(r.byte>>(--r.bits))&1;
    } else {
      r.byte=((r.byte<<1)|(bit&1))&0xff;
      if(++r.bits===8){const b=r.byte;r.byte=0;r.bits=0;this.rtcByte(b);}
    }
  }

  processClock() {
    // MAME apple2gs_state::process_clock clocks CLOCKDATA MSB-first.
    for(let i=0;i<8;i++) {
      if(!(this.clockCtl&0x40)) {
        const bit=(this.clockData>>(7-i))&1;
        this.rtc.data=bit;
        this.rtcShift(bit);
      } else {
        this.rtcShift(this.rtc.data);
        this.clockData=((this.clockData<<1)|(this.rtc.out&1))&0xff;
      }
    }
  }

  floatingBus() {
    if(!this.video) return 0;
    const cyclesPerLine=2800000/(60*262);
    // Convert the JS scan position to MAME's 65-cycle scanner clock.
    // ALIGN_RFB is 1 in MAME 0.289: its h_clock calculation is effectively
    // one scanner cycle ahead of the unaligned visible position.
    let h=Math.floor((this.video.scanCycleAccum/cyclesPerLine)*65)+1;
    if(h>=65)h-=65;
    if(h<0)h+=65;
    let v=this.video.currentScanline;
    // MAME read_floatingbus remaps the 16-line top border to the end of VBL.
    if(v<16)v+=262;
    v-=16;
    // Crossing the scanner's pre-visible boundary advances the vertical
    // counter for floating-bus address generation (25 - ALIGN_RFB = 24).
    if(h<24)v++;
    if(v>=262)v-=262;
    // MAME returns the byte at PC-1 while the VGC is not driving the bus.
    // Use a motherboard callback so this path does not recursively perform
    // another floating-bus I/O read.
    if(h<5 || v>199)
      return this.cpuFetchByte ? (this.cpuFetchByte()&0xff) : 0;

    let a;
    if(this.video.readNewVideo()&0x80) {
      if(h>=25) a=0x16000-50+1+(v*80)+(h*2);
      else if(h>=9 && h<=16) {
        const scb=this.slowE1[0x9d00+v]&0x0f;
        a=0x19f00-18+1+(scb*16)+(h*2);
      } else a=0x19e80+(v>>1);
      return a<0x10000 ? this.slowE0[a] : this.slowE1[a&0xffff];
    }

    // MAME a2_video_device::scanner_address(), using the same compatibility
    // soft-switch latches that drive the legacy renderer.
    const io=this.ioManager;
    if(!io) return 0;
    let hires=(this.legacy.dms_hires && !io.text_mode);
    const mixed=io.mixed_mode;
    const page2=this.legacy.dms_page2 && !this.legacy.dms_80store;
    const hs=h-(h>0?1:0);
    const h0=hs&1, h1=(hs>>1)&1, h2=(hs>>2)&1;
    const h3=(hs>>3)&1, h4=(hs>>4)&1, h5=(hs>>5)&1;
    let vs=256+v;
    if(v>=256) vs-=262;
    const va=vs&1, vb=(vs>>1)&1, vc=(vs>>2)&1;
    const v0=(vs>>3)&1, v1=(vs>>4)&1, v2=(vs>>5)&1;
    const v3=(vs>>6)&1, v4=(vs>>7)&1;
    if(hires && mixed && v4 && v2) hires=false;
    const sum=(0x0d+(h5<<2)+(h4<<1)+h3+(v4<<3)+(v3<<2)+(v4<<1)+v3)&0x0f;
    a=h0|(h1<<1)|(h2<<2)|(sum<<3)|(v0<<7)|(v1<<8)|(v2<<9);
    if(hires)
      a|=(va<<10)|(vb<<11)|(vc<<12)|(page2?0x4000:0x2000);
    else
      a|=page2?0x0800:0x0400;
    return this.slowE0[a&0xffff];
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

  setExternalIrq(source,state) {
    if(Object.prototype.hasOwnProperty.call(this.externalIrq,source))
      this.externalIrq[source]=!!state;
    this.updateMegaIrq();
  }
  updateMegaIrq() {
    const active=this.vblIrq||this.quarterIrq||
      this.externalIrq.vgc||this.externalIrq.doc||this.externalIrq.scc||this.externalIrq.adb;
    if(active) this.intFlag|=0x01; else this.intFlag&=~0x01;
    if(this.irq) this.irq(active);
  }
  setVblFlag() {
    this.intFlag |= 0x08;
    if(this.intEnable&0x08) this.vblIrq=true;
    this.updateMegaIrq();
  }
  setQuarterFlag() {
    this.intFlag |= 0x10;
    if(this.intEnable&0x10) this.quarterIrq=true;
    this.updateMegaIrq();
  }

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
    // IWM odd soft-switch reads have no register data; MAME's c080_r()
    // returns the machine floating bus when the controller supplies none.
    if(addr & 1) return this.floatingBus();
    // DISKREG bit 7 selects the IIgs 3.5-inch path. Do not feed 5.25-inch
    // Disk II latch bytes into firmware while that path is selected.
    if(this.diskReg&0x80) {
      if(this.iwmQ6 && !this.iwmQ7)
        return this.iwmMode | (this.iwmMotor ? 32 : 0) | 0x80;
      if(!this.iwmQ6 && this.iwmQ7) return 0x80;
      return 0;
    }
    if(this.iwmQ6 && !this.iwmQ7) return this.iwmMode | (this.iwmMotor ? 32 : 0) | ((!this.floppy?._active_disk.medium || this.floppy._active_disk.write_protect) ? 128 : 0);
    if(!this.iwmQ6 && this.iwmQ7) return 0x80; // write handshake ready
    return data;
  }

  fastBank0Read(off) {
    const m=this.legacy;
    let aux;
    if(off<0x0200) aux=!!m.aux_zp;
    else {
      aux=!!m.aux_read;
      if(off>=0x0400&&off<0x0800&&m.dms_80store) aux=!!m.dms_page2;
      else if(off>=0x2000&&off<0x4000&&m.dms_80store&&m.dms_hires) aux=!!m.dms_page2;
    }
    return this.ram[(aux?0x10000:0)+(off&0xffff)];
  }

  fastBank0Write(off,val) {
    const m=this.legacy;
    let aux;
    if(off<0x0200) aux=!!m.aux_zp;
    else {
      aux=!!m.aux_write;
      if(off>=0x0400&&off<0x0800&&m.dms_80store) aux=!!m.dms_page2;
      else if(off>=0x2000&&off<0x4000&&m.dms_80store&&m.dms_hires) aux=!!m.dms_page2;
    }
    off&=0xffff; val&=0xff;
    this.ram[(aux?0x10000:0)+off]=val;

    if(!aux) {
      if(off>=0x0400&&off<0x0800&&!(this.shadow&0x01)) this.slowE0[off]=val;
      else if(off>=0x0800&&off<0x0c00&&!(this.shadow&0x20)) this.slowE0[off]=val;
      else if(off>=0x2000&&off<0x4000&&!(this.shadow&0x02)) this.slowE0[off]=val;
      else if(off>=0x4000&&off<0x6000&&!(this.shadow&0x04)) this.slowE0[off]=val;
    } else {
      if(off>=0x0400&&off<0x0800&&!(this.shadow&0x01)) this.slowE1[off]=val;
      else if(off>=0x0800&&off<0x0c00&&!(this.shadow&0x20)) this.slowE1[off]=val;
      else if(off>=0x2000&&off<0xa000) {
        let shadow=false;
        if(off<0x4000) shadow=(!(this.shadow&0x02)&&!(this.shadow&0x10))||!(this.shadow&0x08);
        else if(off<0x6000) shadow=(!(this.shadow&0x04)&&!(this.shadow&0x10))||!(this.shadow&0x08);
        else shadow=!(this.shadow&0x08);
        if(shadow) {
          if(this.video) this.video.writeBankE1(off,val);
          else this.slowE1[off]=val;
        }
      }
    }
    if(this.video&&off>=0x0400&&off<0xa000) this.video.dirty=true;
  }

  e0ReadBank(off) {
    const m=this.legacy;
    if(off<0x0200) return (m.aux_zp ? this.slowE1 : this.slowE0)[off];
    let aux=!!m.aux_read;
    if(off>=0x0400 && off<0x0800 && m.dms_80store) aux=!!m.dms_page2;
    else if(off>=0x2000 && off<0x4000 && m.dms_80store && m.dms_hires) aux=!!m.dms_page2;
    return (aux ? this.slowE1 : this.slowE0)[off];
  }

  e0WriteBank(off,val) {
    const m=this.legacy;
    if(off<0x0200) {
      (m.aux_zp ? this.slowE1 : this.slowE0)[off]=val;
      return;
    }
    let aux=!!m.aux_write;
    if(off>=0x0400 && off<0x0800 && m.dms_80store) aux=!!m.dms_page2;
    else if(off>=0x2000 && off<0x4000 && m.dms_80store && m.dms_hires) aux=!!m.dms_page2;
    (aux ? this.slowE1 : this.slowE0)[off]=val;
  }

  fastLc00Address(off) {
    // MAME lc_00_r/lc_00_w: bank-$00 language-card RAM is fast
    // motherboard RAM. ALTZP independently selects its main/aux half.
    const aux=!!this.legacy.aux_zp;
    if(off<0xe000)
      return (aux?0x10000:0) | (this.legacy.bsr_bank2?0xc000:0xd000) | (off&0x0fff);
    return (aux?0x10000:0) | 0xe000 | (off&0x1fff);
  }

  fastLc00Read(off) {
    if(!this.legacy.bsr_read) return this.romRead(0xff0000|off);
    return this.ram[this.fastLc00Address(off)];
  }

  fastLc00Write(off,val) {
    if(this.legacy.bsr_write)
      this.ram[this.fastLc00Address(off)]=val&0xff;
  }

  slowLcAddress(aux,off) {
    if(off<0xe000)
      return (aux?0x10000:0) | (this.legacy.bsr_bank2?0xc000:0xd000) | (off&0x0fff);
    return (aux?0x10000:0) | 0xe000 | (off&0x1fff);
  }

  slowLcRead(aux,off) {
    if(!this.legacy.bsr_read) return this.romRead(0xff0000|off);
    const a=this.slowLcAddress(aux,off);
    return a&0x10000 ? this.slowE1[a&0xffff] : this.slowE0[a&0xffff];
  }

  slowLcWrite(aux,off,val) {
    if(!this.legacy.bsr_write) return;
    const a=this.slowLcAddress(aux,off);
    (a&0x10000 ? this.slowE1 : this.slowE0)[a&0xffff]=val&0xff;
  }

  read(addr) {
    addr &= 0xffffff;
    const originalBank = addr >>> 16, originalOff = addr & 0xffff;
    // $C035 bit 6 inhibits the bank-$00/$01 I/O and language-card window.
    // Banks $E0/$E1 always retain Mega II I/O/LC decoding.
    const iolcEnabled = !(this.shadow & 0x40);
    if(((originalBank===0xe0 || originalBank===0xe1) && originalOff<0xd000) ||
       (iolcEnabled && originalBank===0x00) ||
       (iolcEnabled && originalBank===0x01 && originalOff<0xd000)) {
      if(originalOff>=0xc000) addr=originalOff;
    }
    if((addr>>>16)===0 && (addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) {
      const io=addr&0xffff;
      if(io>=0xc000 && io<=0xc00f) return this.adb.readKeyData();
      if(io===0xc010) return this.adb.readAnyKeyAndClearStrobe();
      if(io===0xc068) return this.readState();
      if(io===0xc026) return this.adb.readData();
      if(io===0xc027) return this.adb.readStatus();
      if(io===0xc022) return this.video ? this.video.getTextColor() : 0xf2;
      if(io===0xc023) return this.video ? this.video.readVGCINT() : 0;
      if(io===0xc024) return this.adb.readMouseData();
      if(io===0xc025) return this.adb.readKeyModifiers();
      if(io===0xc029) return this.video ? this.video.readNewVideo() : 0;
      if(io===0xc02b) return this.langSel;
      if(io===0xc02d) return this.slotRom;
      if(io===0xc02e){
        if(this.video) this.video.clearScanlineInterrupt();
        return this.video ? this.video.readVertCounter() : 0;
      }
      if(io===0xc02f){
        if(this.video) this.video.clearScanlineInterrupt();
        return this.video ? this.video.readHorizCounter() : 0;
      }
      if(io===0xc031) return this.diskReg;
      // MAME VGCINTCLEAR ($C032) is write-only; reads are floating bus.
      if(io===0xc033) return this.clockData;
      if(io===0xc034) return (this.clockCtl&0xf0)|(this.video?this.video.getBorderColor():0x02);
      if(io===0xc035) return this.shadow;
      if(io===0xc036) return this.speed;
      // MAME has no C037 read register; reads fall through to the Mega II floating bus.
      if(io>=0xc038 && io<=0xc03b) return this.scc.read(io-0xc038);
      if(io===0xc03c) return (this.doc.getControl()|0x1f)&0x7f;
      if(io===0xc03d) return this.doc.readData();
      if(io===0xc03e) return this.doc.addressLow();
      if(io===0xc03f) return this.doc.addressHigh();
      if(io===0xc041) return this.intEnable;
      // MAME returns zero for the SCC activity delta registers; AppleTalk
      // probes these during machine detection/startup.
      if(io===0xc044 || io===0xc045) return 0;
      if(io===0xc046) return this.intFlag|(this.legacy.dms_dhires?0:0x20);
      // IIgs game-I/O reads preserve the floating-bus low seven bits.
      // Reuse the existing Mega II joystick/paddle hook for bit 7.
      if(io>=0xc060 && io<=0xc067) {
        let state=0;
        for(const fn of this.legacy._read_hooks || []) {
          const x=fn(io);
          if(x!==undefined){state=x&0x80;break;}
        }
        // MAME's IIgs C060 (button 3) is active-low. The shared IIe hook
        // has no C060 game-button register, so its disconnected state is high.
        if(io===0xc060) state=0x80;
        // MAME preserves the current floating-bus byte in bits 0-6.
        return state|(this.floatingBus()&0x7f);
      }
      // MAME exposes ROM03's IRQ-vector helper bytes directly at
      // C071-C07D/C07F from ROM offset $3C000. C070 remains floating bus
      // and C07E is the Zip delay soft switch.
      if((io>=0xc071 && io<=0xc07d) || io===0xc07f)
        return this.rom ? this.rom[0x3c000+(io&0xff)] : 0xff;

      // Compatibility status registers are implemented by the Mega II/IIe
      // hooks. Soft-switch accesses that don't produce a value still return
      // the IIgs floating bus, as MAME c000_r does.
      if((io>=0xc011 && io<=0xc01f) ||
         (io>=0xc050 && io<=0xc05f) || io===0xc070 ||
         (io>=0xc07e && io<=0xc08f)) {
        for(const fn of this.legacy._read_hooks || []) {
          const v=fn(io);
          if(v!==undefined) return v&0xff;
        }
        return this.floatingBus();
      }
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
      (slotNum===3
        ? (this.intCxRom || !this.slotC3Rom)
        : (this.intCxRom || !(this.slotRom & (1<<slotNum))));
    if(slotWindow && slotNum===3 && !this.slotC3Rom) this.intC8Rom=true;
    const c8Window=(addr>>>16)===0 && lowAddr>=0xc800 && lowAddr<=0xcfff;
    const internalC8=c8Window && (this.intCxRom || this.intC8Rom);
    if(c8Window && lowAddr===0xcfff) this.intC8Rom=false;
    if(!internalSlotRom && !internalC8) {
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
      if(off>=0xd000)
        // MAME has independent E0 (main) and E1 (aux) LC views. ALTZP
        // selects the fast bank-$00 LC backing, but does not redirect E0 LC.
        v=this.slowLcRead(bank===0xe1,off);
      // Mega II slow RAM. Bank E0 follows the Apple II auxiliary-memory
      // selectors; bank E1 is always the auxiliary side.
      else if(bank===0xe0 && off<0xc000)
        v=this.e0ReadBank(off);
      else if(bank===0xe1 && off>=0x2000 && off<0xa000 && this.video)
        v=this.video.readBankE1(off);
      else
        v=(bank===0xe0 ? this.slowE0 : this.slowE1)[off];
    } else if(bank===0x00) {
      // Fast-side bank 0 uses the same auxiliary selectors as the Mega II,
      // but its backing store is IIgs motherboard RAM.
      if(off<0xc000)
        v=this.fastBank0Read(off);
      else if(off>=0xd000)
        v=this.fastLc00Read(off);
      else
        v=this.legacy.read(off);
    } else if(bank===0x01 && off<0xc000) {
      // MAME 0.289 apple2gs_map: $01:0000-$BFFF is fast-side bank-1
      // motherboard RAM. Shadowing to slow $E1 is handled on writes.
      v=this.ram[addr];
    } else if(bank===0x01 && off>=0xd000 && !(this.shadow&0x40)) {
      // Bank $01 has an independent fast-side language card.
      if(!this.legacy.bsr_read && this.rom) {
        // MAME lc01 uses the same $3D000 internal ROM region view.
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
    } else if(addr>=this.ghostStart && addr<0x800000) {
      // MAME ghostram_r: expansion RAM mirrors to the next power-of-two
      // boundary above the fixed 1 MB ROM03 motherboard RAM.
      const ghost=(addr&this.ghostMask)+this.motherboardRam;
      v=ghost<this.ram.length ? this.ram[ghost] : 0xff;
    } else {
      // MAME floatingbank_r: with no mapped RAM at this address, the
      // 65816 bank register is left on the bus.
      v=(addr>>>16)&0xff;
    }
    if(this.trace) this.trace("R",addr,v);
    return v;
  }

  write(addr,val) {
    addr &= 0xffffff; val &= 0xff;
    const originalBank = addr >>> 16, originalOff = addr & 0xffff;
    const iolcEnabled = !(this.shadow & 0x40);
    if(((originalBank===0xe0 || originalBank===0xe1) && originalOff<0xd000) ||
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
      if(io===0xc008){this.legacy.aux_zp=false;return;}
      if(io===0xc009){this.legacy.aux_zp=true;return;}
      if(io===0xc00a){this.slotC3Rom=false;return;}
      if(io===0xc00b){this.slotC3Rom=true;return;}
      if(io>=0xc00c && io<=0xc00f) {
        for(const fn of this.legacy._write_hooks || []) {
          const v=fn(io,val);
          if(v!==undefined) return;
        }
      }
      if(io===0xc010){this.adb.clearKeyStrobe();return;}
      if(io===0xc068){this.writeState(val);return;}
      if(io===0xc026){this.adb.writeData(val);return;}
      if(io===0xc027){this.adb.writeStatus(val);return;}
      if(io===0xc021){if(this.video)this.video.setMonochrome(val);return;}
      if(io===0xc022){if(this.video)this.video.setTextColor(val);return;}
      if(io===0xc023){if(this.video)this.video.writeVGCINT(val);return;}
      if(io===0xc029){if(this.video)this.video.writeNewVideo(val&0xe1);return;}
      if(io===0xc02b){this.langSel=val&0xf8;return;}
      if(io===0xc02d){this.slotRom=val&0xf6;return;}
      if(io===0xc031){
        // MAME DISKREG: bit 7 selects 3.5-inch SmartPort/IWM operation and
        // bit 6 is the 3.5-inch head-select line. The current JS drive is
        // 5.25-inch only, so preserve both hardware-visible bits without
        // incorrectly changing Disk II drive/head state.
        this.diskReg=val&0xc0;
        return;
      }
      if(io===0xc032){if(this.video)this.video.writeSCANINT(val);return;}
      if(io===0xc033){this.clockData=val;return;}
      if(io===0xc034){
        this.clockCtl=val&0x6f;
        if(this.video)this.video.setBorderColor(val);
        const nextCe=((val>>7)&1)^1;
        if(nextCe!==this.rtc.ce){this.rtc.ce=nextCe;this.rtc.byte=0;this.rtc.bits=0;this.rtc.dir=0;this.rtc.out=0;this.rtc.state=0;}
        if(val&0x80)this.processClock();
        return;
      }
      if(io===0xc035){this.shadow=val;return;}
      if(io===0xc036){this.speed=val;return;}
      // MAME ROM03: DMAREG/CYAREG ($C037) is a no-op in this machine implementation.
      if(io===0xc037)return;
      if(io>=0xc038 && io<=0xc03b){this.scc.write(io-0xc038,val);return;}
      if(io===0xc03c){this.doc.setControl(val);return;}
      if(io===0xc03d){this.doc.writeData(val);return;}
      if(io===0xc03e){this.doc.setAddressLow(val);return;}
      if(io===0xc03f){this.doc.setAddressHigh(val);return;}
      if(io===0xc041){
        this.intEnable=val&0x1f;
        if(!(this.intEnable&0x08)) this.vblIrq=false;
        if(!(this.intEnable&0x10)) this.quarterIrq=false;
        this.updateMegaIrq();
        return;
      }
      if(io===0xc047){
        this.intFlag&=~0x18;
        this.vblIrq=this.quarterIrq=false;
        this.updateMegaIrq();
        return;
      }
      if((io>=0xc050 && io<=0xc05f) || io===0xc070 ||
         (io>=0xc07e && io<=0xc08f)) {
        for(const fn of this.legacy._write_hooks || []) {
          const v=fn(io,val);
          if(v!==undefined) return;
        }
      }
    }
    if(addr >= 0xc0e0 && addr <= 0xc0ef) {this.iwmAccess(addr,val);return;}
    const lowAddr=addr&0xffff;
    const slotNum=(lowAddr>>>8)&0x0f;
    const slotWindow=(addr>>>16)===0 && lowAddr>=0xc100 && lowAddr<=0xc7ff;
    const internalSlotRom=slotWindow &&
      (slotNum===3
        ? (this.intCxRom || !this.slotC3Rom)
        : (this.intCxRom || !(this.slotRom & (1<<slotNum))));
    const c8Window=(addr>>>16)===0 && lowAddr>=0xc800 && lowAddr<=0xcfff;
    // MAME c800_w forwards writes to a claimed external slot regardless of
    // INTCXROM/INTC8ROM. CFFF releases the C800 claim/latch after the access.
    if(!internalSlotRom) {
      for(const fn of this.writeHooks) {
        const r=fn(addr,val);
        if(r !== undefined) {
          if(c8Window && lowAddr===0xcfff) this.intC8Rom=false;
          return;
        }
      }
    }
    if(c8Window && lowAddr===0xcfff) this.intC8Rom=false;

    const bank=addr>>>16, off=addr&0xffff;
    if(bank===0xe0 || bank===0xe1) {
      if(off>=0xd000)
        // E0/E1 language-card windows remain main/aux respectively;
        // ALTZP must not redirect the E0 slow LC window.
        this.slowLcWrite(bank===0xe1,off,val);
      else if(bank===0xe0 && off<0xc000)
        this.e0WriteBank(off,val);
      else if(bank===0xe1 && off>=0x2000 && off<0xa000 && this.video)
        this.video.writeBankE1(off,val);
      else
        (bank===0xe0 ? this.slowE0 : this.slowE1)[off]=val;
    } else if(bank===0x00) {
      if(off<0xc000)
        this.fastBank0Write(off,val);
      else if(off>=0xd000)
        this.fastLc00Write(off,val);
      else
        this.legacy.write(off,val);
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
      // MAME b1ram*_w shadow rules. Text shadowing is a direct Mega II
      // auxiliary write; HGR/SHR shadowing goes through auxram0000_w so the
      // NEWVIDEO address transform is applied when SHR mapping is active.
      if(off>=0x0400 && off<0x0800 && !(this.shadow&0x01)) {
        this.slowE1[off]=val;
      } else if(off>=0x0800 && off<0x0c00 && !(this.shadow&0x20)) {
        this.slowE1[off]=val;
      } else if(off>=0x2000 && off<0xa000) {
        let shadow=false;
        if(off<0x4000)
          shadow=(!(this.shadow&0x02) && !(this.shadow&0x10)) || !(this.shadow&0x08);
        else if(off<0x6000)
          shadow=(!(this.shadow&0x04) && !(this.shadow&0x10)) || !(this.shadow&0x08);
        else
          shadow=!(this.shadow&0x08);
        if(shadow) {
          if(this.video) this.video.writeBankE1(off,val);
          else this.slowE1[off]=val;
        }
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
          if((bank&1) && off>=0x2000 && off<0xa000 && this.video)
            // MAME bank1_0000_sh_w routes HGR/SHR shadow writes through
            // auxram0000_w(), so NEWVIDEO $40/$80 address swizzling applies.
            this.video.writeBankE1(off,val);
          else
            slow[off]=val;
          if((bank&1) && this.video) this.video.dirty=true;
        }
      }
    } else if(addr>=this.ghostStart && addr<0x800000) {
      const ghost=(addr&this.ghostMask)+this.motherboardRam;
      if(ghost<this.ram.length) this.ram[ghost]=val;
    }
    // IIgs RAM writes bypass Memory.write(), where the IIe normally
    // notifies the display. Draw the actual slow-bank byte so inhibited
    // shadow writes cannot leak fast RAM onto the screen.
    if(off>=0x0400 && off<0x6000 && this.legacy.io_manager)
      this.legacy.io_manager.draw_display(off,this.slowE0[off]);
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
    // MAME machine_reset: LC starts on ROM, Dxxx bank 2, with writes
    // enabled but no prewrite sequence in progress.
    m.bsr_read = false; m.bsr_bank2 = true; m.bsr_write = true;
    if(this.legacy.io_manager) this.legacy.io_manager._bsr_write_count = 0;
    this.shadow = 0; this.speed = 0x80;
    this.slotRom = 0; this.langSel = 0; this.diskReg = 0;
    this.clockCtl = 0; this.clockData = 0;
    // CLOCKCTL reset deasserts the RTC serial transaction. Keep PRAM/clock
    // contents, but abort any partial command exactly as CE does in MAME.
    this.rtc.ce=1; this.rtc.clk=0; this.rtc.data=0; this.rtc.out=0;
    this.rtc.dir=0; this.rtc.byte=0; this.rtc.bits=0; this.rtc.state=0;
    this.rtc.cmd=0; this.rtc.writeProtect=false;
    this.intEnable = 0; this.intFlag = 0;
    this.vblIrq = this.quarterIrq = false;
    this.externalIrq.vgc=this.externalIrq.doc=this.externalIrq.scc=this.externalIrq.adb=false;
    this.updateMegaIrq();
    this.romBank = false; this.intCxRom = false; this.slotC3Rom = false; this.intC8Rom = false;
    this.scc.reset(); this.doc.reset();
    this.adb.reset();
    this.iwmMode = 0; this.iwmQ6 = this.iwmQ7 = this.iwmMotor = false;
  }
}
