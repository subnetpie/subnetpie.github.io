//
//  main class to tie components together
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://en.wikipedia.org/wiki/Apple_II_character_set
//

import {W65C02S} from "https://subnetpie.github.io/computer/appleii/w65c02s.js";
import {Memory} from "https://subnetpie.github.io/computer/appleii/memory.js";
import {IIgsMemory} from "https://subnetpie.github.io/computer/appleii/iigs_memory.js";
import {W65C816} from "https://subnetpie.github.io/computer/appleii/w65c816.js";
import {IOManager} from "https://subnetpie.github.io/computer/appleii/io_manager.js";
import {TextDisplay} from "https://subnetpie.github.io/computer/appleii/display_text.js";
import {TextDisplay80} from "https://subnetpie.github.io/computer/appleii/display_text_80.js";
import {HiresDisplay} from "https://subnetpie.github.io/computer/appleii/display_hires.js";
import {LoresDisplay} from "https://subnetpie.github.io/computer/appleii/display_lores.js";
import {DoubleHiresDisplay} from "https://subnetpie.github.io/computer/appleii/display_double_hires.js";
import {Keyboard} from "https://subnetpie.github.io/computer/appleii/keyboard.js";
import {Floppy525} from "https://subnetpie.github.io/computer/appleii/FloppyWoz525.js";
import {AppleAudio} from "https://subnetpie.github.io/computer/appleii/apple_audio.js";
import {ProDOSBlockDevice} from "https://subnetpie.github.io/computer/appleii/prodos_block.js?v=20260927-boot";
import {IIgsVideo} from "https://subnetpie.github.io/computer/appleii/video_iigs.js";
import {MachineTrace} from "https://subnetpie.github.io/computer/appleii/machine_trace.js";
import {rom_342_0304_cd} from "https://subnetpie.github.io/computer/appleii/rom/342-0304-cd.js";
import {rom_342_0303_ef} from "https://subnetpie.github.io/computer/appleii/rom/342-0303-ef.js";

export class Motherboard
{
    constructor(khz, canvas, joyValues, floppy_led_cb, machine = "iie") {
        this.machine = machine;
        this.trace = new MachineTrace();
        this.iigsEnabled = machine === "iigs";
        this.legacyMemory = new Memory(rom_342_0304_cd, rom_342_0303_ef);
        this.keyboard = new Keyboard();
        this.display_text = new TextDisplay(this.legacyMemory, canvas);
        this.display_text_80 = new TextDisplay80(this.legacyMemory, canvas);
        this.display_hires = new HiresDisplay(this.legacyMemory, canvas);
        this.display_lores = new LoresDisplay(this.legacyMemory, canvas);
        this.display_double_hires = new DoubleHiresDisplay(this.legacyMemory, canvas);
        // IIgs video sits above the Mega II-compatible legacy display path.
        // SHR is dormant until NEWVIDEO bit 7 is selected.
        this.video_iigs = this.iigsEnabled ? new IIgsVideo(canvas, {
            refresh: () => this.io_manager && this.io_manager.switch_display_mode()
        }, null, this.display_double_hires) : null;
        this.memory = this.iigsEnabled
            ? new IIgsMemory(this.legacyMemory, this.video_iigs)
            : this.legacyMemory;
        this.cpu = this.iigsEnabled ? new W65C816(this.memory) : new W65C02S(this.memory);
        if(this.video_iigs) {
            this.video_iigs.scanlineIrq = state => this.cpu.irq(state);
        }
        this.cycles = 0;

        // Pass a cycle-count getter into Floppy525 so the WOZ latch emulation
        // can advance the bitstream by the correct number of bits on each read.
        this.floppy525 = new Floppy525(6, this.legacyMemory, floppy_led_cb, () => this.cycles);
        if(this.iigsEnabled) this.memory.floppy = this.floppy525;
        this.prodosBlock = new ProDOSBlockDevice(7, this.legacyMemory);

        this.audio = new AppleAudio(khz);
        this.io_manager = new IOManager(this.legacyMemory, this.keyboard,
                                        this.display_text, this.display_text_80,
                                        this.display_hires, this.display_double_hires, this.display_lores,
                                        this.audio_click.bind(this), joyValues, () => this.cycles,
                                        this.video_iigs, this.iigsEnabled);
    }

    clock(count) {
        this.audio.begin_segment(this.cycles);
        const total = this.cycles + count;
        while(this.cycles < total) {
            const used=this.cpu.step();
            this.cycles += used;
            if(this.iigsEnabled && this.video_iigs) this.video_iigs.tick(used, 2800000);
        }
    }

    startTrace() {
        this.trace.start();
        this.cpu.setTrace(e => this.trace.log("cpu", e));
        this.floppy525.setTrace(e => this.trace.log("disk", e));
        if(this.iigsEnabled) {
            this.memory.setTrace((rw,addr,value) => this.trace.log("mem",{rw,addr,value}));
        }
    }

    stopTrace() { this.trace.stop(); return this.trace.snapshot(); }
    traceText() { return this.trace.text(); }

    audio_click() {
        this.audio.click(this.cycles);
    }

    reset(cold) {
        if(this.iigsEnabled) this.memory.reset(!!cold);
        this.cpu.reset();
        this.display_text.reset();
        this.display_text_80.reset();
        this.display_hires.reset();
        this.display_lores.reset();
        this.display_double_hires.reset();
        if(this.video_iigs) this.video_iigs.reset();
        this.floppy525.reset();
        this.prodosBlock.reset();
        this.audio.reset();
        this.io_manager.reset();

        this.cycles = 0;

        for(let a=0x0400; a<0x0800; a++) this.legacyMemory._main[a] = 0xa0;
        this.display_text.set_active_page(1);  // text page 1 is default

        if(!this.iigsEnabled) {
            this.cpu.register.pc = this.memory.read_word(0xfffc);
        }
    }

    loadIIgsROM(data) {
        if(!this.iigsEnabled) throw new Error("IIgs ROM can only be loaded in machine=iigs mode");
        this.memory.loadROM(data);
        this.cpu.reset();
    }

    // clear message on text page 1
    messageclear() {
      for(let i=0; i<30; i++) this.legacyMemory.write(0x42C+i, 0xA0);
    }

    // write message to text page 1
    message(text) {
        const addr = 0x43b - ((text.length / 2) & 0x0f);
        for(let i=0; i<text.length; i++) this.legacyMemory.write(addr+i, text.charCodeAt(i)+0x80);
    }
}
