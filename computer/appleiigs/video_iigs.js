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
    this.vblActive = false;
    this.bankE1 = new Uint8Array(0x10000); // replaced by bus backing store on IIgs
    this.newVideo = 0x01;
    this.borderColor = 0x02;
    this.textColor = 0xf2;
    this.monochrome = 0x00;
    this.superHires = false;
    // When SHR is disabled, the hardware register changes immediately, but
    // browser presentation waits for the next emulated frame boundary. This
    // mirrors MAME's screen().update_now() behavior without exposing a
    // partially prepared compatibility frame.
    this.compatRevealPending = false;
    this.compatRevealAgeFrames = 0;
    this.compatRevealWrites = 0;
    this.compatRevealSawActivity = false;
    this.compatRevealQuietFrames = 0;
    this.dirty = true;
    this.dirtyLines = new Uint8Array(SHR_LINES);
    this.paletteDirtyMask = 0xffff;
    this.image = this.context.createImageData(640, 200);
    // Presentation-only 640-mode dither filter scratch. One byte per
    // two-pixel pair is enough to preserve all blend decisions before any
    // pixels are modified.
    this.blendMask = new Uint8Array(320);
    this.image32 = new Uint32Array(
      this.image.data.buffer,
      this.image.data.byteOffset,
      this.image.data.byteLength >>> 2
    );

    // Reuse the SHR staging surface. Creating a canvas/context on every
    // refresh is particularly expensive in mobile Safari.
    this.offscreen = document.createElement("canvas");
    this.offscreen.width = 640;
    this.offscreen.height = 200;
    this.offscreenContext = this.offscreen.getContext("2d", {alpha:false});
    this.offscreenContext.imageSmoothingEnabled = false;

    // 16 palettes * 16 entries * RGB. Rebuilt only when a dirty SHR frame
    // is actually rendered, avoiding per-pixel temporary arrays.
    this.paletteRgb = new Uint8Array(16 * 16 * 3);
    this.reset();
  }

  attachBankE1(bytes) {
    if(!(bytes instanceof Uint8Array) || bytes.length < 0x10000)
      throw new Error("IIgs VGC requires a 64K bank E1 backing store");
    this.bankE1 = bytes.subarray(0,0x10000);
    this.markAllDirty(true);
  }

  reset() {
    // ROM 03 hardware reset value, matching MAME 0.289 machine_reset().
    this.newVideo = 0x01;
    this.borderColor = 0x02;
    this.textColor = 0xf2;
    this.monochrome = 0x00;
    this.superHires = false;
    this.compatRevealPending = false;
    this.compatRevealAgeFrames = 0;
    this.compatRevealWrites = 0;
    this.compatRevealSawActivity = false;
    this.compatRevealQuietFrames = 0;
    // RAM clearing is owned by the IIgs memory bus, not the VGC.
    this.markAllDirty(true);
    this.scanlineIrqPending = false;
    this.currentScanline = 0;
    this.vblActive = false;
    this.vgcIntEnable = 0;
    this.vgcIntStatus = 0;
    this.vgcIrqRaised = 0;
    this.scanCycleAccum = 0;
    this.frameCount = 0;
    this.secondFrameCount = 0;
    this.updateIRQ();
  }

  markAllDirty(palettes=false) {
    this.dirtyLines.fill(1);
    this.dirty = true;
    if(palettes) this.paletteDirtyMask = 0xffff;
  }

  markLineDirty(y) {
    y|=0;
    if(y<0 || y>=SHR_LINES) return;
    this.dirtyLines[y]=1;
    this.dirty=true;
  }

  markPaletteDirty(palette) {
    this.paletteDirtyMask |= 1 << (palette & 15);
    this.dirty=true;
  }

  markPhysicalPixelDirty(addr) {
    // Rendering reads two 80-byte physical strips per visible line.
    if(addr>=SHR_PIXEL_BASE && addr<SHR_PIXEL_BASE+SHR_BYTES_PER_PLANE_LINE*SHR_LINES)
      this.markLineDirty(((addr-SHR_PIXEL_BASE)/SHR_BYTES_PER_PLANE_LINE)|0);
    if(addr>=SHR_PIXEL_PLANE2 && addr<SHR_PIXEL_PLANE2+SHR_BYTES_PER_PLANE_LINE*SHR_LINES)
      this.markLineDirty(((addr-SHR_PIXEL_PLANE2)/SHR_BYTES_PER_PLANE_LINE)|0);
  }

  markWriteDirty(logical, physical) {
    // Pixel data is consumed from the mapped physical addresses.
    this.markPhysicalPixelDirty(physical);

    // SCB/palette reads go through the same logical NEWVIDEO transform as
    // writes, so CPU-visible writes to those windows must invalidate them
    // even when their mapped destination lies in a pixel strip.
    if(logical>=SHR_SCB_BASE && logical<SHR_SCB_END)
      this.markLineDirty(logical-SHR_SCB_BASE);
    if(logical>=SHR_PALETTE_BASE && logical<SHR_PALETTE_END)
      this.markPaletteDirty((logical-SHR_PALETTE_BASE)>>>5);

    // Also cover direct physical writes used by slow-bank/shadow paths.
    if(physical>=SHR_SCB_BASE && physical<SHR_SCB_END)
      this.markLineDirty(physical-SHR_SCB_BASE);
    if(physical>=SHR_PALETTE_BASE && physical<SHR_PALETTE_END)
      this.markPaletteDirty((physical-SHR_PALETTE_BASE)>>>5);
  }

  beamVPos() {
    // MAME get_vpos(), adapted to the 262-line NTSC timing used here.
    // BORDER_TOP is 16. MAME carries V at hpos >=
    // BORDER_LEFT + (40-ALIGN_CNT)*16. With BORDER_LEFT=32 and
    // ALIGN_CNT=2 this is count 40 in our 65-count scanline.
    let v=this.currentScanline;
    const frac=this.scanCycleAccum/(2800000/(60*262));
    if(frac >= 40/65) v++;
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
    // hpos/16 maps to our 0..64 count. MAME's
    // (hpos-BORDER_LEFT)/16 + (25+ALIGN_CNT), with BORDER_LEFT/16=2
    // and ALIGN_CNT=2, reduces to hpos/16 + 25.
    let ret=(Math.floor((this.scanCycleAccum/perLine)*65)+25)%65;
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
      if(this.currentScanline === 208) this.vblActive = true;
      else if(this.currentScanline === 16) this.vblActive = false;
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
    value &= 0xff;
    if(value===this.newVideo) return;
    const previousShr = this.superHires;
    this.newVideo = value;
    this.superHires = (this.newVideo & 0x80) !== 0;
    if (this.doubleHires && this.doubleHires.setMonochrome) {
      this.doubleHires.setMonochrome((this.newVideo & 0x20) !== 0);
    }
    // Changing NEWVIDEO changes the SHR address transform itself, so this is
    // one of the few cases that legitimately invalidates every scanline.
    this.markAllDirty(true);
    if (previousShr && !this.superHires) {
      // Preserve the last completed SHR image until the emulated frame
      // boundary. Compatibility RAM/cache state may continue changing in the
      // meantime; presentation is switched atomically by Motherboard.clock().
      this.compatRevealPending = true;
      this.compatRevealAgeFrames = 0;
      this.compatRevealWrites = 0;
      this.compatRevealSawActivity = false;
      this.compatRevealQuietFrames = 0;
    }
  }

  noteCompatVideoWrite(addr) {
    if(!this.compatRevealPending) return;
    addr &= 0xffff;
    if((addr>=0x0400 && addr<0x0c00) || (addr>=0x2000 && addr<0x6000))
      this.compatRevealWrites++;
  }

  shouldRevealCompatibility() {
    if(!this.compatRevealPending) return false;

    this.compatRevealAgeFrames++;
    if(this.compatRevealWrites >= 32) {
      this.compatRevealSawActivity = true;
      this.compatRevealQuietFrames = 0;
    } else if(this.compatRevealSawActivity) {
      this.compatRevealQuietFrames++;
    }
    this.compatRevealWrites = 0;

    // Keep launch artwork over active compatibility redraws. Reveal after one
    // quiet frame once a real redraw burst has occurred. The timeout prevents
    // sparse/black-starting games from being hidden indefinitely.
    return (this.compatRevealSawActivity && this.compatRevealQuietFrames >= 1) ||
           this.compatRevealAgeFrames >= 300;
  }

  consumeCompatRevealPending() {
    const pending=this.compatRevealPending;
    this.compatRevealPending=false;
    this.compatRevealAgeFrames = 0;
    this.compatRevealWrites = 0;
    this.compatRevealSawActivity = false;
    this.compatRevealQuietFrames = 0;
    return pending;
  }

  readNewVideo() { return this.newVideo; }
  setBorderColor(value) { this.borderColor=value&0x0f; }
  getBorderColor() { return this.borderColor&0x0f; }
  setTextColor(value) { this.textColor=value&0xff; }
  getTextColor() { return this.textColor&0xff; }
  setMonochrome(value) { this.monochrome=value&0xff; }
  isSuperHires() { return this.superHires; }

  restoreLegacyCanvas() {
    // Legacy Apple II renderers are built around the original 564x390
    // backing surface. Resize only when compatibility video is actually
    // revealed, so the last SHR frame can remain visible during the existing
    // atomic SHR->Mega II transition.
    if(this.canvas.width !== 564 || this.canvas.height !== 390) {
      this.canvas.width = 564;
      this.canvas.height = 390;
      this.context = this.canvas.getContext("2d", {alpha:false});
      this.context.imageSmoothingEnabled = false;
    }
  }

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
    const physical=this.mapAuxAddress(logical);
    value &= 0xff;
    if(this.bankE1[physical]===value) return;
    this.bankE1[physical] = value;
    this.markWriteDirty(logical,physical);
  }

  rebuildPaletteCache(mask=0xffff) {
    const rgb = this.paletteRgb;
    for(let palette=0; palette<16; palette++) {
      if(!(mask & (1<<palette))) continue;
      for(let index=0; index<16; index++) {
        const a = SHR_PALETTE_BASE + (palette << 5) + (index << 1);
        const word = this.readBankE1(a) | (this.readBankE1(a + 1) << 8);
        const o = ((palette << 4) | index) * 3;
        rgb[o] = ((word >> 8) & 0x0f) * 17;
        rgb[o+1] = ((word >> 4) & 0x0f) * 17;
        rgb[o+2] = (word & 0x0f) * 17;
      }
    }
  }

  putPalettePixel(data, x, y, palette, index) {
    const src = (((palette & 0x0f) << 4) | (index & 0x0f)) * 3;
    const dst = (y * 640 + x) * 4;
    const rgb = this.paletteRgb;
    data[dst] = rgb[src];
    data[dst+1] = rgb[src+1];
    data[dst+2] = rgb[src+2];
    data[dst+3] = 255;
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
        this.putPalettePixel(data,x,y,palette,a);
        this.putPalettePixel(data,x+1,y,palette,a);
        this.putPalettePixel(data,x+2,y,palette,c);
        this.putPalettePixel(data,x+3,y,palette,c);
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
        this.putPalettePixel(data,x,y,palette,p0);
        this.putPalettePixel(data,x+1,y,palette,4+p1);
        this.putPalettePixel(data,x+2,y,palette,8+p2);
        this.putPalettePixel(data,x+3,y,palette,12+p3);
      }
    }
  }

  blend640Line(y, data) {
    // Presentation filter for repeating two-pixel color dithers. Determine
    // every blend decision before modifying pixels so blending cannot
    // propagate. Packed RGBA equality replaces eight byte comparisons per
    // neighboring pair, and the old full 2560-byte row copy is unnecessary.
    const pixelBase=y*640;
    const byteBase=pixelBase*4;
    const px=this.image32;
    const mask=this.blendMask;
    mask.fill(0);

    for(let pair=0;pair<320;pair++) {
      const p=pixelBase+(pair<<1);
      const a=byteBase+(pair<<3), b=a+4;
      const colored =
        data[a]!==data[a+1] || data[a+1]!==data[a+2] ||
        data[b]!==data[b+1] || data[b+1]!==data[b+2];
      if(!colored) continue;

      const p0=px[p], p1=px[p+1];
      const prev=pair>0 &&
        p0===px[p-2] && p1===px[p-1];
      const next=pair<319 &&
        p0===px[p+2] && p1===px[p+3];
      if(prev || next) mask[pair]=1;
    }

    for(let pair=0;pair<320;pair++) {
      if(!mask[pair]) continue;
      const a=byteBase+(pair<<3), b=a+4;
      // Values are 0..255, so (a+b+1)>>1 is exactly Math.round((a+b)/2).
      const r=(data[a]+data[b]+1)>>1;
      const g=(data[a+1]+data[b+1]+1)>>1;
      const bl=(data[a+2]+data[b+2]+1)>>1;
      data[a]=data[b]=r;
      data[a+1]=data[b+1]=g;
      data[a+2]=data[b+2]=bl;
    }
  }

  refresh(force=false) {
    if(!this.superHires) return false;
    if(force) this.markAllDirty(true);
    if(!this.dirty) return false;

    const data=this.image.data;
    const paletteMask=this.paletteDirtyMask;
    if(paletteMask) {
      this.rebuildPaletteCache(paletteMask);
      // A palette update affects only scanlines whose SCB currently selects
      // that palette. Walking 200 SCBs is much cheaper than redrawing 128K
      // pixels, and also handles a palette change with no pixel writes.
      for(let y=0;y<SHR_LINES;y++) {
        const palette=this.readBankE1(SHR_SCB_BASE+y)&0x0f;
        if(paletteMask & (1<<palette)) this.dirtyLines[y]=1;
      }
      this.paletteDirtyMask=0;
    }

    let firstDirty=SHR_LINES, lastDirty=-1;
    for(let y=0;y<SHR_LINES;y++) {
      if(!this.dirtyLines[y]) continue;
      const scb=this.decodeSCB(y);
      if(scb.mode640) {
        this.render640Line(y,scb,data);
        // The AppleColor RGB monitor optically blended repeating adjacent
        // 640-mode dither pixels. Modern LCD resampling exposes those columns
        // as beat/banding patterns. Blend only stable repeating pairs; text,
        // edges and isolated pixels remain at native 640-mode resolution.
        this.blend640Line(y,data);
      } else {
        this.render320Line(y,scb,data);
      }
      this.dirtyLines[y]=0;
      if(y<firstDirty) firstDirty=y;
      if(y>lastDirty) lastDirty=y;
    }

    if(lastDirty<0) {
      this.dirty=false;
      return false;
    }

    // Upload only the changed vertical band into the persistent staging
    // canvas. The final scaled blit stays one drawImage call for stable Safari
    // compositing and avoids seams from independently scaled scanline strips.
    this.offscreenContext.putImageData(
      this.image,0,0,0,firstDirty,640,lastDirty-firstDirty+1
    );
    // SHR is 640 logical pixels wide. Do not squeeze it into the legacy
    // 560-pixel Apple II aperture: that resampling aliases one-pixel dither
    // columns and makes System 6 fills look uneven/solid. The canvas backing
    // store follows SHR at 640x400 (2x vertical) for square-looking IIgs
    // pixels while retaining every horizontal source pixel.
    if(this.canvas.width !== 640 || this.canvas.height !== 400) {
      this.canvas.width = 640;
      this.canvas.height = 400;
      this.context = this.canvas.getContext("2d", {alpha:false});
    }
    this.context.save();
    this.context.imageSmoothingEnabled=false;
    this.context.fillStyle="#000";
    this.context.fillRect(0,0,640,400);
    this.context.drawImage(this.offscreen,0,0,640,200,0,0,640,400);
    this.context.restore();
    this.dirty=false;
    return true;
  }
}
