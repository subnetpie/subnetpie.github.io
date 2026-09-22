import { Z80 } from "../../cpu/z80.js";
import { NamcoWSG } from "../../chips/NamcoWSG.js";
import { EmulatorAudioWorklet } from "../../audio/EmulatorAudioWorklet.js";

//=====================================================================
// - MS. PAC-MAN EMULATOR -
//=====================================================================
// ── Audio ───────────────────────────────────────────────────────────
async function ensureAudio() {
 const emu = window.pacmanEmulator;
 if (!emu?.audio) return;
 try { await emu.audio.unlock(); emu.audio.setEnabled(emu.soundEnable); }
 catch (e) { console.warn("[EMU] ensureAudio failed:", e); }
}
function resumeAudio() { window.pacmanEmulator?.audio?.resume(); }

// ── Browser Helpers ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
 new SwipeController();
 setupDPadControls();

 document.addEventListener("click", ensureAudio);
 document.addEventListener("touchstart", ensureAudio, { passive: true });
 document.addEventListener("mousedown", resumeAudio);

 startEmulator();
});

// ── Decode Helpers ───────────────────────────────────────────────────
class ProtectDecode {
 static bitswap8(x, b7, b6, b5, b4, b3, b2, b1, b0) {
  return (
   ((x >> b0) & 1) |
   (((x >> b1) & 1) << 1) |
   (((x >> b2) & 1) << 2) |
   (((x >> b3) & 1) << 3) |
   (((x >> b4) & 1) << 4) |
   (((x >> b5) & 1) << 5) |
   (((x >> b6) & 1) << 6) |
   (((x >> b7) & 1) << 7)
  );
 }
 static bitswap11(a, b10, b9, b8, b7, b6, b5, b4, b3, b2, b1, b0) {
  return (
   ((a >> b0) & 1) |
   (((a >> b1) & 1) << 1) |
   (((a >> b2) & 1) << 2) |
   (((a >> b3) & 1) << 3) |
   (((a >> b4) & 1) << 4) |
   (((a >> b5) & 1) << 5) |
   (((a >> b6) & 1) << 6) |
   (((a >> b7) & 1) << 7) |
   (((a >> b8) & 1) << 8) |
   (((a >> b9) & 1) << 9) |
   (((a >> b10) & 1) << 10)
  );
 }
 static bitswap12(i, b11, b10, b9, b8, b7, b6, b5, b4, b3, b2, b1, b0) {
  return (
   ((i >> b0) & 1) |
   (((i >> b1) & 1) << 1) |
   (((i >> b2) & 1) << 2) |
   (((i >> b3) & 1) << 3) |
   (((i >> b4) & 1) << 4) |
   (((i >> b5) & 1) << 5) |
   (((i >> b6) & 1) << 6) |
   (((i >> b7) & 1) << 7) |
   (((i >> b8) & 1) << 8) |
   (((i >> b9) & 1) << 9) |
   (((i >> b10) & 1) << 10) |
   (((i >> b11) & 1) << 11)
  );
 }

 static installPatches(dec) {
  const P = (dst, src) => ProtectDecode.copy8(dec, dst, dec, src);

  P(0x0410, 0x8008);
  P(0x08e0, 0x81d8);
  P(0x0a30, 0x8118);
  P(0x0bd0, 0x80d8);
  P(0x0c20, 0x8120);
  P(0x0e58, 0x8168);
  P(0x0ea8, 0x8198);
  P(0x1000, 0x8020);
  P(0x1008, 0x8010);
  P(0x1288, 0x8098);
  P(0x1348, 0x8048);
  P(0x1688, 0x8088);
  P(0x16b0, 0x8188);
  P(0x16d8, 0x80c8);
  P(0x16f8, 0x81c8);
  P(0x19a8, 0x80a8);
  P(0x19b8, 0x81a8);
  P(0x2060, 0x8148);
  P(0x2108, 0x8018);
  P(0x21a0, 0x81a0);
  P(0x2298, 0x80a0);
  P(0x23e0, 0x80e8);
  P(0x2418, 0x8000);
  P(0x2448, 0x8058);
  P(0x2470, 0x8140);
  P(0x2488, 0x8080);
  P(0x24b0, 0x8180);
  P(0x24d8, 0x80c0);
  P(0x24f8, 0x81c0);
  P(0x2748, 0x8050);
  P(0x2780, 0x8090);
  P(0x27b8, 0x8190);
  P(0x2800, 0x8028);
  P(0x2b20, 0x8100);
  P(0x2b30, 0x8110);
  P(0x2bf0, 0x81d0);
  P(0x2cc0, 0x80d0);
  P(0x2cd8, 0x80e0);
  P(0x2cf0, 0x81e0);
  P(0x2d60, 0x8160);
 }
 static decodeU7(raw, dec) {
  for (let i = 0; i < 0x1000; i++) {
   const a = ProtectDecode.bitswap12(i, 11, 3, 7, 9, 10, 8, 6, 5, 4, 2, 1, 0);
   dec[0x3000 + i] = ProtectDecode.bitswap8(
    raw[0xb000 + a],
    0,
    4,
    5,
    7,
    6,
    3,
    2,
    1
   );
  }
 }
 static decodeU5(raw, dec) {
  for (let i = 0; i < 0x800; i++) {
   const a = ProtectDecode.bitswap11(i, 8, 7, 5, 9, 10, 6, 3, 4, 2, 1, 0);
   dec[0x8000 + i] = ProtectDecode.bitswap8(
    raw[0x8000 + a],
    0,
    4,
    5,
    7,
    6,
    3,
    2,
    1
   );
  }
 }
 static decodeU6(raw, dec) {
  for (let i = 0; i < 0x800; i++) {
   const a = ProtectDecode.bitswap12(i, 11, 3, 7, 9, 10, 8, 6, 5, 4, 2, 1, 0);

   // decrypt half of U6 into 0x8800–0x8FFF
   dec[0x8800 + i] = ProtectDecode.bitswap8(
    raw[0x9800 + a],
    0,
    4,
    5,
    7,
    6,
    3,
    2,
    1
   );

   // decrypt other half of U6 into 0x9000–0x97FF
   dec[0x9000 + i] = ProtectDecode.bitswap8(
    raw[0x9000 + a],
    0,
    4,
    5,
    7,
    6,
    3,
    2,
    1
   );
  }
 }

