import { Z80 } from "../../cpu/z80.js";
import { Namco51XX } from "../../chips/Namco51XX.js";
import { Namco53XX } from "../../chips/Namco53XX.js";
import { NamcoWSG } from "../../chips/NamcoWSG.js";

const MASTER_CLOCK = 18_432_000;
const CPU_CLOCK = MASTER_CLOCK / 6;
const FPS = MASTER_CLOCK / 3 / 384 / 264;
const SCREEN_W = 288;
const SCREEN_H = 224;
const CANVAS_W = 224;
const CANVAS_H = 288;

class DigDug {
  constructor() {
    this.canvas = document.querySelector("#gameCanvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(CANVAS_W, CANVAS_H);

    this.rom = [
      new Uint8Array(0x4000),
      new Uint8Array(0x4000),
      new Uint8Array(0x4000)
    ];
    this.ram = new Uint8Array(0x10000);
    this.earom = new Uint8Array(0x40);

    this.input = {
      up: 0,
      right: 0,
      down: 0,
      left: 0,
      fire: 0,
      start1: 0,
      coin1: 0
    };

    this.dswa = 0x99;
    this.dswb = 0x24;

    this.miscLatch = new Uint8Array(8);
    this.videoLatch = new Uint8Array(8);
    this.mainIrqMask = 0;
    this.subIrqMask = 0;
    this.sub2NmiMask = 1;
    this.subsReleased = false;

    this.bgSelect = 0;
    this.bgColorBank = 0;
    this.txColorMode = 0;
    this.bgDisable = 0;
    this.flip = 0;

    this.mainRemainder = 0;
    this.subRemainder = 0;
    this.sub2Remainder = 0;
    this.ioMasterTicks = 0;
    this.ioEdgeTicks = 0;

    this.audioCtx = null;
    this.audioNode = null;
    this.audioUnlocked = false;

    this.bindControls();
    this.bindAudioUnlock();
  }

  async fetchRom(name, base = "./roms/") {
    const response = await fetch(base + name);
    if (!response.ok) {
      throw new Error("ROM " + name + " (" + response.status + ")");
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async init() {
    const names = [
      "dd1a.1", "dd1a.2", "dd1a.3", "dd1a.4",
      "dd1a.5", "dd1a.6", "dd1.7",
      "dd1.9", "dd1.10b", "dd1.11",
      "dd1.12", "dd1.13", "dd1.14", "dd1.15",
      "136007.109", "136007.110", "136007.111",
      "136007.112", "136007.113"
    ];

    const files = Object.fromEntries(
      await Promise.all(names.map(async name => [name, await this.fetchRom(name)]))
    );

    this.rom[0].set(files["dd1a.1"], 0x0000);
    this.rom[0].set(files["dd1a.2"], 0x1000);
    this.rom[0].set(files["dd1a.3"], 0x2000);
    this.rom[0].set(files["dd1a.4"], 0x3000);

    this.rom[1].set(files["dd1a.5"], 0x0000);
    this.rom[1].set(files["dd1a.6"], 0x1000);
    this.rom[2].set(files["dd1.7"], 0x0000);

    this.charRom = files["dd1.9"];
    this.bgMapRom = files["dd1.10b"];
    this.bgGfxRom = files["dd1.11"];

    this.spriteRom = new Uint8Array(0x4000);
    this.spriteRom.set(files["dd1.15"], 0x0000);
    this.spriteRom.set(files["dd1.14"], 0x1000);
    this.spriteRom.set(files["dd1.13"], 0x2000);
    this.spriteRom.set(files["dd1.12"], 0x3000);

    this.proms = new Uint8Array(0x220);
    this.proms.set(files["136007.113"], 0x000);
    this.proms.set(files["136007.111"], 0x020);
    this.proms.set(files["136007.112"], 0x120);

    this.waveProm = files["136007.110"];
    this.buildPalette();

    this.sound = new NamcoWSG({
      variant: NamcoWSG.VARIANT_3_VOICE,
      clock: MASTER_CLOCK / 6 / 32,
      waveformProm: this.waveProm
    });

    this.io51 = new Namco51XX();
    try {
      this.io51.loadROM(await this.fetchRom("51xx.bin", "../galaga/roms/"));
    } catch (error) {
      console.warn("[DigDug] shared 51XX ROM unavailable; controls may not respond", error);
    }

    this.io53 = new Namco53XX();
    this.io53.loadROM(await this.fetchRom("53xx.bin", "../polepos/roms/"));
    this.io53.mcu.readK = () =>
      ((this.miscLatch[7] & 1) << 3) |
      ((this.miscLatch[6] & 1) << 2) |
      ((this.miscLatch[5] & 1) << 1);
    this.io53.mcu.readR[0] = () => this.dswa & 0x0f;
    this.io53.mcu.readR[1] = () => (this.dswa >> 4) & 0x0f;
    this.io53.mcu.readR[2] = () => this.dswb & 0x0f;
    this.io53.mcu.readR[3] = () => (this.dswb >> 4) & 0x0f;
    this.io53Ticks = 0;

    this.ioControl = 0;
    this.ioTimerState = false;
    this.ioReadStretch = false;

    this.cpus = [0, 1, 2].map(index => {
      const cpu = new Z80(
        address => this.read(index, address),
        (address, data) => this.write(index, address, data),
        () => 0xff,
        () => {}
      );
      cpu.reset();
      cpu.IM = 1;
      return cpu;
    });

    this.setSubReset(true);
    this.io51.setResetLine(0);
    this.io53.setResetLine(0);
    this.update51Inputs();
    this.draw();
  }

  buildPalette() {
    const base = [];
    const rw = [33, 71, 151];
    const bw = [81, 174];

    for (let i = 0; i < 32; i++) {
      const p = this.proms[i];
      const r = rw[0] * ((p >> 0) & 1) +
                rw[1] * ((p >> 1) & 1) +
                rw[2] * ((p >> 2) & 1);
      const g = rw[0] * ((p >> 3) & 1) +
                rw[1] * ((p >> 4) & 1) +
                rw[2] * ((p >> 5) & 1);
      const b = bw[0] * ((p >> 6) & 1) +
                bw[1] * ((p >> 7) & 1);
      base.push([r, g, b]);
    }

    this.palette = new Array(544);

    for (let color = 0; color < 16; color++) {
      this.palette[color * 2] = base[0];
      this.palette[color * 2 + 1] = base[color];
    }

    for (let i = 0; i < 256; i++) {
      this.palette[32 + i] = base[(this.proms[0x20 + i] & 0x0f) | 0x10];
      this.palette[288 + i] = base[this.proms[0x120 + i] & 0x0f];
    }
  }

  read(cpuIndex, address) {
    address &= 0xffff;

    if (address < 0x4000) {
      return this.rom[cpuIndex][address];
    }

    if (address >= 0x7000 && address <= 0x70ff) {
      return this.ioDataRead();
    }

    if (address === 0x7100) {
      return this.ioControl & 0xff;
    }

    if (address >= 0x8000 && address <= 0x9bff) {
      return this.ram[address];
    }

    if (address >= 0xb800 && address <= 0xb83f) {
      return this.earom[address & 0x3f];
    }

    return 0xff;
  }

  write(cpuIndex, address, data) {
    void cpuIndex;
    address &= 0xffff;
    data &= 0xff;

    if (address >= 0x6800 && address <= 0x681f) {
      this.sound.write(address & 0x1f, data);
      return;
    }

    if (address >= 0x6820 && address <= 0x6827) {
      this.writeMiscLatch(address & 7, data & 1);
      return;
    }

    if (address >= 0x7000 && address <= 0x70ff) {
      this.ioDataWrite(data);
      return;
    }

    if (address === 0x7100) {
      this.ioControlWrite(data);
      return;
    }

    if (address >= 0x8000 && address <= 0x9bff) {
      this.ram[address] = data;
      return;
    }

    if (address >= 0xa000 && address <= 0xa007) {
      this.writeVideoLatch(address & 7, data & 1);
      return;
    }

    if (address >= 0xb800 && address <= 0xb83f) {
      this.earom[address & 0x3f] = data;
    }
  }

  writeMiscLatch(bit, value) {
    if (this.miscLatch[bit] === value) return;
    this.miscLatch[bit] = value;

    if (bit === 0) {
      this.mainIrqMask = value;
    } else if (bit === 1) {
      this.subIrqMask = value;
    } else if (bit === 2) {
      this.sub2NmiMask = !value;
    } else if (bit === 3) {
      this.setSubReset(!value);
      this.io51.setResetLine(value);
      this.io53.setResetLine(value);
    }

    if (bit >= 5) {
      // Dig Dug drives Namco 53XX MOD0-MOD2 here. The game selects mode 7.
    }
  }

  setSubReset(asserted) {
    if (asserted) {
      this.subsReleased = false;
      this.cpus?.[1] && (this.cpus[1].inReset = true);
      this.cpus?.[2] && (this.cpus[2].inReset = true);
      return;
    }

    if (!this.subsReleased) {
      this.cpus[1].reset();
      this.cpus[2].reset();
      this.cpus[1].IM = 1;
      this.cpus[2].IM = 1;
    }

    this.cpus[1].inReset = false;
    this.cpus[2].inReset = false;
    this.subsReleased = true;
  }

  writeVideoLatch(bit, value) {
    this.videoLatch[bit] = value;

    this.bgSelect = (this.videoLatch[0] ? 1 : 0) |
                    (this.videoLatch[1] ? 2 : 0);
    this.txColorMode = this.videoLatch[2] ? 1 : 0;
    this.bgDisable = this.videoLatch[3] ? 1 : 0;
    this.bgColorBank = (this.videoLatch[4] ? 0x10 : 0) |
                       (this.videoLatch[5] ? 0x20 : 0);
    this.flip = this.videoLatch[7] ? 1 : 0;
  }

  ioControlWrite(data) {
    this.ioControl = data & 0xff;
    this.ioTimerState = false;
    this.ioEdgeTicks = 0;

    // MAME 06XX: disabling the divider clears NMI/chip-select but leaves RW
    // unchanged. In read mode the first falling-edge NMI is suppressed so
    // the selected MCU has one cycle to place its result on the bus.
    this.setIoChipSelects(false);
    this.ioReadStretch = (this.ioControl & 0x10) !== 0 &&
                         (this.ioControl & 0xe0) !== 0;
  }

  ioDataWrite(data) {
    if (this.ioControl & 0x10) return;
    const mask = this.ioControl & 0x0f;
    if (mask & 1) this.io51.write(data);
    // Dig Dug's 53XX is read-only on the 06XX data bus.
  }

  ioDataRead() {
    if (!(this.ioControl & 0x10)) return 0;
    const mask = this.ioControl & 0x0f;
    let value = 0xff;
    if (mask & 1) value &= this.io51.read();
    if (mask & 2) value &= this.io53.read();
    return value & 0xff;
  }

  setIoChipSelects(active) {
    const mask = this.ioControl & 0x0f;
    this.io51.chipSelect(active && (mask & 1) ? 1 : 0);
    this.io53.chipSelect(active && (mask & 2) ? 1 : 0);
  }

  tickIo(masterTicks) {
    this.io51.advanceMasterTicks(masterTicks);
    if (!this.io53.isReset()) {
      this.io53Ticks += masterTicks;
      let cycles = Math.floor(this.io53Ticks / 72);
      this.io53Ticks -= cycles * 72;
      while (cycles > 0 && !this.io53.mcu.halted) {
        const used = this.io53.mcu.step();
        cycles -= used > 0 ? used : 1;
      }
    }

    const shift = (this.ioControl >> 5) & 7;
    if (!shift) return;

    const period = 192 * (1 << shift);
    this.ioEdgeTicks += masterTicks;

    while (this.ioEdgeTicks >= period) {
      this.ioEdgeTicks -= period;
      this.ioTimerState = !this.ioTimerState;

      if (this.ioTimerState) {
        // MAME updates RW only on the falling 06XX clock edge.
        this.io51.rw((this.ioControl & 0x10) ? 1 : 0);

        if (!this.ioReadStretch) {
          this.cpus[0].pulseNmi();
        }
        this.ioReadStretch = false;
        this.setIoChipSelects(true);
      } else {
        this.ioReadStretch = false;
        this.setIoChipSelects(false);
      }
    }
  }

  inputBytes() {
    let in0 = 0xff;
    let in1 = 0xff;

    if (this.input.up) in0 &= ~0x01;
    if (this.input.right) in0 &= ~0x02;
    if (this.input.down) in0 &= ~0x04;
    if (this.input.left) in0 &= ~0x08;

    if (this.input.fire) in1 &= ~0x01;
    if (this.input.start1) in1 &= ~0x04;
    if (this.input.coin1) in1 &= ~0x10;

    return [in0 & 0xff, in1 & 0xff];
  }

  update51Inputs() {
    const [in0, in1] = this.inputBytes();
    this.io51.setPorts(in0, in1);
  }

  runCpu(cpu, budgetName, cycles) {
    this[budgetName] += cycles;

    while (this[budgetName] > 0) {
      const used = cpu.step();
      this[budgetName] -= used;
      if (cpu === this.cpus[0]) this.tickIo(used * 6);
    }
  }

  frame() {
    const cyclesPerLine = CPU_CLOCK / FPS / 264;

    for (let line = 0; line < 264; line++) {
      this.runCpu(this.cpus[0], "mainRemainder", cyclesPerLine);

      if (this.subsReleased) {
        this.runCpu(this.cpus[1], "subRemainder", cyclesPerLine);
        this.runCpu(this.cpus[2], "sub2Remainder", cyclesPerLine);
      }

      if ((line === 64 || line === 192) && this.sub2NmiMask && this.subsReleased) {
        this.cpus[2].pulseNmi();
      }

      if (line === 224) {
        if (this.mainIrqMask) this.cpus[0].requestIrq(0xff);
        if (this.subIrqMask && this.subsReleased) this.cpus[1].requestIrq(0xff);
        this.io51.vblank(true);
      }

      if (line === 0) {
        this.io51.vblank(false);
      }
    }

    this.draw();
  }

  tileIndex(col, row) {
    row += 2;
    col -= 2;

    if (col & 0x20) {
      return (row + ((col & 0x1f) << 5)) & 0x3ff;
    }

    return (col + (row << 5)) & 0x3ff;
  }

  charPixel(code, x, y) {
    const offset = ((code & 0x7f) * 8 + y) & 0x7ff;
    return (this.charRom[offset] >> (7 - x)) & 1;
  }

  bgPixel(code, x, y) {
    // MAME charlayout_2bpp. gfx_layout bit offsets are LSB-numbered
    // within each byte (BIT(source, offset)), not display-order MSB bits.
    const xOffset = x < 4 ? 64 + x : x - 4;
    const bitBase = (code & 0xff) * 128 + xOffset + y * 8;
    const p0 = (this.bgGfxRom[bitBase >> 3] >> (bitBase & 7)) & 1;
    const p1Bit = bitBase + 4;
    const p1 = (this.bgGfxRom[p1Bit >> 3] >> (p1Bit & 7)) & 1;
    return p0 | (p1 << 1);
  }

  spritePixel(code, x, y) {
    // MAME spritelayout_galaga: plane offsets {0,4};
    // X offsets are four 4-pixel groups at 0,64,128,192 bits.
    const xOffset = x < 4 ? x :
                    x < 8 ? 64 + x - 4 :
                    x < 12 ? 128 + x - 8 :
                    192 + x - 12;
    const yOffset = y < 8 ? y * 8 : 256 + (y - 8) * 8;
    const bitBase = (code & 0xff) * 512 + xOffset + yOffset;
    const p0 = (this.spriteRom[bitBase >> 3] >> (bitBase & 7)) & 1;
    const p1Bit = bitBase + 4;
    const p1 = (this.spriteRom[p1Bit >> 3] >> (p1Bit & 7)) & 1;
    return p0 | (p1 << 1);
  }

  putPixel(x, y, pen) {
    if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H) return;

    if (this.flip) {
      x = SCREEN_W - 1 - x;
      y = SCREEN_H - 1 - y;
    }

    const canvasX = SCREEN_H - 1 - y;
    const canvasY = x;
    const color = this.palette[pen] || [0, 0, 0];
    const offset = (canvasY * CANVAS_W + canvasX) * 4;

    this.image.data[offset] = color[0];
    this.image.data[offset + 1] = color[1];
    this.image.data[offset + 2] = color[2];
    this.image.data[offset + 3] = 255;
  }

  drawBackground() {
    for (let row = 0; row < 28; row++) {
      for (let col = 0; col < 36; col++) {
        const index = this.tileIndex(col, row);
        const code = this.bgMapRom[index | (this.bgSelect << 10)];
        const color = this.bgDisable ? 0x0f : (code >> 4);
        const colorCode = color | this.bgColorBank;

        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const pixel = this.bgPixel(code, x, y);
            this.putPixel(col * 8 + x, row * 8 + y, 288 + colorCode * 4 + pixel);
          }
        }
      }
    }
  }

