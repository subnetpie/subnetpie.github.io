// Apple IIgs-capable video subsystem.
// Legacy Apple II/IIe modes remain owned by IOManager (Mega II-compatible path).
// Super Hi-Res uses IIgs bank $E1 video memory:
//   $2000-$9CFF pixel data, $9D00-$9DC7 scan-line control bytes,
//   $9E00-$9FFF 16 x 16-entry 12-bit RGB palettes.

export class IIgsVideo {
  constructor(canvas, legacyVideo = null, scanlineIrq = null) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", {alpha:false});
    this.context.imageSmoothingEnabled = false;
    this.legacy = legacyVideo;
    this.scanlineIrq = scanlineIrq;
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
    this.bankE1 = new Uint8Array(0x10000);
    this.newVideo = 0;
    this.superHires = false;
    this.dirty = true;
    this.image = this.context.createImageData(640, 200);
    this.reset();
  }

  reset() {
    this.newVideo = 0;
    this.superHires = false;
    this.bankE1.fill(0);
    this.dirty = true;
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
  }

  // Decode one of the 200 scan-line control bytes at $E1:9D00-$E1:9DC7.
  // bit 7: 640 mode, bit 6: scan-line interrupt, bit 5: 320 fill mode,
  // bits 3-0: palette number. Fill is ignored by 640 mode.
  decodeSCB(y) {
    const raw = this.bankE1[0x9d00 + (y % 200)];
    return {
      raw,
      mode640: (raw & 0x80) !== 0,
      interrupt: (raw & 0x40) !== 0,
      fill: (raw & 0x20) !== 0,
      palette: raw & 0x0f
    };
  }

  beginScanline(y) {
    this.currentScanline = y % 200;
    const scb = this.decodeSCB(this.currentScanline);
    if (scb.interrupt) {
      this.scanlineIrqPending = true;
      if (this.scanlineIrq) this.scanlineIrq(this.currentScanline, scb.raw);
    }
    return scb;
  }

  clearScanlineInterrupt() { this.scanlineIrqPending = false; }
  isScanlineInterruptPending() { return this.scanlineIrqPending; }

  // $C029 NEWVIDEO. Bit 7 selects Super Hi-Res; clearing it returns display
  // ownership to the Mega II-compatible Apple II/IIe video path.
  writeNewVideo(value) {
    this.newVideo = value & 0xff;
    this.superHires = (this.newVideo & 0x80) !== 0;
    this.dirty = true;
    if (!this.superHires && this.legacy && this.legacy.refresh) this.legacy.refresh();
  }

  readNewVideo() { return this.newVideo; }
  isSuperHires() { return this.superHires; }

  readBankE1(addr) { return this.bankE1[addr & 0xffff]; }

  writeBankE1(addr, value) {
    addr &= 0xffff;
    this.bankE1[addr] = value & 0xff;
    if (addr >= 0x2000 && addr < 0xa000) this.dirty = true;
  }

  paletteColor(palette, index) {
    const a = 0x9e00 + ((palette & 0x0f) << 5) + ((index & 0x0f) << 1);
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
    const base = 0x2000 + y * 160;
    let last = 0;
    for (let i=0;i<160;i++) {
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
    const base = 0x2000 + y * 160;
    const palette = scb.palette;
    // In 640 mode each 2-bit pixel selects one of four colors from a
    // position-dependent group inside the scan line's selected 16-color palette.
    // Pixel positions 0..3 use entries {0,4,8,12}, {0,1,2,3},
    // {0,5,10,15}, and {0,2,4,6}, respectively.
    const maps = [
      [0,4,8,12],
      [0,1,2,3],
      [0,5,10,15],
      [0,2,4,6]
    ];
    for(let i=0;i<160;i++) {
      const b=this.bankE1[base+i];
      const x=i*4;
      const p0=(b>>6)&3, p1=(b>>4)&3, p2=(b>>2)&3, p3=b&3;
      this.putPixel(data,x,y,this.paletteColor(palette,maps[0][p0]));
      this.putPixel(data,x+1,y,this.paletteColor(palette,maps[1][p1]));
      this.putPixel(data,x+2,y,this.paletteColor(palette,maps[2][p2]));
      this.putPixel(data,x+3,y,this.paletteColor(palette,maps[3][p3]));
    }
  }

  refresh(force=false) {
    if (!this.superHires || (!force && !this.dirty)) return false;
    const data=this.image.data;
    for(let y=0;y<200;y++) {
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