 static copy8(dst, dstAddr, src, srcAddr) {
  for (let i = 0; i < 8; i++) dst[dstAddr + i] = src[srcAddr + i];
 }
 static mirrorHighBanks(dec) {
  for (let i = 0; i < 0x1000; i++) {
   dec[0xa000 + i] = dec[0x2000 + i];
   dec[0xb000 + i] = dec[0x3000 + i];
  }
 }
 static decode(raw, dec = new Uint8Array(0x10000)) {
  // 1. Seed BOTH ROM windows with the raw Pac-Man ROMs.
  //    MAME base map: map(0x0000,0x3fff).mirror(0x8000).rom
  //    A15 is unused on the base board, so 0x8000–0xBFFF mirrors 0x0000–0x3FFF.
  //    The Ms. Pac-Man aux board then overrides specific sub-regions on top.
  dec.set(raw.subarray(0x0000, 0x4000), 0x0000); // low  0x0000–0x3FFF
  dec.set(raw.subarray(0x0000, 0x4000), 0x8000); // high 0x8000–0xBFFF (mirror)

  // 2. Decode U7 aux ROM → 0x3000–0x3FFF (overrides Pac ROM in low window).
  //    Then propagate into 0xB000–0xBFFF so the A15 mirror stays consistent.
  ProtectDecode.decodeU7(raw, dec);
  dec.copyWithin(0xb000, 0x3000, 0x4000);

  // 3. Decode U5 aux ROM → 0x8000–0x87FF (overrides Pac mirror in high window).
  //    This region also contains the 40 patch jump targets (0x8000–0x81EF).
  ProtectDecode.decodeU5(raw, dec);

  // 4. Decode U6 aux ROM → 0x8800–0x97FF (overrides Pac mirror in high window).
  //    U6 upper half → 0x8800–0x8FFF, lower half → 0x9000–0x97FF.
  ProtectDecode.decodeU6(raw, dec);

  // 5. Install the 40×8-byte patch regions into 0x0000–0x2FFF.
  //    Sources live in the freshly decoded U5 area (0x8000–0x81EF) — must run after step 3.
  ProtectDecode.installPatches(dec);

  return dec;
 }

 static decodeByte(which, raw, i, page = 0) {
  switch (which) {
   case "U5": {
    const a = ProtectDecode.bitswap11(i, 8, 7, 5, 9, 10, 6, 3, 4, 2, 1, 0);
    const b = ProtectDecode.bitswap8(raw[0x8000 + a], 0, 4, 5, 7, 6, 3, 2, 1);
    return b;
   }

   case "U6A": {
    const a = ProtectDecode.bitswap12(i, 11, 3, 7, 9, 10, 8, 6, 5, 4, 2, 1, 0);
    return ProtectDecode.bitswap8(raw[0x9800 + a], 0, 4, 5, 7, 6, 3, 2, 1);
   }

   case "U6B": {
    const a = ProtectDecode.bitswap12(i, 11, 3, 7, 9, 10, 8, 6, 5, 4, 2, 1, 0);
    return ProtectDecode.bitswap8(raw[0x9000 + a], 0, 4, 5, 7, 6, 3, 2, 1);
   }

   case "U7": {
    const a = ProtectDecode.bitswap12(i, 11, 3, 7, 9, 10, 8, 6, 5, 4, 2, 1, 0);
    return ProtectDecode.bitswap8(raw[0xb000 + a], 0, 4, 5, 7, 6, 3, 2, 1);
   }
  }
  return 0;
 }
}

