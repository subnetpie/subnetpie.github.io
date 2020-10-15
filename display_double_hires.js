//
//  apple2e double hires display emulation
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
// ref: https://www.apple.asimov.net/documentation/hardware/video/
//
//     https://archive.org/download/Apple-Orchard-v1n2-1980-Fall/Apple-Orchard-v1n2-1980-Fall.pdf
//   80-Column Text Card Manual, Apple Comptiter, Inc., 1982.
//     https://www.apple.asimov.net/documentation/hardware/video/Apple%20IIe%2080-Column%20Text%20Card%20Manual.pdf
//   Extended 80-Column Text Card Supplement, Apple Computer, Inc., 1982.
//     https://www.apple.asimov.net/documentation/hardware/video/Extended%2080-Column%20Text%20Card%20Supplement%20IIe.pdf
//   Extended 80-Column Text / AppleColor Adapter Card, Apple Computer, Inc., 1984.
//     https://www.apple.asimov.net/documentation/hardware/video/Ext80ColumnAppleColorCard.pdf
//

export class DoubleHiresDisplay
{
  constructor(memory, canvas, hlines, vlines) {
    this._mem = memory;

    canvas.width = 564;  // 7*2*40 + 4
    canvas.height = 390; // 8*2*24 + 6

    this._context = canvas.getContext('2d', {alpha: false});
    this._context.imageSmoothingEnabled = false;
    this._context.webkitImageSmoothingEnabled = false;

    this._id1 = this._context.createImageData(564, 390);
    this._id2 = this._context.createImageData(564, 390);
    this._id = undefined;
    this._page1_init = false;
    this._page2_init = false;

    // when set, this over-rides color
    this._monochrome = 0;
    this.mpal = [];
    this.cpal = [
      [  0,   0,   0], // 0x0 black
      [ 96,  78, 189], // 0x2 dark blue
      [  0, 163,  96], // 0x4 dark green
      [ 20, 207, 253], // 0x6 medium blue
      [ 96, 114,   3], // 0x8 brown
      [156, 156, 156], // 0xa light gray
      [ 20, 245,  60], // 0xc green
      [114, 255, 208], // 0xe aquamarine
      [227,  30,  96], // 0x1 deep red
      [255,  68, 253], // 0x3 purple
      [156, 156, 156], // 0x5 dark gray
      [208, 195, 255], // 0x7 light blue
      [255, 106,  60], // 0x9 orange
      [255, 160, 208], // 0xb pink
      [208, 221, 141], // 0xd yellow
      [255, 255, 255]  // 0xf white
    ];
    this.r4 = [
        0,   // Black
        2,   // Dark Blue
        4,   // Dark Green
        6,   // Medium Blue
        8,   // Brown
        5,   // Gray 1
        12,  // Light Green
        14,  // Aqua
        1,   // Red
        3,   // Purple
        10,  // Gray 2
        7,  // Pink
        9,   // Orange
        11,   // Light Blue
        13,  // Yellow
        15   // White
    ];
    this.dcolors = [
        [  0,   0,   0], // 0x0 black
        [227,  30,  96], // 0x1 deep red
        [ 96,  78, 189], // 0x2 dark blue
        [255,  68, 253], // 0x3 purple
        [  0, 163,  96], // 0x4 dark green
        [156, 156, 156], // 0x5 dark gray
        [ 20, 207, 253], // 0x6 medium blue
        [208, 195, 255], // 0x7 light blue
        [ 96, 114,   3], // 0x8 brown
        [255, 106,  60], // 0x9 orange
        [156, 156, 156], // 0xa light gray
        [255, 160, 208], // 0xb pink
        [ 20, 245,  60], // 0xc green
        [208, 221, 141], // 0xd yellow
        [114, 255, 208], // 0xe aquamarine
        [255, 255, 255] // 0xf white
    ];
    this.reset();
  }

  get fore() {
    return this._monochrome;
  };
  set fore(rgb) {
    this._monochrome = rgb;
    if (rgb > 0) {
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = rgb & 0xff;
      for (let i=0; i<16; i++) {
        const bf = (0.34 * this.cpal[i][0] + 0.5 * this.cpal[i][1] + 0.16 * this.cpal[i][2]) / 0xff;
        this.mpal[i] = [
          Math.floor(bf * r),
          Math.floor(bf * g),
          Math.floor(bf * b)
        ];
      }
    }
    this.refresh();
  };

  get back() {
    return (this.pal[0][0] << 16) | (this.pal[0][1] << 8) | this.pal[0][2];
  };

  set back(rgb) {
    this.mpal[0][0] = (rgb >> 16) & 0xff;
    this.mpal[0][1] = (rgb >> 8) & 0xff;
    this.mpal[0][2] = rgb & 0xff;
    this.cpal[0][0] = (rgb >> 16) & 0xff;
    this.cpal[0][1] = (rgb >> 8) & 0xff;
    this.cpal[0][2] = rgb & 0xff;
    this.refresh();
  };

  drawPixel(data, off, color) {
    var c0 = color[0], c1 = color[1], c2 = color[2];
    data[off + 0] = c0;
    data[off + 1] = c1;
    data[off + 2] = c2;
    var nextOff = off + 564 * 4;
    data[nextOff + 0] = c0;
    data[nextOff + 1] = c1;
    data[nextOff + 2] = c2;
  }

