// Apple IIgs-capable video subsystem.
// Legacy Apple II/IIe modes remain owned by IOManager (Mega II-compatible path).
// Super Hi-Res uses two 80-byte banks per scanline, matching MAME:
// $2000 + y*80 supplies the first four pixels of each 8-pixel group;
// $6000 + y*80 supplies the second four.
const SHR_PIXEL_BASE = 0x2000;
const SHR_PIXEL_PLANE2 = 0x6000;
const SHR_BYTES_PER_PLANE_LINE = 80;
const SHR_BYTES_PER_LINE = 160;
const SHR_LINES = 200;
const SHR_PIXEL_END = 0x9d00;
const SHR_SCB_BASE = 0x9d00;
const SHR_SCB_END = SHR_SCB_BASE + SHR_LINES;                         // $9DC8
const SHR_PALETTE_BASE = 0x9e00;
const SHR_PALETTE_END = 0xa000;

export class IIgsVideo {
  constructor(canvas, legacyVideo = null, scanlineIrq = null, doubleHires = null) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", {alpha:false});
    this.context.imageSmoothingEnabled = false;
    this.legacy = legacyVideo;
    this.scanlineIrq = scanlineIrq;
    this.doubleHires = doubleHires;
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
    this.bankE1 = new Uint8Array(0x10000); // replaced by bus backing store on IIgs
    this.newVideo = 0x01;
    this.borderColor = 0x02;
    this.textColor = 0xf2;
    this.monochrome = 0x00;
    this.superHires = false;
    this.dirty = true;
    this.image = this.context.createImageData(640, 200);
    this.reset();
  }

  attachBankE1(bytes) {
    if(!(bytes instanceof Uint8Array) || bytes.length < 0x10000)
      throw new Error("IIgs VGC requires a 64K bank E1 backing store");
    this.bankE1 = bytes.subarray(0,0x10000);
    this.dirty = true;
  }

  reset() {
    // ROM 03 hardware reset value, matching MAME 0.289 machine_reset().
    this.newVideo = 0x01;
    this.borderColor = 0x02;
    this.textColor = 0xf2;
    this.monochrome = 0x00;
    this.superHires = false;
    // RAM clearing is owned by the IIgs memory bus, not the VGC.
    this.dirty = true;
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
    this.vgcIntEnable = 0;
    this.vgcIntStatus = 0;
    this.vgcIrqRaised = 0;
    this.scanCycleAccum = 0;
    this.frameCount = 0;
    this.secondFrameCount = 0;
    this.updateIRQ();
  }

  beamVPos() {
    // MAME get_vpos(), adapted to the 262-line NTSC timing used here.
    // BORDER_TOP is 16. The end-of-line carry occurs at horizontal count 38.
    let v=this.currentScanline;
    const frac=this.scanCycleAccum/(2800000/(60*262));
    if(frac >= 38/65) v++;
    if(v < 16) v += 262;
    v += 240;
    if(v > 511) v -= 262;
    return v & 0x1ff;
  }

  readVertCounter() {
    return (this.beamVPos() >>> 1) & 0xff;
  }

  readHorizCounter() {
    // MAME: ((hpos-BORDER_LEFT)/16)+(25+ALIGN_CNT), modulo 65.
    // The emulator tracks one 65-count scanline as scanCycleAccum.
    const perLine=2800000/(60*262);
    let count=Math.floor((this.scanCycleAccum/perLine)*65)+25;
    count=(count+27)%65;
    let ret=count;
    if(ret>0) ret+=0x3f;
    if(this.beamVPos()&1) ret|=0x80;
    return ret&0xff;
  }

  readVGCINT() {
    return (this.vgcIntStatus & 0xe0) | (this.vgcIntEnable & 0x07);
  }

  updateIRQ() {
    const active = this.vgcIrqRaised !== 0;
    this.scanlineIrqPending = active;
    if(this.scanlineIrq) this.scanlineIrq(active);
  }

  writeVGCINT(value) {
    // MAME: replacing enable bits may clear ANYVGCINT, but never clears
    // source status or lowers an IRQ that was already raised.
    if(!((this.vgcIntStatus & 0x60) & (value & 0x06)))
      this.vgcIntStatus &= ~0x80;
    this.vgcIntEnable = value & 0x07;
  }

  writeSCANINT(value) {
    if((value & 0x40) === 0) {
      this.vgcIntStatus &= ~0x40;
      this.vgcIrqRaised &= ~0x40;
    }
    if((value & 0x20) === 0) {
      this.vgcIntStatus &= ~0x20;
      this.vgcIrqRaised &= ~0x20;
    }
    if(!(this.vgcIntStatus & 0x60)) this.vgcIntStatus &= ~0x80;
    this.updateIRQ();
  }

  tick(cycles, cpuHz=2800000) {
    const perLine = cpuHz / (60 * 262);
    this.scanCycleAccum += cycles;
    while(this.scanCycleAccum >= perLine) {
      this.scanCycleAccum -= perLine;
      const y=this.currentScanline;
      if(this.superHires && y < SHR_LINES) this.beginScanline(y);
      this.currentScanline++;
      if(this.currentScanline >= 262) {
        this.currentScanline=0;
        this.frameCount++;
        if(++this.secondFrameCount >= 60) {
          this.secondFrameCount=0;
          this.vgcIntStatus |= 0x40;
          if(this.vgcIntEnable & 0x04) {
            this.vgcIntStatus |= 0x80;
            this.vgcIrqRaised |= 0x40;
            this.updateIRQ();
          }
        }
      }
    }
  }

  // Decode one of the 200 scan-line control bytes at $E1:9D00-$E1:9DC7.
  // bit 7: 640 mode, bit 6: scan-line interrupt, bit 5: 320 fill mode,
  // bits 3-0: palette number. Fill is ignored by 640 mode.
  decodeSCB(y) {
    const raw = this.readBankE1(SHR_SCB_BASE + (y % SHR_LINES));
    return {
      raw,
      mode640: (raw & 0x80) !== 0,
      interrupt: (raw & 0x40) !== 0,
      fill: (raw & 0x20) !== 0,
      palette: raw & 0x0f
    };
  }

  beginScanline(y) {
    this.currentScanline = y % SHR_LINES;
    const scb = this.decodeSCB(this.currentScanline);
    if (scb.interrupt) {
      this.vgcIntStatus |= 0x20;
      if(this.vgcIntEnable & 0x02) {
        this.vgcIntStatus |= 0x80;
        this.vgcIrqRaised |= 0x20;
        this.updateIRQ();
      }
    }
    return scb;
  }

  clearScanlineInterrupt() { this.writeSCANINT(~0x20); }
  isScanlineInterruptPending() { return this.scanlineIrqPending; }

  // $C029 NEWVIDEO is the hardware source of truth for IIgs video selection.
  // Bit 7 selects SHR (0 = Mega II/Apple II-compatible video, 1 = SHR).
  // Bit 5 controls DHGR color interpretation on the Mega II path
  // (0 = color, 1 = monochrome).
  writeNewVideo(value) {
    const previousShr = this.superHires;
    this.newVideo = value & 0xff;
    this.superHires = (this.newVideo & 0x80) !== 0;
    if (this.doubleHires && this.doubleHires.setMonochrome) {
      this.doubleHires.setMonochrome((this.newVideo & 0x20) !== 0);
    }
    this.dirty = true;
    if (previousShr && !this.superHires && this.legacy && this.legacy.refresh) {
      this.legacy.refresh();
    }
  }

  readNewVideo() { return this.newVideo; }
  setBorderColor(value) { this.borderColor=value&0x0f; this.dirty=true; }
  getBorderColor() { return this.borderColor&0x0f; }
  setTextColor(value) { this.textColor=value&0xff; this.dirty=true; }
  getTextColor() { return this.textColor&0xff; }
  setMonochrome(value) { this.monochrome=value&0xff; this.dirty=true; }
  isSuperHires() { return this.superHires; }

  mapAuxAddress(addr) {
    addr &= 0xffff;
    // MAME auxram0000_r/w: NEWVIDEO bits 6/7 enable the IIgs SHR bus
    // address transform across E1:2000-9FFF.
    if(addr>=0x2000 && addr<0xa000 && (this.newVideo&0xc0)) {
      if(addr&1) return (((addr-0x2000)>>>1)+0x6000)&0xffff;
      return (((addr-0x2000)>>>1)+0x2000)&0xffff;
    }
    return addr;
  }

  readBankE1(addr) { return this.bankE1[this.mapAuxAddress(addr)]; }

  writeBankE1(addr, value) {
    const logical=addr&0xffff;
    addr=this.mapAuxAddress(logical);
    this.bankE1[addr] = value & 0xff;
    if ((addr >= SHR_PIXEL_BASE && addr < SHR_PIXEL_END) ||
        (addr >= SHR_SCB_BASE && addr < SHR_SCB_END) ||
        (addr >= SHR_PALETTE_BASE && addr < SHR_PALETTE_END)) {
      this.dirty = true;
    }
  }

  paletteColor(palette, index) {
    const a = SHR_PALETTE_BASE + ((palette & 0x0f) << 5) + ((index & 0x0f) << 1);
    const word = this.readBankE1(a) | (this.readBankE1(a + 1) << 8);
    // IIgs color is 0RGB, four bits per component.
    return [
      ((word >> 8) & 0x0f) * 17,
      ((word >> 4) & 0x0f) * 17,
      (word & 0x0f) * 17
    ];
  }

  putPixel(data, x, y, rgb) {
    const o = (y * 640 + x) * 4;
    data[o] = rgb[0]; data[o+1] = rgb[1]; data[o+2] = rgb[2]; data[o+3] = 255;
  }

  render320Line(y, scb, data) {
    const palette = scb.palette;
    const fill = scb.fill;
    const base = SHR_PIXEL_BASE + y * SHR_BYTES_PER_PLANE_LINE;
    const base2 = SHR_PIXEL_PLANE2 + y * SHR_BYTES_PER_PLANE_LINE;
    // MAME 0.289 fillmode_init[scb & 0x1f]: palette nibble, except
    // SCB $00 seeds color 2 and SCB $10 seeds color 0.
    let last = (scb.raw & 0x0f) || ((scb.raw & 0x10) ? 0 : 2);
    for (let i=0; i<SHR_BYTES_PER_PLANE_LINE; i++) {
      for (let plane=0; plane<2; plane++) {
        const b=this.bankE1[(plane ? base2 : base)+i];
        let a=(b>>4)&15, c=b&15;
        if (fill) {
          if (a===0) a=last; else last=a;
          if (c===0) c=last; else last=c;
        }
        const x=i*8+plane*4;
        const ca=this.paletteColor(palette,a), cc=this.paletteColor(palette,c);
        this.putPixel(data,x,y,ca); this.putPixel(data,x+1,y,ca);
        this.putPixel(data,x+2,y,cc); this.putPixel(data,x+3,y,cc);
      }
    }
  }

  render640Line(y, scb, data) {
    const base = SHR_PIXEL_BASE + y * SHR_BYTES_PER_PLANE_LINE;
    const base2 = SHR_PIXEL_PLANE2 + y * SHR_BYTES_PER_PLANE_LINE;
    const palette = scb.palette;
    // MAME 0.289 screen_update_GS: each pixel position selects from
    // consecutive groups 0-3, 4-7, 8-11 and 12-15 of the SCB palette.
    for(let i=0;i<SHR_BYTES_PER_PLANE_LINE;i++) {
      for(let plane=0;plane<2;plane++) {
        const b=this.bankE1[(plane ? base2 : base)+i];
        const x=i*8+plane*4;
        const p0=(b>>6)&3, p1=(b>>4)&3, p2=(b>>2)&3, p3=b&3;
        this.putPixel(data,x,y,this.paletteColor(palette,p0));
        this.putPixel(data,x+1,y,this.paletteColor(palette,4+p1));
        this.putPixel(data,x+2,y,this.paletteColor(palette,8+p2));
        this.putPixel(data,x+3,y,this.paletteColor(palette,12+p3));
      }
    }
  }

  refresh(force=false) {
    if (!this.superHires || (!force && !this.dirty)) return false;
    const data=this.image.data;
    for(let y=0; y<SHR_LINES; y++) {
      const scb=this.decodeSCB(y);
      if (scb.mode640) this.render640Line(y,scb,data);
      else this.render320Line(y,scb,data);
    }
    // Scale 640x200 SHR to the emulator's 564x390 presentation canvas.
    const off=document.createElement("canvas");
    off.width=640; off.height=200;
    off.getContext("2d",{alpha:false}).putImageData(this.image,0,0);
    this.context.save();
    this.context.imageSmoothingEnabled=false;
    this.context.fillStyle="#000";
    this.context.fillRect(0,0,this.canvas.width,this.canvas.height);
    this.context.drawImage(off,0,0,640,200,2,3,560,384);
    this.context.restore();
    this.dirty=false;
    return true;
  }
}