  drawText() {
    for (let row = 0; row < 28; row++) {
      for (let col = 0; col < 36; col++) {
        const index = this.tileIndex(col, row);
        const code = this.ram[0x8000 + index];
        const color = this.txColorMode
          ? code & 0x0f
          : ((code >> 4) & 0x0e) | ((code >> 3) & 2);

        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const pixel = this.charPixel(code, x, y);
            if (pixel) {
              this.putPixel(col * 8 + x, row * 8 + y, color * 2 + 1);
            }
          }
        }
      }
    }
  }

  drawSprites() {
    const gfxOffset = [[0, 1], [2, 3]];

    for (let offset = 0; offset < 0x80; offset += 2) {
      let sprite = this.ram[0x8b80 + offset];
      const color = this.ram[0x8b80 + offset + 1] & 0x3f;
      const sx = this.ram[0x9380 + offset + 1] - 40 + 1;
      let sy = 256 - this.ram[0x9380 + offset] + 1;
      let flipx = this.ram[0x9b80 + offset] & 1;
      let flipy = (this.ram[0x9b80 + offset] >> 1) & 1;
      const size = (sprite >> 7) & 1;

      if (size) {
        sprite = (sprite & 0xc0) | ((sprite & ~0xc0) << 2);
      }

      sy -= 16 * size;
      sy = (sy & 0xff) - 32;

      if (this.flip) {
        flipx ^= 1;
        flipy ^= 1;
      }

      for (let ty = 0; ty <= size; ty++) {
        for (let tx = 0; tx <= size; tx++) {
          const code = sprite + gfxOffset[ty ^ (size * flipy)][tx ^ (size * flipx)];

          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const pixel = this.spritePixel(
                code,
                flipx ? 15 - x : x,
                flipy ? 15 - y : y
              );

              const pen = 32 + color * 4 + pixel;
              // MAME uses transpen_mask(..., 0x1f): transparency is selected
              // after the sprite lookup PROM, not by raw graphics pixel 0.
              if (this.proms[0x20 + color * 4 + pixel] === 0x0f) continue;

              const px = ((sx + 16 * tx) & 0xff) + x;
              const py = sy + 16 * ty + y;

              if (px >= 16 && px < 272) {
                this.putPixel(px, py, pen);
              }

              // MAME draws a second copy at +0x100 for X wraparound.
              const wrapX = px + 0x100;
              if (wrapX >= 16 && wrapX < 272) {
                this.putPixel(wrapX, py, pen);
              }
            }
          }
        }
      }
    }
  }

  draw() {
    this.image.data.fill(0);
    // MAME screen_update_digdug: background, transparent text, then sprites.
    this.drawBackground();
    this.drawText();
    this.drawSprites();
    this.ctx.putImageData(this.image, 0, 0);
  }

  bindAudioUnlock() {
    const unlock = async () => {
      if (this.audioUnlocked || !this.sound) return;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContext({ latencyHint: "interactive" });
        this.audioNode = this.audioCtx.createScriptProcessor(1024, 0, 1);
        this.audioNode.onaudioprocess = event => {
          this.sound.renderMono(event.outputBuffer.getChannelData(0));
        };
        this.audioNode.connect(this.audioCtx.destination);
      }

      await this.audioCtx.resume();
      this.audioUnlocked = this.audioCtx.state === "running";
    };

    document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    document.addEventListener("touchstart", unlock, { capture: true, passive: true });
  }

  bindControls() {
    const set = (name, value) => {
      this.input[name] = value;
      this.update51Inputs?.();
    };

    const pulse = name => {
      set(name, 1);
      setTimeout(() => set(name, 0), 150);
    };

    const keyMap = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Space: "fire"
    };

    addEventListener("keydown", event => {
      if (keyMap[event.code]) {
        event.preventDefault();
        set(keyMap[event.code], 1);
      }
      if (event.code === "Digit1" && !event.repeat) pulse("start1");
      if (event.code === "Digit5" && !event.repeat) pulse("coin1");
    });

    addEventListener("keyup", event => {
      if (keyMap[event.code]) {
        event.preventDefault();
        set(keyMap[event.code], 0);
      }
    });

    document.querySelectorAll("[data-btn]").forEach(element => {
      const name = element.dataset.btn;
      element.onpointerdown = event => {
        event.preventDefault();
        if (name === "coin1" || name === "start1") pulse(name);
        else set(name, 1);
      };
      element.onpointerup = () => set(name, 0);
      element.onpointercancel = () => set(name, 0);
      element.oncontextmenu = event => event.preventDefault();
    });

    const dpad = document.querySelector("#dpad");

    const move = event => {
      const rect = dpad.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;

      for (const name of ["left", "right", "up", "down"]) set(name, 0);
      if (Math.hypot(x, y) <= 15) return;

      if (Math.abs(x) > Math.abs(y)) set(x < 0 ? "left" : "right", 1);
      else set(y < 0 ? "up" : "down", 1);
    };

    dpad.onpointerdown = event => {
      event.preventDefault();
      dpad.setPointerCapture(event.pointerId);
      move(event);
    };
    dpad.onpointermove = event => {
      if (dpad.hasPointerCapture(event.pointerId)) move(event);
    };
    dpad.onpointerup = dpad.onpointercancel = () => {
      for (const name of ["left", "right", "up", "down"]) set(name, 0);
    };

    addEventListener("blur", () => {
      for (const name of Object.keys(this.input)) set(name, 0);
    });
  }

  run() {
    const frameMs = 1000 / FPS;
    let previous = performance.now();
    let accumulator = 0;

    const loop = now => {
      accumulator += Math.min(100, now - previous);
      previous = now;

      while (accumulator >= frameMs) {
        this.frame();
        accumulator -= frameMs;
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

const emulator = new DigDug();
await emulator.init();
emulator.run();
window.digDug = emulator;
