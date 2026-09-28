//
//  apple2e io mamager
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%201.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%202.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%203.pdf
//       ftp://ftp.apple.asimov.net/pub/apple_II/documentation/hardware/machines/Apple%20IIe%20Technical%20Reference%20Manual%20(alt%202)_part%204.pdf
//


//
//  table 2-10: display soft switches (p.29)
//
//    name        action  hex     function
//    --------------------------------------------------------------------------------------
//    AltChar     W       $C00E   off: display text using primary character set
//    AltChar     W       $C00F   on:  display text using alternate character set
//    RdAltChar   R7      $C01E   read AltChar switch (1 = on)
//    --------------------------------------------------------------------------------------
//    80Col       W       $C00C   off: display 40 columns
//    80Col       W       $C00D   on:  display 80 columns
//    Rd80Col     R7      $C01F   read 80Col switch (1 = on)
//    --------------------------------------------------------------------------------------
//    80Store     W       $C000   off: cause Page2 on to select auxiliary RAM
//    80Store     W       $C001   on:  allow Page2 to switch main RAM areas
//    Rd80Store   R7      $0018   read 80Store switch (1 = on)
//    --------------------------------------------------------------------------------------
//    Page2       R/W     $C054   off: select page 1
//    Page2       R/W     $C055   on:  select Page2 or, if 80Store on, page 1 in auxiliary memory
//    RdPage2     R7      $C01C   read Page2 switch (1 = on)
//    --------------------------------------------------------------------------------------
//    TEXT        R/W     $0050   off: display graphics or (if MIXED on) mixed
//    TEXT        R/W     $C051   on:  display text
//    RdTEXT      R7      $C01A   read TEXT switch (1 = on)
//    --------------------------------------------------------------------------------------
//    MIXED       R/W     $C052   off: display only text or only graphics
//    MIXED       R/W     $C053   on:  (if TEXT off) display text and graphics
//    RdMIXED     R7      $C01B   read MIXED switch (1 = on)
//    --------------------------------------------------------------------------------------
//    HiRes       R/W     $C056   off: (if TEXT off) display low-resolution graphics
//    HiRes       R/W     $C057   on:  (if TEXT off) display high-resolution or (if DHiRes on) double-high-resolution graphics
//    RdHiRes     R7      $C01D   read HiRes switch (1 = on)
//    --------------------------------------------------------------------------------------
//    IOUDis      W       $C07E   on:  disable IOU access for addresses $0058 to $C05F; enable access to DHiRes switch *
//    IOUDis      W       $C07F   off: enable IOU access for addresses $0058 to $C05F; disable access to DHiRes switch *
//    RdlOUDis    R7      $C07E   read IOUDis switch (1 = off) **
//    --------------------------------------------------------------------------------------
//    DHiRes      R/W     $C05E   on:  (if IOUDis on) turn on double-high-resolution
//    DHiRes      R/W     $C05F   off: (if IOUDis on) turn off double-high-resolution
//    RdDHiRes    R7      $C07F   read DHiRes switch (1 = on) **
//    --------------------------------------------------------------------------------------
//
//    *  the firmware normally leaves IOUDis on (see also ** below)
//    ** reading or writing any address in the range $C070-$C07F also
//       triggers the paddle timer and resets VBLInt (see chapter 7)
//


