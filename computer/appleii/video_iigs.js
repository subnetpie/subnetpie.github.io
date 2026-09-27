// Apple IIgs-capable video subsystem.
// Legacy Apple II/IIe modes remain owned by IOManager (Mega II-compatible path).
// Super Hi-Res uses the IIgs linear bank-$E1 video layout.
// Unlike Apple II text/HGR memory there is no scan-line address interleave:
//   $2000-$9CFF  200 scan lines x 160 consecutive bytes
//   $9D00-$9DC7  200 scan-line control bytes (one byte per line)
//   $9E00-$9FFF  16 palettes x 16 12-bit RGB entries (2 bytes/entry)
const SHR_PIXEL_BASE = 0x2000;
const SHR_BYTES_PER_LINE = 160;
const SHR_LINES = 200;
const SHR_PIXEL_END = SHR_PIXEL_BASE + SHR_BYTES_PER_LINE * SHR_LINES; // $9D00
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
    this.superHires = false;
    // RAM clearing is owned by the IIgs memory bus, not the VGC.
    this.dirty = true;
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
    this.vgcIntEnable = 0;
    this.vgcIntStatus = 0;
    this.scanCycleAccum = 0;
    this.frameCount = 0;
    this.updateIRQ();
  }

  readVGCINT() {
    const active = ((this.vgcIntStatus & 0x20) && (this.vgcIntEnable & 0x02)) ||
                   ((this.vgcIntStatus & 0x40) && (this.vgcIntEnable & 0x04));
    return (active ? 0x80 : 0) | (this.vgcIntStatus & 0x60) | (this.vgcIntEnable & 0x07);
  }

  updateIRQ() {
    const active = ((this.vgcIntStatus & 0x20) && (this.vgcIntEnable & 0x02)) ||
                   ((this.vgcIntStatus & 0x40) && (this.vgcIntEnable & 0x04));
    this.scanlineIrqPending = !!active;
    if(this.scanlineIrq) this.scanlineIrq(!!active);
  }

  writeVGCINT(value) {
    // MAME preserves status bits and replaces only the three enable/control
    // bits. Disabling a source does not clear its latched status.
    this.vgcIntEnable = value & 0x07;
    this.updateIRQ();
  }

  writeSCANINT(value) {
    if((value & 0x20) === 0) this.vgcIntStatus &= ~0x20;
    if((value & 0x40) === 0) this.vgcIntStatus &= ~0x40;
    this.updateIRQ();
  }

  tick(cycles, cpuHz=2800000) {
    const perLine = cpuHz / (60 * 262);
    this.scanCycleAccum += cycles;
    while(this.scanCycleAccum >= perLine) {
      this.scanCycleAccum -= perLine;
      const y=this.currentScanline;
      if(y < SHR_LINES) this.beginScanline(y);
      this.currentScanline++;
      if(this.currentScanline >= 262) {
        this.currentScanline=0;
        if(++this.frameCount >= 60) {
          this.frameCount=0;
          this.vgcIntStatus |= 0x40;
          this.updateIRQ();
        }
      }
    }
  }

  // Decode one of the 200 scan-line control bytes at $E1:9D00-$E1:9DC7.
  // bit 7: 640 mode, bit 6: scan-line interrupt, bit 5: 320 fill mode,
  // bits 3-0: palette number. Fill is ignored by 640 mode.
  decodeSCB(y) {
    const raw = this.bankE1[SHR_SCB_BASE + (y % SHR_LINES)];
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
      this.updateIRQ();
    }
    return scb;
  }

  clearScanlineInterrupt() { this.vgcIntStatus &= ~0x20; this.updateIRQ(); }
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
  isSuperHires() { return this.superHires; }

  readBankE1(addr) { return this.bankE1[addr & 0xffff]; }

  writeBankE1(addr, value) {
    addr &= 0xffff;
    this.bankE1[addr] = value & 0xff;
    if ((addr >= SHR_PIXEL_BASE && addr < SHR_PIXEL_END) ||
        (addr >= SHR_SCB_BASE && addr < SHR_SCB_END) ||
        (addr >= SHR_PALETTE_BASE && addr < SHR_PALETTE_END)) {
      this.dirty = true;
    }
  }

  paletteColor(palette, index) {
    const a = SHR_PALETTE_BASE + ((palette & 0x0f) << 5) + ((index & 0x0f) << 1);
    const word = this.bankE1[a] | (this.bankE1[a + 1] << 8);
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
    const base = SHR_PIXEL_BASE + y * SHR_BYTES_PER_LINE;
    // MAME 0.289 fillmode_init[scb & 0x1f]: palette nibble, except
    // SCB $00 seeds color 2 and SCB $10 seeds color 0.
    let last = (scb.raw & 0x0f) || ((scb.raw & 0x10) ? 0 : 2);
    for (let i=0; i<SHR_BYTES_PER_LINE; i++) {
      const b=this.bankE1[base+i];
      let a=(b>>4)&15, c=b&15;
      if (fill) {
        if (a===0) a=last; else last=a;
        if (c===0) c=last; else last=c;
      }
      const x=i*4;
      const ca=this.paletteColor(palette,a), cc=this.paletteColor(palette,c);
      this.putPixel(data,x,y,ca); this.putPixel(data,x+1,y,ca);
      this.putPixel(data,x+2,y,cc); this.putPixel(data,x+3,y,cc);
    }
  }

  render640Line(y, scb, data) {
    const base = SHR_PIXEL_BASE + y * SHR_BYTES_PER_LINE;
    const palette = scb.palette;
    // MAME 0.289 screen_update_GS: each pixel position selects from
    // consecutive groups 0-3, 4-7, 8-11 and 12-15 of the SCB palette.
    for(let i=0;i<160;i++) {
      const b=this.bankE1[base+i];
      const x=i*4;
      const p0=(b>>6)&3, p1=(b>>4)&3, p2=(b>>2)&3, p3=b&3;
      this.putPixel(data,x,y,this.paletteColor(palette,p0));
      this.putPixel(data,x+1,y,this.paletteColor(palette,4+p1));
      this.putPixel(data,x+2,y,this.paletteColor(palette,8+p2));
      this.putPixel(data,x+3,y,this.paletteColor(palette,12+p3));
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