  draw(addr) {
    const ae = addr & 0xfffe; // even
    const ao = addr | 0x0001; // odd
    const col = (ae & 0x7f) % 40;  // column: 0-39
    const ac0 = ae - col;  // col 0, 40, 80 address in bits 6,5
    const row = ((ac0 << 1) & 0xc0) | ((ac0 >> 4) & 0x38) | ((ac0 >> 10) & 0x07);
    if(row > 191) return;
    // data is spread across four bytes in main & aux memory
    const id = (addr < 0x4000) ? this._id1 : this._id2;
    this.draw_cell (
      id,
      row,
      col,
      this._mem._aux[ae], 
      this._mem._main[ae],
      this._mem._aux[ao],
      this._mem._main[ao]
    );
  }

  draw_cell(id, row, col, b0, b1, b2, b3) {
    const c = [
      0,
      ((b0 & 0x0f) >> 0), // 0
      ((b0 & 0x70) >> 4) | ((b1 & 0x01) << 3), // 1
      ((b1 & 0x1e) >> 1), // 2
      ((b1 & 0x60) >> 5) | ((b2 & 0x03) << 2), // 3
      ((b2 & 0x3c) >> 2), // 4
      ((b2 & 0x40) >> 6) | ((b3 & 0x07) << 1), // 5
      ((b3 & 0x78) >> 3), // 6
      0
    ]; // 7
    const hb = [
      0,
      b0 & 0x80, // 0
      b0 & 0x80, // 1
      b1 & 0x80, // 2
      b2 & 0x80, // 3
      b2 & 0x80, // 4
      b3 & 0x80, // 5
      b3 & 0x80, // 6
      0
    ]; // 7
    const pal = (this._monochrome > 0) ? this.mpal : this.cpal;
    var r4 = this.r4;
    var dcolors = this.dcolors;
    const pca = [
      pal[((b0 & 0x0f) >> 0)], // a
      pal[((b0 & 0x70) >> 4) | ((b1 & 0x01) << 3)], // b
      pal[((b1 & 0x1e) >> 1)], // c
      pal[((b1 & 0x60) >> 5) | ((b2 & 0x03) << 2)], // d
      pal[((b2 & 0x3c) >> 2)], // e
      pal[((b2 & 0x40) >> 6) | ((b3 & 0x07) << 1)], // f
      pal[((b3 & 0x78) >> 3)] // g
    ];

    // row: 0-191, col: 0-39
    const ox = (col * 14) + 1;
    const oy = (row * 2) + 3;
    const lo = (ox + oy * 564) * 4;
    const data = id.data;

    let po = 0; 
    let off = 0;
    let rgb = pca[po];
    for(let x=lo, xmax=lo+112; x<xmax; x+=16, po++) {
//      var hbs = hb[po];
//      var dcolor = dcolors[r4[c[po]]];
//      var bits = c[po-1] | (c[po] << 4) | (c[po+1] << 8);      
//      for (idx = 1; idx < 8; idx++) {

      for(let jdx = 0; jdx <= 4; jdx++) {
        rgb = pca[po];
//        if ((c[po] != c[po - 1]) && (c[po] != c[po + 1]) &&
//           (((bits & 0x1c) == 0x1c) ||
//           ((bits & 0x70) == 0x70) ||
//           ((bits & 0x38) == 0x38))) 
//        {
//          rgb[0] = rgb[1] = rgb[2] = 255;
//        } else {
//        }
//        drawPixel(x+off, rgb);

        data[x+off+0] = data[x+off+2256] = rgb[0];
        data[x+off+1] = data[x+off+2257] = rgb[1];
        data[x+off+2] = data[x+off+2258] = rgb[2];
        off += 4;
      }
    }
    if(id == this._id) this._context.putImageData(this._id, 0, 0, ox, oy, 28, 2);
  }

    refresh() {
      if (this._id == this._id1) {
        this._id = undefined; // suspend rendering
        for (let a=0x2000; a<0x4000; a++) this.draw(a);
          this._id = this._id1;
          this._context.putImageData(this._id, 0, 0);
        } else if (this._id == this._id2) {
          this._id = undefined; // suspend rendering
          for (let a=0x4000; a<0x6000; a++) this.draw(a);
          this._id = this._id2;
          this._context.putImageData(this._id, 0, 0);
        }
      }
    
      set_active_page(page) {
        if (page != 2) {
          // select page 1
          if (!this._page1_init) {
            this._id = undefined; // suspend rendering
            for (let a=0x2000; a<0x4000; a++) this.draw(a);
            this._page1_init = true;
          }
          this._id = this._id1;
        } else {
          // select page 2
          if (!this._page2_init) {
            this._id = undefined; // suspend rendering
            for (let a=0x4000; a<0x6000; a++) this.draw(a);
            this._page2_init = true;
          }
          this._id = this._id2;
        }
        this._context.putImageData(this._id, 0, 0);
      }

      reset() {
        const imax = 564 * 390 * 4; // (560+4, 384+6) * rgba
        for (let i=0; i<imax; i+=4) {
          this._id1.data[i]   = this._id2.data[i]   = 0x00;
          this._id1.data[i+1] = this._id2.data[i+1] = 0x00;
          this._id1.data[i+2] = this._id2.data[i+2] = 0x00;
          this._id1.data[i+3] = this._id2.data[i+3] = 0xff;
        }
        this._context.putImageData(this._id1, 0, 0);
        this._id = undefined;
        this._page1_init = false;
        this._page2_init = false;
    }
}