// ── Main ─────────────────────────────────────────────────────────────
class jsMsPacMan {
 constructor() {
  this.audio = new EmulatorAudioWorklet();
  this.audioFrameSamples = 0;
  this.canvas = document.getElementById("gameCanvas");
  this.ctx = this.canvas.getContext("2d");

  this.accumulator = 0;
  this.lastFrameTime = 0;
  this.targetInterval = 1000 / 60.606;
  this.cyclesPerFrame = 50688; // 3.072 MHz / 60.606 Hz
  this.running = false;

  this.decodeEnabled = false;
  this.decodeLatch = 0;
  this.activeROM = "U5";
  this.romViews = {
   rawLow: new Uint8Array(0x4000),
   rawHigh: new Uint8Array(0x4000),
   decoded: new Uint8Array(0x10000)
  };

  // Raw encrypted ROM from network (Pac + Ms. Pac aux daughterboard)
  this.rawRom = new Uint8Array(0x10000);

  // Active RAM view (video/color/work RAM at 0x4000-0x4FFF, I/O mirrors, etc.)
  // ROM regions are NOT stored here anymore — use bankPac / bankMs
  this.memory = new Uint8Array(0x10000);

  // --- Dual-bank ROM (MAME mspacman protection model) ---
  // bankPac: raw Pac-Man program (0x0000-0x3FFF, 0x8000-0xBFFF)
  // bankMs:  decoded Ms. Pac-Man program (same address ranges)
  this.bankPac = new Uint8Array(0x10000);
  this.bankMs = new Uint8Array(0x10000);

  // Decode latch: false = Pac bank active, true = Ms. Pac bank active
  this.decodeEnabled = false;

  // ← INSERT HERE: MAME-style protection latch
  this.pacmanRawLow = new Uint8Array(0x4000); // 0x0000–0x3FFF raw encrypted Pac-Man
  this.pacmanRawHigh = new Uint8Array(0x4000); // 0x8000–0xBFFF raw encrypted aux ROMs

  // Protection decode views (filled after loadROMS)
  this.romViews = {
   rawLow: new Uint8Array(0x4000), // 0000–3FFF raw encrypted
   rawHigh: new Uint8Array(0x4000), // 8000–BFFF raw encrypted
   decoded: new Uint8Array(0x10000) // full decoded DROM image
  };

  // CPU
  this.cpu = new Z80();


  this.cpu.memRead = this.memoryRead.bind(this);
  this.cpu.memWrite = this.memoryWrite.bind(this);
  this.cpu.ioRead = this.ioRead.bind(this);
  this.cpu.ioWrite = this.ioWrite.bind(this);

  if (typeof this.cpu.setInstructionReaders === "function") {
    this.cpu.setInstructionReaders(
      this.memoryRead.bind(this),
      this.memoryRead.bind(this)
    );
  }

  this.cpu.vectorLatch = 0xf8;

  // Graphics & Audio
  this.palette = [];
  this.clut = new Uint8Array(256);
  this.chars = [];
  this.sprites = [];

  this.charRom = new Uint8Array(0x1000);
  this.spriteRom = new Uint8Array(0x1000);
  this.colorProm = new Uint8Array(32);
  this.colorTable = new Uint8Array(256);
  this.waveformProm = new Uint8Array(256);

  // IO / State
  this.ioRegisters = new Uint8Array(256);
  this.flipScreen = false;
  this.soundEnable = false;
  this.interruptEnable = false;
  this.frameCounter = 0;

  // Fast Ms. Pac-Man speed-hack toggle
  this._initFastToggle();

  this.inputs = {
   up: false,
   down: false,
   left: false,
   right: false,
   coin1: false,
   coin2: false,
   credit: false,
   start1: false,
   start2: false
  };
 }

 _initFastToggle() {
  const btn = document.getElementById("fastMsPacToggle");
  if (!btn) return;

  const updateLabel = () =>
   (btn.textContent = this.fastMsPac ? "Fast" : "Slow");
  updateLabel();

  btn.addEventListener("click", async () => {
   this.stop(); // pause cleanly
   this.fastMsPac = !this.fastMsPac; // toggle flag
   updateLabel();
   await this._coldBoot();
  });
 }

 // ── ROM Loading ──────────────────────────────────────────────
 async loadROMS() {
  const base = "https://subnetpie.github.io/arcade/mspacman/";
  const files = {
   "pacman.6e": { target: "rom", offset: 0x0000 },
   "pacman.6f": { target: "rom", offset: 0x1000 },
   "pacman.6h": { target: "rom", offset: 0x2000 },
   "pacman.6j": { target: "rom", offset: 0x3000 },
   u5: { target: "rom", offset: 0x8000 },
   u6: { target: "rom", offset: 0x9000 },
   u7: { target: "rom", offset: 0xb000 },
   "5e": { target: "char", offset: 0x0000 },
   "5f": { target: "sprite", offset: 0x0000 },
   "82s123.7f": { target: "color", offset: 0x0000 },
   "82s126.4a": { target: "palette", offset: 0x0000 },
   "82s126.1m": { target: "waveform", offset: 0x0000 }
  };

  this.rawRom.fill(0);
  await Promise.all(
   Object.entries(files).map(async ([filename, cfg]) => {
    try {
     const res = await fetch(base + filename);
     if (!res.ok) throw new Error(`HTTP ${res.status}`);
     const data = new Uint8Array(await res.arrayBuffer());
     switch (cfg.target) {
      case "rom":
       this.rawRom.set(data.subarray(0, 0x1000), cfg.offset);
       break;
      case "char":
       this.charRom.set(data.subarray(0, 0x1000), cfg.offset);
       break;
      case "sprite":
       this.spriteRom.set(data.subarray(0, 0x1000), cfg.offset);
       break;
      case "color":
       this.colorProm.set(data.subarray(0, 32));
       break;
      case "palette":
       this.colorTable.set(data.subarray(0, 256));
       break;
      case "waveform":
       this.waveformProm.set(data.subarray(0, 256));
       break;
     }
    } catch (e) {
     console.warn(`Missing ROM: ${filename}`, e.message);
    }
   })
  );

  // Fast chip: replaces pacman.6j (0x3000–0x3FFF) in rawRom.
  // Only affects bankPac — bankMs[0x3000–0x3FFF] always comes from U7 decode.
  if (this.fastMsPac) {
   console.log("[loadROMS] attempting pacfast.6f fetch...");
   try {
    const res = await fetch(base + "pacfast.6f");
    console.log(
     "[loadROMS] pacfast.6f response — ok:",
     res.ok,
     "status:",
     res.status
    );
    if (res.ok) {
     const data = new Uint8Array(await res.arrayBuffer());
     console.log("[loadROMS] pacfast.6f size:", data.byteLength);
     this.rawRom.set(data.subarray(0, 0x1000), 0x1000);
     console.log("[loadROMS] pacfast.6f applied at 0x3000");
    }
   } catch (e) {
    console.warn("[loadROMS] pacfast.6f fetch threw:", e);
   }
  }

  // bankPac: raw Pac-Man ROMs, used when decodeEnabled = false.
  // A15 is not connected on the base board, so 0x8000–0xBFFF mirrors 0x0000–0x3FFF.
  // Do NOT use rawRom[0x8000+] here — those are encrypted aux ROMs, not Pac-Man code.
  this.bankPac.set(this.rawRom.subarray(0x0000, 0x4000), 0x0000);
  this.bankPac.set(this.rawRom.subarray(0x0000, 0x4000), 0x8000); // A15 mirror

  // bankMs: fully decoded Ms. Pac-Man image, used when decodeEnabled = true.
  // ProtectDecode.decode() seeds the mirror, applies U7/U5/U6, then installs patches.
  const decoded = ProtectDecode.decode(this.rawRom);
  this.bankMs.set(decoded.subarray(0x0000, 0xc000), 0x0000);

  this.memory.fill(0);
  console.log(
   "ROMs loaded —",
   this.fastMsPac ? "fast chip active" : "normal speed"
  );
 }

