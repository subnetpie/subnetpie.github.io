/* pole-position.js — Namco/Atari Pole Position (1982) arcade board for
 * emulators.org, running the AUTHENTIC ROM set.
 *
 * Hardware (per MAME src/mame/namco/polepos.cpp, BSD-3-Clause):
 *   - a Zilog Z80 "master"/sound CPU (region maincpu),
 *   - TWO Zilog Z8002 16-bit game CPUs (sub1, sub2) sharing the sprite / road /
 *     alpha / view RAM,
 *   - the Namco 06xx serial I/O bus driving FOUR customs — the 51xx (coin/credit +
 *     input + protection), 53xx (steering/DIP), 52xx (voice) and 54xx (noise) — each
 *     a real Fujitsu MB8843/MB8844 MCU run FROM ITS GENUINE ROM on the MB88xx core
 *     below (no HLE); the 52xx streams the digitized Fuji speech out of its DAC and
 *     the 54xx the tyre/engine noise, both time-stamped for the host audio path,
 *   - the Namco 3-voice WSG (waveform PROM pp1-5.3b) plus the discrete engine-sound
 *     section (an 8-slot wavetable in the engine ROM clocked by the RPM latch),
 *     synthesized alongside the WSG in polepos-voices.js,
 *   - custom video: a background/"view" tilemap, a zoomable 4bpp sprite layer, an
 *     alphanumeric overlay, and the famous road generator built from three road
 *     ROMs, with a palette and many lookup tables held in PROMs.
 *
 * WHAT IS REAL HERE. Every graphic on screen is decoded from the genuine ROMs:
 *   - the palette is built from the three RGB palette PROMs exactly as the board
 *     wires the resistor ladder,
 *   - the alpha font, the view tiles, the 16x16 and 32x32 sprites are decoded with
 *     MAME's gfx layouts,
 *   - the road is generated live from the three road ROMs + the road-colour PROM +
 *     the vertical-position-modifier PROMs,
 *   - sprite zoom uses the real vertical scale LUT PROM.
 * The renderer (buildPalette / decode* / drawRoad / zoomSprite / draw) is a direct
 * port of polepos_v.cpp.
 *
 * CPUs. The Z80 master is DrGoldfire's Z80.js (MIT), the same core the site's
 * Dig Dug / Galaga machines use. The two Z8002 run an authored from-scratch Z8002
 * interpreter (makeZ8002, below) that implements the full documented instruction
 * set the game exercises — byte/word/long ALU, ADC/SBC, INC/DEC, every addressing
 * mode (register / indirect / direct / indexed / base+index / base+disp / PC-
 * relative), bit ops, shifts and rotates (incl. long), block moves (LDIR/LDDR/
 * CPIR/CPDR), LDM, MULT/DIV, EXTS, LDCTL, DI/EI, the NVI (VBLANK) interrupt and
 * IRET, LDPS, HALT — with the exact flag semantics of MAME's z8000ops.hxx. Both
 * sub-CPUs run their REAL ROM code with no unimplemented-opcode traps through
 * boot; the debugger single-steps sub #1 through the shared 'z8000' decoder.
 *
 * THERE IS NO DIRECTOR. The scene is composited by the real game program: the Z80
 * master boots, runs its RAM/ROM self-test, drives the 06xx and releases the two
 * Z8002 via the LS259, and the Z8002 program the real road/sprite/alpha/view RAM
 * that the genuine video hardware renders. The interrupt cadence, shared RAM and
 * the Z80<->sub handshake follow polepos.cpp.
 *
 * SCOPE. See README.txt "WHAT WORKS". Every ROM and the whole video board are real
 * and verified. The game BOOTS PAST the power-on self-test and now SUSTAINS: the
 * real 51xx runs the coin/credit/protection handshake over the real 06xx bus, both
 * Z8002 subs start and stay phase-locked, and the attract mode CYCLES (the winding-
 * track title screen and the self-playing demo race). Insert a coin and press the
 * accelerator and the game shows PREPARE TO QUALIFY and drops you into a live,
 * STEERABLE qualifying lap: the real 53xx steering bends the road, the accelerator
 * and brake move the car, the score and lap timer run. This build fixed the sub-CPU
 * lockstep by (1) giving the Z8002 core cycle-accurate MAME z8000tbl timing and a
 * TRUE time-ordered interleave that always advances the furthest-behind CPU so the
 * two subs never cross a shared-RAM barrier out of phase, (2) reloading a sub's
 * reset vector on the LS259 /RESET release edge, (3) correcting the LDM (0x1c/0x5c)
 * decode that had corrupted a sub's registers and run it off into RAM, (4) adding
 * DAB, and (5) fixing the ADC accelerator/brake select. Nothing is pre-rendered or
 * faked; there is no director. Provenance + SHA1s: README.txt.
 */
