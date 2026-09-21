import { Z80 } from "../../cpu/z80.js";
import { NamcoWSG } from "../../chips/NamcoWSG.js";
import { EmulatorAudioWorklet } from "../../audio/EmulatorAudioWorklet.js";

// ===========================================================
// jspacman — Pac-Man Emulator
// ===========================================================
// Audio
async function ensureAudio() {
  const emu = window.pacmanEmulator;
  if (!emu?.audio) return;
  try { await emu.audio.unlock(); emu.audio.setEnabled(emu.soundEnable); }
  catch (e) { console.warn("[EMU] ensureAudio failed:", e); }
}
function resumeAudio() { window.pacmanEmulator?.audio?.resume(); }

// Main
class jspacman {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx    = this.canvas.getContext("2d");

    this.targetInterval = 1000 / 60.606;
    this.cyclesPerFrame = 50688;
    this.accumulator    = 0;
    this.lastFrameTime  = 0;
    this.frameCounter   = 0;

    this.cpu             = new Z80();

    this.cpu.memRead     = (addr)        => this.memoryRead(addr);
    this.cpu.memWrite    = (addr, value) => this.memoryWrite(addr, value);
    this.cpu.ioRead      = (port)        => this.ioRead(port);
    this.cpu.ioWrite     = (port, value) => this.ioWrite(port, value);

    this.cpu.vectorLatch = 0x00;

    this.memory      = new Uint8Array(0x10000).fill(0x00);
    this.ioRegisters = new Uint8Array(256);

    this.romData      = new Uint8Array(0x4000);
    this.charRom      = new Uint8Array(0x1000);
    this.spriteRom    = new Uint8Array(0x1000);
    this.colorProm    = new Uint8Array(32);
    this.colorTable   = new Uint8Array(256);
    this.waveformProm = new Uint8Array(512);
    this.wsg          = null;
    this.audio        = new EmulatorAudioWorklet();
    this.audioFrameSamples = 0;
    this.soundEnable  = false;

    this.palette = [];
    this.clut    = new Uint8Array(256);
    this.chars   = [];
    this.sprites = [];

    this.flipScreen      = false;
    this.interruptEnable = true;

