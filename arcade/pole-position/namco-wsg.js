/* namco-wsg.js — the shared Namco 3-voice WSG (Waveform Sound Generator).
 *
 * ONE self-contained implementation of the Namco wavetable sound chip used by
 * Pac-Man, Galaga, Dig Dug and Bosconian. It is the ENGINE; each board supplies
 * its own waveform-table DATA (and a couple of small options) at construction, so
 * the three emulators that used to carry near-identical private copies now drive
 * this single file instead.
 *
 * The chip: three independent voices, each with a 20-bit phase accumulator, a
 * 4-bit volume and a waveform selector that indexes one of the board's 32-sample,
 * 4-bit waveforms held in its sound PROM. The WSG runs at 3.072 MHz / 32 = 96 kHz;
 * every tick each voice does `accumulator += frequency` and emits
 * `waveform[wave][(accumulator>>15) & 31]`, and the voices are summed and scaled by
 * their volumes. We do NOT run an internal 96 kHz loop and resample — we advance
 * the accumulators at the host AudioContext rate directly, adding
 * `frequency * (96000 / sampleRate)` per output sample, so the pitch is exact and
 * no resampling is needed.
 *
 * Register map (the canonical Namco `pacman_sound_w` offset map, 0x00..0x1f; the
 * board translates its own sound base — Pac-Man $5040, Galaga/Dig Dug/Bosco
 * $6800 — to this offset before calling `write`). This ONE map serves every board:
 * the harbaum/galagino Dig Dug decode uses the exact same offsets, so there is no
 * separate "Dig Dug layout" — only its wider waveform table differs.
 *   0x05 / 0x0a / 0x0f : voice 1 / 2 / 3 waveform select
 *   0x10..0x14         : voice 1 frequency (five nibbles, 20-bit)
 *   0x15               : voice 1 volume (4 bits)
 *   0x16..0x19 / 0x1a  : voice 2 frequency (four nibbles, 16-bit) / volume
 *   0x1b..0x1e / 0x1f  : voice 3 frequency (four nibbles, 16-bit) / volume
 * Voices 2 and 3 lack the lowest frequency nibble on real hardware (its bits are
 * always 0), exactly as here. Only the low nibble of each write is latched.
 *
 * Per-board options — `new NamcoWSG(sampleRate, opts)`:
 *   opts.waveform  '82s126' (default) | 'digdug'    pick a built-in table, OR
 *   opts.waveTable [ raw 0..15 nibbles ]            an explicit flat table
 *                  (length = 32 * waveCount; sample = table[(wave<<5)|phase])
 *   opts.waveMask  waveform-select mask             (default waveCount-1: 7 for the
 *                  eight-waveform 82s126, 15 for Dig Dug's sixteen)
 *   opts.gain      output gain                      (default 90)
 *   opts.enabled   initial mixer-enable             (default false; boards without a
 *                  sound-enable latch — Dig Dug, Bosco — pass true)
 *   opts.skipSilentAdvance  freeze a voice's phase   (default false; Dig Dug passes
 *                  accumulator while its volume is 0   true to match its own render)
 *
 * Built-in tables:
 *   '82s126' — the Pac-Man / Bosconian sound PROM (`82s126.1m`), the standard MAME
 *              contents: 256 bytes = 8 waveforms x 32 samples, low nibble used. This
 *              is the REAL hardware wavetable, shared by Pac-Man and Bosconian.
 *   'digdug' — a faithful SYNTHESIZED 16-waveform set (band-limited sine, triangle,
 *              saw, pulse and mixed shapes, quantised to 4 bits). The genuine Dig Dug
 *              waveform PROMs (Namco 136007.109/.110) are not bundled, so Dig Dug
 *              uses this; pitch/rhythm/note choice come from the game, only the
 *              precise timbre of a waveform index differs from the original PROM.
 */
