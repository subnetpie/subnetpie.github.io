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
import {IIgsMemory} from "https://subnetpie.github.io/computer/appleii/iigs_memory.js?v=20260928-perfbatch1";
import {W65C816} from "https://subnetpie.github.io/computer/appleii/w65c816.js?v=20260928-blend";
import {IOManager} from "https://subnetpie.github.io/computer/appleii/io_manager.js?v=20260928-framelatch1";
import {TextDisplay} from "https://subnetpie.github.io/computer/appleii/display_text.js";
import {TextDisplay80} from "https://subnetpie.github.io/computer/appleii/display_text_80.js";
import {HiresDisplay} from "https://subnetpie.github.io/computer/appleii/display_hires.js?v=20260928-pageflip1";
import {LoresDisplay} from "https://subnetpie.github.io/computer/appleii/display_lores.js";
import {DoubleHiresDisplay} from "https://subnetpie.github.io/computer/appleii/display_double_hires.js?v=20260928-writeahead1";
import {Keyboard} from "https://subnetpie.github.io/computer/appleii/keyboard.js?v=20260928-blend";
import {Floppy525} from "https://subnetpie.github.io/computer/appleii/FloppyWoz525.js";
import {AppleAudio} from "https://subnetpie.github.io/computer/appleii/apple_audio.js?v=20260928-ring1";
import {ProDOSBlockDevice} from "https://subnetpie.github.io/computer/appleii/prodos_block.js?v=20260927-boot";
import {IIgsVideo} from "https://subnetpie.github.io/computer/appleii/video_iigs.js?v=20260928-blendopt1";
import {MachineTrace} from "https://subnetpie.github.io/computer/appleii/machine_trace.js";
import {rom_342_0304_cd} from "https://subnetpie.github.io/computer/appleii/rom/342-0304-cd.js";
import {rom_342_0303_ef} from "https://subnetpie.github.io/computer/appleii/rom/342-0303-ef.js";