    this.inputs = {
      up: false, down: false, left: false, right: false,
      coin1: false, coin2: false, credit: false,
      start1: false, start2: false,
    };
    this.running = false;
  }

  // ── ROM Loading ──────────────────────────────────────────────
  async loadROM(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  async loadROMS(useDiag = false) {
    const base = "https://subnetpie.github.io/arcade/pacman/";

    if (!useDiag) {
      const [r6e, r6f, r6h, r6j] = await Promise.all([
        this.loadROM(base + "pacman.6e"),
        this.loadROM(base + "pacman.6f"),
        this.loadROM(base + "pacman.6h"),
        this.loadROM(base + "pacman.6j"),
      ]);
      this.romData.set(r6e.subarray(0, 0x1000), 0x0000);
      this.romData.set(r6f.subarray(0, 0x1000), 0x1000);
      this.romData.set(r6h.subarray(0, 0x1000), 0x2000);
      this.romData.set(r6j.subarray(0, 0x1000), 0x3000);
    } else {
      const diag     = await this.loadROM(base + "diagnostic.bin");
      const pageSize = 0x1000;
      const pages    = Math.min(4, Math.ceil(diag.length / pageSize));
      for (let i = 0; i < pages; i++) {
        const slice = diag.subarray(i * pageSize, (i + 1) * pageSize);
        if (slice.length) this.romData.set(slice, i * pageSize);
      }
      for (let i = pages; i < 4; i++)
        this.romData.set(this.romData.subarray(0, pageSize), i * pageSize);
    }

    const [charData, spriteData, colorData, paletteData, waveData1, waveData3] =
      await Promise.all([
        this.loadROM(base + "pacman.5e"),
        this.loadROM(base + "pacman.5f"),
        this.loadROM(base + "82s123.7f"),
        this.loadROM(base + "82s126.4a"),
        this.loadROM(base + "82s126.1m"),
        this.loadROM(base + "82s126.3m"),
      ]);

    this.charRom.set(charData.subarray(0, 0x1000));
    this.spriteRom.set(spriteData.subarray(0, 0x1000));
    this.colorProm.set(colorData.subarray(0, 32));
    this.colorTable.set(paletteData.subarray(0, 256));
    this.waveformProm.set(waveData1.subarray(0, 256), 0);
    this.waveformProm.set(waveData3.subarray(0, 256), 256);
  }

  // ── I/O Bus ──────────────────────────────────────────────────
  ioRead(port) {
    const offset = port & 0xff;
    if (offset === 0x00) return this.cpu.vectorLatch ?? 0x00;
    if (offset >= 0x60 && offset <= 0x6f)
      return this.memory[0x5060 + (offset - 0x60)];
    return this.ioRegisters[offset] ?? 0xff;
  }
  ioWrite(port, data) {
    const offset = port & 0xff;
    if (offset === 0x00) this.cpu.vectorLatch = data & 0xff;
  }

  // ── Memory Map ───────────────────────────────────────────────
  memoryRead(addr) {
    addr &= 0xffff;
    if      (addr >= 0x8000 && addr <= 0x8fff) addr = 0x4000 | (addr & 0x0fff);
    else if (addr >= 0xc000 && addr <= 0xcfff) addr = 0x4000 | (addr & 0x0fff);
    if (addr < 0x4000) return this.memory[addr];

    if (addr >= 0x5000 && addr < 0x5100) {
      const offset = addr & 0xff;
      if (offset < 0x40) {
        let v = 0xff;
        if (this.inputs.up)     v &= ~0x01;
        if (this.inputs.left)   v &= ~0x02;
        if (this.inputs.right)  v &= ~0x04;
        if (this.inputs.down)   v &= ~0x08;
        if (this.inputs.coin1)  v &= ~0x20;
        if (this.inputs.coin2)  v &= ~0x40;
        if (this.inputs.credit) v &= ~0x80;
        return v;
      }
      if (offset < 0x80) {
        let v = 0xff;
        if (this.inputs.start1) v &= ~0x20;
        if (this.inputs.start2) v &= ~0x40;
        return v;
      }
      if (offset < 0xc0) {
        let dsw = 0xff;
//        dsw |=  0x01;
//        dsw &= ~0x02;
//        dsw &= ~0x04;
//        dsw |=  0x08;
//        dsw &= ~0x30;
        return dsw;
      }
    }
    return this.memory[addr];
  }
  memoryWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if      (addr >= 0x8000 && addr <= 0x8fff) addr = 0x4000 | (addr & 0x0fff);
    else if (addr >= 0xc000 && addr <= 0xcfff) addr = 0x4000 | (addr & 0x0fff);

    if (addr < 0x4000) return;

    if (addr >= 0x5000 && addr < 0x5008) {
      const bit0 = (data & 1) === 1;
      switch (addr & 0x07) {
        case 0x00: this.interruptEnable = bit0; break;
        case 0x01:
          this.soundEnable = bit0;
          // Only call setEnabled if audio is already warmed up (user has interacted).
          // If not ready yet, the pending enable state is stored in this.soundEnable
          // and replayed by ensureAudio() on first interaction.
          this.wsg?.soundEnable(bit0);
          this.audio.setEnabled(bit0);
          break;
        case 0x02: this.flipScreen = bit0; break;
        // 0x03–0x07: lamps, coin lockout, coin counter — not emulated
      }
      return;
    }

    if (addr >= 0x5040 && addr <= 0x505f) {
      this.wsg?.write(addr - 0x5040, data);
      return;
    }

    if (addr >= 0x50c0 && addr <= 0x50ff) return; // watchdog — no-op

    this.memory[addr] = data;
  }

  // ── Graphics Builders ────────────────────────────────────────
  buildPalette(colorProm) {
    return Array.from({ length: 16 }, (_, i) => {
      const d = colorProm[i];
      const r = (d & 0x01 ? 0x21 : 0) + (d & 0x02 ? 0x47 : 0) + (d & 0x04 ? 0x97 : 0);
      const g = (d & 0x08 ? 0x21 : 0) + (d & 0x10 ? 0x47 : 0) + (d & 0x20 ? 0x97 : 0);
      const b = (d & 0x40 ? 0x51 : 0) + (d & 0x80 ? 0xae : 0);
      return `rgb(${r},${g},${b})`;
    });
  }
  buildCLUT(colorTable) {
    const clut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) clut[i] = colorTable[i] & 0x0f;
    return clut;
  }
  buildChars(charRom) {
    return Array.from({ length: 256 }, (_, tileNum) => {
      const base   = tileNum * 16;
      const raw    = new Uint8Array(64);
      const pixels = new Uint8Array(64);
      for (let col = 0; col < 8; col++) {
        const lo = charRom[base + col];
        const hi = charRom[base + 8 + col];
        for (let nib = 0; nib < 4; nib++) {
          const bp = 3 - nib;
          raw[nib * 8 + col]       = (((hi >> (bp + 4)) & 1) << 1) | ((hi >> bp) & 1);
          raw[(nib + 4) * 8 + col] = (((lo >> (bp + 4)) & 1) << 1) | ((lo >> bp) & 1);
        }
      }
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) pixels[(7 - (7 - x)) * 8 + y] = raw[y * 8 + x];
      return pixels;
    });
  }
  buildSprites(spriteRom) {
    const STRIP_ORIGINS = [
      [0, 0], [0, 12], [0, 8], [0, 4],
      [8, 0], [8, 12], [8, 8], [8, 4],
    ];
    return Array.from({ length: 64 }, (_, spriteNum) => {
      const base   = spriteNum * 64;
      const raw    = new Uint8Array(256);
      const pixels = new Uint8Array(256);
      for (let strip = 0; strip < 8; strip++) {
        const [sx, sy]  = STRIP_ORIGINS[strip];
        const stripBase = base + strip * 8;
        for (let b = 0; b < 8; b++) {
          const byte = spriteRom[stripBase + b];
          for (let pr = 0; pr < 4; pr++) {
            raw[(sy + pr) * 16 + (sx + b)] =
              (((byte >> (pr + 4)) & 1) << 1) | ((byte >> pr) & 1);
          }
        }
      }
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) pixels[x * 16 + (15 - y)] = raw[y * 16 + x];
      return pixels;
    });
  }

  // ── Rendering ────────────────────────────────────────────────
  renderTiles() {
    const { memory, chars, palette, clut, ctx } = this;
    for (let off = 0; off < 0x400; off++) {
      const code = memory[0x4000 + off];
      const col6 = memory[0x4400 + off] & 0x3f;
      const row  = Math.floor(off / 32);
      const col  = off % 32;
      let sx, sy;
      if      (off < 0x040) { sx = row + 34; sy = col - 2; }
      else if (off < 0x3c0) { sx = col + 2;  sy = row - 2; }
      else                  { sx = row - 30; sy = col - 2; }
      const pix = chars[code];
      if (!pix) continue;
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const p            = pix[py * 8 + px];
          const paletteIndex = clut[(col6 << 2) | p] & 0x0f;
          if (p === 0 && paletteIndex === 0) continue;
          ctx.fillStyle = palette[paletteIndex];
          ctx.fillRect(sx * 8 + px, sy * 8 + py, 1, 1);
        }
      }
    }
  }
  renderSprites() {
    const { memory, sprites, palette, clut, ctx, flipScreen: flip } = this;
    for (let i = 7; i >= 0; i--) {
      const attrAddr = 0x4ff0 + i * 2;
      const attrByte = memory[attrAddr];
      const shape    = (attrByte >> 2) & 0x3f;
      const fx       = !!(attrByte & 0x01);
      const fy       = !!(attrByte & 0x02);
      const col6     = memory[attrAddr + 1] & 0x3f;
      const posAddr  = 0x5060 + i * 2;
      let x = 272 - memory[posAddr + 1];
      let y = memory[posAddr] - 31;
      if (i <= 1) y += 1;
      if (flip)   { x = 224 - 16 - x; y = 288 - 16 - y; }
      const pix = sprites[shape];
      if (!pix) continue;
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const p            = pix[(fy ? 15 - py : py) * 16 + (fx ? 15 - px : px)];
          if (p === 0) continue;
          const paletteIndex = clut[(((col6 | 0x40) << 2) | p) & 0xff] & 0x0f;
          if (paletteIndex === 0) continue;
          const sx = x + px, sy = y + py;
          if (sx < 0 || sx >= 288 || sy < 0 || sy >= 224) continue;
          ctx.fillStyle = palette[paletteIndex];
          ctx.fillRect(sx, sy, 1, 1);
        }
      }
    }
  }
  renderFrame() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderTiles();
    this.renderSprites();
  }

  // ── CPU Execution ────────────────────────────────────────────
  runCpuFrame() {
    let cyclesLeft = this.cyclesPerFrame;
    while (cyclesLeft > 0) cyclesLeft -= this.cpu.step();
    if (this.interruptEnable) this.cpu.requestIrq(this.cpu.vectorLatch);
  }

  renderAudioFrame() {
    if (!this.wsg || !this.audio.ready) return;
    this.audioFrameSamples += this.wsg.sampleRate / 60.606;
    const count = Math.floor(this.audioFrameSamples);
    this.audioFrameSamples -= count;
    if (!count) return;
    const pcm = new Float32Array(count);
    this.wsg.renderMono(pcm);
    this.audio.push(pcm, this.wsg.sampleRate);
  }

  // ── Frame Loop ───────────────────────────────────────────────
  frameLoop() {
    if (!this.running) return;
    const now   = performance.now();
    let   delta = now - (this.lastFrameTime || now);
    this.lastFrameTime = now;
    if (delta > 100) delta = 100;
    this.accumulator += delta;
    while (this.accumulator >= this.targetInterval) {
      this.runCpuFrame();
      this.accumulator -= this.targetInterval;
      this.frameCounter++;
      this.renderAudioFrame();
    }
    this.renderFrame();
    requestAnimationFrame(() => this.frameLoop());
  }

  // ── Lifecycle ────────────────────────────────────────────────
  async start() {
    this.memory.fill(0x00);
    this.memory.set(this.romData, 0x0000);
    this.palette = this.buildPalette(this.colorProm);
    this.clut    = this.buildCLUT(this.colorTable);
    this.chars   = this.buildChars(this.charRom);
    this.sprites = this.buildSprites(this.spriteRom);

    // Tear down any previous instance to prevent AudioContext leaks on reset.
    // Do NOT init audio here — AudioContext creation requires a user gesture.
    // ensureAudio() handles deferred init on first interaction.
    this.wsg = new NamcoWSG({ waveformProm: this.waveformProm });

    this.cpu.reset();
    this.running       = true;
    this.lastFrameTime = performance.now();
    this.accumulator   = 0;

    if (typeof updateButtonStates === 'function') updateButtonStates();
    this.frameLoop();
  }

  stop() {
    this.running = false;
    this.audio.setEnabled(false);
    this.audio.clear();
    updateButtonStates();
  }
}