 // ── Memory & IO ──────────────────────────────────────────────
 _latchCheck(addr) {
  if (addr >= 0x3ff8 && addr <= 0x3fff) {
   this.decodeEnabled = true; // latch set → Ms. Pac-Man bank
  } else if (
   (addr >= 0x0038 && addr <= 0x003f) || // RST 38h vector — hits during Pac-Man ROM checksum
   (addr >= 0x03b0 && addr <= 0x03b7) ||
   (addr >= 0x1600 && addr <= 0x1607) ||
   (addr >= 0x2120 && addr <= 0x2127) ||
   (addr >= 0x3ff0 && addr <= 0x3ff7) ||
   (addr >= 0x8000 && addr <= 0x8007) || // never hit during normal Ms. Pac-Man play
   (addr >= 0x97f0 && addr <= 0x97f7) // hidden "Hello, Nakamura!" message area
  ) {
   this.decodeEnabled = false; // latch clear → Pac-Man bank
  }
 }
 memoryRead(addr) {
  addr &= 0xffff;

  // Decode latch trap — every vblank IRQ vector fetch at 0x3FFC re-enables Ms. Pac bank
  this._latchCheck(addr);

  // RAM mirrors: 0x6000–0x6FFF and 0xC000–0xCFFF both fold into 0x4000–0x4FFF
  // MAME: map(0x4000,0x4fff).mirror(0xa000) — bits 13 and 15 are ignored
  if ((addr >= 0x6000 && addr <= 0x6fff) || (addr >= 0xc000 && addr <= 0xcfff))
   addr = 0x4000 | (addr & 0x0fff);

  // 0x0000–0x3FFF: ROM — Pac-Man base or Ms. Pac-Man decoded bank
  // Both bankPac and bankMs are 64 KB arrays indexed directly
  if (addr < 0x4000)
   return (this.decodeEnabled ? this.bankMs : this.bankPac)[addr] ?? 0;

  // 0x4000–0x4FFF: Video RAM (0x4000–0x43FF), Color RAM (0x4400–0x47FF),
  //                unmapped hole (0x4800–0x4BFF), Work RAM + sprite attrs (0x4C00–0x4FFF)
  if (addr <= 0x4fff) {
   // MAME: map(0x4800,0x4bff).mirror(0xa000).r(FUNC(pacman_read_nop)) — returns 0xBF
   // Ms. Pac-Man reads here for string delimiters; value matters
   if (addr >= 0x4800 && addr <= 0x4bff) return 0xbf;
   return this.memory[addr] ?? 0;
  }

  // 0x5000–0x50FF: I/O reads — input ports and DIP switches
  if (addr >= 0x5000 && addr <= 0x50ff) {
   const off = addr & 0xff;

   // IN0 @ 0x5000 — active-low joystick (P1) + coin inputs
   if (off < 0x40) {
    let v = 0xff;
    if (this.inputs.up) v &= ~0x01; // bit 0
    if (this.inputs.left) v &= ~0x02; // bit 1
    if (this.inputs.right) v &= ~0x04; // bit 2
    if (this.inputs.down) v &= ~0x08; // bit 3
    // bit 4: rack advance / service DIP — leave high (inactive)
    if (this.inputs.coin1) v &= ~0x20; // bit 5
    if (this.inputs.coin2) v &= ~0x40; // bit 6
    if (this.inputs.credit) v &= ~0x80; // bit 7 — service credit button
    return v;
   }

   // IN1 @ 0x5040 — active-low start buttons; bit 7 = cabinet type
   // MAME PORT_CONFNAME "Cabinet": 0x80 = upright (default), 0x00 = cocktail
   if (off < 0x80) {
    let v = 0xff; // bit 7 high = upright cabinet
    if (this.inputs.start1) v &= ~0x20; // bit 5
    if (this.inputs.start2) v &= ~0x40; // bit 6
    return v;
   }

   // DSW1 @ 0x5080: 1C/1C coinage, 3 lives, 10k bonus, normal difficulty, normal names
   if (off < 0xc0) return 0b11001001; // 0xC9

   // DSW2 @ 0x50C0: all bits unused on standard Ms. Pac-Man
   return 0xff;
  }

  // 0x8000–0xBFFF: ROM upper bank — same bankPac/bankMs arrays, indexed directly
  if (addr >= 0x8000 && addr <= 0xbfff)
   return (this.decodeEnabled ? this.bankMs : this.bankPac)[addr] ?? 0;

  if (this.debug) console.warn(`FALLBACK read @${addr.toString(16)}`);
  return 0;
 }
 memoryWrite(addr, data) {
  addr &= 0xffff;
  data &= 0xff;

  // Decode latch trap — writes to ROM-space trap addresses also toggle the latch
  this._latchCheck(addr);

  // RAM mirrors: 0x6000–0x6FFF and 0xC000–0xCFFF → 0x4000–0x4FFF
  if (
   (addr >= 0x6000 && addr <= 0x6fff) ||
   (addr >= 0xc000 && addr <= 0xcfff)
  ) {
   this.memory[0x4000 | (addr & 0x0fff)] = data;
   return;
  }

  // 0x4000–0x4FFF: Video RAM, Color RAM, Work RAM, Sprite attribute RAM (spriteram)
  if (addr >= 0x4000 && addr <= 0x4fff) {
   if (addr >= 0x4800 && addr <= 0x4bff) return; // unmapped — NOP write
   this.memory[addr] = data;
   return;
  }

  // 0x5000–0x50FF: Memory-mapped hardware I/O writes
  if (addr >= 0x5000 && addr <= 0x50ff) {
   const off = addr & 0xff;

   // 0x5000–0x5007: LS259 8-bit addressable latch
   // MAME: map(0x5000,0x5007).mirror(0xaf38).w("mainlatch", FUNC(ls259_device::write_d0))
   // A0–A2 select the output bit; D0 is the value written
   if (off <= 0x07) {
    const val = !!(data & 0x01); // only D0 matters
    switch (off) {
     case 0: // interrupt enable (IRQ mask)
      this.interruptEnable = val;
      if (!val) this.cpu.clearIrq(); // clear pending IRQ immediately
      break;
     case 1: // sound enable
      this.soundEnable = val;
      this.wsg?.soundEnable(val);
      this.audio.setEnabled(val); // fire-and-forget async is fine here
      break;
     case 2:
      break; // latch pin 8K — no PCB connection, ignore
     case 3: // flip screen
      this.flipScreen = val;
      break;
     // case 4: P1 start lamp  — no output transistors on real PCB, ignore
     // case 5: P2 start lamp  — same
     // case 6: coin lockout   — same
     // case 7: coin counter   — same
    }
    return;
   }

   // 0x5040–0x505F: Namco WSG sound registers (reg index = off - 0x40, range 0x00–0x1F)
   // MAME: map(0x5040,0x505f).mirror(0xaf00).w(m_namco_sound, FUNC(namco_device::pacman_sound_w))
   if (off >= 0x40 && off <= 0x5f) {
    this.wsg?.write(off - 0x40, data & 0x0f);
    return;
   }

   // 0x5060–0x506F: Sprite position RAM — x/y coordinate pairs (spriteram2)
   // MAME: map(0x5060,0x506f).mirror(0xaf00).writeonly().share("spriteram2")
   // Stored in-place; renderSprites reads from this.memory[0x5060 + i*2]
   if (off >= 0x60 && off <= 0x6f) {
    this.memory[addr] = data;
    return;
   }

   // 0x5070–0x50BF: NOP (unused range, DSW regions are read-only)
   // 0x50C0:        Watchdog reset — ignored in emulation
   return;
  }

  if (this.debug)
   console.warn(`Unhandled write @${addr.toString(16)} = ${data.toString(16)}`);
 }
 ioRead(port) {
  const offset = port & 0xff;
  if (offset === 0x00) {
   return this.cpu.vectorLatch ?? 0xf8; // IM2 vector latch
  }
  return this.ioRegisters[offset] ?? 0xff;
 }
 ioWrite(port, data) {
  const offset = port & 0xff;
  data &= 0xff;

  // IM2 vector latch (Namco standard: 0xF8 at boot)
  if (offset === 0x00) {
   this.cpu.vectorLatch = data;
   return;
  }

  // Watchdog/ROM test bypass (self-test writes here to ack)
  if (offset >= 0xc0 && offset <= 0xff) return; // 0x50C0+

  // Control bits (0x5000-5007)
  if (offset >= 0x00 && offset <= 0x07) {
   switch (offset) {
    case 0x00:
     this.interruptEnable = !!(data & 1);
     break;
    case 0x01:
     this.soundEnable = !!(data & 1);
     this.wsg?.soundEnable(this.soundEnable);
    this.audio.setEnabled(this.soundEnable);
     break;
    case 0x02:
     /* Aux CPU (ignored in single CPU decode) */ break;
    case 0x03:
     this.flipScreen = !!(data & 1);
     break;
    default:
     break;
   }
   return;
  }

  // Tile/color updates (0x5000–0x503F) → mirror to 0x4000–0x43FF
  if (offset < 0x40) {
   const vramAddr = 0x4000 + offset;
   this.memory[vramAddr] = data;
   return;
  }

  // Namco WSG sound registers (0x5040-505F)
  if (offset >= 0x40 && offset <= 0x5f) {
   const reg = offset - 0x40;
   this.ioRegisters[offset] = data;
   this.wsg?.write(reg, data & 0x0f);
   return;
  }

  // Sprite position/color RAM (0x5060–0x506F) → mirror to VRAM
  if (offset >= 0x60 && offset < 0x70) {
   const vramAddr = 0x4ff0 + (offset - 0x60) * 2;
   this.memory[vramAddr] = data;
   this.memory[vramAddr + 1] = this.ioRegisters[offset + 1] ?? 0;
   return;
  }

  // Default: store to shadow regs (for debugging)
  this.ioRegisters[offset] = data;
 }