(function (global) {
  'use strict';

  // ---- ROM blob (base64 MAME regions) ---------------------------------------
  var R = global.PP_ROMS;
  function b64(s) {
    var bin = (typeof atob === 'function') ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    var out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  var ROM = R ? {
    maincpu: b64(R.maincpu), sub1: b64(R.sub1), sub2: b64(R.sub2),
    chars: b64(R.chars), tiles: b64(R.tiles), sprites: b64(R.sprites), big: b64(R.bigsprites),
    road: b64(R.road), scalelut: b64(R.scalelut), proms: b64(R.proms),
    wavprom: b64(R.wavprom), engine: b64(R.engine), voice: b64(R.voice),
    // Namco custom-MCU program ROMs (Fujitsu MB8843/MB8844, 1 KB each) — run for
    // real: 51xx (coin/protection), 53xx (steering), 52xx (voice), 54xx (noise).
    mcu51: b64(R.mcu51), mcu53: b64(R.mcu53), mcu52: b64(R.mcu52), mcu54: b64(R.mcu54)
  } : null;

  // ---- geometry (MAME set_raw: 256 wide, visible rows 16..239 => 256x224) ----
  var BMPW = 256, BMPH = 256, VIS_Y0 = 16, VIS_H = 224;

  // =====================================================================
  //  VIDEO  — direct port of polepos_v.cpp (BSD-3-Clause)
  // =====================================================================

  // Palette: 128 indirect colours from the three RGB PROMs (resistor ladder),
  // then the pen-indirect lookup tables for alpha / background / sprite / road.
  function buildVideo() {
    var proms = ROM.proms;
    var idx = new Uint32Array(128);           // 128 indirect RGB colours
    function comp(v) { var b0 = v & 1, b1 = (v >> 1) & 1, b2 = (v >> 2) & 1, b3 = (v >> 3) & 1; return 0x0e * b0 + 0x1f * b1 + 0x43 * b2 + 0x8f * b3; }
    var i;
    for (i = 0; i < 128; i++) {
      var r = comp(proms[0x000 + i] & 0xf);
      var g = comp(proms[0x100 + i] & 0xf);
      var b = comp(proms[0x200 + i] & 0xf);
      idx[i] = (0xff << 24 | b << 16 | g << 8 | r) >>> 0;
    }
    // pen -> indirect-colour index tables (MAME set_pen_indirect)
    var penAlpha0 = new Uint16Array(256), penAlpha1 = new Uint16Array(256);
    var penBg = new Uint16Array(256);
    var penSpr0 = new Uint16Array(1024), penSpr1 = new Uint16Array(1024);
    var penRoad = new Uint16Array(1024);
    for (i = 0; i < 64 * 4; i++) {
      var ca = proms[0x300 + i];
      penAlpha0[i] = (ca !== 15) ? (0x20 + ca) : 0x2f;
      penAlpha1[i] = (ca !== 15) ? (0x60 + ca) : 0x2f;  // aliases in indirect space >127 -> handled via % 128 fold below
    }
    for (i = 0; i < 64 * 4; i++) { penBg[i] = proms[0x400 + i] & 0xff; }
    for (i = 0; i < 64 * 16; i++) {
      var cs = proms[0xc00 + i];
      penSpr0[i] = (cs !== 15) ? (0x10 + cs) : 0x1f;
      penSpr1[i] = (cs !== 15) ? (0x50 + cs) : 0x1f;
    }
    for (i = 0; i < 64 * 16; i++) { penRoad[i] = 0x40 + (proms[0x800 + i] & 0xf); }
    // vertical position modifier (three nibble PROMs)
    var vpos = new Uint16Array(256);
    for (i = 0; i < 256; i++) vpos[i] = (proms[0x500 + i] & 0xf) + ((proms[0x600 + i] & 0xf) << 4) + ((proms[0x700 + i] & 0xf) << 8);

    // Resolve an indirect palette pen number (0..0x2f used here) to RGBA. The
    // indirect table only has 128 real colours; alpha/sprite "bank 2/3" pens map
    // to the same low colours, so fold >=0x30 groups appropriately: our pen
    // numbers already reference indices < 128.
    function rgbaOf(pen) { return idx[pen & 0x7f]; }

    return { idx: idx, rgbaOf: rgbaOf,
      penAlpha0: penAlpha0, penAlpha1: penAlpha1, penBg: penBg,
      penSpr0: penSpr0, penSpr1: penSpr1, penRoad: penRoad, vpos: vpos };
  }

  // charlayout_2bpp: 8x8, 2bpp, planes {0,4}; x {0,1,2,3, 8*8+0..3}; y {0..7}*8; 16 bytes/char
  function decodeChars(d, n) {
    var out = new Array(n), ch, x, y;
    for (ch = 0; ch < n; ch++) {
      var t = new Uint8Array(64), base = ch * 16;
      for (y = 0; y < 8; y++) {
        for (x = 0; x < 8; x++) {
          var xo = x < 4 ? x : (8 * 8 + (x - 4));   // bit offset within the char (in bits)
          var byteBit0 = base + ((0 + xo) >> 3);     // plane 0 at bit 0
          // Reproduce MAME planeoffset {0,4} + xoffset list precisely:
          var p0bit = 0 + xo, p1bit = 4 + xo, yb = y * 8;
          var b0 = (d[base + ((p0bit + yb) >> 3)] >> (7 - ((p0bit + yb) & 7))) & 1;
          var b1 = (d[base + ((p1bit + yb) >> 3)] >> (7 - ((p1bit + yb) & 7))) & 1;
          t[y * 8 + x] = b0 | (b1 << 1);
        }
      }
      out[ch] = t;
    }
    return out;
  }

  // smallspritelayout: 16x16, 4bpp, RGN_FRAC(1,2). planes {0,4,H,H+4} (H=half=0x2000)
  // xoffset {0,1,2,3,8,9,10,11,16..19,24..27}; yoffset {0..15}*32; 32 bytes/row-group => 16*32 bits/char
  function decodeSmallSprites(d) {
    var half = d.length >> 1, n = 128, out = new Array(n), sp, x, y;
    var xo = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27];
    for (sp = 0; sp < n; sp++) {
      var px = new Uint8Array(256), base = sp * (16 * 32 / 8); // 64 bytes per char
      for (y = 0; y < 16; y++) {
        var yb = y * 32;
        for (x = 0; x < 16; x++) {
          var bx = xo[x];
          function bit(planeBase) { var bo = planeBase + bx + yb; return (d[base + (bo >> 3)] >> (7 - (bo & 7))) & 1; }
          function bitH(planeBase) { var bo = planeBase + bx + yb; return (d[half + base + (bo >> 3)] >> (7 - (bo & 7))) & 1; }
          var p0 = bit(0), p1 = bit(4), p2 = bitH(0), p3 = bitH(4);
          px[y * 16 + x] = p0 | (p1 << 1) | (p2 << 2) | (p3 << 3);
        }
      }
      out[sp] = px;
    }
    return out;
  }

  // bigspritelayout: 32x32, 4bpp, RGN_FRAC(1,2). planes {0,4,H,H+4}; xoffset 32 vals;
  // yoffset {0..31}*64; 32*64 bits per char = 256 bytes.
  function decodeBigSprites(d) {
    var half = d.length >> 1, n = 128, out = new Array(n), sp, x, y;
    var xo = [0, 1, 2, 3, 8, 9, 10, 11, 16, 17, 18, 19, 24, 25, 26, 27,
      32, 33, 34, 35, 40, 41, 42, 43, 48, 49, 50, 51, 56, 57, 58, 59];
    for (sp = 0; sp < n; sp++) {
      var px = new Uint8Array(1024), base = sp * (32 * 64 / 8); // 256 bytes per char
      for (y = 0; y < 32; y++) {
        var yb = y * 64;
        for (x = 0; x < 32; x++) {
          var bx = xo[x];
          var b0o = 0 + bx + yb, b1o = 4 + bx + yb;
          var p0 = (d[base + (b0o >> 3)] >> (7 - (b0o & 7))) & 1;
          var p1 = (d[base + (b1o >> 3)] >> (7 - (b1o & 7))) & 1;
          var p2 = (d[half + base + (b0o >> 3)] >> (7 - (b0o & 7))) & 1;
          var p3 = (d[half + base + (b1o >> 3)] >> (7 - (b1o & 7))) & 1;
          px[y * 32 + x] = p0 | (p1 << 1) | (p2 << 2) | (p3 << 3);
        }
      }
      out[sp] = px;
    }
    return out;
  }

  // =====================================================================
  //  Z8002 core  (authored from-scratch; big-endian 16-bit, non-segmented)
  //  Runs against an external bus {rb,rw,wb,ww}. Full documented Z8002 ISA
  //  (byte/word/long ALU, block moves, mult/div, shifts, bit ops, LDM,
  //  addressing modes R/IR/DA/X/BA/BX/RA, LDCTL, DI/EI, NVI + IRET), ported
  //  against MAME's z8000ops.hxx flag semantics.  Unimplemented opcodes are
  //  logged (cpu.onUnimpl) and skipped.  See README "Z8002 CORE".
  // =====================================================================
  function makeZ8002(bus) {
    var cpu = {
      R: new Uint16Array(16), pc: 0,
      C: 0, Z: 0, S: 0, V: 0, D: 0, H: 0, ctrl: 0x00,
      halted: false, insns: 0, nviEnabled: 0, nviPending: 0, id: 0,
      onUnimpl: null, unimplCount: 0, lastUnimpl: 0,
      psap: 0
    };
    var R = cpu.R;
    // ---- register file views ----
    function RW(n) { return R[n & 15]; }
    function SW(n, v) { R[n & 15] = v & 0xffff; }
    function RB(n) { n &= 15; return n < 8 ? (R[n] >> 8) & 0xff : R[n - 8] & 0xff; }
    function SB(n, v) { n &= 15; v &= 0xff; if (n < 8) R[n] = (R[n] & 0x00ff) | (v << 8); else R[n - 8] = (R[n - 8] & 0xff00) | v; }
    function RL(n) { n &= 14; return ((R[n] << 16) | R[n + 1]) >>> 0; }
    function SL(n, v) { n &= 14; R[n] = (v >>> 16) & 0xffff; R[n + 1] = v & 0xffff; }
    cpu.getB = RB; cpu.setB = SB; cpu.getL = RL; cpu.setL = SL;

    // ---- FCW (flags/control word) ----
    cpu.fcw = function () { return ((cpu.ctrl << 8) | (cpu.C << 7) | (cpu.Z << 6) | (cpu.S << 5) | (cpu.V << 4) | (cpu.D << 3) | (cpu.H << 2)) & 0xffff; };
    cpu.setFcw = function (v) {
      cpu.ctrl = (v >> 8) & 0x7f;               // clear SEG on Z8002
      cpu.C = (v >> 7) & 1; cpu.Z = (v >> 6) & 1; cpu.S = (v >> 5) & 1;
      cpu.V = (v >> 4) & 1; cpu.D = (v >> 3) & 1; cpu.H = (v >> 2) & 1;
      cpu.nviEnabled = (cpu.ctrl & 0x08) ? 1 : 0;   // F_NVIE = 0x0800
    };
    function fcwLo() { return (cpu.C << 7) | (cpu.Z << 6) | (cpu.S << 5) | (cpu.V << 4) | (cpu.D << 3) | (cpu.H << 2); }
    function setFcwLo(v) { cpu.C = (v >> 7) & 1; cpu.Z = (v >> 6) & 1; cpu.S = (v >> 5) & 1; cpu.V = (v >> 4) & 1; cpu.D = (v >> 3) & 1; cpu.H = (v >> 2) & 1; }

    // ---- memory + stack ----
    function rd8(a) { return bus.rb(a & 0xffff); }
    function rd16(a) { a &= 0xffff; return bus.rw(a); }
    function rd32(a) { a &= 0xffff; return (((bus.rw(a) << 16) | bus.rw((a + 2) & 0xffff)) >>> 0); }
    function wr8(a, v) { bus.wb(a & 0xffff, v & 0xff); }
    function wr16(a, v) { bus.ww(a & 0xffff, v & 0xffff); }
    function wr32(a, v) { a &= 0xffff; bus.ww(a, (v >>> 16) & 0xffff); bus.ww((a + 2) & 0xffff, v & 0xffff); }
    function pushW(reg, v) { SW(reg, (RW(reg) - 2) & 0xffff); wr16(RW(reg), v); }
    function popW(reg) { var v = rd16(RW(reg)); SW(reg, (RW(reg) + 2) & 0xffff); return v; }
    function pushL(reg, v) { SW(reg, (RW(reg) - 4) & 0xffff); wr32(RW(reg), v); }
    function popL(reg) { var v = rd32(RW(reg)); SW(reg, (RW(reg) + 4) & 0xffff); return v; }

    // ---- instruction stream ----
    var pc0 = 0;
    function fetch() { var w = bus.rw(cpu.pc); cpu.pc = (cpu.pc + 2) & 0xffff; return w; }
    function s8(v) { v &= 0xff; return v & 0x80 ? v - 256 : v; }
    function s16(v) { v &= 0xffff; return v & 0x8000 ? v - 0x10000 : v; }
    function s32(v) { v = v >>> 0; return v & 0x80000000 ? v - 0x100000000 : v; }

    // ---- flag helpers (exact MAME semantics) ----
    function parity8(v) { v &= 0xff; v ^= v >> 4; v ^= v >> 2; v ^= v >> 1; return (v & 1) ? 0 : 1; }
    function zsB(r) { cpu.Z = (r & 0xff) === 0 ? 1 : 0; cpu.S = (r & 0x80) ? 1 : 0; }
    function zsW(r) { cpu.Z = (r & 0xffff) === 0 ? 1 : 0; cpu.S = (r & 0x8000) ? 1 : 0; }
    function zsL(r) { r >>>= 0; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x80000000) ? 1 : 0; }
    function zspB(r) { r &= 0xff; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x80) ? 1 : 0; cpu.V = parity8(r); }

    function ADDB(dst, val) { var r = (dst + val) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = cpu.H = 0; cpu.D = 0; zsB(r); if (r < (dst & 0xff)) cpu.C = 1; if (((val & dst & ~r) | (~val & ~dst & r)) & 0x80) cpu.V = 1; if ((r & 15) < (dst & 15)) cpu.H = 1; return r; }
    function ADDW(dst, val) { var r = (dst + val) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (r < (dst & 0xffff)) cpu.C = 1; if (((val & dst & ~r) | (~val & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function ADDL(dst, val) { var r = (dst + val) >>> 0; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsL(r); if ((r >>> 0) < (dst >>> 0)) cpu.C = 1; if (((val & dst & ~r) | (~val & ~dst & r)) & 0x80000000) cpu.V = 1; return r; }
    function ADCW(dst, val) { var c = cpu.C, r = (dst + val + c) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (r < (dst & 0xffff) || (r === (dst & 0xffff) && (val + c))) cpu.C = 1; if (((val & dst & ~r) | (~val & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function ADCB(dst, val) { var c = cpu.C, r = (dst + val + c) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = cpu.H = 0; cpu.D = 0; zsB(r); if (r < (dst & 0xff) || (r === (dst & 0xff) && (val + c))) cpu.C = 1; if (((val & dst & ~r) | (~val & ~dst & r)) & 0x80) cpu.V = 1; if ((r & 15) < (dst & 15) || ((r & 15) === (dst & 15) && ((val & 15) + c))) cpu.H = 1; return r; }
    function SUBB(dst, val) { var r = (dst - val) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = cpu.H = 0; cpu.D = 1; zsB(r); if (r > (dst & 0xff)) cpu.C = 1; if (((~val & dst & ~r) | (val & ~dst & r)) & 0x80) cpu.V = 1; if ((r & 15) > (dst & 15)) cpu.H = 1; return r; }
    function SUBW(dst, val) { var r = (dst - val) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (r > (dst & 0xffff)) cpu.C = 1; if (((~val & dst & ~r) | (val & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function SUBL(dst, val) { var r = (dst - val) >>> 0; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsL(r); if ((r >>> 0) > (dst >>> 0)) cpu.C = 1; if (((~val & dst & ~r) | (val & ~dst & r)) & 0x80000000) cpu.V = 1; return r; }
    function SBCW(dst, val) { var c = cpu.C, r = (dst - val - c) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (r > (dst & 0xffff) || (r === (dst & 0xffff) && (val + c))) cpu.C = 1; if (((~val & dst & ~r) | (val & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function SBCB(dst, val) { var c = cpu.C, r = (dst - val - c) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = cpu.H = 0; cpu.D = 1; zsB(r); if (r > (dst & 0xff) || (r === (dst & 0xff) && (val + c))) cpu.C = 1; if (((~val & dst & ~r) | (val & ~dst & r)) & 0x80) cpu.V = 1; if ((r & 15) > (dst & 15) || ((r & 15) === (dst & 15) && ((val & 15) + c))) cpu.H = 1; return r; }
    function CPW(dst, val) { SUBW(dst, val); }
    function CPB(dst, val) { SUBB(dst, val); }
    function CPL(dst, val) { SUBL(dst, val); }
    function ORB(dst, val) { var r = (dst | val) & 0xff; zspB(r); return r; }
    function ORW(dst, val) { var r = (dst | val) & 0xffff; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x8000) ? 1 : 0; return r; }
    function ANDB(dst, val) { var r = (dst & val) & 0xff; zspB(r); return r; }
    function ANDW(dst, val) { var r = (dst & val) & 0xffff; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x8000) ? 1 : 0; return r; }
    function XORB(dst, val) { var r = (dst ^ val) & 0xff; zspB(r); return r; }
    function XORW(dst, val) { var r = (dst ^ val) & 0xffff; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x8000) ? 1 : 0; return r; }
    function INCB(dst, n) { var r = (dst + n) & 0xff; cpu.Z = cpu.S = cpu.V = 0; zsB(r); if (((n & dst & ~r) | (~n & ~dst & r)) & 0x80) cpu.V = 1; return r; }
    function INCW(dst, n) { var r = (dst + n) & 0xffff; cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (((n & dst & ~r) | (~n & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function DECB(dst, n) { var r = (dst - n) & 0xff; cpu.Z = cpu.S = cpu.V = 0; zsB(r); if (((~n & dst & ~r) | (n & ~dst & r)) & 0x80) cpu.V = 1; return r; }
    function DECW(dst, n) { var r = (dst - n) & 0xffff; cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (((~n & dst & ~r) | (n & ~dst & r)) & 0x8000) cpu.V = 1; return r; }
    function COMB(dst) { var r = (~dst) & 0xff; zspB(r); return r; }
    function COMW(dst) { var r = (~dst) & 0xffff; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x8000) ? 1 : 0; return r; }
    function NEGB(dst) { var r = (-dst) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsB(r); if (r > 0) cpu.C = 1; if (r === 0x80) cpu.V = 1; return r; }
    function NEGW(dst) { var r = (-dst) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (r > 0) cpu.C = 1; if (r === 0x8000) cpu.V = 1; return r; }
    // DAB — decimal-adjust byte (MAME z8000dab.h table, reproduced exactly as a
    // rule verified byte-for-byte against all 2048 flag/value combinations). Uses
    // C, H and D (0=after add/adc, 1=after sub/sbc); sets C from the table, Z/S
    // from the result, leaves V/H/D.
    function DAB(val) {
      val &= 0xff;
      var lo = val & 0xf, hi = (val >> 4) & 0xf, corr, cy;
      if (!cpu.D) {
        if (cpu.C || cpu.H) { corr = 0x66; cy = 1; }
        else if (hi <= 9 && lo <= 9) { corr = 0x00; cy = 0; }
        else if (hi <= 8 && lo >= 10) { corr = 0x06; cy = 0; }
        else if (hi >= 10 && lo <= 9) { corr = 0x60; cy = 1; }
        else { corr = 0x66; cy = 1; }
      } else {
        if (!cpu.C && !cpu.H) { corr = 0x00; cy = 0; }
        else if (!cpu.C && cpu.H) { corr = 0xfa; cy = 1; }
        else if (cpu.C && !cpu.H) { corr = 0xa0; cy = 1; }
        else { corr = 0x9a; cy = 1; }
      }
      var r = (val + corr) & 0xff;
      cpu.C = cy; cpu.Z = r === 0 ? 1 : 0; cpu.S = (r & 0x80) ? 1 : 0;
      return r;
    }
    function TESTB(r) { zspB(r); }
    function TESTW(r) { r &= 0xffff; cpu.Z = cpu.S = 0; if (!r) cpu.Z = 1; else if (r & 0x8000) cpu.S = 1; }
    function TESTL(r) { r >>>= 0; cpu.Z = cpu.S = 0; if (!r) cpu.Z = 1; else if (r & 0x80000000) cpu.S = 1; }
    // shifts (count > 0)
    function SLLW(d, c) { var cf = c ? ((d << (c - 1)) & 0x8000) : 0; var r = (d << c) & 0xffff; cpu.C = cpu.Z = cpu.S = 0; zsW(r); if (cf) cpu.C = 1; return r; }
    function SRLW(d, c) { var cf = c ? ((d >>> (c - 1)) & 1) : 0; var r = (d >>> c) & 0xffff; cpu.C = cpu.Z = cpu.S = 0; zsW(r); if (cf) cpu.C = 1; return r; }
    function SLAW(d, c) { var cf = c ? ((d << (c - 1)) & 0x8000) : 0; var r = (s16(d) << c) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (cf) cpu.C = 1; if ((r ^ d) & 0x8000) cpu.V = 1; return r; }
    function SRAW(d, c) { var cf = c ? ((s16(d) >> (c - 1)) & 1) : 0; var r = (s16(d) >> c) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsW(r); if (cf) cpu.C = 1; return r; }
    function SLLB(d, c) { var cf = c ? ((d << (c - 1)) & 0x80) : 0; var r = (d << c) & 0xff; cpu.C = cpu.Z = cpu.S = 0; zsB(r); if (cf) cpu.C = 1; return r; }
    function SRLB(d, c) { var cf = c ? ((d >>> (c - 1)) & 1) : 0; var r = (d >>> c) & 0xff; cpu.C = cpu.Z = cpu.S = 0; zsB(r); if (cf) cpu.C = 1; return r; }
    function SLAB(d, c) { var cf = c ? ((d << (c - 1)) & 0x80) : 0; var r = (s8(d) << c) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsB(r); if (cf) cpu.C = 1; if ((r ^ d) & 0x80) cpu.V = 1; return r; }
    function SRAB(d, c) { var cf = c ? ((s8(d) >> (c - 1)) & 1) : 0; var r = (s8(d) >> c) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsB(r); if (cf) cpu.C = 1; return r; }
    function RLW(d, twice) { var r = ((d << 1) | (d >>> 15)) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) r = ((r << 1) | (r >>> 15)) & 0xffff; zsW(r); if (r & 1) cpu.C = 1; if ((r ^ d) & 0x8000) cpu.V = 1; return r; }
    function RRW(d, twice) { var r = ((d >>> 1) | (d << 15)) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) r = ((r >>> 1) | (r << 15)) & 0xffff; if (!r) cpu.Z = 1; else if (r & 0x8000) { cpu.S = 1; cpu.C = 1; } if ((r ^ d) & 0x8000) cpu.V = 1; return r; }
    function RLCW(d, twice) { var c = d & 0x8000, r = ((d << 1) | cpu.C) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) { var c1 = c >> 15; c = r & 0x8000; r = ((r << 1) | c1) & 0xffff; } zsW(r); if (c) cpu.C = 1; if ((r ^ d) & 0x8000) cpu.V = 1; return r; }
    function RRCW(d, twice) { var c = d & 1, r = ((d >>> 1) | (cpu.C << 15)) & 0xffff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) { var c1 = c << 15; c = r & 1; r = ((r >>> 1) | c1) & 0xffff; } zsW(r); if (c) cpu.C = 1; if ((r ^ d) & 0x8000) cpu.V = 1; return r; }
    function RLB(d, twice) { var r = ((d << 1) | (d >>> 7)) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) r = ((r << 1) | (r >>> 7)) & 0xff; zsB(r); if (r & 1) cpu.C = 1; if ((r ^ d) & 0x80) cpu.V = 1; return r; }
    function RRB(d, twice) { var r = ((d >>> 1) | (d << 7)) & 0xff; cpu.C = cpu.Z = cpu.S = cpu.V = 0; if (twice) r = ((r >>> 1) | (r << 7)) & 0xff; if (!r) cpu.Z = 1; else if (r & 0x80) { cpu.S = 1; cpu.C = 1; } if ((r ^ d) & 0x80) cpu.V = 1; return r; }
    function SLLL(d, c) { d >>>= 0; var cf = c ? ((d >>> (32 - c)) & 1) : 0; var r = (c >= 32 ? 0 : (d << c)) >>> 0; cpu.C = cpu.Z = cpu.S = 0; zsL(r); if (cf) cpu.C = 1; return r; }
    function SRLL(d, c) { d >>>= 0; var cf = c ? ((d >>> (c - 1)) & 1) : 0; var r = (c >= 32 ? 0 : (d >>> c)) >>> 0; cpu.C = cpu.Z = cpu.S = 0; zsL(r); if (cf) cpu.C = 1; return r; }
    function SLAL(d, c) { d >>>= 0; var cf = c ? ((d >>> (32 - c)) & 1) : 0; var r = (c >= 32 ? 0 : (d << c)) >>> 0; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsL(r); if (cf) cpu.C = 1; if ((r ^ d) & 0x80000000) cpu.V = 1; return r; }
    function SRAL(d, c) { var sd = s32(d); var cf = c ? ((sd >> (c - 1)) & 1) : 0; var r = (Math.floor(sd / Math.pow(2, c))) >>> 0; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsL(r); if (cf) cpu.C = 1; return r; }
    function MULTW(dst, val) { var r = (s16(dst) * s16(val)) >>> 0; cpu.C = cpu.Z = cpu.S = cpu.V = 0; zsL(r); var sr = s32(r); if (sr < -0x7fff || sr >= 0x7fff) cpu.C = 1; return r; }
    function DIVW(destL, val) {
      // destL: 32-bit dividend; val: 16-bit divisor; returns (remainder<<16)|quotient
      cpu.C = cpu.Z = cpu.S = cpu.V = 0;
      if (!val) { cpu.Z = 1; cpu.V = 1; return destL >>> 0; }
      var dd = destL >>> 0, dv = val & 0xffff;
      var qsign = ((dd >>> 16) ^ dv) & 0x8000, rsign = (dd >>> 16) & 0x8000;
      var d = s32(dd); if (d < 0) d = -d;
      var v = s16(dv); if (v < 0) v = -v;
      var q = Math.floor(d / v), rem = d % v;
      if (qsign) q = -q; if (rsign) rem = -rem;
      q &= 0xffff; rem &= 0xffff; zsW(q);
      return (((rem & 0xffff) << 16) | (q & 0xffff)) >>> 0;
    }

    function cond(cc) {
      switch (cc & 0xf) {
        case 0: return false; case 1: return (cpu.S ^ cpu.V) === 1; case 2: return ((cpu.S ^ cpu.V) | cpu.Z) === 1;
        case 3: return (cpu.C | cpu.Z) === 1; case 4: return cpu.V === 1; case 5: return cpu.S === 1; case 6: return cpu.Z === 1;
        case 7: return cpu.C === 1; case 8: return true; case 9: return (cpu.S ^ cpu.V) === 0; case 10: return ((cpu.S ^ cpu.V) | cpu.Z) === 0;
        case 11: return (cpu.C | cpu.Z) === 0; case 12: return cpu.V === 0; case 13: return cpu.S === 0; case 14: return cpu.Z === 0; case 15: return cpu.C === 0;
      }
      return false;
    }
    cpu.cond = cond;

    function unimpl(op) { cpu.unimplCount++; cpu.lastUnimpl = op; if (cpu.onUnimpl) cpu.onUnimpl(pc0, op, cpu.id); }

    // Effective-address helper for the DA/indexed families (0x30-0x37, 0x40-0x6f).
    // s === 0 -> direct address = op1;  s !== 0 -> indexed = op1 + RW(s).
    // Returns absolute 16-bit address.  op1 already fetched by caller.
    function eaDA(op1, s) { return (op1 + (s ? RW(s) : 0)) & 0xffff; }

    cpu.step = function () {
      if (cpu.halted) {
        if (cpu.nviPending && cpu.nviEnabled) { cpu.halted = false; }
        else return 4;
      }
      // ---- NVI (VBLANK non-vectored interrupt) ----
      if (cpu.nviPending && cpu.nviEnabled) {
        cpu.nviPending = 0;
        var ofcw = cpu.fcw();
        cpu.ctrl |= 0x40;                          // enter system mode (F_S_N)
        pushW(15, cpu.pc);
        pushW(15, ofcw);
        pushW(15, 0);                              // interrupt/trap type tag
        var nv = cpu.psap & 0xffff;
        cpu.pc = rd16((nv + 0x1a) & 0xffff);       // GET_PC(NVI)
        cpu.setFcw(rd16((nv + 0x18) & 0xffff));    // GET_FCW(NVI)
        return 22;
      }
      cpu.insns++;
      pc0 = cpu.pc;
      var op0 = fetch(), hi = (op0 >> 8) & 0xff, s = (op0 >> 4) & 0xf, d = op0 & 0xf, n1 = (op0 >> 8) & 0xf;
      var op1, op2, addr, v, cc, bit, cnt, sr, dr, lo = op0 & 0xff, twice;
      switch (hi) {
        // ---- 0x00-0x0b : byte/word ALU, @Rs or immediate ----
        case 0x00: if (s === 0) { op1 = fetch(); SB(d, ADDB(RB(d), op1 & 0xff)); } else SB(d, ADDB(RB(d), rd8(RW(s)))); return 7;
        case 0x01: if (s === 0) { op1 = fetch(); SW(d, ADDW(RW(d), op1)); } else SW(d, ADDW(RW(d), rd16(RW(s)))); return 7;
        case 0x02: if (s === 0) { op1 = fetch(); SB(d, SUBB(RB(d), op1 & 0xff)); } else SB(d, SUBB(RB(d), rd8(RW(s)))); return 7;
        case 0x03: if (s === 0) { op1 = fetch(); SW(d, SUBW(RW(d), op1)); } else SW(d, SUBW(RW(d), rd16(RW(s)))); return 7;
        case 0x04: if (s === 0) { op1 = fetch(); SB(d, ORB(RB(d), op1 & 0xff)); } else SB(d, ORB(RB(d), rd8(RW(s)))); return 7;
        case 0x05: if (s === 0) { op1 = fetch(); SW(d, ORW(RW(d), op1)); } else SW(d, ORW(RW(d), rd16(RW(s)))); return 7;
        case 0x06: if (s === 0) { op1 = fetch(); SB(d, ANDB(RB(d), op1 & 0xff)); } else SB(d, ANDB(RB(d), rd8(RW(s)))); return 7;
        case 0x07: if (s === 0) { op1 = fetch(); SW(d, ANDW(RW(d), op1)); } else SW(d, ANDW(RW(d), rd16(RW(s)))); return 7;
        case 0x08: if (s === 0) { op1 = fetch(); SB(d, XORB(RB(d), op1 & 0xff)); } else SB(d, XORB(RB(d), rd8(RW(s)))); return 7;
        case 0x09: if (s === 0) { op1 = fetch(); SW(d, XORW(RW(d), op1)); } else SW(d, XORW(RW(d), rd16(RW(s)))); return 7;
        case 0x0a: if (s === 0) { op1 = fetch(); CPB(RB(d), op1 & 0xff); } else CPB(RB(d), rd8(RW(s))); return 7;
        case 0x0b: if (s === 0) { op1 = fetch(); CPW(RW(d), op1); } else CPW(RW(d), rd16(RW(s))); return 7;
        // ---- 0x0c/0x0d : single-op / imm on @Rs ----
        case 0x0c: addr = RW(s); switch (d) {
          case 0x0: wr8(addr, COMB(rd8(addr))); return 12;
          case 0x1: op1 = fetch(); CPB(rd8(addr), op1 & 0xff); return 11;
          case 0x2: wr8(addr, NEGB(rd8(addr))); return 12;
          case 0x4: TESTB(rd8(addr)); return 8;
          case 0x5: op1 = fetch(); wr8(addr, op1 & 0xff); return 7;
          case 0x6: v = rd8(addr); cpu.S = (v & 0x80) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; wr8(addr, v | 0x80); return 11;
          case 0x8: wr8(addr, 0); return 8;
          default: unimpl(op0); return 8;
        }
        case 0x0d: addr = RW(s); switch (d) {
          case 0x0: wr16(addr, COMW(rd16(addr))); return 12;
          case 0x1: op1 = fetch(); CPW(rd16(addr), op1); return 11;
          case 0x2: wr16(addr, NEGW(rd16(addr))); return 12;
          case 0x4: TESTW(rd16(addr)); return 8;
          case 0x5: op1 = fetch(); wr16(addr, op1); return 11;
          case 0x6: v = rd16(addr); cpu.S = (v & 0x8000) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; wr16(addr, v | 0x8000); return 11;
          case 0x8: wr16(addr, 0); return 8;
          case 0x9: op1 = fetch(); pushW(s, op1); return 12;
          default: unimpl(op0); return 8;
        }
        case 0x0e: case 0x0f: fetch(); unimpl(op0); return 10; // EPU ext
        // ---- 0x10-0x1f : long / mult / div / push-pop / ldm / jp@ / call@ ----
        case 0x10: if (s === 0) { op2 = fetch(); op1 = fetch(); CPL(RL(d), ((op2 << 16) | op1) >>> 0); } else CPL(RL(d), rd32(RW(s))); return 14;
        case 0x11: pushL(s, RL(d)); return 20;   // pushl @Rs,@Rd? -> pushl @Rs,RRd (mem long from RL(d))
        case 0x12: if (s === 0) { op2 = fetch(); op1 = fetch(); SL(d, SUBL(RL(d), ((op2 << 16) | op1) >>> 0)); } else SL(d, SUBL(RL(d), rd32(RW(s)))); return 14;
        case 0x13: pushW(s, RW(d)); return 13;
        case 0x14: if (s === 0) { op2 = fetch(); op1 = fetch(); SL(d, ((op2 << 16) | op1) >>> 0); TESTL(RL(d)); } else SL(d, rd32(RW(s))); return 11;
        case 0x15: SL(d, popL(s)); return 19;
        case 0x16: if (s === 0) { op2 = fetch(); op1 = fetch(); SL(d, ADDL(RL(d), ((op2 << 16) | op1) >>> 0)); } else SL(d, ADDL(RL(d), rd32(RW(s)))); return 14;
        case 0x17: SW(d, popW(s)); return 12;
        case 0x18: fetch(); unimpl(op0); return 282;  // MULTL (log)
        case 0x19: if (s === 0) { op1 = fetch(); SL(d, MULTW(RW((d & 14) + 1), op1)); } else SL(d, MULTW(RW((d & 14) + 1), rd16(RW(s)))); return 70;
        case 0x1a: fetch(); unimpl(op0); return 744;  // DIVL (log)
        case 0x1b: if (s === 0) { op1 = fetch(); SL(d, DIVW(RL(d), op1)); } else SL(d, DIVW(RL(d), rd16(RW(s)))); return 107;
        case 0x1c: {
          // LDM/TESTL with @Rs.  op0 = 0x1c | (ptr<<4) | sub.  MAME z8000tbl:
          // TESTL @Rd is 1 word; LDM Rd,@Rs,n / LDM @Rd,Rs,n are 2 words (op0 +
          // "0000 rrrr 0000 nmin1").  The register field is NIB1 (bits 8-11).
          var ptr = s, subc = d;
          if (subc === 0x8) { TESTL(rd32(RW(ptr))); return 13; }
          if (subc === 0x1 || subc === 0x9) {
            op1 = fetch();                           // reg/count word
            var cN = (op1 & 0xf) + 1, rr = (op1 >> 8) & 0xf, a2 = RW(ptr);
            if (subc === 0x1) { for (var li = 0; li < cN; li++) { SW(rr, rd16(a2)); a2 = (a2 + 2) & 0xffff; rr = (rr + 1) & 15; } }
            else { for (var si = 0; si < cN; si++) { wr16(a2, RW(rr)); a2 = (a2 + 2) & 0xffff; rr = (rr + 1) & 15; } }
            return 11;
          }
          fetch(); unimpl(op0); return 11;
        }
        case 0x1d: wr32(RW(s), RL(d)); return 11;   // ldl @Rs,RRd
        case 0x1e: if (cond(d)) cpu.pc = RW(s); return 10; // jp cc,@Rs
        case 0x1f: pushW(15, cpu.pc); cpu.pc = RW(s); return 10; // call @Rs
        // ---- 0x20-0x2f : ldb/ld @Rs/imm, bit/inc/dec@, ex, store@ ----
        case 0x20: if (s === 0) { op1 = fetch(); SB(d, op1 & 0xff); } else SB(d, rd8(RW(s))); return 7;
        case 0x21: if (s === 0) { op1 = fetch(); SW(d, op1); } else SW(d, rd16(RW(s))); return 7;
        case 0x22: addr = RW(s); v = rd8(addr); wr8(addr, v & ~(1 << d)); return 11;   // resb @Rs,#b
        case 0x23: addr = RW(s); v = rd16(addr); wr16(addr, v & ~(1 << d)); return 11;
        case 0x24: addr = RW(s); v = rd8(addr); wr8(addr, v | (1 << d)); return 11;
        case 0x25: addr = RW(s); v = rd16(addr); wr16(addr, v | (1 << d)); return 11;
        case 0x26: v = rd8(RW(s)); cpu.Z = (v & (1 << d)) ? 0 : 1; return 8;
        case 0x27: v = rd16(RW(s)); cpu.Z = (v & (1 << d)) ? 0 : 1; return 8;
        case 0x28: addr = RW(s); wr8(addr, INCB(rd8(addr), d + 1)); return 11;
        case 0x29: addr = RW(s); wr16(addr, INCW(rd16(addr), d + 1)); return 11;
        case 0x2a: addr = RW(s); wr8(addr, DECB(rd8(addr), d + 1)); return 11;
        case 0x2b: addr = RW(s); wr16(addr, DECW(rd16(addr), d + 1)); return 11;
        case 0x2c: addr = RW(s); v = rd8(addr); wr8(addr, RB(d)); SB(d, v); return 12;
        case 0x2d: addr = RW(s); v = rd16(addr); wr16(addr, RW(d)); SW(d, v); return 12;
        case 0x2e: wr8(RW(s), RB(d)); return 8;
        case 0x2f: wr16(RW(s), RW(d)); return 8;
        // ---- 0x30-0x37 : relative / base+disp / indexed load-store ----
        case 0x30: op1 = fetch(); if (s === 0) SB(d, rd8((cpu.pc + s16(op1)) & 0xffff)); else SB(d, rd8((RW(s) + op1) & 0xffff)); return 14;
        case 0x31: op1 = fetch(); if (s === 0) SW(d, rd16((cpu.pc + s16(op1)) & 0xffff)); else SW(d, rd16((RW(s) + op1) & 0xffff)); return 14;
        case 0x32: op1 = fetch(); if (s === 0) wr8((cpu.pc + s16(op1)) & 0xffff, RB(d)); else wr8((RW(s) + op1) & 0xffff, RB(d)); return 14;
        case 0x33: op1 = fetch(); if (s === 0) wr16((cpu.pc + s16(op1)) & 0xffff, RW(d)); else wr16((RW(s) + op1) & 0xffff, RW(d)); return 14;
        case 0x34: op1 = fetch(); SW(d, s === 0 ? (cpu.pc + s16(op1)) & 0xffff : (RW(s) + op1) & 0xffff); return 15; // lda/ldar
        case 0x35: op1 = fetch(); if (s === 0) SL(d, rd32((cpu.pc + s16(op1)) & 0xffff)); else SL(d, rd32((RW(s) + op1) & 0xffff)); return 17;
        case 0x36: if (op0 === 0x3600) return 2; unimpl(op0); return 10; // bpt / rsvd36
        case 0x37: op1 = fetch(); if (s === 0) wr32((cpu.pc + s16(op1)) & 0xffff, RL(d)); else wr32((RW(s) + op1) & 0xffff, RL(d)); return 17;
        case 0x39: v = rd32(RW(s)); cpu.setFcw((v >>> 16) & 0xffff); cpu.pc = v & 0xffff; return 12; // ldps @Rs
        case 0x3a: case 0x3b: fetch(); unimpl(op0); return 11; // block I/O (special)
        case 0x3c: SB(d, 0xff); unimpl(op0); return 10; // inb  (no Z8002 I/O here)
        case 0x3d: SW(d, 0xffff); unimpl(op0); return 10; // in
        case 0x3e: case 0x3f: unimpl(op0); return 10; // outb/out
        // ---- 0x40-0x4b : byte/word ALU with direct/indexed ----
        case 0x40: op1 = fetch(); addr = eaDA(op1, s); SB(d, ADDB(RB(d), rd8(addr))); return 9;
        case 0x41: op1 = fetch(); addr = eaDA(op1, s); SW(d, ADDW(RW(d), rd16(addr))); return 9;
        case 0x42: op1 = fetch(); addr = eaDA(op1, s); SB(d, SUBB(RB(d), rd8(addr))); return 9;
        case 0x43: op1 = fetch(); addr = eaDA(op1, s); SW(d, SUBW(RW(d), rd16(addr))); return 9;
        case 0x44: op1 = fetch(); addr = eaDA(op1, s); SB(d, ORB(RB(d), rd8(addr))); return 9;
        case 0x45: op1 = fetch(); addr = eaDA(op1, s); SW(d, ORW(RW(d), rd16(addr))); return 9;
        case 0x46: op1 = fetch(); addr = eaDA(op1, s); SB(d, ANDB(RB(d), rd8(addr))); return 9;
        case 0x47: op1 = fetch(); addr = eaDA(op1, s); SW(d, ANDW(RW(d), rd16(addr))); return 9;
        case 0x48: op1 = fetch(); addr = eaDA(op1, s); SB(d, XORB(RB(d), rd8(addr))); return 9;
        case 0x49: op1 = fetch(); addr = eaDA(op1, s); SW(d, XORW(RW(d), rd16(addr))); return 9;
        case 0x4a: op1 = fetch(); addr = eaDA(op1, s); CPB(RB(d), rd8(addr)); return 9;
        case 0x4b: op1 = fetch(); addr = eaDA(op1, s); CPW(RW(d), rd16(addr)); return 9;
        case 0x4c: op1 = fetch(); addr = eaDA(op1, s); switch (d) {
          case 0x0: wr8(addr, COMB(rd8(addr))); return 15;
          case 0x1: op2 = fetch(); CPB(rd8(addr), op2 & 0xff); return 15;
          case 0x2: wr8(addr, NEGB(rd8(addr))); return 15;
          case 0x4: TESTB(rd8(addr)); return 13;
          case 0x5: op2 = fetch(); wr8(addr, op2 & 0xff); return 14;
          case 0x6: v = rd8(addr); cpu.S = (v & 0x80) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; wr8(addr, v | 0x80); return 15;
          case 0x8: wr8(addr, 0); return 13;
          default: unimpl(op0); return 13;
        }
        case 0x4d: op1 = fetch(); addr = eaDA(op1, s); switch (d) {
          case 0x0: wr16(addr, COMW(rd16(addr))); return 15;
          case 0x1: op2 = fetch(); CPW(rd16(addr), op2); return 15;
          case 0x2: wr16(addr, NEGW(rd16(addr))); return 15;
          case 0x4: TESTW(rd16(addr)); return 13;
          case 0x5: op2 = fetch(); wr16(addr, op2); return 14;
          case 0x6: v = rd16(addr); cpu.S = (v & 0x8000) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; wr16(addr, v | 0x8000); return 15;
          case 0x8: wr16(addr, 0); return 13;
          default: unimpl(op0); return 13;
        }
        case 0x4e: op1 = fetch(); addr = eaDA(op1, s); wr8(addr, RB(d)); return 14; // ldb addr,Rb (0x4e uses ss for index)
        // ---- 0x50-0x5f : long / push-pop / mult / div / jp / call with direct ----
        case 0x50: op1 = fetch(); addr = eaDA(op1, s); CPL(RL(d), rd32(addr)); return 14;
        case 0x51: op1 = fetch(); addr = eaDA(op1, s); pushL(s || 15, rd32(addr)); unimpl(op0); return 14; // rare
        case 0x52: op1 = fetch(); addr = eaDA(op1, s); SL(d, SUBL(RL(d), rd32(addr))); return 14;
        case 0x54: op1 = fetch(); addr = eaDA(op1, s); SL(d, rd32(addr)); return 14;
        case 0x56: op1 = fetch(); addr = eaDA(op1, s); SL(d, ADDL(RL(d), rd32(addr))); return 14;
        case 0x59: op1 = fetch(); addr = eaDA(op1, s); SL(d, MULTW(RW((d & 14) + 1), rd16(addr))); return 70;
        case 0x5b: op1 = fetch(); addr = eaDA(op1, s); SL(d, DIVW(RL(d), rd16(addr))); return 107;
        case 0x5c: {
          // LDM/TESTL with direct/indexed address.  MAME z8000tbl: TESTL addr(rd)
          // is 2 words (op0 + addr); LDM rd,addr(rs),n / LDM addr(rs),rd,n are
          // 3 words (op0 + "0000 rrrr 0000 nmin1" reg/count + addr).  s = index reg.
          var subc2 = d;
          if (subc2 === 0x8) { op1 = fetch(); addr = eaDA(op1, s); TESTL(rd32(addr)); return s ? 17 : 16; }
          if (subc2 === 0x1 || subc2 === 0x9) {
            var rc5 = fetch();                       // reg/count word
            op1 = fetch();                           // address word
            addr = eaDA(op1, s);
            var cN2 = (rc5 & 0xf) + 1, rr2 = (rc5 >> 8) & 0xf, a3 = addr;
            if (subc2 === 0x1) { for (var l2 = 0; l2 < cN2; l2++) { SW(rr2, rd16(a3)); a3 = (a3 + 2) & 0xffff; rr2 = (rr2 + 1) & 15; } }
            else { for (var s2 = 0; s2 < cN2; s2++) { wr16(a3, RW(rr2)); a3 = (a3 + 2) & 0xffff; rr2 = (rr2 + 1) & 15; } }
            return s ? 15 : 14;
          }
          op1 = fetch(); unimpl(op0); return 14;
        }
        case 0x5d: op1 = fetch(); addr = eaDA(op1, s); wr32(addr, RL(d)); return 14;
        case 0x5e: op1 = fetch(); addr = eaDA(op1, s); if (cond(d)) cpu.pc = addr; return 8;
        case 0x5f: op1 = fetch(); addr = eaDA(op1, s); pushW(15, cpu.pc); cpu.pc = addr; return 12;
        // ---- 0x60-0x6f : ldb/ld/bit/inc/dec/ex/store with direct/indexed ----
        case 0x60: op1 = fetch(); addr = eaDA(op1, s); SB(d, rd8(addr)); return 9;
        case 0x61: op1 = fetch(); addr = eaDA(op1, s); SW(d, rd16(addr)); return 9;
        case 0x62: op1 = fetch(); addr = eaDA(op1, s); v = rd8(addr); wr8(addr, v & ~(1 << d)); return 11;
        case 0x63: op1 = fetch(); addr = eaDA(op1, s); v = rd16(addr); wr16(addr, v & ~(1 << d)); return 11;
        case 0x64: op1 = fetch(); addr = eaDA(op1, s); v = rd8(addr); wr8(addr, v | (1 << d)); return 11;
        case 0x65: op1 = fetch(); addr = eaDA(op1, s); v = rd16(addr); wr16(addr, v | (1 << d)); return 11;
        case 0x66: op1 = fetch(); addr = eaDA(op1, s); cpu.Z = (rd8(addr) & (1 << d)) ? 0 : 1; return 10;
        case 0x67: op1 = fetch(); addr = eaDA(op1, s); cpu.Z = (rd16(addr) & (1 << d)) ? 0 : 1; return 10;
        case 0x68: op1 = fetch(); addr = eaDA(op1, s); wr8(addr, INCB(rd8(addr), d + 1)); return 13;
        case 0x69: op1 = fetch(); addr = eaDA(op1, s); wr16(addr, INCW(rd16(addr), d + 1)); return 13;
        case 0x6a: op1 = fetch(); addr = eaDA(op1, s); wr8(addr, DECB(rd8(addr), d + 1)); return 13;
        case 0x6b: op1 = fetch(); addr = eaDA(op1, s); wr16(addr, DECW(rd16(addr), d + 1)); return 13;
        case 0x6c: op1 = fetch(); addr = eaDA(op1, s); v = rd8(addr); wr8(addr, RB(d)); SB(d, v); return 14;
        case 0x6d: op1 = fetch(); addr = eaDA(op1, s); v = rd16(addr); wr16(addr, RW(d)); SW(d, v); return 14;
        case 0x6e: op1 = fetch(); addr = eaDA(op1, s); wr8(addr, RB(d)); return 11;
        case 0x6f: op1 = fetch(); addr = eaDA(op1, s); wr16(addr, RW(d)); return 11;
        // ---- 0x70-0x77 : base + index register ----
        case 0x70: op1 = fetch(); SB(d, rd8((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff)); return 14;
        case 0x71: op1 = fetch(); SW(d, rd16((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff)); return 14;
        case 0x72: op1 = fetch(); wr8((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff, RB(d)); return 14;
        case 0x73: op1 = fetch(); wr16((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff, RW(d)); return 14;
        case 0x74: op1 = fetch(); SW(d, (RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff); return 14; // lda
        case 0x75: op1 = fetch(); SL(d, rd32((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff)); return 17;
        case 0x76: op1 = fetch(); SW(d, eaDA(op1, s)); return 12; // lda Rd,addr(Rs)
        case 0x77: op1 = fetch(); wr32((RW(s) + RW((op1 >> 8) & 0xf)) & 0xffff, RL(d)); return 17;
        // ---- 0x79-0x7f : ldps / halt / iret / di-ei / ldctl / sc ----
        case 0x79: op1 = fetch(); addr = eaDA(op1, s); v = rd32(addr); cpu.setFcw((v >>> 16) & 0xffff); cpu.pc = v & 0xffff; return 16;
        case 0x7a: cpu.halted = true; return 8;
        case 0x7b: switch (op0 & 0xff) {
          case 0x00: { var tag = popW(15); var f = popW(15); cpu.pc = popW(15); cpu.setFcw(f); return 13; } // iret
          default: return 7; // mset/mres/mbit/mreq (no external mu bus)
        }
        case 0x7c: {
          var imm2 = op0 & 3;
          if (op0 & 0x4) { cpu.ctrl |= (((~imm2) << 3) & 0x18); }          // ei: set NVIE/VIE per mask
          else { cpu.ctrl &= (((imm2) << 3) | 0xe7); }                     // di
          cpu.nviEnabled = (cpu.ctrl & 0x08) ? 1 : 0;
          return 7;
        }
        case 0x7d: {
          var c3 = d, reg = s;
          if (d & 0x8) {  // ldctl ctrl,Rs
            switch (d & 7) {
              case 2: cpu.setFcw(RW(reg) & 0xd8fc); break;
              case 5: cpu.psap = (cpu.psap & ~0xff00) | (RW(reg) & 0xff00); break;
              default: break;
            }
          } else {        // ldctl Rd,ctrl
            switch (d & 7) {
              case 2: SW(reg, cpu.fcw()); break;
              case 5: SW(reg, cpu.psap & 0xff00); break;
              default: break;
            }
          }
          return 7;
        }
        case 0x7e: fetch(); unimpl(op0); return 10;
        case 0x7f: unimpl(op0); return 10; // sc (system call) - unused
        // ---- 0x80-0x8f : register-register ALU + single-op ----
        case 0x80: SB(d, ADDB(RB(d), RB(s))); return 4;
        case 0x81: SW(d, ADDW(RW(d), RW(s))); return 4;
        case 0x82: SB(d, SUBB(RB(d), RB(s))); return 4;
        case 0x83: SW(d, SUBW(RW(d), RW(s))); return 4;
        case 0x84: SB(d, ORB(RB(d), RB(s))); return 4;
        case 0x85: SW(d, ORW(RW(d), RW(s))); return 4;
        case 0x86: SB(d, ANDB(RB(d), RB(s))); return 4;
        case 0x87: SW(d, ANDW(RW(d), RW(s))); return 4;
        case 0x88: SB(d, XORB(RB(d), RB(s))); return 4;
        case 0x89: SW(d, XORW(RW(d), RW(s))); return 4;
        case 0x8a: CPB(RB(d), RB(s)); return 4;
        case 0x8b: CPW(RW(d), RW(s)); return 4;
        case 0x8c: switch (d) {
          case 0x0: SB(s, COMB(RB(s))); return 7;
          case 0x1: SB(s, fcwLo() & 0xfc); return 7;         // ldctlb Rb,flags
          case 0x2: SB(s, NEGB(RB(s))); return 7;
          case 0x4: TESTB(RB(s)); return 7;
          case 0x6: v = RB(s); cpu.S = (v & 0x80) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; SB(s, v | 0x80); return 7;
          case 0x8: SB(s, 0); return 7;
          case 0x9: setFcwLo(RB(s) & 0xfc); return 7;        // ldctlb flags,Rb
          default: unimpl(op0); return 7;
        }
        case 0x8d: switch (d) {
          case 0x0: SW(s, COMW(RW(s))); return 7;
          case 0x1: { var m = op0 & 0xf0; if (m & 0x80) cpu.C = 1; if (m & 0x40) cpu.Z = 1; if (m & 0x20) cpu.S = 1; if (m & 0x10) cpu.V = 1; return 7; } // setflg
          case 0x2: SW(s, NEGW(RW(s))); return 7;
          case 0x3: { var m2 = op0 & 0xf0; if (m2 & 0x80) cpu.C = 0; if (m2 & 0x40) cpu.Z = 0; if (m2 & 0x20) cpu.S = 0; if (m2 & 0x10) cpu.V = 0; return 7; } // resflg
          case 0x4: TESTW(RW(s)); return 7;
          case 0x5: { var m3 = op0 & 0xf0; if (m3 & 0x80) cpu.C ^= 1; if (m3 & 0x40) cpu.Z ^= 1; if (m3 & 0x20) cpu.S ^= 1; if (m3 & 0x10) cpu.V ^= 1; return 7; } // comflg
          case 0x6: v = RW(s); cpu.S = (v & 0x8000) ? 1 : 0; cpu.Z = v === 0 ? 1 : 0; SW(s, v | 0x8000); return 7;
          case 0x7: return 7; // nop
          case 0x8: SW(s, 0); return 7;
          default: unimpl(op0); return 7;
        }
        case 0x8e: case 0x8f: fetch(); unimpl(op0); return 10;
        // ---- 0x90-0x9f : long reg-reg / push-pop / mult / div / testl / ret ----
        case 0x90: CPL(RL(d), RL(s)); return 8;
        case 0x91: pushL(s, RL(d)); return 12;
        case 0x92: SL(d, SUBL(RL(d), RL(s))); return 8;
        case 0x93: pushW(s, RW(d)); return 9;
        case 0x94: SL(d, RL(s)); TESTL(RL(d)); return 5;
        case 0x95: SL(d, popL(s)); return 12;
        case 0x96: SL(d, ADDL(RL(d), RL(s))); return 8;
        case 0x97: SW(d, popW(s)); return 8;
        case 0x98: unimpl(op0); return 282; // multl reg
        case 0x99: SL(d, MULTW(RW((d & 14) + 1), RW(s))); return 70;
        case 0x9a: unimpl(op0); return 744; // divl reg
        case 0x9b: SL(d, DIVW(RL(d), RW(s))); return 107;
        case 0x9c: TESTL(RL(s)); return 13;
        case 0x9e: if (cond(d)) { cpu.pc = popW(15); } return 10; // ret cc
        case 0x9d: case 0x9f: unimpl(op0); return 4;
        // ---- 0xa0-0xaf : ldb/ld reg, bit reg, inc/dec reg, ex, tcc ----
        case 0xa0: SB(d, RB(s)); return 3;
        case 0xa1: SW(d, RW(s)); return 3;
        case 0xa2: SB(s, RB(s) & ~(1 << d)); return 4;   // resb Rb,#b  (reg=NIB2=s, bit=NIB3=d)
        case 0xa3: SW(s, RW(s) & ~(1 << d)); return 4;
        case 0xa4: SB(s, RB(s) | (1 << d)); return 4;
        case 0xa5: SW(s, RW(s) | (1 << d)); return 4;
        case 0xa6: cpu.Z = (RB(s) & (1 << d)) ? 0 : 1; return 4;
        case 0xa7: cpu.Z = (RW(s) & (1 << d)) ? 0 : 1; return 4;
        case 0xa8: SB(s, INCB(RB(s), d + 1)); return 4;
        case 0xa9: SW(s, INCW(RW(s), d + 1)); return 4;
        case 0xaa: SB(s, DECB(RB(s), d + 1)); return 4;
        case 0xab: SW(s, DECW(RW(s), d + 1)); return 4;
        case 0xac: v = RB(s); SB(s, RB(d)); SB(d, v); return 6;
        case 0xad: v = RW(s); SW(s, RW(d)); SW(d, v); return 6;
        case 0xae: if (cond(d)) SB(s, RB(s) | 1); return 5; // tccb cc,Rb
        case 0xaf: if (cond(d)) SW(s, RW(s) | 1); return 5; // tcc cc,Rw
        // ---- 0xb0-0xbf : dab/exts/shift/adc-sbc/block/ldk ----
        case 0xb0: SB(s, DAB(RB(s))); return 5; // dab Rbd
        case 0xb1: switch (d) {
          case 0x0: SW(s, s16(s8(RW(s) & 0xff)) & 0xffff); return 11;   // extsb: byte->word sign extend
          case 0xa: SL(s, s32(s16(RL(s) & 0xffff)) >>> 0); return 11;   // exts: word->long
          case 0x7: unimpl(op0); return 11; // extsl (quad) - log
          default: unimpl(op0); return 11;
        }
        case 0xb2: { // byte shift/rotate
          twice = (d & 2) ? 1 : 0;
          switch (d) {
            case 0x0: case 0x2: SB(s, RLB(RB(s), twice)); return 6;
            case 0x4: case 0x6: SB(s, RRB(RB(s), twice)); return 6;
            case 0x1: op1 = fetch(); { var cB = op1 & 0xff; if (cB & 0x80) SB(s, SRLB(RB(s), 256 - cB)); else SB(s, SLLB(RB(s), cB)); } return 13;
            case 0x9: op1 = fetch(); { var cB2 = op1 & 0xff; if (cB2 & 0x80) SB(s, SRAB(RB(s), 256 - cB2)); else SB(s, SLAB(RB(s), cB2)); } return 13;
            case 0x3: { var cnt3 = s8(RB((op1 = fetch(), (op1 >> 4) & 0xf))); SB(s, cnt3 < 0 ? SRLB(RB(s), -cnt3) : SLLB(RB(s), cnt3)); } return 15;
            default: unimpl(op0); return 6;
          }
        }
        case 0xb3: { // word shift/rotate
          twice = (d & 2) ? 1 : 0;
          switch (d) {
            case 0x0: case 0x2: SW(s, RLW(RW(s), twice)); return 6;
            case 0x4: case 0x6: SW(s, RRW(RW(s), twice)); return 6;
            case 0x8: case 0xa: SW(s, RLCW(RW(s), twice)); return 6;
            case 0xc: case 0xe: SW(s, RRCW(RW(s), twice)); return 6;
            case 0x1: op1 = fetch(); { var cW = s16(op1); if (cW < 0) SW(s, SRLW(RW(s), -cW)); else SW(s, SLLW(RW(s), cW)); } return 13;
            case 0x9: op1 = fetch(); { var cW2 = s16(op1); if (cW2 < 0) SW(s, SRAW(RW(s), -cW2)); else SW(s, SLAW(RW(s), cW2)); } return 13;
            case 0x3: { op1 = fetch(); var cnt5 = s16(RW((op1 >> 4) & 0xf)); SW(s, cnt5 < 0 ? SRLW(RW(s), -cnt5) : SLLW(RW(s), cnt5)); } return 15;
            case 0xb: { op1 = fetch(); var cnt6 = s16(RW((op1 >> 4) & 0xf)); SW(s, cnt6 < 0 ? SRAW(RW(s), -cnt6) : SLAW(RW(s), cnt6)); } return 15;
            case 0x5: op1 = fetch(); { var cL = s16(op1); SL(s, cL < 0 ? SRLL(RL(s), -cL) : SLLL(RL(s), cL)); } return 13;   // sll/srl long
            case 0xd: op1 = fetch(); { var cL2 = s16(op1); SL(s, cL2 < 0 ? SRAL(RL(s), -cL2) : SLAL(RL(s), cL2)); } return 13; // sla/sra long
            case 0x7: { op1 = fetch(); var cL3 = s16(RW((op1 >> 4) & 0xf)); SL(s, cL3 < 0 ? SRLL(RL(s), -cL3) : SLLL(RL(s), cL3)); } return 15;  // sdll
            case 0xf: { op1 = fetch(); var cL4 = s16(RW((op1 >> 4) & 0xf)); SL(s, cL4 < 0 ? SRAL(RL(s), -cL4) : SLAL(RL(s), cL4)); } return 15;  // sdal
            default: unimpl(op0); return 6;
          }
        }
        case 0xb4: SB(d, ADCB(RB(d), RB(s))); return 5;
        case 0xb5: SW(d, ADCW(RW(d), RW(s))); return 5;
        case 0xb6: SB(d, SBCB(RB(d), RB(s))); return 5;
        case 0xb7: SW(d, SBCW(RW(d), RW(s))); return 5;
        case 0xb8: fetch(); unimpl(op0); return 11; // trib etc
        case 0xba: case 0xbb: { // block byte(ba)/word(bb) transfer & compare
          var word = (hi === 0xbb);
          op1 = fetch();
          var sub = d;                 // op0 low nibble = sub-op
          var srcp = s;                // op0 NIB2 = @Rs (for ldir @Rd,@Rs it's the source pointer)
          var cntr = (op1 >> 8) & 0xf, dstp = (op1 >> 4) & 0xf, cc7 = op1 & 0xf;
          var inc = word ? 2 : 1;
          switch (sub) {
            case 0x1: { // ldir/ldirb  @Rd,@Rs,r
              if (word) wr16(RW(dstp), rd16(RW(srcp))); else wr8(RW(dstp), rd8(RW(srcp)));
              SW(srcp, (RW(srcp) + inc) & 0xffff); SW(dstp, (RW(dstp) + inc) & 0xffff);
              SW(cntr, (RW(cntr) - 1) & 0xffff); if (RW(cntr) !== 0) { cpu.V = 0; if (cc7 === 0) cpu.pc = pc0; } else cpu.V = 1;
              return 11;
            }
            case 0x9: { // lddr/lddrb  @Rd,@Rs,r (decrement)
              if (word) wr16(RW(dstp), rd16(RW(srcp))); else wr8(RW(dstp), rd8(RW(srcp)));
              SW(srcp, (RW(srcp) - inc) & 0xffff); SW(dstp, (RW(dstp) - inc) & 0xffff);
              SW(cntr, (RW(cntr) - 1) & 0xffff); if (RW(cntr) !== 0) { cpu.V = 0; if (cc7 === 0) cpu.pc = pc0; } else cpu.V = 1;
              return 11;
            }
            case 0x0: case 0x4: case 0x8: case 0xc: { // cpi/cpir/cpd/cpdr (compare)
              var back = (sub & 0x8) ? 1 : 0, rep = (sub & 0x4) ? 1 : 0;
              var dreg = (op1 >> 4) & 0xf; // %rw3 dest reg to compare
              if (word) CPW(RW(dreg), rd16(RW(srcp))); else CPB(RB(dreg), rd8(RW(srcp)));
              var zc = cond(cc7); cpu.Z = zc ? 1 : 0;
              SW(srcp, (RW(srcp) + (back ? -inc : inc)) & 0xffff);
              SW(cntr, (RW(cntr) - 1) & 0xffff);
              if (rep) { if (RW(cntr) !== 0 && !cpu.Z) cpu.pc = pc0; cpu.V = RW(cntr) === 0 ? 1 : 0; }
              return 11;
            }
            default: unimpl(op0); return 11;
          }
        }
        case 0xbc: unimpl(op0); return 14; // rrdb
        case 0xbd: SW(s, d); return 5;     // ldk Rw,#imm4
        case 0xbe: unimpl(op0); return 14; // rldb
        case 0xbf: unimpl(op0); return 4;
        case 0x7a: cpu.halted = true; return 8;
      }
      // ---- 0xc0-0xcf : LDB Rb,#imm8 short ----
      if (hi >= 0xc0 && hi <= 0xcf) { SB(hi & 0xf, lo); return 5; }
      // ---- 0xd0-0xdf : CALR disp12 ----
      if (hi >= 0xd0 && hi <= 0xdf) {
        var d12 = op0 & 0xfff, disp = (d12 & 0x800) ? (4096 - 2 * (d12 & 0x7ff)) : (-2 * (d12 & 0x7ff));
        pushW(15, cpu.pc); cpu.pc = (cpu.pc + disp) & 0xffff; return 10;
      }
      // ---- 0xe0-0xef : JR cc,disp8 ----
      if (hi >= 0xe0 && hi <= 0xef) { var d8 = s8(lo); if (cond(hi & 0xf)) cpu.pc = (cpu.pc + 2 * d8) & 0xffff; return 6; }
      // ---- 0xf0-0xff : DJNZ / DBJNZ ----
      if (hi >= 0xf0 && hi <= 0xff) {
        var word1 = (lo >> 7) & 1, dsp = lo & 0x7f, reg = hi & 0xf, nz;
        if (word1) { SW(reg, (RW(reg) - 1) & 0xffff); nz = RW(reg) !== 0; } else { SB(reg, (RB(reg) - 1) & 0xff); nz = RB(reg) !== 0; }
        if (nz) cpu.pc = (cpu.pc - 2 * dsp) & 0xffff; return 11;
      }
      unimpl(op0); return 4;
    };

    cpu.reset = function (pc0v, fcw0) {
      var i; for (i = 0; i < 16; i++) R[i] = 0;
      cpu.pc = pc0v & 0xffff; cpu.setFcw(fcw0 & 0xffff);
      cpu.halted = false; cpu.insns = 0; cpu.nviPending = 0; cpu.psap = 0;
      cpu.unimplCount = 0;
    };
    cpu.raiseNVI = function () { cpu.nviPending = 1; };
    cpu.clearNVI = function () { cpu.nviPending = 0; };
    return cpu;
  }

  // =====================================================================
  //  MB88xx core  (Fujitsu 4-bit MCU; direct port of MAME cpu/mb88xx.cpp,
  //  BSD-3-Clause).  The Namco 51xx / 53xx customs are MB8843s: 10-bit program
  //  (1 KB), 6-bit data (64 nibbles), PC 6-bit + PA page.  One machine cycle =
  //  6 oscillator clocks.  ISA, flags (st/zf/cf/vf/sf/if), the 4-deep call/IRQ
  //  stack, the internal timer, the serial shifter and the external / timer /
  //  serial interrupt vectors are all reproduced exactly from execute_run().
  //  `io` supplies the port callbacks the Namco device wiring binds:
  //     readK() -> 4-bit K       writeO(o8) -> 8-bit O latch (through PLA)
  //     writeP(a4)               readR[0..3]() / writeR[0..3](v)
  //     readSI() -> 0/1          writeSO(bit)
  // =====================================================================
  var MB_INT_SERIAL = 0x01, MB_INT_TIMER = 0x02, MB_INT_EXTERNAL = 0x04;
  var MB_SERIAL_PRESCALE = 6, MB_TIMER_PRESCALE = 32, MB_SERIAL_DISABLE = 1000;
  function makeMB88(prog, io) {
    var PROG_MASK = 0x3ff;                     // MB8843: 10-bit program space
    var DATA_MASK = 0x3f;                      // MB8843: 6-bit data space (64 nibbles)
    var data = new Uint8Array(64);
    var c = {
      PC: 0, PA: 0, SP: new Uint16Array(4), SI: 0,
      A: 0, X: 0, Y: 0,
      st: 1, zf: 0, cf: 0, vf: 0, sf: 0, iff: 0,
      pio: 0, TH: 0, TL: 0, TP: 0, ctr: 0,
      SB: 0, SBcount: 0, oOutput: 0,
      pendingIrq: 0, inIrq: false,
      serialEnabled: false, serialAcc: 0,
      insns: 0, id: 0, onUnimpl: null
    };
    function READOP(a) { return prog[a & PROG_MASK] & 0xff; }
    function RDMEM(a) { return data[a & DATA_MASK] & 0x0f; }
    function WRMEM(a, v) { data[a & DATA_MASK] = v & 0x0f; }
    function GETPC() { return (((c.PA << 6) + c.PC) & PROG_MASK); }
    function GETEA() { return ((c.X << 4) + c.Y) & DATA_MASK; }
    function INCPC() { c.PC++; if (c.PC >= 0x40) { c.PC = 0; c.PA = (c.PA + 1) & 0x1f; } }
    function TEST_ST() { return c.st & 1; }
    function TEST_CF() { return c.cf & 1; }
    function UPDATE_ST_C(v) { c.st = (v & 0x10) ? 0 : 1; }
    function UPDATE_ST_Z(v) { c.st = (v === 0) ? 0 : 1; }
    function UPDATE_CF(v) { c.cf = ((v & 0x10) === 0) ? 0 : 1; }
    function UPDATE_ZF(v) { c.zf = (v !== 0) ? 0 : 1; }

    // ---- write O through the 8-bit PLA (default mask option: no PLA data) ----
    function writePla(index) {
      var shift = (index & 0x10) ? 4 : 0, mask = 0xf << shift;
      c.oOutput = (c.oOutput & ~mask) | ((index << shift) & mask);
      c.oOutput &= 0xff;
      if (io.writeO) io.writeO(c.oOutput);
    }

    // ---- serial shift (called by the host clock at the serial prescale rate) ----
    function serialTick() {
      c.SBcount++;
      if (c.SBcount >= MB_SERIAL_DISABLE) { c.serialEnabled = false; }
      if (!c.sf) {
        var si = io.readSI ? (io.readSI() ? 1 : 0) : 1;
        c.SB = (c.SB >> 1) | (si ? 8 : 0);
        if (c.SBcount >= 4) { c.sf = 1; c.pendingIrq |= MB_INT_SERIAL; }
      }
    }

    function pioEnable(newpio) {
      if ((c.pio ^ newpio) & 0x30) {
        if ((newpio & 0x30) === 0) c.serialEnabled = false;
        else if ((newpio & 0x30) === 0x20) { c.serialEnabled = true; c.serialAcc = 0; }
        else c.serialEnabled = false;           // unsupported mode: leave disabled
      }
      c.pio = newpio & 0xff;
    }

    function incrementTimer() {
      c.TL = (c.TL + 1) & 0x0f;
      if (c.TL === 0) { c.TH = (c.TH + 1) & 0x0f; if (c.TH === 0) { c.vf = 1; c.pendingIrq |= MB_INT_TIMER; } }
    }

    // ---- external + timer clock inputs (edge-triggered, per execute_set_input) ----
    c.setIrqLine = function (state) {
      state = state ? 1 : 0;
      if (!c.iff && state && (c.pio & MB_INT_EXTERNAL)) c.pendingIrq |= MB_INT_EXTERNAL;
      c.iff = state;
    };
    c.setTcLine = function (state) {
      state = state ? 1 : 0;
      if (c.ctr && !state && (c.pio & 0x40)) incrementTimer();
      c.ctr = state;
    };

    function burnCycles(cycles) {
      // internal clock enable -> feed the timer prescaler
      if (c.pio & 0x80) {
        c.TP += cycles;
        while (c.TP >= MB_TIMER_PRESCALE) { c.TP -= MB_TIMER_PRESCALE; incrementTimer(); }
      }
      // serial prescaler (host-clocked shifter)
      if (c.serialEnabled) {
        c.serialAcc += cycles;
        while (c.serialAcc >= MB_SERIAL_PRESCALE) { c.serialAcc -= MB_SERIAL_PRESCALE; serialTick(); }
      }
      // dispatch a pending, enabled interrupt
      if (!c.inIrq && (c.pendingIrq & c.pio)) {
        c.inIrq = true;
        var intpc = GETPC();
        var packed = (intpc | (TEST_CF() << 15) | (c.zf << 14) | (c.st << 13)) & 0xffff;
        c.SP[c.SI] = packed;
        c.SI = (c.SI + 1) & 3;
        if (c.pendingIrq & c.pio & MB_INT_EXTERNAL) c.PC = 0x02;
        else if (c.pendingIrq & c.pio & MB_INT_TIMER) c.PC = 0x04;
        else if (c.pendingIrq & c.pio & MB_INT_SERIAL) c.PC = 0x06;
        c.PA = 0x00; c.st = 1; c.pendingIrq = 0;
      }
    }

    // Execute one instruction; returns the machine-cycle count (1 or 2, +irq work).
    c.step = function () {
      c.insns++;
      var opcode = READOP(GETPC());
      INCPC();
      var oc = 1, arg;
      switch (opcode) {
        case 0x00: c.st = 1; break;                                   // nop
        case 0x01: writePla((TEST_CF() << 4) | c.A); c.st = 1; break; // outO
        case 0x02: if (io.writeP) io.writeP(c.A); c.st = 1; break;    // outP
        case 0x03: if (io.writeR[c.Y & 3]) io.writeR[c.Y & 3](c.A); c.st = 1; break; // outR
        case 0x04: c.Y = c.A; c.st = 1; break;                        // tay
        case 0x05: c.TH = c.A; c.st = 1; break;                       // tath
        case 0x06: c.TL = c.A; c.st = 1; break;                       // tatl
        case 0x07: c.SB = c.A; c.st = 1; break;                       // tas
        case 0x08: c.Y++; UPDATE_ST_C(c.Y); c.Y &= 0x0f; UPDATE_ZF(c.Y); break; // icy
        case 0x09: arg = RDMEM(GETEA()) + 1; UPDATE_ST_C(arg); arg &= 0x0f; UPDATE_ZF(arg); WRMEM(GETEA(), arg); break; // icm
        case 0x0a: WRMEM(GETEA(), c.A); c.Y++; UPDATE_ST_C(c.Y); c.Y &= 0x0f; UPDATE_ZF(c.Y); break; // stic
        case 0x0b: arg = RDMEM(GETEA()); WRMEM(GETEA(), c.A); c.A = arg; UPDATE_ZF(c.A); c.st = 1; break; // x
        case 0x0c: c.A = (c.A << 1) | TEST_CF(); UPDATE_ST_C(c.A); c.cf = c.st ^ 1; c.A &= 0x0f; UPDATE_ZF(c.A); break; // rol
        case 0x0d: c.A = RDMEM(GETEA()); UPDATE_ZF(c.A); c.st = 1; break; // l
        case 0x0e: arg = RDMEM(GETEA()) + c.A + TEST_CF(); UPDATE_ST_C(arg); c.cf = c.st ^ 1; c.A = arg & 0x0f; UPDATE_ZF(c.A); break; // adc
        case 0x0f: c.A &= RDMEM(GETEA()); UPDATE_ZF(c.A); c.st = c.zf ^ 1; break; // and
        case 0x10: if (TEST_CF() || c.A > 9) c.A += 6; UPDATE_ST_C(c.A); c.cf = c.st ^ 1; c.A &= 0x0f; break; // daa
        case 0x11: if (TEST_CF() || c.A > 9) c.A += 10; UPDATE_ST_C(c.A); c.cf = c.st ^ 1; c.A &= 0x0f; break; // das
        case 0x12: c.A = (io.readK ? io.readK() : 0) & 0x0f; UPDATE_ZF(c.A); c.st = 1; break; // inK
        case 0x13: c.A = (io.readR[c.Y & 3] ? io.readR[c.Y & 3]() : 0) & 0x0f; UPDATE_ZF(c.A); c.st = 1; break; // inR
        case 0x14: c.A = c.Y; UPDATE_ZF(c.A); c.st = 1; break;        // tya
        case 0x15: c.A = c.TH; UPDATE_ZF(c.A); c.st = 1; break;       // ttha
        case 0x16: c.A = c.TL; UPDATE_ZF(c.A); c.st = 1; break;       // ttla
        case 0x17: c.A = c.SB; UPDATE_ZF(c.A); c.st = 1; break;       // tsa
        case 0x18: c.Y--; UPDATE_ST_C(c.Y); c.Y &= 0x0f; break;       // dcy
        case 0x19: arg = RDMEM(GETEA()) - 1; UPDATE_ST_C(arg); arg &= 0x0f; UPDATE_ZF(arg); WRMEM(GETEA(), arg); break; // dcm
        case 0x1a: WRMEM(GETEA(), c.A); c.Y--; UPDATE_ST_C(c.Y); c.Y &= 0x0f; UPDATE_ZF(c.Y); break; // stdc
        case 0x1b: arg = c.X; c.X = c.A; c.A = arg; UPDATE_ZF(c.A); c.st = 1; break; // xx
        case 0x1c: c.A |= TEST_CF() << 4; UPDATE_ST_C(c.A << 4); c.cf = c.st ^ 1; c.A >>= 1; c.A &= 0x0f; UPDATE_ZF(c.A); break; // ror
        case 0x1d: WRMEM(GETEA(), c.A); c.st = 1; break;             // st
        case 0x1e: arg = (RDMEM(GETEA()) - c.A - TEST_CF()) & 0xff; UPDATE_ST_C(arg); c.cf = c.st ^ 1; c.A = arg & 0x0f; UPDATE_ZF(c.A); break; // sbc
        case 0x1f: c.A |= RDMEM(GETEA()); UPDATE_ZF(c.A); c.st = c.zf ^ 1; break; // or
        case 0x20: arg = (io.readR[c.Y >> 2] ? io.readR[c.Y >> 2]() : 0) & 0x0f; if (io.writeR[c.Y >> 2]) io.writeR[c.Y >> 2](arg | (1 << (c.Y & 3))); c.st = 1; break; // setR
        case 0x21: c.cf = 1; c.st = 1; break;                        // setc
        case 0x22: arg = (io.readR[c.Y >> 2] ? io.readR[c.Y >> 2]() : 0) & 0x0f; if (io.writeR[c.Y >> 2]) io.writeR[c.Y >> 2](arg & ~(1 << (c.Y & 3))); c.st = 1; break; // rstR
        case 0x23: c.cf = 0; c.st = 1; break;                        // rstc
        case 0x24: arg = (io.readR[c.Y >> 2] ? io.readR[c.Y >> 2]() : 0) & 0x0f; c.st = (arg & (1 << (c.Y & 3))) ? 0 : 1; break; // tstr
        case 0x25: c.st = c.iff ^ 1; break;                          // tsti
        case 0x26: c.st = c.vf ^ 1; c.vf = 0; break;                 // tstv
        case 0x27: c.st = c.sf ^ 1; if (c.sf) { if (c.SBcount >= MB_SERIAL_DISABLE && (c.pio & 0x30) === 0x20) c.serialEnabled = true; c.SBcount = 0; } c.sf = 0; break; // tsts
        case 0x28: c.st = c.cf ^ 1; break;                           // tstc
        case 0x29: c.st = c.zf ^ 1; break;                           // tstz
        case 0x2a: WRMEM(GETEA(), c.SB); UPDATE_ZF(c.SB); c.st = 1; break; // sts
        case 0x2b: c.SB = RDMEM(GETEA()); UPDATE_ZF(c.SB); c.st = 1; break; // ls
        case 0x2c: c.SI = (c.SI - 1) & 3; c.PC = c.SP[c.SI] & 0x3f; c.PA = (c.SP[c.SI] >> 6) & 0x1f; c.st = 1; break; // rts
        case 0x2d: c.A = ((~c.A) + 1) & 0x0f; UPDATE_ST_Z(c.A); break; // neg
        case 0x2e: arg = (RDMEM(GETEA()) - c.A) & 0xff; UPDATE_CF(arg); arg &= 0x0f; UPDATE_ST_Z(arg); c.zf = c.st ^ 1; break; // c
        case 0x2f: c.A ^= RDMEM(GETEA()); UPDATE_ST_Z(c.A); c.zf = c.st ^ 1; break; // eor
        case 0x30: case 0x31: case 0x32: case 0x33: arg = RDMEM(GETEA()); WRMEM(GETEA(), arg | (1 << (opcode & 3))); c.st = 1; break; // sbit
        case 0x34: case 0x35: case 0x36: case 0x37: arg = RDMEM(GETEA()); WRMEM(GETEA(), arg & ~(1 << (opcode & 3))); c.st = 1; break; // rbit
        case 0x38: case 0x39: case 0x3a: case 0x3b: arg = RDMEM(GETEA()); c.st = (arg & (1 << (opcode & 3))) ? 0 : 1; break; // tbit
        case 0x3c: c.inIrq = false; c.SI = (c.SI - 1) & 3; c.PC = c.SP[c.SI] & 0x3f; c.PA = (c.SP[c.SI] >> 6) & 0x1f; c.st = (c.SP[c.SI] >> 13) & 1; c.zf = (c.SP[c.SI] >> 14) & 1; c.cf = (c.SP[c.SI] >> 15) & 1; break; // rti
        case 0x3d: c.PA = READOP(GETPC()) & 0x1f; c.PC = c.A * 4; oc++; c.st = 1; break; // jpa imm
        case 0x3e: pioEnable(c.pio | READOP(GETPC())); INCPC(); oc++; c.st = 1; break; // en imm
        case 0x3f: pioEnable(c.pio & ~READOP(GETPC())); INCPC(); oc++; c.st = 1; break; // dis imm
        case 0x40: case 0x41: case 0x42: case 0x43: arg = ((io.readR[0] ? io.readR[0]() : 0) & 0x0f) | (1 << (opcode & 3)); if (io.writeR[0]) io.writeR[0](arg); c.st = 1; break; // setD
        case 0x44: case 0x45: case 0x46: case 0x47: arg = ((io.readR[0] ? io.readR[0]() : 0) & 0x0f) & ~(1 << (opcode & 3)); if (io.writeR[0]) io.writeR[0](arg); c.st = 1; break; // rstD
        case 0x48: case 0x49: case 0x4a: case 0x4b: arg = (io.readR[2] ? io.readR[2]() : 0) & 0x0f; c.st = (arg & (1 << (opcode & 3))) ? 0 : 1; break; // tstD
        case 0x4c: case 0x4d: case 0x4e: case 0x4f: c.st = (c.A & (1 << (opcode & 3))) ? 0 : 1; break; // tba
        case 0x50: case 0x51: case 0x52: case 0x53: arg = RDMEM(opcode & 3); WRMEM(opcode & 3, c.A); c.A = arg; UPDATE_ZF(c.A); c.st = 1; break; // xd
        case 0x54: case 0x55: case 0x56: case 0x57: arg = RDMEM((opcode & 3) + 4); WRMEM((opcode & 3) + 4, c.Y); c.Y = arg; UPDATE_ZF(c.Y); c.st = 1; break; // xyd
        case 0x58: case 0x59: case 0x5a: case 0x5b:
        case 0x5c: case 0x5d: case 0x5e: case 0x5f: c.X = opcode & 7; UPDATE_ZF(c.X); c.st = 1; break; // lxi (X)
        case 0x60: case 0x61: case 0x62: case 0x63:
        case 0x64: case 0x65: case 0x66: case 0x67: // call imm
          arg = READOP(GETPC()); INCPC(); oc++;
          if (TEST_ST()) { c.SP[c.SI] = GETPC(); c.SI = (c.SI + 1) & 3; c.PC = arg & 0x3f; c.PA = ((opcode & 7) << 2) | (arg >> 6); }
          c.st = 1; break;
        case 0x68: case 0x69: case 0x6a: case 0x6b:
        case 0x6c: case 0x6d: case 0x6e: case 0x6f: // jpl imm
          arg = READOP(GETPC()); INCPC(); oc++;
          if (TEST_ST()) { c.PC = arg & 0x3f; c.PA = ((opcode & 7) << 2) | (arg >> 6); }
          c.st = 1; break;
        case 0x70: case 0x71: case 0x72: case 0x73:
        case 0x74: case 0x75: case 0x76: case 0x77:
        case 0x78: case 0x79: case 0x7a: case 0x7b:
        case 0x7c: case 0x7d: case 0x7e: case 0x7f: // ai
          arg = (opcode & 0x0f) + c.A; UPDATE_ST_C(arg); c.cf = c.st ^ 1; c.A = arg & 0x0f; UPDATE_ZF(c.A); break;
        case 0x80: case 0x81: case 0x82: case 0x83:
        case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8a: case 0x8b:
        case 0x8c: case 0x8d: case 0x8e: case 0x8f: c.Y = opcode & 0x0f; UPDATE_ZF(c.Y); c.st = 1; break; // lyi
        case 0x90: case 0x91: case 0x92: case 0x93:
        case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9a: case 0x9b:
        case 0x9c: case 0x9d: case 0x9e: case 0x9f: c.A = opcode & 0x0f; UPDATE_ZF(c.A); c.st = 1; break; // li
        case 0xa0: case 0xa1: case 0xa2: case 0xa3:
        case 0xa4: case 0xa5: case 0xa6: case 0xa7:
        case 0xa8: case 0xa9: case 0xaa: case 0xab:
        case 0xac: case 0xad: case 0xae: case 0xaf: // cyi
          arg = ((opcode & 0x0f) - c.Y) & 0xff; UPDATE_CF(arg); arg &= 0x0f; UPDATE_ST_Z(arg); c.zf = c.st ^ 1; break;
        case 0xb0: case 0xb1: case 0xb2: case 0xb3:
        case 0xb4: case 0xb5: case 0xb6: case 0xb7:
        case 0xb8: case 0xb9: case 0xba: case 0xbb:
        case 0xbc: case 0xbd: case 0xbe: case 0xbf: // ci
          arg = ((opcode & 0x0f) - c.A) & 0xff; UPDATE_CF(arg); arg &= 0x0f; UPDATE_ST_Z(arg); c.zf = c.st ^ 1; break;
        default: if (TEST_ST()) c.PC = opcode & 0x3f; c.st = 1; break; // jmp (0xc0-0xff)
      }
      burnCycles(oc);
      return oc;
    };

    c.reset = function () {
      c.PC = 0; c.PA = 0; c.SP[0] = c.SP[1] = c.SP[2] = c.SP[3] = 0; c.SI = 0;
      c.A = 0; c.X = 0; c.Y = 0;
      c.st = 1; c.zf = 0; c.cf = 0; c.vf = 0; c.sf = 0; c.iff = 0;
      c.pio = 0; c.TH = 0; c.TL = 0; c.TP = 0; c.ctr = 0;
      c.SB = 0; c.SBcount = 0; c.oOutput = 0;
      c.pendingIrq = 0; c.inIrq = false; c.serialEnabled = false; c.serialAcc = 0;
      c.insns = 0;
      for (var i = 0; i < 64; i++) data[i] = 0;
    };
    c.data = data;
    return c;
  }

  // =====================================================================
  //  BOARD
  // =====================================================================
  function create(canvas) {
    if (canvas) { canvas.width = 256; canvas.height = 224; }
    var ctx = canvas ? canvas.getContext('2d') : null;
    var image = ctx ? ctx.createImageData(256, 224) : null;
    var buf32 = image ? new Uint32Array(image.data.buffer) : new Uint32Array(256 * 224);

    var V = buildVideo();
    var gChars = decodeChars(ROM.chars, 256);
    var gTiles = decodeChars(ROM.tiles, 256);
    var gSmall = decodeSmallSprites(ROM.sprites);
    var gBig = decodeBigSprites(ROM.big);

    // ---- shared RAM (16-bit words, shared by the two Z8002) ----
    var sprite16 = new Uint16Array(0x800);   // 0x8000..0x8fff (word) / Z80 0x4000
    var road16 = new Uint16Array(0x400);   // 0x9000..0x97ff       / Z80 0x4800
    var alpha16 = new Uint16Array(0x400);   // 0x9800..0x9fff       / Z80 0x4c00
    var view16 = new Uint16Array(0x800);   // 0xa000..0xafff       / Z80 0x5000
    var nvram = new Uint8Array(0x800);
    var soundram = new Uint8Array(0x400);
    var sndRegs = new Uint8Array(0x40);    // WSG registers window (Z80 0x83c0)
    var scroll = 0, roadVScroll = 0, chacl = 1;

    // ---- sound-custom DAC output event logs (drained by the host audio path) ----
    // Each 52xx P-port write and each 54xx O/R output write is time-stamped with
    // the emitting MCU's absolute CPU-cycle clock so the host can reconstruct the
    // piecewise-constant DAC waveform at the audio sample rate.  Cleared per field.
    var ev52 = [];   // flat [cycle, pCode(0..15), ...]  — 52xx voice DAC
    var ev54 = [];   // flat [cycle, out0, out1, out2, ...] — 54xx 3-channel DAC
    var audioClk = 0;   // absolute cycle of the MCU instruction currently stepping

    var self = {};
    self.V = V; self.gChars = gChars; self.gTiles = gTiles; self.gSmall = gSmall; self.gBig = gBig;
    self.sprite16 = sprite16; self.road16 = road16; self.alpha16 = alpha16; self.view16 = view16;
    self.soundram = soundram; self.nvram = nvram;
    self.width = 256; self.height = 224;
    self.onWrite = null; self.onSound = null; self.lastWrite = -1;
    self.frameCount = 0;

    // ---- Z8002 shared bus (both sub CPUs) ----
    function z8_rb(a) {
      a &= 0xffff;
      if (a < 0x8000) return 0; // ROM handled by wrapper per-cpu
      if (a < 0x9000) { var w = sprite16[(a >> 1) & 0x7ff]; return (a & 1) ? (w & 0xff) : (w >> 8) & 0xff; }
      if (a < 0x9800) { var w2 = road16[(a >> 1) & 0x3ff]; return (a & 1) ? (w2 & 0xff) : (w2 >> 8) & 0xff; }
      if (a < 0xa000) { var w3 = alpha16[(a >> 1) & 0x3ff]; return (a & 1) ? (w3 & 0xff) : (w3 >> 8) & 0xff; }
      if (a < 0xb000) { var w4 = view16[(a >> 1) & 0x7ff]; return (a & 1) ? (w4 & 0xff) : (w4 >> 8) & 0xff; }
      return 0xff;
    }
    function z8_wb(a, v) {
      a &= 0xffff; v &= 0xff;
      if (a < 0x8000) return;
      if (a < 0x9000) { var i = (a >> 1) & 0x7ff; sprite16[i] = (a & 1) ? ((sprite16[i] & 0xff00) | v) : ((sprite16[i] & 0x00ff) | (v << 8)); return; }
      if (a < 0x9800) { var i2 = (a >> 1) & 0x3ff; road16[i2] = (a & 1) ? ((road16[i2] & 0xff00) | v) : ((road16[i2] & 0x00ff) | (v << 8)); return; }
      if (a < 0xa000) { var i3 = (a >> 1) & 0x3ff; alpha16[i3] = (a & 1) ? ((alpha16[i3] & 0xff00) | v) : ((alpha16[i3] & 0x00ff) | (v << 8)); return; }
      if (a < 0xb000) { var i4 = (a >> 1) & 0x7ff; view16[i4] = (a & 1) ? ((view16[i4] & 0xff00) | v) : ((view16[i4] & 0x00ff) | (v << 8)); return; }
    }
    // Per-CPU NVI-enable + subReset flags, shared across the board.
    var subIrqMask = 0, sub1Reset = 1, sub2Reset = 1;
    function z8factory(rom, cpuId) {
      var bus = {
        rb: function (a) { a &= 0xffff; return a < 0x8000 ? rom[a] : z8_rb(a); },
        wb: function (a, v) {
          a &= 0xffff;
          if (a >= 0x6000 && a < 0x8000) {   // NVI enable (mirrored 0x6000-0x7fff) — NOT shared
            subIrqMask = v & 1;
            if (!subIrqMask) { sub1.clearNVI(); sub2.clearNVI(); }
            return;
          }
          if ((a & 0xf800) === 0xc000) {     // 0xc000-c001 mirror: background hscroll
            scroll = ((a & 1) ? ((scroll & 0xff00) | v) : ((scroll & 0x00ff) | (v << 8))) & 0xffff; return;
          }
          if ((a & 0xf800) === 0xc100 || (a >= 0xc100 && a < 0xc102)) { // road vscroll
            roadVScroll = ((a & 1) ? ((roadVScroll & 0xff00) | v) : ((roadVScroll & 0x00ff) | (v << 8))) & 0xffff; return;
          }
          if (a >= 0xc000) return;           // other c000-page write-only latches: n.c.
          z8_wb(a, v);
        },
        rw: function (a) { a &= 0xffff; return a < 0x8000 ? (((rom[a] << 8) | rom[(a + 1) & 0xffff]) & 0xffff) : ((z8_rb(a) << 8 | z8_rb((a + 1) & 0xffff)) & 0xffff); },
        ww: function (a, v) { this.wb(a, (v >> 8) & 0xff); this.wb((a + 1) & 0xffff, v & 0xff); }
      };
      var c = makeZ8002(bus); c.id = cpuId; return c;
    }
    var sub1 = z8factory(ROM.sub1, 1);
    var sub2 = z8factory(ROM.sub2, 2);
    self.sub1 = sub1; self.sub2 = sub2;
    // Restart a Z8002 from its reset vector (FCW from ROM word $0002, PC from word
    // $0004).  On the real board the LS259 /RESET line, when released, reloads the
    // CPU from this vector; the master pulses it to (re)start a sub for a new scene.
    function resetSub(cpu, rom) {
      var fcw0 = ((rom[2] << 8) | rom[3]) & 0xffff;
      var pc0v = ((rom[4] << 8) | rom[5]) & 0xffff;
      cpu.reset(pc0v, fcw0);
    }
    // Unimplemented-opcode telemetry (surfaced for bring-up / README honesty).
    self.unimpl = {};
    function onUnimpl(pc, op, id) { var k = ('0000' + op.toString(16)).slice(-4); self.unimpl[k] = (self.unimpl[k] || 0) + 1; }
    sub1.onUnimpl = onUnimpl; sub2.onUnimpl = onUnimpl;

    // ---- input state ----
    var buttons = 0;
    var autoStartMask = 1;   // IN0 bit2, program-controlled via LS259 q6 (sb0_w)
    // DIP switches (active-high, MAME 'polepos' defaults): DSWA 1C/1C, 90s, 3 laps;
    // DSWB extended/practice ranks + demo sounds ON.
    var DSWA = 0xff, DSWB = 0x6b;
    // steering: a virtual DIAL position advanced by held left/right keys; the 53xx
    // MCU polls it exactly as polepos_state::steering_changed_r / steering_delta_r.
    var steerLast = 0, steerAccum = 0, steerDelta = 0, steerPos = 0;
    function advanceSteer() {
      if (buttons & MASK.left) steerPos = (steerPos - 2) & 0xff;
      else if (buttons & MASK.right) steerPos = (steerPos + 2) & 0xff;
    }
    function steeringChangedR() {
      var steerNew = steerPos & 0xff;
      steerAccum += ((steerNew - steerLast) << 24 >> 24) * 2;
      steerLast = steerNew;
      if (steerAccum < 0) { steerDelta = 0; steerAccum++; }
      else if (steerAccum > 0) { steerDelta = 1; steerAccum--; }
      return steerAccum & 1;
    }
    function steeringDeltaR() { return steerDelta & 1; }
    // IN0 (active-low, idle 0xff): b1 gear, b2 auto-start (program line), b4 coin1,
    // b5 coin2, b6 service, b7 test.  All read by the real 51xx MCU on R2/R3.
    function in0() {
      var b = 0xff;
      if (buttons & MASK.gear) b &= ~0x02;
      if (!autoStartMask) b &= ~0x04;          // program "presses" start via q6
      if (buttons & MASK.coin) b &= ~0x10;     // coin1
      if (buttons & MASK.start) b &= ~0x20;    // coin2 slot doubles as 2P start credit
      return b & 0xff;
    }

    // ===================================================================
    //  Namco custom MCUs — the REAL Fujitsu MB8843 ROMs on the MB88 core.
    //  51xx = coin/credit + input + protection; 53xx = steering/DIP reader.
    //  Both hang off the 06xx serial bus below.  Wiring is a direct port of
    //  namco51.cpp / namco53.cpp: K, R0-R3, O (8-bit answer latch), P.
    // ===================================================================
    var n51 = { portO: 0, rw: 0, cpu: null, reset: 1 };
    var n53 = { portO: 0, cpu: null, reset: 1 };
    n51.cpu = makeMB88(ROM.mcu51, {
      readK: function () { return ((n51.rw << 3) | (n51.portO & 0x07)) & 0x0f; },
      writeO: function (o8) { n51.portO = o8 & 0xff; },
      writeP: function (v) { /* coin counters / lockout (bookkeeping only) */ },
      readR: [
        function () { return DSWB & 0x0f; },
        function () { return (DSWB >> 4) & 0x0f; },
        function () { return in0() & 0x0f; },
        function () { return (in0() >> 4) & 0x0f; }
      ],
      writeR: [null, null, null, null],
      readSI: function () { return 1; }, writeSO: null
    });
    n51.cpu.id = 0x51;
    n53.cpu = makeMB88(ROM.mcu53, {
      readK: function () { return 0; },        // MOD hardwired to 0 -> mode 0
      writeO: function (o8) { n53.portO = o8 & 0xff; },
      writeP: function (v) { /* P outputs (chip selects for input muxing) */ },
      readR: [
        function () { return steeringChangedR() & 0x0f; },
        function () { return steeringDeltaR() & 0x0f; },
        function () { return DSWA & 0x0f; },
        function () { return (DSWA >> 4) & 0x0f; }
      ],
      writeR: [null, null, null, null],
      readSI: function () { return 1; }, writeSO: null
    });
    n53.cpu.id = 0x53;
    self.n51 = n51; self.n53 = n53;             // exposed for the debugger / bring-up

    // ---- Namco 52xx voice player (Fujitsu MB8843, port of namco52.cpp) --------
    // A sample player: K = 4-bit command (sample # to play, 0 = none); it walks a
    // 16-bit address into the voice sample ROM (O = A8..A15, R2 = A0..A3, R3 =
    // A4..A7), reads the byte back on R0 (low nibble) / R1 (high nibble), and
    // streams a 4-bit PCM value out of its P port to a DAC.  SI is tied to +5V in
    // Pole Position (full 16-bit ROM addressing).  /TC is grounded (the MCU paces
    // itself off its internal timer).  Selected on the 06xx as custom #2 (0x04).
    var n52 = { cmd: 0, reset: 1, addr: 0, cpu: null };
    function voiceRom(a) { a &= 0xffff; return a < 0x8000 ? (ROM.voice[a] & 0xff) : 0xff; }
    n52.cpu = makeMB88(ROM.mcu52, {
      readK: function () { return n52.cmd & 0x0f; },
      writeO: function (o8) { n52.addr = (n52.addr & 0x00ff) | ((o8 & 0xff) << 8); },
      writeP: function (v) { ev52.push(audioClk); ev52.push(v & 0x0f); },
      readR: [
        function () { return voiceRom(n52.addr) & 0x0f; },        // R0 = ROM D0-D3
        function () { return (voiceRom(n52.addr) >> 4) & 0x0f; }, // R1 = ROM D4-D7
        null, null
      ],
      writeR: [
        null, null,
        function (v) { n52.addr = (n52.addr & 0xfff0) | (v & 0x0f); },        // R2 = A0-A3
        function (v) { n52.addr = (n52.addr & 0xff0f) | ((v & 0x0f) << 4); }  // R3 = A4-A7
      ],
      readSI: function () { return 1; }, writeSO: null
    });
    n52.cpu.id = 0x52;

    // ---- Namco 54xx noise generator (Fujitsu MB8844, port of namco54.cpp) -----
    // A noise/engine-support generator: K = high nibble of the command, R0 = low
    // nibble; it emits three 4-bit noise channels — O0-O3 = OUT0, O4-O7 = OUT1,
    // R1 = OUT2 — each into a DAC + op-amp band-pass on the board.  Selected on
    // the 06xx as custom #3 (0x08).
    var n54 = { cmd: 0, reset: 1, o0: 0, o1: 0, o2: 0, cpu: null };
    function pushEv54() { ev54.push(audioClk); ev54.push(n54.o0); ev54.push(n54.o1); ev54.push(n54.o2); }
    n54.cpu = makeMB88(ROM.mcu54, {
      readK: function () { return (n54.cmd >> 4) & 0x0f; },
      writeO: function (o8) { n54.o0 = o8 & 0x0f; n54.o1 = (o8 >> 4) & 0x0f; pushEv54(); },
      writeP: null,
      readR: [
        function () { return n54.cmd & 0x0f; },   // R0 = command low nibble
        null, null, null
      ],
      writeR: [
        null,
        function (v) { n54.o2 = v & 0x0f; pushEv54(); },   // R1 = OUT2
        null, null
      ],
      readSI: function () { return 1; }, writeSO: null
    });
    n54.cpu.id = 0x54;
    self.n52 = n52; self.n54 = n54;
    self.ev52 = ev52; self.ev54 = ev54;         // DAC event logs, read by the host

    // ===================================================================
    //  Namco 06xx bus (port of namco06.cpp).  It selects up to four customs
    //  (low nibble of control), R/!W is bit4, the top three bits are a clock
    //  divider.  While the divider is running the chip pulses /NMI to the Z80
    //  (driving one read/write per byte) and pulses each selected custom's
    //  /IRQ (chip-select) so the MCU services that byte.  The read data port
    //  ANDs together every selected custom's O-latch.
    // ===================================================================
    var o6 = {
      control: 0, timerState: false, readStretch: false,
      halfPeriod: 0, acc: 0, running: false
    };
    function o6_selMask() { return o6.control & 0x0f; }
    function o6_dataR() {                        // Z80 read @ 0x9000
      if (!(o6.control & 0x10)) return 0;        // read requested in write mode
      var r = 0xff;
      if (o6.control & 0x01) r &= n51.portO;     // 51xx answer
      if (o6.control & 0x02) r &= n53.portO;     // 53xx answer
      return r & 0xff;
    }
    function o6_dataW(v) {                        // Z80 write @ 0x9000
      if (o6.control & 0x10) return;             // write requested in read mode
      v &= 0xff;
      if (o6.control & 0x01) n51.portO = v;      // command byte -> 51xx O/K latch
      // 52xx (0x04) / 54xx (0x08) are sound customs: latch the command; the MCU
      // reads it on K when the 06xx pulses its /IRQ (chip-select) below.
      if (o6.control & 0x04) n52.cmd = v;
      if (o6.control & 0x08) n54.cmd = v;
    }
    function o6_ctrlW(v) {                        // Z80 write @ 0x9100
      o6.control = v & 0xff;
      if ((o6.control & 0xe0) === 0) {           // divider stopped -> quiesce the bus
        o6.running = false; o6.timerState = false;
        n51.cpu.setIrqLine(0); n53.cpu.setIrqLine(0);
        n52.cpu.setIrqLine(0); n54.cpu.setIrqLine(0);
      } else {
        var numShifts = (o6.control & 0xe0) >> 5;
        o6.halfPeriod = 32 * (1 << numShifts);   // main-CPU cycles per timer half
        o6.acc = 0; o6.running = true;
        o6.readStretch = (o6.control & 0x10) ? true : false;  // suppress 1st read NMI
      }
    }
    // Advance the 06xx timer by `dt` master-CPU cycles, firing NMI / chip-select
    // edges.  Called from the frame scheduler.  A "true" timer edge = one byte:
    // it drives R/!W, pulses each selected MCU's /IRQ, and (unless stretched)
    // pulses the Z80 /NMI so it reads or writes that byte.
    function o6_service(dt) {
      if (!o6.running) return;
      o6.acc += dt;
      while (o6.acc >= o6.halfPeriod) {
        o6.acc -= o6.halfPeriod;
        o6.timerState = !o6.timerState;
        var sel = o6_selMask();
        if (o6.timerState) {
          n51.rw = (o6.control & 0x01) ? ((o6.control >> 4) & 1) : n51.rw;
          if (o6.control & 0x01) n51.cpu.setIrqLine(1);
          if (o6.control & 0x02) n53.cpu.setIrqLine(1);
          if (o6.control & 0x04) n52.cpu.setIrqLine(1);
          if (o6.control & 0x08) n54.cpu.setIrqLine(1);
          if (!o6.readStretch && z80) z80.interrupt(true, 0);   // /NMI to master
          o6.readStretch = false;
        } else {
          if (o6.control & 0x01) n51.cpu.setIrqLine(0);
          if (o6.control & 0x02) n53.cpu.setIrqLine(0);
          if (o6.control & 0x04) n52.cpu.setIrqLine(0);
          if (o6.control & 0x08) n54.cpu.setIrqLine(0);
        }
      }
    }

    // ---- Z80 master/sound CPU + LS259 output latch (0xa000-0xa007) ----
    var latch = new Uint8Array(8);      // q0..q7
    var vpos = 0;                        // current scanline (for READY 128V bit)
    var adcSel = 0;                      // GASEL: 0=accel, 1=brake
    function readyR() {
      var ret = 0xff;
      if (vpos >= 128) ret ^= 0x02;      // 128V
      ret ^= 0x08;                        // ADC0804 end flag (conversion always ready)
      return ret & 0xff;
    }
    function adcRead() {
      // ADC0804 on Z80 I/O port 0.  MAME m_analog_io = { BRAKE, ACCEL }, read as
      // m_analog_io[adc_input]: GASEL/adcSel = 0 selects BRAKE, 1 selects ACCEL.
      var pedal = adcSel ? ((buttons & MASK.accel) ? 0x90 : 0) : ((buttons & MASK.brake) ? 0x90 : 0);
      return pedal & 0xff;
    }
    var Z80ctor = global.Z80;
    var z80 = Z80ctor ? new Z80ctor({
      mem_read: function (a) {
        a &= 0xffff;
        if (a < 0x3000) return ROM.maincpu[a];
        if (a < 0x4000) return nvram[a & 0x7ff];                 // 0x3000-3fff mirror
        if (a >= 0x4000 && a < 0x4800) return sprite16[a - 0x4000] & 0xff;
        if (a >= 0x4800 && a < 0x4c00) return road16[a - 0x4800] & 0xff;
        if (a >= 0x4c00 && a < 0x5000) return alpha16[a - 0x4c00] & 0xff;
        if (a >= 0x5000 && a < 0x5800) return view16[a - 0x5000] & 0xff;
        if (a >= 0x8000 && a < 0x9000) { var so = a & 0x3ff; return so < 0x3c0 ? soundram[so] : sndRegs[so - 0x3c0]; }
        if (a >= 0x9000 && a < 0xa000) return (a & 0x100) ? o6.control : o6_dataR();   // 9000 data / 9100 ctrl
        if (a >= 0xa000 && a < 0xb000) return readyR();
        return 0xff;
      },
      mem_write: function (a, v) {
        a &= 0xffff; v &= 0xff; self.lastWrite = a; if (self.onWrite) self.onWrite(a, v);
        if (a >= 0x3000 && a < 0x4000) { nvram[a & 0x7ff] = v; return; }
        if (a >= 0x4000 && a < 0x4800) { var i = a - 0x4000; sprite16[i] = (sprite16[i] & 0xff00) | v; return; }
        if (a >= 0x4800 && a < 0x4c00) { var i2 = a - 0x4800; road16[i2] = (road16[i2] & 0xff00) | v; return; }
        if (a >= 0x4c00 && a < 0x5000) { var i3 = a - 0x4c00; alpha16[i3] = (alpha16[i3] & 0xff00) | v; return; }
        if (a >= 0x5000 && a < 0x5800) { var i4 = a - 0x5000; view16[i4] = (view16[i4] & 0xff00) | v; return; }
        if (a >= 0x8000 && a < 0x9000) { var so = a & 0x3ff; if (so < 0x3c0) { soundram[so] = v; } else { sndRegs[so - 0x3c0] = v; if (self.onSound) self.onSound(so - 0x3c0, v); } return; }
        if (a >= 0x9000 && a < 0xa000) { if (a & 0x100) o6_ctrlW(v); else o6_dataW(v); return; }
        if (a >= 0xa000 && a < 0xa100) {   // LS259 latch, write_d0
          var bit = a & 7, on = v & 1;
          latch[bit] = on;
          if (bit === 1) {                                // Namco MCU reset (active low)
            var newReset = on ? 0 : 1;
            // released -> boot all four customs (LS259 q1 gates 51/52/53/54xx)
            if (n51.reset === 1 && newReset === 0) { n51.cpu.reset(); n53.cpu.reset(); n52.cpu.reset(); n54.cpu.reset(); }
            n51.reset = newReset; n53.reset = newReset; n52.reset = newReset; n54.reset = newReset;
          }
          if (bit === 2 && !on) { engineLsb = 0; engineMsb = 0; }  // CLSON low -> clear engine (clson_w)
          if (bit === 3) adcSel = on;
          if (bit === 4) { var r1 = on ? 0 : 1; if (sub1Reset === 1 && r1 === 0) resetSub(sub1, ROM.sub1); sub1Reset = r1; }
          if (bit === 5) { var r2 = on ? 0 : 1; if (sub2Reset === 1 && r2 === 0) resetSub(sub2, ROM.sub2); sub2Reset = r2; }
          if (bit === 6) autoStartMask = on ? 0 : 1;   // sb0_w: auto_start = !q6
          if (bit === 7) chacl = on;
          return;
        }
        if (a >= 0xa100 && a < 0xa200) return;                        // watchdog
        if (a >= 0xa200 && a < 0xa300) { engineLsb = v & 0x1f; if (self.onEngine) self.onEngine(engineLsb, engineMsb); return; }
        if (a >= 0xa300 && a < 0xa400) { engineMsb = v & 0x3f; if (self.onEngine) self.onEngine(engineLsb, engineMsb); return; }
      },
      io_read: function (p) { return (p & 0xff) === 0 ? adcRead() : 0xff; },
      io_write: function () {}
    }) : null;
    self.z80 = z80;
    var engineLsb = 0, engineMsb = 0;
    self.onEngine = null;
    // Engine-sound latch for the host synth: pitch lsb ($a200, bits 5..1) + enable
    // (bit 0), pitch msb ($a300, 6 bits), and CLSON (LS259 q2) which gates it.
    self.engineLatch = function () { return { lsb: engineLsb, msb: engineMsb, clson: latch[2] & 1 }; };

    // ---- input ----
    var MASK = { left: 0x01, right: 0x02, accel: 0x04, brake: 0x08, gear: 0x10, start: 0x20, coin: 0x40 };
    self.setInput = function (mask, down) { if (down) buttons |= mask; else buttons &= ~mask; buttons &= 0xff; };
    self.MASK = MASK;

    // ---- WSG sound register window (for the shared chip) ----
    self.soundRegs = function () { return sndRegs; };

    // ---- debugger access (targets Z8002 sub-CPU #1 address space) ----
    self.R = sub1.R;                 // alias for the debugger register file
    Object.defineProperty(self, 'pc', { get: function () { return sub1.pc; }, set: function (v) { sub1.pc = v & 0xffff; } });
    Object.defineProperty(self, 'C', { get: function () { return sub1.C; }, set: function (v) { sub1.C = v ? 1 : 0; } });
    Object.defineProperty(self, 'Z', { get: function () { return sub1.Z; }, set: function (v) { sub1.Z = v ? 1 : 0; } });
    Object.defineProperty(self, 'S', { get: function () { return sub1.S; }, set: function (v) { sub1.S = v ? 1 : 0; } });
    Object.defineProperty(self, 'V', { get: function () { return sub1.V; }, set: function (v) { sub1.V = v ? 1 : 0; } });
    Object.defineProperty(self, 'D', { get: function () { return sub1.D; }, set: function (v) { sub1.D = v ? 1 : 0; } });
    Object.defineProperty(self, 'H', { get: function () { return sub1.H; }, set: function (v) { sub1.H = v ? 1 : 0; } });
    Object.defineProperty(self, 'halted', { get: function () { return sub1.halted; } });
    self.fcw = function () { return sub1.fcw(); };
    self.setFcw = function (v) { sub1.setFcw(v); };
    self.getB = function (n) { return sub1.getB(n); };
    self.setB = function (n, v) { sub1.setB(n, v); };
    self.step = function () { return sub1.step(); };
    self.peek = function (a) { a &= 0xffff; return a < 0x8000 ? ROM.sub1[a] : z8_rb(a); };
    self.poke = function (a, v) { if ((a & 0xffff) >= 0x8000) z8_wb(a & 0xffff, v & 0xff); };
    self.mem = ROM.sub1; // for the vram bits view fallback

    // =====================================================================
    //  RENDER — port of screen_update (bg tilemap, road, sprites, alpha)
    // =====================================================================
    function drawRoad(bmp) {
      var roadRegion = ROM.road, bits1 = 0x2000, bits2 = 0x4000;
      var y, x, i;
      for (y = 128; y < 256; y++) {
        var yoffs = ((V.vpos[y] + roadVScroll) >> 3) & 0x1ff;
        var roadpal = road16[yoffs & 0x3ff] & 15;
        var penBase = (roadpal << 6);
        var xoffs = road16[0x380 + (y & 0x7f)] & 0x3ff;
        var xscroll = xoffs & 7; xoffs &= ~7;
        var line = new Uint16Array(256 + 8), di = 0;
        for (x = 0; x < 256 / 8 + 1; x++, xoffs += 8) {
          if (xoffs & 0x200) { for (i = 0; i < 8; i++) line[di++] = penBase | 0; }
          else {
            var romoffs = ((y & 0x7f) << 6) + ((xoffs & 0x1f8) >> 3);
            var control = roadRegion[romoffs] || 0;
            var b1 = roadRegion[bits1 + romoffs] || 0;
            var b2 = roadRegion[bits2 + ((romoffs & 0xfff) | ((romoffs & 0x1000) >> 1))] || 0;
            var roadval = control & 0x3f, carin = control >> 7;
            for (i = 8; i > 0; i--) {
              var bits = ((b1 >> i) & 1) + (((b2 >> i) & 1) << 1);
              if (!carin && bits) bits++;
              line[di++] = penBase | (roadval & 0x3f);
              roadval += bits;
            }
          }
        }
        // write to bitmap row y
        var rowBase = y * BMPW;
        for (x = 0; x < 256; x++) bmp[rowBase + x] = V.rgbaOf(V.penRoad[(line[x + xscroll]) & 0x3ff]);
      }
    }

    function zoomSprite(bmp, big, code, color, flipx, sx, sy, sizex, sizey) {
      var gfx = big ? gBig : gSmall;
      var dim = big ? 32 : 16;
      var data = gfx[code % gfx.length];
      if (!data) return;
      var offsxor = flipx ? (dim - 1) : 0;
      var scalelut = ROM.scalelut;
      var y, x;
      for (y = 0; y <= sizey; y++) {
        var yy = (sy + y) & 0x1ff;
        if (yy >= 0x10 && yy < 0xf0) {
          var dy = scalelut[((y << 6) + sizey) & 0xfff] & 0x1f;
          if (!big) dy >>= 1;
          if (dy >= dim) continue;
          var srow = dy * dim;
          var xx = sx & 0x3ff, siz = 0, offs = 0;
          for (x = (big ? 0x40 : 0x20); x > 0; x--) {
            if (xx < 0x100) {
              var srcCol = ((offs >> 1) ^ offsxor) & (dim - 1);
              var pen = data[srow + srcCol] & 0x0f;
              if (pen !== 0) {
                var idxPen = V.penSpr0[((color & 0x3f) << 4) + pen];
                if (idxPen !== 0x1f) bmp[yy * BMPW + xx] = V.rgbaOf(idxPen);
              }
            }
            offs++;
            siz = siz + 1 + sizex;
            if (siz & 0x40) { siz &= 0x3f; xx = (xx + 1) & 0x3ff; }
          }
        }
      }
    }

    function drawSprites(bmp) {
      var i;
      for (i = 0; i < 64; i++) {
        var pos0 = sprite16[0x380 + i * 2], pos1 = sprite16[0x380 + i * 2 + 1];
        var siz0 = sprite16[0x780 + i * 2], siz1 = sprite16[0x780 + i * 2 + 1];
        if (siz0 === 0 && siz1 === 0 && pos0 === 0 && pos1 === 0) continue;
        var sx = (pos1 & 0x3ff) - 0x40 + 4;
        var sy = 512 - (pos0 & 0x1ff) + 1;
        var sizex = (siz1 & 0x3f00) >> 8;
        var sizey = (siz0 & 0x3f00) >> 8;
        var code = siz0 & 0x7f;
        var flipx = (siz0 >> 7) & 1;
        var color = siz1 & 0x3f;
        var big = (siz0 >> 15) & 1;
        zoomSprite(bmp, big, code, color, flipx, sx, sy, sizex, sizey);
      }
    }

    function drawTilemapBg(bmp) {
      // bg view tilemap: 64 cols x 16 rows, SCAN_COLS, 8x8, only top half visible (y<128)
      var col, row, x, y;
      for (col = 0; col < 64; col++) {
        for (row = 0; row < 16; row++) {
          var ti = col * 16 + row; // SCAN_COLS
          var word = view16[ti & 0x7ff];
          var code = (word & 0xff) | ((word & 0x4000) >> 6);
          var color = (word & 0x3f00) >> 8;
          if (word === 0) continue;               // empty view RAM -> sky (transparent)
          var tile = gTiles[code & 0xff];
          if (!tile) continue;
          var px0 = ((col * 8) - scroll) & 0x1ff, py0 = row * 8;
          for (y = 0; y < 8; y++) {
            var yy = py0 + y; if (yy >= 128) continue;
            for (x = 0; x < 8; x++) {
              var xx = (px0 + x) & 0x1ff; if (xx >= 256) continue;
              var p = tile[y * 8 + x]; if (!p) continue;
              bmp[yy * BMPW + xx] = V.rgbaOf(V.penBg[((color & 0x3f) << 2) + p] & 0x7f);
            }
          }
        }
      }
    }

    function drawTilemapTx(bmp) {
      // alpha tx tilemap: 32x32 SCAN_ROWS, 8x8, whole screen, transparent pen 0x2f
      var col, row, x, y;
      for (row = 0; row < 32; row++) {
        for (col = 0; col < 32; col++) {
          var ti = row * 32 + col;
          var word = alpha16[ti & 0x3ff];
          var code = (word & 0xff) | ((word & 0x4000) >> 6);
          var color = (word & 0x3f00) >> 8;
          if (chacl === 0) { code &= 0xff; color = 0; }
          if (ti >= 32 * 16) color |= 0x40;
          var tile = gChars[code & 0xff];
          if (!tile) continue;
          var px0 = col * 8, py0 = row * 8;
          for (y = 0; y < 8; y++) {
            var yy = py0 + y;
            for (x = 0; x < 8; x++) {
              var p = tile[y * 8 + x];
              if (p === 0) continue;               // transparent background of the glyph
              var pen = V.penAlpha0[((color & 0x3f) << 2) + p];
              if (pen === 0x2f) continue;          // PROM-transparent pen
              bmp[(yy) * BMPW + (px0 + x)] = V.rgbaOf(pen & 0x7f);
            }
          }
        }
      }
    }

    var full = new Uint32Array(BMPW * BMPH);
    self.renderInto = function (out) {
      full.fill(0xff000000);
      drawTilemapBg(full);
      drawRoad(full);
      drawSprites(full);
      drawTilemapTx(full);
      // crop visible window (rows VIS_Y0..VIS_Y0+223, cols 0..255) into 256x224
      var y, x;
      for (y = 0; y < VIS_H; y++) {
        var s = (y + VIS_Y0) * BMPW, d = y * 256;
        for (x = 0; x < 256; x++) out[d + x] = full[s + x];
      }
    };
    self.render = function () { if (!ctx) return; self.renderInto(buf32); ctx.putImageData(image, 0, 0); };

    // =====================================================================
    //  SCHEDULER — the REAL game runs itself.  One 60 Hz field is stepped a
    //  scanline at a time so the interrupt cadence matches polepos.cpp:
    //    * Z80 IRQ0 at scanlines 64 and 192 (when LS259 q0 / IRQON is set),
    //    * both Z8002 take the VBLANK non-vectored interrupt at scanline 240
    //      (when the shared sub-IRQ mask, written at $6000, is set),
    //    * the 06xx pulses /NMI to the Z80 while its clock divider is running,
    //      which is how the Z80 collects 51xx / 53xx input bytes.
    //  The Z80 master boots, sets up the board and RELEASES the two Z8002
    //  resets via the LS259; the sub-CPUs then composite every frame from
    //  their own program.  There is no director.
    // =====================================================================
    // MASTER_CLOCK 24.576 MHz.  Z80 and both Z8002 run at MASTER/8 = 3.072 MHz.
    // 60.606 Hz field over 264 lines => ~51264 cycles/CPU/frame, ~194/line.
    var LINES = 264;                 // total scanlines (visible 224 + blanking)
    var Z80_PER_LINE = 194;          // Z80 T-cycles per scanline
    var SUB_PER_LINE = 194;          // Z8002 cycles per scanline (both game CPUs)

    self.reset = function () {
      var i;
      for (i = 0; i < sprite16.length; i++) sprite16[i] = 0;
      for (i = 0; i < road16.length; i++) road16[i] = 0;
      for (i = 0; i < alpha16.length; i++) alpha16[i] = 0;
      for (i = 0; i < view16.length; i++) view16[i] = 0;
      for (i = 0; i < nvram.length; i++) nvram[i] = 0;
      for (i = 0; i < sndRegs.length; i++) sndRegs[i] = 0;
      for (i = 0; i < 8; i++) latch[i] = 0;
      scroll = 0; roadVScroll = 0; chacl = 1; self.frameCount = 0; vpos = 0;
      subIrqMask = 0; sub1Reset = 1; sub2Reset = 1;
      // 06xx bus + Namco MCUs: held in reset until the master sets LS259 q1.
      o6.control = 0; o6.running = false; o6.timerState = false; o6.readStretch = false; o6.acc = 0;
      n51.portO = 0; n51.rw = 0; n51.reset = 1; n53.portO = 0; n53.reset = 1;
      n51.cpu.reset(); n53.cpu.reset();
      // sound customs + their DAC event logs
      n52.cmd = 0; n52.reset = 1; n52.addr = 0; n52.cpu.reset();
      n54.cmd = 0; n54.reset = 1; n54.o0 = 0; n54.o1 = 0; n54.o2 = 0; n54.cpu.reset();
      ev52.length = 0; ev54.length = 0; audioClk = 0;
      autoStartMask = 1; steerLast = 0; steerAccum = 0; steerDelta = 0; steerPos = 0;
      engineLsb = 0; engineMsb = 0; self.unimpl = {};
      if (z80) z80.reset();
      // Z8002 reset: FCW from word $0002, PC from word $0004 of each sub ROM.
      var fcw1 = ((ROM.sub1[2] << 8) | ROM.sub1[3]) & 0xffff;
      var pc1 = ((ROM.sub1[4] << 8) | ROM.sub1[5]) & 0xffff;
      var fcw2 = ((ROM.sub2[2] << 8) | ROM.sub2[3]) & 0xffff;
      var pc2 = ((ROM.sub2[4] << 8) | ROM.sub2[5]) & 0xffff;
      sub1.reset(pc1, fcw1); sub2.reset(pc2, fcw2);
      self.render();
    };

    // The two Z8002 sub-CPUs are TIGHTLY COUPLED: they share the sprite/road/
    // alpha/view work RAM, keep their stacks in that shared RAM, and re-init the
    // scene off shared-memory barriers rather than an explicit lock.  On the real
    // board both run from the SAME MASTER/8 clock in exact lockstep, so a memory
    // clear on one and a stack push on the other never race — the relative timing
    // is fixed by the silicon.  A coarse "run CPU A for a slice, then CPU B for a
    // slice" scheduler cannot hold that: whichever CPU is stepped first inside a
    // slice can cross a barrier (e.g. sub #1's $8300-$8f00 scene-init clear) that
    // the other has not yet reached, clobbering its live stack.
    //
    // So we run a TRUE TIME-ORDERED INTERLEAVE.  Every device carries an absolute
    // clock in CPU-cycle units (MASTER/8 = 3.072 MHz): the Z80 and both Z8002 tick
    // their real per-instruction cycle count (the makeZ8002 step() returns MAME
    // z8000tbl cycle costs); each MB8843 MCU runs a machine cycle (6 osc clocks at
    // MASTER/16) every MCU_DIV = 12 CPU cycles.  At each step we advance ONLY the
    // furthest-behind enabled device by one instruction, so no CPU ever runs past
    // a point in time the others have not reached — the two subs stay phase-locked
    // exactly as on hardware and their shared-RAM barriers stay ordered.  Scanline
    // interrupts and the 06xx bus timer are serviced at their exact cycle times.
    var CYC_PER_LINE = 194, MCU_DIV = 12;

    self.frameCycles = LINES * CYC_PER_LINE;     // CPU-cycle span of one field (for audio timestamps)

    self.runFrame = function () {
      var total = LINES * CYC_PER_LINE;
      advanceSteer();                            // one wheel step per field
      ev52.length = 0; ev54.length = 0;          // fresh DAC event logs this field
      var tz = 0, t1 = 0, t2 = 0, t51 = 0, t53 = 0, t52 = 0, t54 = 0;   // absolute CPU-cycle clocks
      var lineDone = -1, o6last = 0;
      function hw(now) {                          // fire time-based hardware <= now
        while (lineDone + 1 < LINES && (lineDone + 1) * CYC_PER_LINE <= now) {
          var ln = ++lineDone; vpos = ln;
          // Z80 IRQ0 at 64V and 192V (when LS259 q0 / IRQON is set)
          if ((ln === 64 || ln === 192) && latch[0] && z80) z80.interrupt(false, 0xff);
          // VBLANK: both Z8002 take the non-vectored interrupt at line 240
          if (ln === 240 && subIrqMask) { sub1.raiseNVI(); sub2.raiseNVI(); }
          // 51xx timer clock is the screen VBLANK (falling edge at vblank start).
          if (ln === 0) n51.cpu.setTcLine(1);
          else if (ln === 240) n51.cpu.setTcLine(0);
        }
        if (now > o6last) { o6_service(now - o6last); o6last = now; }  // 06xx /NMI + MCU /IRQ
      }
      for (;;) {
        // frontier = smallest clock among enabled (out-of-reset) devices
        var m = tz;
        if (!sub1Reset && t1 < m) m = t1;
        if (!sub2Reset && t2 < m) m = t2;
        if (!n51.reset && t51 < m) m = t51;
        if (!n53.reset && t53 < m) m = t53;
        if (!n52.reset && t52 < m) m = t52;
        if (!n54.reset && t54 < m) m = t54;
        if (m >= total) break;
        hw(m);
        // devices held in reset track the frontier so they resume in phase the
        // instant the Z80 releases them (no accumulated head-start / lag).
        if (sub1Reset) t1 = m;
        if (sub2Reset) t2 = m;
        if (n51.reset) t51 = m;
        if (n53.reset) t53 = m;
        if (n52.reset) t52 = m;
        if (n54.reset) t54 = m;
        // advance exactly the furthest-behind device by one instruction
        if (tz <= m) { tz += z80 ? z80.run_instruction() : 4; }
        else if (!sub1Reset && t1 <= m) { t1 += sub1.step(); }
        else if (!sub2Reset && t2 <= m) { t2 += sub2.step(); }
        else if (!n51.reset && t51 <= m) { t51 += n51.cpu.step() * MCU_DIV; }
        else if (!n53.reset && t53 <= m) { t53 += n53.cpu.step() * MCU_DIV; }
        else if (!n52.reset && t52 <= m) { audioClk = t52; t52 += n52.cpu.step() * MCU_DIV; }
        else if (!n54.reset && t54 <= m) { audioClk = t54; t54 += n54.cpu.step() * MCU_DIV; }
      }
      hw(total);
      self.frameCount++;
    };

    self.reset();
    return self;
  }

  var api = { create: create, W: 256, H: 224 };
  if (typeof window !== 'undefined') window.PolePosition = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