async function startEmulator(useDiag = false) {
  try {
    if (window.pacmanEmulator?.running) {
      window.pacmanEmulator.stop();
      window.pacmanEmulator = null;
    }
    const emu = new jspacman();
    await emu.loadROMS(useDiag);
    emu.useDiag           = useDiag;
    window.pacmanEmulator = emu;
    await emu.start();
    console.log(`[INIT] Running in ${useDiag ? "DIAGNOSTIC" : "GAME"} mode`);
  } catch (err) {
    console.error("[ERROR] Failed to start emulator:", err);
    alert("Failed to start emulator: " + err.message);
  }
}
function stopEmulator() {
  window.pacmanEmulator?.stop();
}

// Boot
document.addEventListener("DOMContentLoaded", () => {
  new SwipeController();
  setupDPadControls();

  // Any interaction warms up audio (covers coin/start buttons on mobile)
  document.addEventListener('click',      ensureAudio);
  document.addEventListener('touchstart', ensureAudio, { passive: true });
  document.addEventListener('mousedown',  resumeAudio);

  // Start emulator immediately — CPU + graphics run without audio until
  // the first user gesture triggers ensureAudio().
  startEmulator(false);
});

// UI 
function updateButtonStates() {
  const toggleBtn = document.getElementById("toggleBtn");
  const resetBtn  = document.getElementById("resetBtn");
  const emu       = window.pacmanEmulator;
  const inDiag    = emu?.useDiag ?? false;

  if (toggleBtn) {
    toggleBtn.textContent = inDiag ? "Game" : "Test";
    toggleBtn.disabled    = false;
  }
  if (resetBtn) resetBtn.disabled = false;
}
function toggleEmulator() {
  ensureAudio(); // button click is a valid gesture — warm up audio immediately
  const emu = window.pacmanEmulator;
  startEmulator(emu?.running ? !emu.useDiag : false);
}