export class IOManager
{
    constructor(memory, keyboard, display_text, display_text_80, display_hires, display_double_hires, display_lores, audio_cb, joystick, get_cycles = () => 0, video_iigs = null, iigsEnabled = false) {
        this._mem = memory;
        this._kbd = keyboard;
        this._display_text = display_text;
        this._display_text_80 = display_text_80;
        this._display_hires = display_hires;
        this._display_double_hires = display_double_hires;
        this._display_lores = display_lores;
        this._audio_cb = audio_cb;
        this._get_cycles = get_cycles;
        this._paddleDeadlines = [0, 0, 0, 0];
        this._joystick = joystick;
        this._video_iigs = video_iigs;
        this._iigsEnabled = !!iigsEnabled;

        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._mixed_mode = false;
        this._altchar_mode = false;
        this._80col_mode = false;
        this._double_hires = false;
        this._iou_disable = false;

        this._bsr_write_count = 0;

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));
    }

    ////////////////////////////////////////////
    read(addr) {
        if((addr & 0xf000) != 0xc000) return undefined; // default read

        // c000-c0ff: read switches
        if((addr & 0xff00) == 0xc000) {
            //console.log("c0xx read switch: " + addr.toString(16));
            switch(addr)
            {
                case 0xc000: // keyboard io
                    return this._kbd.key;
                case 0xc010: // keyboard strobe
                    this._kbd.strobe();
                    return 0;
                case 0xc011: // bank (0: bank1, 0x80: bank2)
                    //console.log("active bank: " + this._mem.bsr_bank2 ? "2" : "1");
                    return this._mem.bsr_bank2 ? 0x80 : 0;
                case 0xc012: // ram/rom (0: rom, 0x80: ram)
                    //console.log("bank switch ram read: " + this._mem.bsr_read);
                    return this._mem.bsr_read ? 0x80 : 0;
                case 0xc013: // read main/aux (0: main, 0x80: aux)
                    //console.log("aux ram read: " + this._mem.aux_read);
                    return this._mem.aux_read ? 0x80 : 0;
                case 0xc014: // write main/aux (0: main, 0x80: aux)
                    //console.log("aux ram write: " + this._mem.aux_write);
                    return this._mem.aux_write ? 0x80 : 0;
                case 0xc015: // cx-rom (0: slots active, 0x80: use internal rom)
                    return this._cx_rom ? 0x80 : 0;
                case 0xc016: // zp (0: main zp/stack, 0x80: aux zp/stack)
                    //console.log("aux zp/stack: " + this._mem.aux_zp);
                    return this._mem.aux_zp ? 0x80 : 0;
                case 0xc017: // c3-rom (0: use internal rom, 0x80: slot 3 io active)
                    //console.log("c3 rom: " + this._c3_rom);
                    return this._c3_rom ? 0 : 0x80;
                case 0xc018: // 80store (0: 80store off, 0x80: 80store on)
                    //console.log("80 store: " + this._mem.dms_80store);
                    return this._mem.dms_80store ? 0x80 : 0;
                case 0xc019: // IIgs VBL has the opposite polarity to IIe RDVBLBAR.
                    if(this._iigsEnabled && this._video_iigs)
                        return this._video_iigs.currentScanline >= 192 ? 0x80 : 0;
                    // NTSC: 65 CPU cycles/line, 192 visible + 70 blank lines.
                    return (this._get_cycles() % (65 * 262)) < (65 * 192) ? 0x80 : 0;
                case 0xc01a: // text (0: graphics mode, 0x80: text mode)
                    return this._text_mode ? 0x80 : 0;
                case 0xc01b: // mixed mode (0: full screen, 0x80: mixed mode)
                    return this._mixed_mode ? 0x80 : 0;
                case 0xc01c: // page2 (0: main, 0x80: aux)
                    return this._mem.dms_page2 ? 0x80 : 0;
                case 0xc01d: // hires (0: lores, 0x80: hires)
                    return this._mem.dms_hires ? 0x80 : 0;
                case 0xc01e: // alt char mode (0: alt char mode off, 0x80: alt char mode on)
                    return this._altchar_mode ? 0x80 : 0;
                case 0xc01f: // 80 col mode (0: 40 cols, 0x80: 80 cols)
                    return this._80col_mode ? 0x80 : 0;
                case 0xc029: // IIgs NEWVIDEO; absent on the Apple IIe machine
                    if(this._iigsEnabled && this._video_iigs) return this._video_iigs.readNewVideo();
                    break;
                case 0xc061: // js pb0
                    return this._joystick.button0 ? 0x80 : 0;
                case 0xc062: // js pb1
                    return this._joystick.button1 ? 0x80 : 0;
                case 0xc063: // js pb2
                    return this._joystick.button2 ? 0x80 : 0;
                case 0xc064: // js pdl-0
                    return this._get_cycles() < this._paddleDeadlines[0] ? 0x80 : 0;
                case 0xc065: // js pdl-1
                    return this._get_cycles() < this._paddleDeadlines[1] ? 0x80 : 0;
                case 0xc066: // js pdl-2
                    return this._get_cycles() < this._paddleDeadlines[2] ? 0x80 : 0;
                case 0xc067: // js pdl-3
                    return this._get_cycles() < this._paddleDeadlines[3] ? 0x80 : 0;
                case 0xc070: // trigger paddle read
                    this.triggerPaddles();
                    return 0;
                case 0xc07e: // iou disable (0: iou is enabled, 0x80: iou is disabled)
                    //console.log("iou disable: " + this._iou_disable);
                    return this._iou_disable ? 0x80 : 0;
                case 0xc07f: // double hires (0: double hires inactive, 0x80: double hires active)
                    //console.log("double hires: " + this._double_hires);
                    return this._double_hires ? 0 : 0x80;
                default:
                    break;
            }

            // slots begin at 0xc090
            if(addr > 0xc08f) return undefined;

            return this.rw_switches(addr, false);
        }

        // c100-cfff: rom handling
        //   c3: c300-c3ff
        //   c8: c800-cfff
        //   cx: c100-cfff

        // c100-cfff: cx rom
        if(this._cx_rom) {
            // c300-c3ff
            if((addr & 0xff00) == 0xc300) {
                this._c8_rom = true;
            }
            else if(addr == 0xcfff) {
                this._c8_rom = false;
            }
            return undefined; // default cx rom read
        }
        // c300-c3ff: c3 rom
        if(this._c3_rom && ((addr & 0xff00) == 0xc300)) {
            this._c8_rom = true;
            return undefined; // default c3 rom read
        }
        // c800-cfff: c8 rom
        if(this._c8_rom && (addr >= 0xc800)) {
            if(addr == 0xcfff) {
                this._c8_rom = false;
            }
            return undefined; // default c8 rom read
        }
    }


    triggerPaddles() {
        // 558 one-shots: about 10.8 microseconds per paddle unit. Polling
        // memory must not advance time, and active timers cannot retrigger.
        const now = this._get_cycles();
        const cyclesPerUnit = 10.8 * (this._iigsEnabled ? 2.8 : 1.0205);
        for(let i=0; i<4; i++) {
            if(now >= this._paddleDeadlines[i]) {
                const value = Math.max(0, Math.min(255, this._joystick['axis'+i] ?? 127));
                this._paddleDeadlines[i] = now + value * cyclesPerUnit;
            }
        }
    }

    ////////////////////////////////////////////
    write(addr, val) {
        this.draw_display(addr, val);

        // c000-c0ff: write switches
        if((addr & 0xff00) == 0xc000) {
            //console.log("c0xx write switch: [" + addr.toString(16) + "] --> val: " + val);

            // keyboard strobe (write: 0xc010-0xc01f)
            if((addr & 0xfff0) == 0xc010) {
                this._kbd.strobe();
                return 0; // write handled
            }

            switch(addr)
            {
                case 0xc000: // 80store off
                    // 80STORE changes PAGE2 from aux page-1 selection back to
                    // the normal page-2 address range, so it is a video mode
                    // change when the latch actually toggles.
                    if(this._mem.dms_80store) {
                        this._mem.dms_80store = false;
                        this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc001: // 80store on
                    if(!this._mem.dms_80store) {
                        this._mem.dms_80store = true;
                        this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc002: // read main memory
                    //console.log("aux ram read off");
                    this._mem.aux_read = false;
                    return 0; // write handled
                case 0xc003: // read aux memory
                    //console.log("aux ram read on");
                    this._mem.aux_read = true;
                    return 0; // write handled
                case 0xc004: // write main memory
                    //console.log("aux ram write off");
                    this._mem.aux_write = false;
                    return 0; // write handled
                case 0xc005: // write aux memory
                    //console.log("aux ram write on");
                    this._mem.aux_write = true;
                    return 0; // write handled
                case 0xc006: // cx rom off
                    //console.log("cx rom off");
                    this._cx_rom = false;
                    return 0; // write handled
                case 0xc007: // cx rom on
                    //console.log("cx rom on");
                    this._cx_rom = true;
                    return 0; // write handled
                case 0xc008: // use main zp & stack
                    //console.log("aux ram zp/stack off");
                    this._mem.aux_zp = false;
                    return 0; // write handled
                case 0xc009: // use aux zp & stack
                    //console.log("aux ram zp/stack on");
                    this._mem.aux_zp = true;
                    return 0; // write handled
                case 0xc00a: // c3 rom on (slot 3 io off)
                    //console.log("c3 rom on (slot 3 io off)");
                    this._c3_rom = true;
                    return 0; // write handled
                case 0xc00b: // c3 rom off (slot 3 io on)
                    //console.log("c3 rom off (slot 3 io on)");
                    this._c3_rom = false;
                    return 0; // write handled
                case 0xc00c: // 80 col off
                    //console.log("80 col off");
                    if(this._80col_mode) {
                      this._80col_mode = false;
                      this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc00d: // 80 col on
                    //console.log("80 col on");
                    if(!this._80col_mode) {
                      this._80col_mode = true;
                      this.switch_display_mode();
                    }
                    return 0; // write handled
                case 0xc00e: // alt char off
                    //console.log("alt char off");
                    this._altchar_mode = false;
                    return 0; // write handled
                case 0xc00f: // alt char on
                    //console.log("alt char on");
                    this._altchar_mode = true;
                    return 0; // write handled
                case 0xc023: // IIgs VGCINT: only enable bits are writable
                    if(this._iigsEnabled && this._video_iigs) {
                        this._video_iigs.writeVGCINT(val);
                        return 0;
                    }
                    break;
                case 0xc029: // IIgs NEWVIDEO; do not expose it to Apple IIe software
                    if(this._iigsEnabled && this._video_iigs) {
                        this._video_iigs.writeNewVideo(val);
                        return 0;
                    }
                    break;
                case 0xc032: // IIgs SCANINT interrupt clear
                    if(this._iigsEnabled && this._video_iigs) {
                        this._video_iigs.writeSCANINT(val);
                        return 0;
                    }
                    break;
                //case 0xc010: // keyboard strobe (handled above)
                //    this._kbd.strobe();
                //    return 0; // write handled
                case 0xc070: // PTRIG also responds to writes
                    this.triggerPaddles();
                    return 0;
                case 0xc07e: // iou disable on
                    this._iou_disable = true;
                    return 0; // write handled
                case 0xc07f: // iou disable off
                    this._iou_disable = false;
                    return 0; // write handled
                default:
                    break;
            }

            // slots begin at 0xc090
            if(addr > 0xc08f) return undefined;

            return this.rw_switches(addr, true);
        }
    }

    ////////////////////////////////////////////
    rw_switches(addr, writing = false) {
        switch(addr)
        {
            case 0xc030: // speaker toggle
                //console.log("speaker toggle");
                this._audio_cb();
                break;
            case 0xc050: // text mode off
                //console.log("text mode off");
                if(this._text_mode) {
                    this._text_mode = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc051: // text mode on
                //console.log("text mode on");
                if(!this._text_mode) {
                    this._text_mode = true;
                    this.switch_display_mode();
                }
                break;
            case 0xc052: // mixed mode off
                //console.log("mixed mode off");
                if(this._mixed_mode) {
                    this._mixed_mode = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc053: // mixed mode on
                //console.log("mixed mode on");
                if(!this._mixed_mode) {
                    this._mixed_mode = true;
                    this.switch_display_mode();
                }
                break;
            case 0xc054: // page2 off
                // PAGE2 is still a visible page flip with 80STORE enabled:
                // it selects main vs auxiliary page-1 video memory.
                if(this._mem.dms_page2) {
                    this._mem.dms_page2 = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc055: // page2 on
                if(!this._mem.dms_page2) {
                    this._mem.dms_page2 = true;
                    this.switch_display_mode();
                }
                break;
            case 0xc056: // hires off
                //console.log("hires off");
                if(this._mem.dms_hires) {
                    this._mem.dms_hires = false;
                    this.switch_display_mode();
                }
                break;
            case 0xc057: // hires on
                //console.log("hires on");
                if(!this._mem.dms_hires) {
                    this._mem.dms_hires = true;
// TODO: emperical testing suggests we clear the ram before enabling
// for(let a=0x2000; a<0x4000; a++) this._mem._main[a] = 0;
                    this.switch_display_mode();
                }
                break;
            case 0xc05e: // double hires on
                if(this._iou_disable) {
                    //console.log("double hires on");
                    if(!this._double_hires) {
                      this._80col_mode = true;
                      this._double_hires = true;
                      this.switch_display_mode();
                    }
                }
                break;
            case 0xc05f: // double hires off
                if(this._iou_disable) {
                    //console.log("double hires off");
                    if(this._double_hires) {
                        this._double_hires = false;
                        this.switch_display_mode();
                    }
                }
                break;
                
            default: // bsr: c080-c08f
                // bank select switches
                // apple tech ref p.82
                if((addr >= 0xc080) && (addr <= 0xc08f)) {
                    // MAME lc_update(): any even access disables prewrite
                    // and LC writing. A write clears prewrite but does not
                    // disable an already-enabled write latch. Only odd reads
                    // advance prewrite; the second consecutive odd read
                    // enables LC writes.
                    if((addr & 1) === 0) {
                        this._bsr_write_count = 0;
                        this._mem.bsr_write = false;
                    } else if(writing) {
                        this._bsr_write_count = 0;
                    } else {
                        if(this._bsr_write_count === 0) this._bsr_write_count = 1;
                        else this._mem.bsr_write = true;
                    }

                    // bit 3: d000 bank select, (0: bank 2, 8: bank 1)
                    this._mem.bsr_bank2 = (addr & 0x08) == 0;

                    // 0000 ram 0^0 = 0
                    // 0001 rom 1^0 = 1
                    // 0010 rom 0^1 = 1
                    // 0011 ram 1^1 = 0
                    this._mem.bsr_read = ((addr ^ (addr>>1)) & 0x01) == 0;
                    //console.log("bank select [" + addr.toString(16) + "], dx read: " + this._mem.bsr_read + "  dx write: " + this._mem.bsr_write + "  dx bank2: " + this._mem.bsr_bank2);
                }
                break;
        }
        return 0; // switch processed
    }

    ////////////////////////////////////////////
    draw_display(addr, val) {
        // When IIgs Super Hi-Res owns video output, Mega II memory writes still
        // update RAM/soft-switch state but must not paint over the SHR canvas.
        if(this._video_iigs && this._video_iigs.isSuperHires()) return;
        const textPage = this._mem.dms_page2 && !this._mem.dms_80store ? 0x0800 : 0x0400;
        const textWrite = addr >= textPage && addr < textPage + 0x400;
        const mixedText = !this._text_mode && this._mixed_mode;

        if(addr >= 0x0400 && addr < 0x0c00 && (this._text_mode || mixedText)) {
            if(this._80col_mode) this._display_text_80.draw_text(addr, val);
            else this._display_text.draw_text(addr, val);
            if(mixedText) this.draw_mixed_text();
        }

        if(this._text_mode) return;

        if(this._mem.dms_hires) {
            // Both page buffers must track writes. Games draw the hidden page
            // before flipping PAGE2; filtering to the visible page loses it.
            if(addr >= 0x2000 && addr < 0x6000) {
                if(this._double_hires) this._display_double_hires.draw(addr);
                else this._display_hires.draw(addr, val);
                if(this._mixed_mode) this.draw_mixed_text();
            }
        } else if(textWrite) {
            this._display_lores.draw(addr);
            if(this._mixed_mode) this.draw_mixed_text();
        }
    }

    draw_mixed_text() {
        // Mixed mode is graphics scanlines 0-159 plus text rows 20-23.
        // Render those four rows directly over the active graphics canvas.
        const d = this._80col_mode ? this._display_text_80 : this._display_text;
        const page = this._mem.dms_page2 && !this._mem.dms_80store ? 0x0800 : 0x0400;
        for(let a=page;a<page+0x400;a++) {
            const col=(a&0x7f)%40;
            const row=(((a-col)>>2)&0x18)|((a>>7)&7);
            if(row>=20 && row<24) d.draw_text(a, this._mem._main[a]);
        }
        const src=d._id;
        if(src) d._context.putImageData(src,0,0,0,20*16+4,564,4*16);
    }

    ////////////////////////////////////////////
    switch_display_mode() {
        if(this._video_iigs && this._video_iigs.isSuperHires()) {
            this._video_iigs.refresh(true);
            return;
        }
        const page = this._mem.dms_page2 && !this._mem.dms_80store ? 2 : 1;
        const videoBank = this._mem.dms_80store && this._mem.dms_page2 ? "aux" : "main";

        if(this._text_mode) {
            if(this._80col_mode) this._display_text_80.set_active_page(page);
            else this._display_text.set_active_page(page);
            return;
        }

        if(this._mem.dms_hires) {
            if(this._double_hires) this._display_double_hires.set_active_page(page);
            else this._display_hires.set_active_page(page, videoBank);
        } else {
            this._display_lores.set_active_page(page, this._double_hires && this._80col_mode);
        }
        if(this._mixed_mode) this.draw_mixed_text();
    }

    // Expose compatibility-video latches to IIgs bus/video timing logic.
    get text_mode() { return this._text_mode; }
    get mixed_mode() { return this._mixed_mode; }

    reset() {
        this._paddleDeadlines.fill(0);
        this._c3_rom = false;
        this._c8_rom = false;
        this._cx_rom = false;

        this._text_mode = true;
        this._mixed_mode = false;
        this._altchar_mode = false;
        this._80col_mode = false;
        this._double_hires = false;
        this._iou_disable = true;

        this._bsr_write_count = 0;
    }
}

