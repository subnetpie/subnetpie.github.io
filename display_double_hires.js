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

        // apple tech notes #63: master color values, p.326
        // https://www.apple.asimov.net/documentation/misc/Apple2TechNotes1993.pdf
        // modified to soften black & white

       this.cpal = [

//          [0x11,0x11,0x11], [0xdd,0x00,0x33], [0x00,0x00,0x99], [0xdd,0x22,0xdd],
//          [0x00,0x77,0x22], [0x55,0x55,0x55], [0x22,0x22,0xff], [0x66,0xaa,0xff],
//          [0x88,0x55,0x00], [0xff,0x66,0x00], [0xaa,0xaa,0xaa], [0xff,0x99,0x88],
//          [0x11,0xdd,0x00], [0xff,0xff,0x00], [0x44,0xff,0x99], [0xee,0xee,0xee]

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
          [255, 255, 255] // 0xf white

        ];

        this.reset();

    }

    get fore() {
        return this._monochrome;
    };
    set fore(rgb) {
        this._monochrome = rgb;
        if(rgb > 0) {
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = rgb & 0xff;
            for(let i=0; i<16; i++) {
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

    draw(addr) {
        const ae = addr & 0xfffe; // even
        const ao = addr | 0x0001; // odd

        // rows are 120 columns wide consuming 128 bytes (0-119)+8
        // every 40 columns rows wrap for a total of three wraps
        // 8 rows wrapping 3 times creates a total of 24 rows
        // bits 6,5 ($60) of columns 0,40,80 yield the wrap row 0,1,2
        // bits 9,8,7 yield the 0-7 relative row number
        //
        // hires graphics repeats the above pattern eight times:
        // $0000, $0400, $0800, $0c00, $1000, $1400, $1800, $1c00
        // bits 12-10 ($1c00) of the address are the repeat number 0-7
        const col = (ae & 0x7f) % 40;  // column: 0-39
        const ac0 = ae - col;  // col 0, 40, 80 address in bits 6,5
        const row = ((ac0 << 1) & 0xc0) | ((ac0 >> 4) & 0x38) | ((ac0 >> 10) & 0x07);
        if(row > 191) return;

        // data is spread across four bytes in main & aux memory
        const id = (addr < 0x4000) ? this._id1 : this._id2;
        this.draw_cell(id, row, col, this._mem._aux[ae], this._mem._main[ae],
                                     this._mem._aux[ao], this._mem._main[ao]);
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

//    const hb = [
//      0,
//      b0 & 0x80, // 0
//      b0 & 0x80, // 1
//      b1 & 0x80, // 2
//      b2 & 0x80, // 3
//      b2 & 0x80, // 4
//      b3 & 0x80, // 5
//      b3 & 0x80, // 6
//      0
//    ]; // 7

        const pal = (this._monochrome > 0) ? this.mpal : this.cpal;

        //         main     aux
        // 2000: xddccccb xbbbaaaa
        // 2001: xggggfff xfeeeedd
        //         <--- read ---
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
        for(let x=lo, xmax=lo+112; x<xmax; x+=16) {
          const rgb = pca[po++];
          var bits = c[po-1] | (c[po] << 4) | (c[po+1] << 8);
        
         

 //      for (idx = 1; idx < 8; idx++) {
 //        hbs = hb[idx];
 //        var dcolor = dcolors[r4[c[po++]]];

 //       function _drawHalfPixel(data, off, color) {
 //         var c0 = dcolor[0], c1 = dcolor[1], c2 = dcolor[2];

         let off = 0;
         for(let jdx = 0; jdx < 5; jdx++) {

            if ((pca[po] != pca[po - 1]) && (pca[po] != pca[po + 1]) &&
               (((bits & 0x1c) == 0x1c) ||
               ((bits & 0x70) == 0x70) ||
               ((bits & 0x38) == 0x38))) 
            { 
              pca[po] = [255,255,255];
            }

            data[x+off]   = data[x+off+2256] = rgb[0];
            data[x+off+1] = data[x+off+2257] = rgb[1];
            data[x+off+2] = data[x+off+2258] = rgb[2];
            off += 4;
          }
        }
        if(id == this._id) this._context.putImageData(this._id, 0, 0, ox, oy, 28, 2);
    }

    refresh() {
        if(this._id == this._id1) {
            this._id = undefined; // suspend rendering
            for(let a=0x2000; a<0x4000; a++) this.draw(a);
            this._id = this._id1;
            this._context.putImageData(this._id, 0, 0);
        }
        else if(this._id == this._id2) {
            this._id = undefined; // suspend rendering
            for(let a=0x4000; a<0x6000; a++) this.draw(a);
            this._id = this._id2;
            this._context.putImageData(this._id, 0, 0);
        }
    }
    
    set_active_page(page) {
        if(page != 2) {
            // select page 1
            if(!this._page1_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x2000; a<0x4000; a++) this.draw(a);
                this._page1_init = true;
            }
            this._id = this._id1;
        } else {
            // select page 2
            if(!this._page2_init) {
                this._id = undefined; // suspend rendering
                for(let a=0x4000; a<0x6000; a++) this.draw(a);
                this._page2_init = true;
            }
            this._id = this._id2;
        }
        this._context.putImageData(this._id, 0, 0);
    }

    reset() {
        const imax = 564 * 390 * 4; // (560+4, 384+6) * rgba
        for(let i=0; i<imax; i+=4) {
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

