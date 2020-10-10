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

export function HiresPage(page, context)
{
    var _page = page;
    var _imageData;
    var _dirty = {
        top: 385,
        bottom: -1,
        left: 561,
        right: -1
    };

    var r4 = [
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

    var dcolors = [
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
        [255, 255, 255], // 0xf white
    ];

    var _buffer = [];
    var _refreshing = false;

    var _monoMode = false;

    function _init() {
        var idx;
        _imageData = context.createImageData(560, 384);
        for (idx = 0; idx < 560 * 384 * 4; idx++) {
            _imageData.data[idx] = 0xff;
        }
        _buffer[0] = allocMemPages(0x20);
        _buffer[1] = allocMemPages(0x20);
    }

    function _drawPixel(data, off, color) {
        var c0 = color[0], c1 = color[1], c2 = color[2];

        data[off + 0] = data[off + 4] = c0;
        data[off + 1] = data[off + 5] = c1;
        data[off + 2] = data[off + 6] = c2;
        var nextOff = off + 560 * 4;
        data[nextOff] = data[nextOff + 4] = c0;
        data[nextOff + 1] = data[nextOff + 5] = c1;
        data[nextOff + 2] = data[nextOff + 6] = c2;
    }

    function _drawHalfPixel(data, off, color) {
        var c0 = color[0], c1 = color[1], c2 = color[2];
        data[off + 0] = c0;
        data[off + 1] = c1;
        data[off + 2] = c2;
        var nextOff = off + 560 * 4;
        data[nextOff] = c0;
        data[nextOff + 1] = c1;
        data[nextOff + 2] = c2;
    }

    //
    // 160x192 pixels alternate 3 and 4 base pixels wide
    //

    function _draw3Pixel(data, off, color) {
        var c0 = color[0], c1 = color[1], c2 = color[2];

        data[off + 0] = data[off + 4] = data[off + 8] = c0;
        data[off + 1] = data[off + 5] = data[off + 9] = c1;
        data[off + 2] = data[off + 6] = data[off + 10] = c2;
        var nextOff = off + 560 * 4;
        data[nextOff] = data[nextOff + 4] = data[nextOff + 8] = c0;
        data[nextOff + 1] = data[nextOff + 5] = data[nextOff + 9] = c1;
        data[nextOff + 2] = data[nextOff + 6] = data[nextOff + 10] = c2;
    }

    function _draw4Pixel(data, off, color) {
        var c0 = color[0], c1 = color[1], c2 = color[2];

        data[off + 0] = data[off + 4] = data[off + 8] = data[off + 12] = c0;
        data[off + 1] = data[off + 5] = data[off + 9] = data[off + 13] = c1;
        data[off + 2] = data[off + 6] = data[off + 10] = data[off + 14] = c2;
        var nextOff = off + 560 * 4;
        data[nextOff] = data[nextOff + 4] = data[nextOff + 8] = data[nextOff + 12] = c0;
        data[nextOff + 1] = data[nextOff + 5] = data[nextOff + 9] = data[nextOff + 13] = c1;
        data[nextOff + 2] = data[nextOff + 6] = data[nextOff + 10] = data[nextOff + 14] = c2;
    }

    _init();

    return {
        bank0: function() {
            var self = this;
            return {
                start: function() {
                    return self._start();
                },
                end: function() {
                    return self._end();
                },
                read: function(page, off) {
                    return self._read(page, off, 0);
                },
                write: function(page, off, val) {
                    return self._write(page, off, val, 0);
                }
            };
        },

        bank1: function() {
            var self = this;
            return {
                start: function() {
                    return self._start();
                },
                end: function() {
                    return self._end();
                },
                read: function(page, off) {
                    return self._read(page, off, 1);
                },
                write: function(page, off, val) {
                    return self._write(page, off, val, 1);
                }
            };
        },

        _start: function() { return (0x20 * _page); },

        _end: function() { return (0x020 * _page) + 0x1f; },

        _read: function(page, off, bank) {
            var addr = (page << 8) | off, base = addr & 0x1FFF;
            return _buffer[bank][base];
        },

        _write: function(page, off, val, bank) {
            var addr = (page << 8) | off, base = addr & 0x1FFF,
                idx, jdx;

            if (_buffer[bank][base] == val && !_refreshing) {
                return;
            }
            _buffer[bank][base] = val;

            var hbs = val & 0x80;

            var col = (base % 0x80) % 0x28,
                adj = off - col;

            // 000001cd eabab000 -> 000abcde
            var ab = (adj & 0x18),
                cd = (page & 0x03) << 1,
                e = adj >> 7;

            var rowa = ab | cd | e,
                rowb = base >> 10;

            var dx, dy, data = _imageData.data;
            if ((rowa < 24) && (col < 40)) {
                if (!multiScreen && !hiresMode) {
                    return;
                }

                var y = rowa << 4 | rowb << 1;
                if (y < _dirty.top) { _dirty.top = y; }
                y += 2;
                if (y > _dirty.bottom) { _dirty.bottom = y; }
                var x = col * 14 - 2;
                if (x < _dirty.left) { _dirty.left = x; }
                x += 18;
                if (x > _dirty.right) { _dirty.right = x; }

                dy = rowa << 4 | rowb << 1;
                var bz, b0, b1, b2, b3, b4, c, hb;
                if (oneSixtyMode && !_monoMode) {
                    // 1 byte = two pixels, but 3:4 ratio
                    var c3 = val & 0xf;
                    var c4 = val >> 4;

                    dx = col * 2 + (bank ^ 1);
                    off = dx * 28 + dy * 280 * 4 * 2;

                    _draw3Pixel(data, off, dcolors[c3]);
                    _draw4Pixel(data, off + 12, dcolors[c4]);
                } else if (doubleHiresMode) {
                    val &= 0x7f;

                    // Every 4 bytes is 7 pixels
                    // 2 bytes per bank

                    // b0       b1       b2       b3
                    //  c0  c1    c2  c3    c4  c5    c6
                    // 76543210 76543210 76543210 76543210
                    //  1111222  2333344  4455556  6667777

                    var mod = col % 2, mcol = col - mod, baseOff = base - mod;
                    bz = _buffer[0][baseOff - 1];
                    b0 = _buffer[1][baseOff];
                    b1 = _buffer[0][baseOff];
                    b2 = _buffer[1][baseOff + 1];
                    b3 = _buffer[0][baseOff + 1];
                    b4 = _buffer[1][baseOff + 2];
                    c = [
                        0,
                        ((b0 & 0x0f) >> 0), // 0
                        ((b0 & 0x70) >> 4) | ((b1 & 0x01) << 3), // 1
                        ((b1 & 0x1e) >> 1), // 2
                        ((b1 & 0x60) >> 5) | ((b2 & 0x03) << 2), // 3
                        ((b2 & 0x3c) >> 2), // 4
                        ((b2 & 0x40) >> 6) | ((b3 & 0x07) << 1), // 5
                        ((b3 & 0x78) >> 3), // 6
                        0
                    ], // 7
                    hb = [
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
                    if (col > 0) {
                        c[0] = (bz & 0x78) >> 3;
                        hb[0] = bz & 0x80;
                    }
                    if (col < 39) {
                        c[8] = b4 & 0x0f;
                        hb[8] = b4 & 0x80;
                    }
                    dx = mcol * 14;
                    off = dx * 4 + dy * 280 * 4 * 2;

                    var monoColor = null;
                    if (_monoMode || monoDHRMode) {
                        monoColor = whiteCol;
                    }

                    for (idx = 1; idx < 8; idx++) {
                        hbs = hb[idx];
                        var dcolor = dcolors[r4[c[idx]]];
                        var bits = c[idx-1] | (c[idx] << 4) | (c[idx+1] << 8);
                        for (jdx = 0; jdx < 4; jdx++, off += 4) {
                            if (monoColor) {
                                if (bits & 0x10) {
                                    _drawHalfPixel(data, off, monoColor);
                                } else {
                                    _drawHalfPixel(data, off, blackCol);
                                }
                            } else if (mixedDHRMode) {
                                if (hbs) {
                                    _drawHalfPixel(data, off, dcolor);
                                } else {
                                    if (bits & 0x10) {
                                        _drawHalfPixel(data, off, whiteCol);
                                    } else {
                                        _drawHalfPixel(data, off, blackCol);
                                    }
                                }
                            } else if (colorDHRMode) {
                                _drawHalfPixel(data, off, dcolor);
                            } else if (
                                ((c[idx] != c[idx - 1]) && (c[idx] != c[idx + 1])) &&
                                (((bits & 0x1c) == 0x1c) ||
                                ((bits & 0x70) == 0x70) ||
                                ((bits & 0x38) == 0x38))
                            ) {
                                _drawHalfPixel(data, off, whiteCol);
                            } else if (
                                (bits & 0x38) ||
                                (c[idx] == c[idx + 1]) ||
                                (c[idx] == c[idx - 1])
                            ) {
                                _drawHalfPixel(data, off, dcolor);
                            }  else if (bits & 0x28) {
                                _drawHalfPixel(data, off, dim(dcolor));
                            } else {
                                _drawHalfPixel(data, off, blackCol);
                            }
                            bits >>= 1;
                        }
                    }

                    if (!_refreshing) {
                        _refreshing = true;
                        var bb = bank ? 0 : 1;
                        for (var rr = addr - 1; rr <= addr + 1; rr++) {
                            var vv = _buffer[bb][rr - 0x2000 * _page];
                            this._write(rr >> 8, rr & 0xff, vv, bb);
                        }
                        _refreshing = false;
                    }
                } else {
                    val = _buffer[0][base];
                    hbs = val & 0x80;
                    val &= 0x7f;
                    dx = col * 14 - 2;
                    b0 = col > 0 ? _buffer[0][base - 1] : 0;
                    b2 = col < 39 ? _buffer[0][base + 1] : 0;
                    val |= (b2 & 0x3) << 7;
                    var v0 = b0 & 0x20, v1 = b0 & 0x40, v2 = val & 0x1,
                        odd = !(col & 0x1),
                        color,
                        oddCol = (hbs ? orangeCol : greenCol),
                        evenCol = (hbs ? blueCol : violetCol);

                    off = dx * 4 + dy * 280 * 4 * 2;

                    monoColor = _monoMode ? whiteCol : null;

                    for (idx = 0; idx < 9; idx++, off += 8) {
                        val >>= 1;

                        if (v1) {
                            if (monoColor) {
                                color = monoColor;
                            } else if (highColorHGRMode) {
                                color = dcolors[_buffer[1][base] >> 4];
                            } else if (v0 || v2) {
                                color = whiteCol;
                            } else {
                                color = odd ? oddCol : evenCol;
                            }
                        } else {
                            if (monoColor) {
                                color = blackCol;
                            } else if (highColorHGRMode) {
                                color = dcolors[_buffer[1][base] & 0x0f];
                            } else if (odd && v2 && v0) {
                                color = v0 ? dim(evenCol) : evenCol;
                            } else if (!odd && v0 && v2) {
                                color = v2 ? dim(oddCol) : oddCol;
                            } else {
                                color = blackCol;
                            }
                        }

                        if (dx > -1 && dx < 560) {
                            _drawPixel(data, off, color);
                        }
                        dx += 2;

                        v0 = v1;
                        v1 = v2;
                        v2 = val & 0x01;
                        odd = !odd;
                    }
                }
            }
        },
        refresh: function() {
            var page, off, idx, addr = 0x2000 * _page;
            _refreshing = true;
            for (idx = 0; idx < 0x2000; idx++, addr++) {
                page = addr >> 8;
                off = addr & 0xff;
                this._write(page, off, _buffer[0][idx], 0);
                if (_80colMode) {
                    this._write(page, off, _buffer[1][idx], 1);
                }
            }
            _refreshing = false;
        },
        mono: function(on) {
            _monoMode = on;
            this.refresh();
        },
        blit: function(mixed) {
            if (_dirty.top === 385) { return false; }
            var top = _dirty.top;
            var bottom = _dirty.bottom;
            var left = _dirty.left;
            var right = _dirty.right;

            if (mixed) {
                if (top > 320) { return false; }
                if (bottom > 320) { bottom = 320; }
            }
            context.putImageData(
                _imageData, 0, 0, left, top, right - left, bottom - top
            );
            _dirty = {
                top: 385,
                bottom: -1,
                left: 561,
                right: -1
            };
            return true;
        },
        start: function() {
            return this._start();
        },
        end: function() {
            return this._end();
        },
        read: function(page, off) {
            return this._read(page, off, 0);
        },
        write: function(page, off, val) {
            return this._write(page, off, val, 0);
        },
        getState: function() {
            return {
                page: _page,
                mono: _monoMode,
                buffer: [
                    base64_encode(_buffer[0]),
                    base64_encode(_buffer[1])
                ]
            };
        },
        setState: function(state) {
            _page = state.page;
            _monoMode = state.mono;
            _buffer[0] = base64_decode(state.buffer[0]);
            _buffer[1] = base64_decode(state.buffer[1]);

            this.refresh();
        }
    };
}

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
          7,   // Pink
          9,   // Orange
          11,  // Light Blue
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
          [255, 255, 255], // 0xf white
       ];

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

         //         bbbaaaa.             ...xbbba
         // a           ^^^                     ^
         //pal[((b0 << 1) & 0x0e) | ((b0 >> 3) & 0x01)],
         //pal[((b0 << 0) & 0x0f)],
         //         ...xbbba            xddccccb
         // b           ^^^                    ^
         //pal[((b0 >> 3) & 0x0e) | (b1 & 0x01)],
         //        xddccccb       ....xddc
         // c          ^^^               ^
         //pal[(b1 & 0x0e) | ((b1 >> 4) & 0x01)],
         //pal[((b1 >> 1) & 0x0f)],
         //         eeedd...             ....xddc             .xfeeeed
         // d           ^                     ^^                     ^
         //pal[((b2 << 3) & 0x08) | ((b1 >> 4) & 0x06) | ((b2 >> 1) & 0x01)],
         //pal[((b1 >> 3) & 0x0f) | (b2 & 0x03)],
         //         .xfeeeed             .....xfe
         // e           ^^^                     ^
         //pal[((b2 >> 1) & 0x0e) | ((b2 >> 5) & 0x01)],
         //pal[((b2 >> 2) & 0x0f)],
         //         gggfff..             .....xfe             ..xggggf
         // f           ^^                     ^                     ^
         //pal[((b3 << 2) & 0x0c) | ((b2 >> 5) & 0x02) | ((b3 >> 2) & 0x01)],
         //pal[((b2 >> 3) & 0xf) | (b3 & 0x07)],
         //         ..xggggf             ......xg
         // g           ^^^                     ^
         //pal[((b3 >> 2) & 0x0e) | ((b3 >> 6) & 0x01)]
         //pal[((b3 >> 3) & 0x0f)]
         ];

        // row: 0-191, col: 0-39
        const ox = (col * 14) + 1;
        const oy = (row * 2) + 3;
        const lo = (ox + oy * 564) * 4;
        const data = id.data;

       // let po = 0;
       // for(let x=lo, xmax=lo+112; x<xmax; x+=16) {

       //   const rgb = pca[po++];

       for (idx = 1; idx < 8; idx++) {
 //        hbs = hb[idx];
         var dcolor = this.dcolors[this.r4[c[idx]]];
 //        var bits = c[idx-1] | (c[idx] << 4) | (c[idx+1] << 8);
         for (jdx = 0; jdx < 4; jdx++, off += 4) {

//function _drawHalfPixel(data, off, color) {
        var c0 = dcolor[0], c1 = dcolor[1], c2 = dcolor[2];
        data[off + 0] = c0;
        data[off + 1] = c1;
        data[off + 2] = c2;
        var nextOff = off + 560 * 4;
        data[nextOff] = c0;
        data[nextOff + 1] = c1;
        data[nextOff + 2] = c2;
      };
   //       data[x + 0] = rgb[0];
   //       data[x + 1] = data[x + 9] = rgb[1];
   //       data[x + 2] = rgb[2];
   //       var nextOff = x + 2256;
   //       data[nextOff + 0] = data[nextOff + 8] = rgb[0];
   //       data[nextOff + 1] = rgb[1];
   //       data[nextOff + 2] = rgb[2];

   //     data[x + 0] = data[x + 4] = data[x + 8] = data[x + 12] = rgb[0];
   //     data[x + 1] = data[x + 5] = data[x + 9] = data[x + 13] = rgb[1];
   //     data[x + 2] = data[x + 6] = data[x + 10] = data[x + 14] = rgb[2];
   //     var nextOff = x + 2256;
   //     data[nextOff] = data[nextOff + 4] = data[nextOff + 8] = data[nextOff + 12] = rgb[0];
   //     data[nextOff + 1] = data[nextOff + 5] = data[nextOff + 9] = data[nextOff + 13] = rgb[1];
   //     data[nextOff + 2] = data[nextOff + 6] = data[nextOff + 10] = data[nextOff + 14] = rgb[2];

      //      data[x]   = data[x+4] = data[x+8]  = data[x+12] = data[x+2256] = data[x+2260] = data[x+2264] = data[x+2268] = rgb[0];
      //      data[x+1] = data[x+5] = data[x+9]  = data[x+13] = data[x+2257] = data[x+2261] = data[x+2265] = data[x+2269] = rgb[1];
      //      data[x+2] = data[x+6] = data[x+10] = data[x+14] = data[x+2258] = data[x+2262] = data[x+2266] = data[x+2270] = rgb[2];
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