 // ── Graphics Pipeline ────────────────────────────────────────
 buildPalette(colorProm) {
  const palette = new Array(32);
  for (let i = 0; i < 32; i++) {
   const d = colorProm[i];
   const r =
    (d & 0x01 ? 0x21 : 0) + (d & 0x02 ? 0x47 : 0) + (d & 0x04 ? 0x97 : 0);
   const g =
    (d & 0x08 ? 0x21 : 0) + (d & 0x10 ? 0x47 : 0) + (d & 0x20 ? 0x97 : 0);
   const b = (d & 0x40 ? 0x51 : 0) + (d & 0x80 ? 0xae : 0);
   palette[i] = `rgb(${r},${g},${b})`;
  }
  return palette;
 }
 buildCLUT(colorTable) {
  const clut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
   clut[i] = colorTable[i] & 0x0f;
  }
  return clut;
 }
 buildChars(charRom) {
  const chars = new Array(256);
  for (let tileNum = 0; tileNum < 256; tileNum++) {
   const base = tileNum * 16;
   const raw = new Uint8Array(64);
   const pixels = new Uint8Array(64);

   for (let col = 0; col < 8; col++) {
    const lowerByte = charRom[base + col];
    const upperByte = charRom[base + 8 + col];
    for (let rowNib = 0; rowNib < 4; rowNib++) {
     const bitPos = 3 - rowNib;

     const ub0 = (upperByte >> bitPos) & 1;
     const ub1 = (upperByte >> (bitPos + 4)) & 1;
     raw[rowNib * 8 + col] = (ub1 << 1) | ub0;

     const lb0 = (lowerByte >> bitPos) & 1;
     const lb1 = (lowerByte >> (bitPos + 4)) & 1;
     raw[(rowNib + 4) * 8 + col] = (lb1 << 1) | lb0;
    }
   }

   // Rotate/flip to match your screen orientation
   for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
     const srcIndex = y * 8 + x;
     const rx = y;
     const ry = 7 - x;
     const fy = 7 - ry;
     const dstIndex = fy * 8 + rx;
     pixels[dstIndex] = raw[srcIndex];
    }
   }

   chars[tileNum] = pixels;
  }
  return chars;
 }
 buildSprites(spriteRom) {
  const sprites = new Array(64);
  for (let spriteNum = 0; spriteNum < 64; spriteNum++) {
   const base = spriteNum * 64;
   const raw = new Uint8Array(256);
   const pixels = new Uint8Array(256);

   for (let strip = 0; strip < 8; strip++) {
    const stripBase = base + strip * 8;
    let stripY, stripX;

    if (strip === 4) {
     stripY = 0;
     stripX = 8;
    } else if (strip === 0) {
     stripY = 0;
     stripX = 0;
    } else if (strip === 5) {
     stripY = 12;
     stripX = 8;
    } else if (strip === 1) {
     stripY = 12;
     stripX = 0;
    } else if (strip === 6) {
     stripY = 8;
     stripX = 8;
    } else if (strip === 2) {
     stripY = 8;
     stripX = 0;
    } else if (strip === 7) {
     stripY = 4;
     stripX = 8;
    } else if (strip === 3) {
     stripY = 4;
     stripX = 0;
    }

    for (let byteIdx = 0; byteIdx < 8; byteIdx++) {
     const byte = spriteRom[stripBase + byteIdx];
     for (let pixelRow = 0; pixelRow < 4; pixelRow++) {
      const bit0 = (byte >> pixelRow) & 1;
      const bit1 = (byte >> (pixelRow + 4)) & 1;
      const pixelValue = (bit1 << 1) | bit0;
      const x = stripX + byteIdx;
      const y = stripY + pixelRow;
      raw[y * 16 + x] = pixelValue;
     }
    }
   }

   // Rotate for display
   for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
     const srcIndex = y * 16 + x;
     const newX = 15 - y;
     const newY = x;
     const dstIndex = newY * 16 + newX;
     pixels[dstIndex] = raw[srcIndex];
    }
   }

   sprites[spriteNum] = pixels;
  }
  return sprites;
 }
 renderTiles(ctx, memory, chars, palette, clut, flip) {
  for (let off = 0; off < 0x400; off++) {
   const code = memory[0x4000 + off];
   const colorByte = memory[0x4400 + off];
   //  const col6 = colorByte & 0x3f;
   const col6 = colorByte & 0x3f;

   let sx, sy;
   const row = (off / 32) | 0;
   const col = off % 32;

   if (off < 0x40) {
    sx = row + 34;
    sy = col - 2;
   } else if (off < 0x3c0) {
    sx = col + 2;
    sy = row - 2;
   } else {
    sx = row - 30;
    sy = col - 2;
   }

   const pix = chars[code];
   if (!pix) continue;

   for (let py = 0; py < 8; py++) {
    for (let px = 0; px < 8; px++) {
     const p = pix[py * 8 + px];
     const clutIndex = (col6 << 2) | p;
     const paletteIndex = clut[clutIndex] & 0x0f;
     if (paletteIndex === 0 && p === 0) continue;

     ctx.fillStyle = palette[paletteIndex];
     ctx.fillRect(sx * 8 + px, sy * 8 + py, 1, 1);
    }
   }
  }
 }
 renderSprites(ctx, memory, sprites, palette, clut, flip) {
  for (let i = 7; i >= 0; i--) {
   const attrAddr = 0x4ff0 + i * 2;
   const attrByte = memory[attrAddr];

   const shape = (attrByte >> 2) & 0x3f;
   const fx = !!(attrByte & 0x01);
   const fy = !!(attrByte & 0x02);

   const col6 = memory[attrAddr + 1] & 0x3f;

   const posAddr = 0x5060 + i * 2;
   const rawX = memory[posAddr + 1];
   const rawY = memory[posAddr];

   let x = 272 - rawX;
   let y = rawY - 31;

   if (i <= 1) y += 1;

   const pix = sprites[shape];
   if (!pix) continue;

   if (flip) {
    x = 224 - 16 - x;
    y = 288 - 16 - y;
   }

   for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
     const spx = fx ? 15 - px : px;
     const spy = fy ? 15 - py : py;
     const p = pix[spy * 16 + spx];

     const clutIndex = ((col6 | 0x40) << 2) | p;
     const paletteIndex = clut[clutIndex & 0xff] & 0x0f;

     const screenX = x + px;
     const screenY = y + py;

     if (p === 0 || paletteIndex === 0) continue;

     if (screenX >= 0 && screenX < 288 && screenY >= 0 && screenY < 224) {
      ctx.fillStyle = palette[paletteIndex];
      ctx.fillRect(screenX, screenY, 1, 1);
     }
    }
   }
  }
 }
 renderFrame() {
  this.ctx.fillStyle = "#000";
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  this.renderTiles(
   this.ctx,
   this.memory,
   this.chars,
   this.palette,
   this.clut,
   this.flipScreen
  );
  this.renderSprites(
   this.ctx,
   this.memory,
   this.sprites,
   this.palette,
   this.clut,
   this.flipScreen
  );
 }

 renderAudioFrame() {
  if (!this.wsg || !this.audio.ready) return;
  this.audioFrameSamples += this.wsg.sampleRate / (1000 / this.targetInterval);
  const count = Math.floor(this.audioFrameSamples);
  this.audioFrameSamples -= count;
  if (!count) return;
  const pcm = new Float32Array(count);
  this.wsg.renderMono(pcm);
  this.audio.push(pcm, this.wsg.sampleRate);
 }

 // Track the RAF handle so stop() can cancel it cleanly
 _rafHandle = null;

 frameLoop(timestamp) {
  if (!this.running) return;

  // Initialise on first real RAF tick — never called with a raw direct call anymore
  if (!this.lastFrameTime) this.lastFrameTime = timestamp;

  let delta = timestamp - this.lastFrameTime;
  if (delta > 100) delta = 100; // clamp after tab suspend
  this.lastFrameTime = timestamp;
  this.accumulator += delta;

  while (this.accumulator >= this.targetInterval) {
   let cycles = this.cyclesPerFrame;
   while (cycles > 0) {
    const c = this.cpu.step();
    if (c <= 0) break;
    cycles -= c;
   }
   this.frameCounter++;
   this.renderAudioFrame();
   if (this.interruptEnable) this.cpu.requestIrq(this.cpu.vectorLatch);
   this.accumulator -= this.targetInterval;
  }

  this.renderFrame();
  this._rafHandle = requestAnimationFrame((ts) => this.frameLoop(ts));
 }

 // ── Operation ────────────────────────────────────────────────
 async _coldBoot() {
  await this.loadROMS();

  this.palette = this.buildPalette(this.colorProm);
  this.clut = this.buildCLUT(this.colorTable);
  this.chars = this.buildChars(this.charRom);
  this.sprites = this.buildSprites(this.spriteRom);

  // Reset machine audio without touching the browser AudioContext.
  if (this.wsg) this.wsg.reset();
  else this.wsg = new NamcoWSG({ waveformProm: this.waveformProm });
  this.audio.clear();
  this.audio.setEnabled(false);
  this.audioFrameSamples = 0;

  this.decodeEnabled = false;
  this.soundEnable = false; // game will re-enable via 0x5001 latch write
  this.interruptEnable = false;
  this.flipScreen = false;
  this.cpu.reset();
  this.frameCounter = 0;
  this.accumulator = 0;
  this.lastFrameTime = 0;
  this.running = true;
  this._rafHandle = requestAnimationFrame((ts) => this.frameLoop(ts));
 }

 _initFastToggle() {
  const btn = document.getElementById("fastMsPacToggle");
  if (!btn) {
   console.warn("[toggle] fastMsPacToggle button not found in DOM");
   return;
  }

  const updateLabel = () =>
   (btn.textContent = this.fastMsPac ? "Fast" : "Slow");
  updateLabel();

  btn.addEventListener("click", async () => {
   if (btn.disabled) return;
   btn.disabled = true;
   console.log("[toggle] clicked — current fastMsPac:", this.fastMsPac);

   this.stop();
   this.fastMsPac = !this.fastMsPac;
   updateLabel();
   console.log(
    "[toggle] fastMsPac now:",
    this.fastMsPac,
    "— starting _coldBoot"
   );

   try {
    await this._coldBoot();
    console.log("[toggle] _coldBoot complete ✓");
   } catch (e) {
    // Surface the real error — without this it dies silently
    console.error("[toggle] _coldBoot threw:", e);
    // Revert the flag and try to recover with normal speed
    this.fastMsPac = false;
    updateLabel();
    try {
     await this._coldBoot();
    } catch (_) {}
   } finally {
    btn.disabled = false;
   }
  });
 }

 async start() {
  await this._coldBoot();
 }
 stop() {
  this.running = false;
  if (this._rafHandle !== null) {
   cancelAnimationFrame(this._rafHandle); // kill the queued callback immediately
   this._rafHandle = null;
  }
 }
}