(function (global) {
  'use strict';

  var ACC_MASK = 0xFFFFF;   // 20-bit accumulator
  var ACC_MOD = ACC_MASK + 1;
  var WSG_CLOCK = 96000;    // 3.072 MHz / 32

  // ---- built-in waveform tables (raw 0..15 nibbles; centred by -8 at render) ----

  // Pac-Man / Bosconian `82s126.1m` — the real Namco sound PROM (8 x 32).
  var WAVE_82S126 = [
    7,9,10,11,12,13,13,14,14,14,13,13,12,11,10,9,7,5,4,3,2,1,1,0,0,0,1,1,2,3,4,5,
    7,12,14,14,13,11,9,10,11,11,10,9,6,4,3,5,7,9,11,10,8,5,4,3,3,4,5,3,1,0,0,2,
    7,10,12,13,14,13,12,10,7,4,2,1,0,1,2,4,7,11,13,14,13,11,7,3,1,0,1,3,7,14,7,0,
    7,13,11,8,11,13,9,6,11,14,12,7,9,10,6,2,7,12,8,4,5,7,2,0,3,8,5,1,3,6,3,1,
    0,8,15,7,1,8,14,7,2,8,13,7,3,8,12,7,4,8,11,7,5,8,10,7,6,8,9,7,7,8,8,7,
    7,8,6,9,5,10,4,11,3,12,2,13,1,14,0,15,0,15,1,14,2,13,3,12,4,11,5,10,6,9,7,8,
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
  ];

  // Dig Dug — synthesized 16 x 32 set, returned as a flat array of raw 0..15
  // nibbles so the render path centres it (-8) exactly like the real PROM.
  function buildDigDugTable() {
    var SAMPLES = 32, WAVES = 16;
    var TWO_PI = Math.PI * 2;
    function quant(v) {                       // v in [-1,1] -> raw nibble 0..15
      var raw = Math.round(7.5 + 7.5 * v);
      if (raw < 0) raw = 0;
      if (raw > 15) raw = 15;
      return raw;
    }
    var shapes = [
      function (t) { return Math.sin(TWO_PI * t); },                        //  0 sine
      function (t) { return 1 - 4 * Math.abs(t - 0.5); },                   //  1 triangle
      function (t) { return 2 * t - 1; },                                   //  2 saw up
      function (t) { return 1 - 2 * t; },                                   //  3 saw down
      function (t) { return t < 0.5 ? 1 : -1; },                            //  4 square
      function (t) { return t < 0.25 ? 1 : -1; },                          //  5 pulse 25%
      function (t) { return t < 0.125 ? 1 : -1; },                         //  6 pulse 12.5%
      function (t) { return Math.sin(2 * TWO_PI * t); },                   //  7 octave sine
      function (t) { return Math.abs(Math.sin(Math.PI * t)) * 2 - 1; },    //  8 rectified sine
      function (t) { return 0.7 * Math.sin(TWO_PI * t) + 0.3 * Math.sin(3 * TWO_PI * t); }, // 9 +3rd
      function (t) { return 0.7 * Math.sin(TWO_PI * t) + 0.3 * Math.sin(2 * TWO_PI * t); }, // 10 +2nd
      function (t) { return (Math.floor(t * 8) / 3.5) - 1; },              // 11 staircase
      function (t) { return 1 - 2 * Math.abs(2 * (t % 0.5) - 0.5) - 0; },  // 12 double triangle
      function (t) { return t < 0.0625 ? 1 : -1; },                        // 13 narrow pulse
      function (t) { return Math.cos(TWO_PI * t); },                       // 14 cosine
      function (t) { return (2 * ((t * 2) % 1)) - 1; }                     // 15 double saw
    ];
    var flat = new Array(WAVES * SAMPLES);
    var w = 0, i = 0;
    for (w = 0; w < WAVES; w++) {
      var fn = shapes[w];
      for (i = 0; i < SAMPLES; i++) {
        var t = i / SAMPLES;
        flat[(w << 5) | i] = quant(fn(t));
      }
    }
    return flat;
  }

  function resolveTable(opts) {
    if (opts.waveTable) return opts.waveTable;
    if (opts.waveform === 'digdug') return buildDigDugTable();
    return WAVE_82S126;
  }

  function NamcoWSG(sampleRate, opts) {
    opts = opts || {};
    this.sampleRate = sampleRate || 44100;
    // accumulator increment per OUTPUT sample = freqReg * (96000 / sampleRate)
    this.ticksPerSample = WSG_CLOCK / this.sampleRate;
    this.waveTable = resolveTable(opts);
    this.waveCount = this.waveTable.length >> 5;   // 32 samples per waveform
    this.waveMask = (opts.waveMask === undefined) ? (this.waveCount - 1) : opts.waveMask;
    this.gain = (opts.gain === undefined) ? 90 : opts.gain;
    this.enabled = opts.enabled ? 1 : 0;
    this.skipSilent = opts.skipSilentAdvance ? 1 : 0;
    var v = [];
    var i = 0;
    for (i = 0; i < 3; i++) {
      v.push({ freq: 0, vol: 0, wave: 0, acc: 0 });
    }
    this.voices = v;
  }

  // Sound-enable latch (Pac-Man's $5001, bit 0). When clear, the mixer is muted.
  NamcoWSG.prototype.setEnable = function (on) {
    this.enabled = on ? 1 : 0;
  };

  NamcoWSG.prototype.reset = function () {
    var i = 0;
    for (i = 0; i < 3; i++) {
      this.voices[i].freq = 0;
      this.voices[i].vol = 0;
      this.voices[i].wave = 0;
      this.voices[i].acc = 0;
    }
  };

  // Set a voice's frequency register / volume / waveform directly (leaving its
  // phase accumulator running so pitch stays continuous). Used by a board that
  // sequences the chip itself, e.g. Bosconian's stand-in attract demo.
  NamcoWSG.prototype.setVoiceRaw = function (i, freqReg, vol, wave) {
    var v = this.voices[i];
    v.freq = freqReg & ACC_MASK;
    v.vol = vol & 0x0f;
    v.wave = wave & this.waveMask;
  };

  // Write one sound register. `off` is the offset from the board's sound base
  // (0x00..0x1f); the Namco WSG only latches the low nibble of the data bus.
  NamcoWSG.prototype.write = function (off, val) {
    var n = val & 0x0f;
    var v = this.voices;
    var m = this.waveMask;
    switch (off & 0x1f) {
      case 0x05: v[0].wave = n & m; break;
      case 0x0a: v[1].wave = n & m; break;
      case 0x0f: v[2].wave = n & m; break;
      // voice 1 frequency (20-bit, five nibbles)
      case 0x10: v[0].freq = (v[0].freq & ~0x0000f) | n; break;
      case 0x11: v[0].freq = (v[0].freq & ~0x000f0) | (n << 4); break;
      case 0x12: v[0].freq = (v[0].freq & ~0x00f00) | (n << 8); break;
      case 0x13: v[0].freq = (v[0].freq & ~0x0f000) | (n << 12); break;
      case 0x14: v[0].freq = (v[0].freq & ~0xf0000) | (n << 16); break;
      case 0x15: v[0].vol = n; break;
      // voice 2 frequency (16-bit, four nibbles; lowest nibble is always 0)
      case 0x16: v[1].freq = (v[1].freq & ~0x000f0) | (n << 4); break;
      case 0x17: v[1].freq = (v[1].freq & ~0x00f00) | (n << 8); break;
      case 0x18: v[1].freq = (v[1].freq & ~0x0f000) | (n << 12); break;
      case 0x19: v[1].freq = (v[1].freq & ~0xf0000) | (n << 16); break;
      case 0x1a: v[1].vol = n; break;
      // voice 3 frequency (16-bit, four nibbles)
      case 0x1b: v[2].freq = (v[2].freq & ~0x000f0) | (n << 4); break;
      case 0x1c: v[2].freq = (v[2].freq & ~0x00f00) | (n << 8); break;
      case 0x1d: v[2].freq = (v[2].freq & ~0x0f000) | (n << 12); break;
      case 0x1e: v[2].freq = (v[2].freq & ~0xf0000) | (n << 16); break;
      case 0x1f: v[2].vol = n; break;
    }
  };

  // Render `frames` output samples into `out` as interleaved-stereo Int16
  // (mono WSG duplicated to L and R). `out` must have room for frames*2 shorts.
  NamcoWSG.prototype.render = function (out, frames) {
    var v = this.voices;
    var tps = this.ticksPerSample;
    var tab = this.waveTable;
    var skip = this.skipSilent;
    var g = this.enabled ? this.gain : 0;
    var v0 = v[0], v1 = v[1], v2 = v[2];
    var i0 = v0.freq * tps, i1 = v1.freq * tps, i2 = v2.freq * tps;
    var a0 = v0.acc, a1 = v1.acc, a2 = v2.acc;
    var b0 = v0.wave << 5, b1 = v1.wave << 5, b2 = v2.wave << 5;
    var vol0 = v0.vol, vol1 = v1.vol, vol2 = v2.vol;
    var i = 0, j = 0;
    for (i = 0; i < frames; i++) {
      var mix = 0;
      if (!skip || vol0) { a0 = (a0 + i0) % ACC_MOD; mix += (tab[b0 | ((a0 >> 15) & 31)] - 8) * vol0; }
      if (!skip || vol1) { a1 = (a1 + i1) % ACC_MOD; mix += (tab[b1 | ((a1 >> 15) & 31)] - 8) * vol1; }
      if (!skip || vol2) { a2 = (a2 + i2) % ACC_MOD; mix += (tab[b2 | ((a2 >> 15) & 31)] - 8) * vol2; }
      var s = (mix * g) | 0;
      if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
      out[j++] = s;
      out[j++] = s;
    }
    v0.acc = a0; v1.acc = a1; v2.acc = a2;
    return out;
  };

  global.NamcoWSG = NamcoWSG;
  if (typeof module !== 'undefined') module.exports = NamcoWSG;
})(typeof window !== 'undefined' ? window : this);