// Controls
class SwipeController {
  constructor() {
    this.element      = document;
    this.touchStart   = null;
    this.minSwipeDist = 30;
    const opts = { passive: false };
    this.element.addEventListener("touchstart", (e) => this._start(e), opts);
    this.element.addEventListener("touchmove",  (e) => this._move(e),  opts);
    this.element.addEventListener("touchend",   (e) => this._end(e),   opts);
  }

  _start(e) {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    this.touchStart = { x: t.clientX, y: t.clientY };
  }

  _move(e) {
    if (this.touchStart) e.preventDefault();
  }

  _end(e) {
    if (!this.touchStart) return;
    e.preventDefault();
    const t    = e.changedTouches[0];
    const dx   = t.clientX - this.touchStart.x;
    const dy   = t.clientY - this.touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    this.touchStart = null;
    if (absX < this.minSwipeDist && absY < this.minSwipeDist) return;
    const dir = absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    this._applyInput(dir);
  }

  _applyInput(dir) {
    const emu = window.pacmanEmulator;
    if (!emu) return;
    ["up", "down", "left", "right"].forEach((d) => (emu.inputs[d] = d === dir));
  }
}
function setupDPadControls() {
  document.querySelectorAll(".pad").forEach((btn) => {
    const dir    = btn.getAttribute("data-dir");
    const setDir = (state) => {
      if (window.pacmanEmulator) window.pacmanEmulator.inputs[dir] = state;
      btn.classList.toggle("pressed", state);
    };
    btn.addEventListener("touchstart",  (e) => { e.preventDefault(); setDir(true);  }, { passive: false });
    btn.addEventListener("touchend",    (e) => { e.preventDefault(); setDir(false); }, { passive: false });
    btn.addEventListener("touchcancel", (e) => { e.preventDefault(); setDir(false); }, { passive: false });
    btn.addEventListener("mousedown",   (e) => { e.preventDefault(); setDir(true);  });
    btn.addEventListener("mouseup",     (e) => { e.preventDefault(); setDir(false); });
    btn.addEventListener("mouseleave",  ()  => setDir(false));
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });
}
const KEY_MAP = {
  arrowup:    "up",    w: "up",
  arrowdown:  "down",  s: "down",
  arrowleft:  "left",  a: "left",
  arrowright: "right", d: "right",
  5: "coin1", 6: "coin2",
  1: "start1", 2: "start2",
};
document.addEventListener("keydown", (e) => {
  ensureAudio(); // first keypress warms up the audio graph
  const emu   = window.pacmanEmulator;
  if (!emu) return;
  const input = KEY_MAP[e.key.toLowerCase()];
  if (input) emu.inputs[input] = true;
});
document.addEventListener("keyup", (e) => {
  const emu   = window.pacmanEmulator;
  if (!emu) return;
  const input = KEY_MAP[e.key.toLowerCase()];
  if (input) emu.inputs[input] = false;
});
function insertCoin1() {
  const emu = window.pacmanEmulator;
  if (!emu) return;
  emu.inputs.coin1 = true;
  setTimeout(() => { emu.inputs.coin1 = false; }, 100);
}
function start1Player() {
  const emu = window.pacmanEmulator;
  if (!emu) return;
  emu.inputs.start1 = true;
  setTimeout(() => { emu.inputs.start1 = false; }, 300);
}
function start2Player() {
  const emu = window.pacmanEmulator;
  if (!emu) return;
  emu.inputs.start2 = true;
  setTimeout(() => { emu.inputs.start2 = false; }, 100);
}

// HTML controls remain callable after switching the game to an ES module.
Object.assign(window, { insertCoin1, start1Player, start2Player, toggleEmulator });