// ── Bootstrap ────────────────────────────────────────────────────────
async function startEmulator() {
 try {
  console.log("-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
  console.log("✓ Starting Ms. Pac-Man emulator (Original+Decode)....");
  const emu = new jsMsPacMan();
  await emu.start();
  window.pacmanEmulator = emu;
  console.log("✓ Emulator running successfully!");
 } catch (error) {
  console.error("✗ Failed to start emulator:", error);
  alert("Failed to start emulator: " + error.message);
 }
}

// ── Controls ─────────────────────────────────────────────────────────
class SwipeController {
  constructor() {
    this.element = document;
    this.touchStart = null;
    this.currentDir = null;
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
    this.touchStart  = { x: t.clientX, y: t.clientY };
    this.currentDir  = null;
  }

  _move(e) {
    if (!this.touchStart) return;
    e.preventDefault();

    const t    = e.changedTouches[0];
    const dx   = t.clientX - this.touchStart.x;
    const dy   = t.clientY - this.touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Only act once the finger has moved far enough to commit a direction
    if (absX < this.minSwipeDist && absY < this.minSwipeDist) return;

    const dir = absX > absY
      ? (dx > 0 ? "right" : "left")
      : (dy > 0 ? "down"  : "up");

    // Only fire when the direction actually changes
    if (dir !== this.currentDir) {
      this.currentDir = dir;
      this._applyInput(dir);
    }
  }

  _end(e) {
    if (!this.touchStart) return;
    e.preventDefault();
    this.touchStart = null;
    this.currentDir = null;
  }

  _applyInput(dir) {
    const emu = window.pacmanEmulator;
    if (!emu) return;
    ["up", "down", "left", "right"].forEach((d) => (emu.inputs[d] = d === dir));
  }
}

function setupDPadControls() {
 document.querySelectorAll(".pad").forEach((btn) => {
  const dir = btn.getAttribute("data-dir");
  const setDir = (state) => {
   if (window.pacmanEmulator) window.pacmanEmulator.inputs[dir] = state;
   btn.classList.toggle("pressed", state);
  };
  btn.addEventListener(
   "touchstart",
   (e) => {
    e.preventDefault();
    setDir(true);
   },
   { passive: false }
  );
  btn.addEventListener(
   "touchend",
   (e) => {
    e.preventDefault();
    setDir(false);
   },
   { passive: false }
  );
  btn.addEventListener(
   "touchcancel",
   (e) => {
    e.preventDefault();
    setDir(false);
   },
   { passive: false }
  );
  btn.addEventListener("mousedown", (e) => {
   e.preventDefault();
   setDir(true);
  });
  btn.addEventListener("mouseup", (e) => {
   e.preventDefault();
   setDir(false);
  });
  btn.addEventListener("mouseleave", () => setDir(false));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
 });
}
const KEY_MAP = {
 arrowup: "up",
 w: "up",
 arrowdown: "down",
 s: "down",
 arrowleft: "left",
 a: "left",
 arrowright: "right",
 d: "right",
 5: "coin1",
 6: "coin2",
 1: "start1",
 2: "start2"
};
document.addEventListener("keydown", (e) => {
 ensureAudio(); // first keypress warms up the audio graph
 const emu = window.pacmanEmulator;
 if (!emu) return;
 const input = KEY_MAP[e.key.toLowerCase()];
 if (input) emu.inputs[input] = true;
});
document.addEventListener("keyup", (e) => {
 const emu = window.pacmanEmulator;
 if (!emu) return;
 const input = KEY_MAP[e.key.toLowerCase()];
 if (input) emu.inputs[input] = false;
});
function insertCoin1() {
 const emu = window.pacmanEmulator;
 if (!emu) return;
 emu.inputs.coin1 = true;
 setTimeout(() => {
  emu.inputs.coin1 = false;
 }, 100);
}
function start1Player() {
 const emu = window.pacmanEmulator;
 if (!emu) return;
 emu.inputs.start1 = true;
 setTimeout(() => {
  emu.inputs.start1 = false;
 }, 300);
}
function start2Player() {
 const emu = window.pacmanEmulator;
 if (!emu) return;
 emu.inputs.start2 = true;
 setTimeout(() => {
  emu.inputs.start2 = false;
 }, 100);
}

// HTML controls remain callable after switching the game to an ES module.
Object.assign(window, { insertCoin1, start1Player, start2Player });