const IIGS_FAST_HZ = 2800000;
const IIGS_SLOW_HZ = 1021800;

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
        if(this.iigsEnabled) this.memory.initRtcFromHost();
        if(this.iigsEnabled)this.keyboard.onChange=(value,down)=>this.memory.adb.setKeyData(value,down);
        this.cpu = this.iigsEnabled ? new W65C816(this.memory) : new W65C02S(this.memory);
        this.iigsIrq = {mega:false};
        this.updateIIgsIRQ = () => this.cpu.irq(this.iigsIrq.mega);
        if(this.video_iigs) {
            this.video_iigs.scanlineIrq = state => this.memory.setExternalIrq("vgc",state);
        }
        if(this.iigsEnabled) this.memory.irq = state => { this.iigsIrq.mega=!!state; this.updateIIgsIRQ(); };
        if(this.iigsEnabled && this.memory.doc) {
            this.memory.doc.irq = state => this.memory.setExternalIrq("doc",state);
        }
        if(this.iigsEnabled && this.memory.scc) {
            this.memory.scc.irq = state => this.memory.setExternalIrq("scc",state);
        }
        this.cycles = 0;
        this.deferredPeripheralCycles = 0;
        this.perfEnabled = false;
        this.perf = {cpu:0,video:0,disk:0,audio:0,peripheral:0};

        // Pass a cycle-count getter into Floppy525 so the WOZ latch emulation
        // can advance the bitstream by the correct number of bits on each read.
        this.floppy525 = new Floppy525(6, this.legacyMemory, floppy_led_cb, () => this.cycles);
        if(this.iigsEnabled) this.memory.floppy = this.floppy525;
        this.prodosBlock = new ProDOSBlockDevice(7, this.iigsEnabled ? this.memory : this.legacyMemory);

        this.audio = new AppleAudio(khz);
        this.io_manager = new IOManager(this.legacyMemory, this.keyboard,
                                        this.display_text, this.display_text_80,
                                        this.display_hires, this.display_double_hires, this.display_lores,
                                        this.audio_click.bind(this), joyValues, () => this.cycles,
                                        this.video_iigs, this.iigsEnabled);
        this.legacyMemory.io_manager = this.io_manager;
        if(this.iigsEnabled) {
            this.memory.ioManager = this.io_manager;
            // RTC/SCC may be advanced in batches, but reads/writes to their
            // registers first synchronize all completed instruction time.
            this.memory.syncPeripheralTime = () => this.flushDeferredPeripherals();
            this.memory.cpuFetchByte = () => {
                const reg=this.cpu.register;
                const pc=reg.pc&0xffff;
                // W65C816 exposes the program bank as register.pb.
                const bank=reg.pb&0xff;
                const addr=(bank<<16)|((pc-1)&0xffff);
                // Avoid I/O recursion: MAME's approximation is the previous
                // program fetch, which should normally be ROM/RAM.
                if((addr&0xffff)>=0xc000 && (addr&0xffff)<=0xc0ff) return bank;
                return this.memory.read(addr);
            };
        }
    }

    setPerfEnabled(enabled) {
        this.perfEnabled=!!enabled;
        this.perf.cpu=this.perf.video=this.perf.disk=this.perf.audio=this.perf.peripheral=0;
    }

    consumePerf() {
        const out={...this.perf};
        this.perf.cpu=this.perf.video=this.perf.disk=this.perf.audio=this.perf.peripheral=0;
        return out;
    }

    flushDeferredPeripherals() {
        if(!this.iigsEnabled || !this.deferredPeripheralCycles) return;
        const cycles=this.deferredPeripheralCycles;
        this.deferredPeripheralCycles=0;
        const timed=this.perfEnabled ? performance.now() : 0;
        this.memory.tickRtc(cycles,IIGS_FAST_HZ);
        if(this.memory.scc) this.memory.scc.tick(cycles);
        if(this.perfEnabled) this.perf.peripheral += performance.now()-timed;
    }

    clock(count) {
        this.audio.begin_segment(this.cycles);
        const total = this.cycles + count;
        while(this.cycles < total) {
            const cpuHz = this.iigsEnabled && !(this.memory.speed & 0x80)
                ? IIGS_SLOW_HZ : (this.iigsEnabled ? IIGS_FAST_HZ : 1020500);

            let timed=this.perfEnabled ? performance.now() : 0;
            const usedCpu = this.cpu.step();
            if(this.perfEnabled) this.perf.cpu += performance.now()-timed;

            const usedMaster = this.iigsEnabled
                ? usedCpu * (IIGS_FAST_HZ / cpuHz)
                : usedCpu;
            this.cycles += usedMaster;

            if(this.iigsEnabled && this.video_iigs) {
                timed=this.perfEnabled ? performance.now() : 0;
                const oldLine=this.video_iigs.currentScanline;
                const oldFrame=this.video_iigs.frameCount;
                this.video_iigs.tick(usedMaster, IIGS_FAST_HZ);
                if(this.perfEnabled) this.perf.video += performance.now()-timed;
                if(oldLine < 192 && this.video_iigs.currentScanline >= 192)
                    this.memory.setVblFlag();
                if(this.video_iigs.frameCount !== oldFrame) {
                    if(this.io_manager && this.io_manager.latch_display_state)
                        this.io_manager.latch_display_state();
                    if((this.video_iigs.frameCount & 0x0f) === 0)
                        this.memory.setQuarterFlag();
                }
            }

            if(this.iigsEnabled) {
                // RTC and SCC have explicit register-boundary synchronization,
                // so accumulate them instead of paying two calls per opcode.
                this.deferredPeripheralCycles += usedMaster;

                // IWM flux/read-window state is observable at any I/O access,
                // so keep it instruction-accurate while the controller has
                // actual timed work. Completely idle IWM costs zero calls.
                if(this.memory.iwmActive || this.memory.iwmMotorDelay ||
                   this.memory.iwmWritePending) {
                    timed=this.perfEnabled ? performance.now() : 0;
                    this.memory.tickIwm(usedMaster,IIGS_FAST_HZ);
                    if(this.perfEnabled) this.perf.disk += performance.now()-timed;
                }
            }

            if(this.iigsEnabled && this.memory.doc) {
                timed=this.perfEnabled ? performance.now() : 0;
                const docSamples=this.memory.doc.tick(usedMaster,IIGS_FAST_HZ);
                if(docSamples) this.audio.doc_sample(
                    this.cycles,
                    this.memory.doc.lastLeft,
                    this.memory.doc.lastRight,
                    this.memory.doc.getVolume()
                );
                if(this.perfEnabled) this.perf.audio += performance.now()-timed;
            }
        }
        this.flushDeferredPeripherals();
        if(this.iigsEnabled) {
            const timed=this.perfEnabled ? performance.now() : 0;
            this.audio.end_segment(this.cycles);
            if(this.perfEnabled) this.perf.audio += performance.now()-timed;
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
        if(this.iigsEnabled) {
            this.iigsIrq.vgc=this.iigsIrq.doc=this.iigsIrq.scc=false;
            this.memory.reset(!!cold);
        }
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
        this.deferredPeripheralCycles = 0;

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
