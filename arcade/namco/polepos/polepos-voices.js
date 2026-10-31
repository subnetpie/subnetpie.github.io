/* polepos-voices.js — Pole Position analog sound path: the Namco 52xx voice, the
 * Namco 54xx noise and the discrete engine-sound section, mixed alongside the
 * Namco WSG.
 *
 * WHAT THIS IS. The 52xx (voice) and 54xx (noise) customs are real Fujitsu MCUs
 * run for real inside pole-position.js from their genuine ROMs; each streams a
 * 4-bit DAC value out of its output ports. The core time-stamps every DAC write
 * with the emitting MCU's absolute CPU-cycle clock into core.ev52 / core.ev54,
 * so this module reconstructs the piecewise-constant (sample-and-hold) DAC
 * waveform at the host audio rate and pushes it through the board's analog
 * back-end. The engine tone is the polepos_sound_device: an 8-slot wavetable in
 * the genuine engine ROM (pp1_15/pp1_16) read by a phase accumulator whose pitch
 * is the car RPM latch the game writes at $a200/$a300, then the three engine
 * op-amp filters.
 *
 * FAITHFULNESS. Ported directly from MAME (BSD-3-Clause) src/mame/namco:
 *   - polepos_a.cpp  — the engine wavetable synth (sound_stream_update), the
 *     filter2 biquads (setup / step / opamp_m_bandpass_setup) and the discrete
 *     netlist component values (polepos_discrete: DACs + channel filters);
 *   - namco52.cpp / namco54.cpp — the DAC output wiring reproduced in the core.
 * The biquads are evaluated at the host sample rate (their coefficients are a
 * function of sample rate, so this is exact, not a resample). The one documented
 * approximation is the DAC ladder: MAME's DISCRETE_DAC_R1 is modelled here as a
 * conductance-weighted 4-bit DAC (Thevenin open-circuit voltage of the real R
 * ladder), and the 52xx output op-amp rail clamp is applied symmetrically to
 * keep the mix AC-centred (MAME's single-supply half-wave clamp is removed
 * downstream by AC coupling anyway). The audio CONTENT — the speech samples, the
 * noise sequence, the engine pitch — is produced entirely by the real ROMs and
 * the real RPM latch; nothing here is a recorded clip or a canned pattern.
 */
(function (global) {
  'use strict';

  // ---- 2nd-order (biquad) filter — direct port of polepos_a.cpp filter2 -------
  var FILTER_LOWPASS = 0, FILTER_HIGHPASS = 1, FILTER_BANDPASS = 2;

  function Filter2() { this.a1 = this.a2 = this.b0 = this.b1 = this.b2 = 0; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  Filter2.prototype.reset = function () { this.x1 = this.x2 = this.y1 = this.y2 = 0; };
  // setup(sampleRate, type, fc, d=1/Q, gain)
  Filter2.prototype.setup = function (sr, type, fc, d, gain) {
    var two_over_T = 2 * sr;
    var two_over_T_squared = two_over_T * two_over_T;
    var w = sr * 2.0 * Math.tan(Math.PI * fc / sr);   // pre-warping
    var w_squared = w * w;
    var den = two_over_T_squared + d * w * two_over_T + w_squared;
    this.a1 = 2.0 * (-two_over_T_squared + w_squared) / den;
    this.a2 = (two_over_T_squared - d * w * two_over_T + w_squared) / den;
    var b0, b1, b2;
    if (type === FILTER_LOWPASS) { b0 = b2 = w_squared / den; b1 = 2.0 * b0; }
    else if (type === FILTER_BANDPASS) { b0 = d * w * two_over_T / den; b1 = 0.0; b2 = -b0; }
    else { b0 = b2 = two_over_T_squared / den; b1 = -2.0 * b0; }   // highpass
    this.b0 = b0 * gain; this.b1 = b1 * gain; this.b2 = b2 * gain;
  };
  // op-amp multiple-feedback band-pass -> (fc, d, gain), port of opamp_m_bandpass_setup
  Filter2.prototype.opampBandpass = function (sr, r1, r2, r3, c1, c2) {
    var r_in, gain;
    if (r2 === 0) { gain = 1; r_in = r1; }
    else { gain = r2 / (r1 + r2); r_in = 1.0 / (1.0 / r1 + 1.0 / r2); }
    var fc = 1.0 / (2 * Math.PI * Math.sqrt(r_in * r3 * c1 * c2));
    var d = (c1 + c2) / Math.sqrt(r3 / r_in * c1 * c2);
    gain *= -r3 / r_in * c2 / (c1 + c2);
    this.setup(sr, FILTER_BANDPASS, fc, d, gain);
  };
  Filter2.prototype.step = function (x0) {
    var y0 = -this.a1 * this.y1 - this.a2 * this.y2 + this.b0 * x0 + this.b1 * this.x1 + this.b2 * this.x2;
    this.x2 = this.x1; this.x1 = x0; this.y2 = this.y1; this.y1 = y0;
    return y0;
  };

  // ---- board constants (polepos_a.cpp) --------------------------------------
  var VREF = 5.0 * (1000.0 / (1500.0 + 1000.0));   // POLEPOS_VREF = 2.0 V
  var ENGINE_CLOCK = 24576000 / 8;                 // MASTER_CLOCK/8 = 3.072 MHz

  // engine output-mix resistors + volume table
  var R_FILT_OUT = [4700.0, 7500.0, 10000.0];
  var R_FILT_TOTAL = 1.0 / (1.0 / R_FILT_OUT[0] + 1.0 / R_FILT_OUT[1] + 1.0 / R_FILT_OUT[2]);
  var R166 = 1000.0, R167 = 2200.0, R168 = 4700.0;
  var R166_SH = 1.0 / (1.0 / R166 + 1.0 / 250), R167_SH = 1.0 / (1.0 / R166 + 1.0 / 250), R168_SH = 1.0 / (1.0 / R166 + 1.0 / 250);
  var VOLUME_TABLE = [
    (R168_SH + R167_SH + R166_SH + 2200) / 10000,
    (R168_SH + R167_SH + R166 + 2200) / 10000,
    (R168_SH + R167 + R166_SH + 2200) / 10000,
    (R168_SH + R167 + R166 + 2200) / 10000,
    (R168 + R167_SH + R166_SH + 2200) / 10000,
    (R168 + R167_SH + R166 + 2200) / 10000,
    (R168 + R167 + R166_SH + 2200) / 10000,
    (R168 + R167 + R166 + 2200) / 10000
  ];

  // conductance-weighted 4-bit R-ladder DAC (models DISCRETE_DAC_R1 open-circuit
  // voltage). resistors[0] is the LSB.  Returns a 16-entry lookup table 0..vON.
  function dacTable(resistors, vON) {
    var g = [1 / resistors[0], 1 / resistors[1], 1 / resistors[2], 1 / resistors[3]];
    var gtot = g[0] + g[1] + g[2] + g[3];
    var t = new Float64Array(16), code, b, s;
    for (code = 0; code < 16; code++) {
      s = 0;
      for (b = 0; b < 4; b++) { if (code & (1 << b)) s += g[b]; }
      t[code] = vON * s / gtot;
    }
    return t;
  }
  var DAC54 = dacTable([47000, 22000, 10000, 4700], 4);       // polepos_54xx_dac
  var DAC52 = dacTable([100000, 47000, 22000, 10000], 4);     // polepos_52xx_dac
  var DAC54_R = 1.0 / (1.0 / 47000 + 1.0 / 22000 + 1.0 / 10000 + 1.0 / 4700);

  // ---- output gains: convert board "volts" to Int16, balanced against the WSG -
  var GAIN_ENGINE = 3600, GAIN_VOICE = 5200, GAIN_NOISE = 2600;

  function PolePositionVoices(sampleRate, engineRom) {
    this.sr = sampleRate || 44100;
    this.engineRom = engineRom;                  // Uint8Array(0x4000), 8 x 0x800

    // 52xx voice chain (discrete CHANL4): highpass 100Hz d=1/.3, lowpass 1200Hz d=1/.8
    this.f52hp = new Filter2(); this.f52hp.setup(this.sr, FILTER_HIGHPASS, 100, 1.0 / 0.3, 1);
    this.f52lp = new Filter2(); this.f52lp.setup(this.sr, FILTER_LOWPASS, 1200, 1.0 / 0.8, 1);
    this.p52 = 0;                                 // held DAC code across fields

    // 54xx three channels (discrete CHANL1/2/3), each an op-amp MFB band-pass
    this.f54 = [new Filter2(), new Filter2(), new Filter2()];
    // CHANL1 <- OUT2 : r1=DAC_R+22k, r2=R125 12k, r3=R122 120k, C27=C28=.0022u
    this.f54[0].opampBandpass(this.sr, DAC54_R + 22000, 12000, 120000, 0.0022e-6, 0.0022e-6);
    // CHANL2 <- OUT1 : r1=DAC_R+15k, r2=R137 15k, r3=R134 120k, C29=C30=.022u
    this.f54[1].opampBandpass(this.sr, DAC54_R + 15000, 15000, 120000, 0.022e-6, 0.022e-6);
    // CHANL3 <- OUT0 : r1=DAC_R+22k, r2=R143 22k, r3=R140 180k, C33=C34=.047u
    this.f54[2].opampBandpass(this.sr, DAC54_R + 22000, 22000, 180000, 0.047e-6, 0.047e-6);
    this.o0 = 0; this.o1 = 0; this.o2 = 0;        // held DAC codes across fields

    // engine filters (polepos_sound_device m_filter_engine[])
    this.fEng = [new Filter2(), new Filter2(), new Filter2()];
    this.fEng[0].opampBandpass(this.sr, 220000, 33000, 390000, 0.01e-6, 0.01e-6);
    this.fEng[1].opampBandpass(this.sr, 150000, 22000, 330000, 0.0047e-6, 0.0047e-6);
    this.fEng[2].setup(this.sr, FILTER_HIGHPASS, 950, 1.0 / 0.707, 1);
    this.engPos = 0;                              // engine phase accumulator (<<12)

    // running peaks for diagnostics
    this.peak52 = 0; this.peak54 = 0; this.peakEng = 0;
  }

  PolePositionVoices.prototype.reset = function () {
    this.f52hp.reset(); this.f52lp.reset();
    this.f54[0].reset(); this.f54[1].reset(); this.f54[2].reset();
    this.fEng[0].reset(); this.fEng[1].reset(); this.fEng[2].reset();
    this.p52 = 0; this.o0 = this.o1 = this.o2 = 0; this.engPos = 0;
    this.peak52 = this.peak54 = this.peakEng = 0;
  };

  // Add `frames` stereo Int16 samples of (52xx + 54xx + engine) onto `out`
  // (interleaved L,R already holding the WSG).  Reads the DAC event logs and the
  // engine RPM latch straight off the running core.
  PolePositionVoices.prototype.mixInto = function (out, frames, core) {
    var cyc = core.frameCycles || 1;
    var ev52 = core.ev52, ev54 = core.ev54;
    var lat = core.engineLatch();
    var i, s;

    // ---- engine phase/step (sound_stream_update) ----
    var engOn = (lat.clson & 1) && (lat.lsb & 1);
    var msb = lat.msb & 63, lsb = lat.lsb & 62;
    var clock = (ENGINE_CLOCK / 16) * ((msb + 1) * 64 + lsb + 1) / (64 * 64);
    var estep = Math.floor(clock * 4096 / this.sr);
    var slot = (msb >> 3) & 7, ebase = slot * 0x800, evol = VOLUME_TABLE[slot];
    var erom = this.engineRom;

    var ep0 = this.fEng[0], ep1 = this.fEng[1], ep2 = this.fEng[2];
    var hp = this.f52hp, lp = this.f52lp, b0 = this.f54[0], b1 = this.f54[1], b2 = this.f54[2];

    var p52 = this.p52, e52i = 0;
    var o0 = this.o0, o1 = this.o1, o2 = this.o2, e54i = 0;
    var pos = this.engPos;
    var clampMaxLo = -1.5, clampMaxHi = 1.5;      // symmetric op-amp rail clamp (52xx)

    for (i = 0; i < frames; i++) {
      var sampCyc = (i + 1) * cyc / frames;

      // 52xx voice: consume DAC events up to this sample, hold last value
      while (e52i < ev52.length && ev52[e52i] < sampCyc) { p52 = ev52[e52i + 1]; e52i += 2; }
      var v52 = DAC52[p52 & 15] - VREF;
      v52 = hp.step(v52); v52 = lp.step(v52); v52 *= 0.5;
      if (v52 > clampMaxHi) v52 = clampMaxHi; else if (v52 < clampMaxLo) v52 = clampMaxLo;

      // 54xx noise: three channels through their band-passes, summed
      while (e54i < ev54.length && ev54[e54i] < sampCyc) { o0 = ev54[e54i + 1]; o1 = ev54[e54i + 2]; o2 = ev54[e54i + 3]; e54i += 4; }
      var n54 = b0.step(DAC54[o2 & 15]) + b1.step(DAC54[o1 & 15]) + b2.step(DAC54[o0 & 15]);

      // engine wavetable + filters
      var eng = 0;
      if (engOn) {
        var x0 = (3.4 / 255 * erom[ebase + ((pos >> 12) & 0x7ff)] - 2) * evol;
        var y, itot = 0;
        y = ep0.step(x0); if (y > 1.5) y = 1.5; else if (y < -2) y = -2; itot += y / R_FILT_OUT[0];
        y = ep1.step(x0); if (y > 1.5) y = 1.5; else if (y < -2) y = -2; itot += y / R_FILT_OUT[1];
        y = ep2.step(x0); if (y > 1.5) y = 1.5; else if (y < -2) y = -2; itot += y / R_FILT_OUT[2];
        eng = itot * R_FILT_TOTAL / 2;
        pos = (pos + estep) % 0x800000;
      } else {
        // keep the filters converging toward silence so re-enable is glitch-free
        ep0.step(0); ep1.step(0); ep2.step(0);
      }

      // diagnostics (pre-gain magnitudes)
      var a52 = v52 < 0 ? -v52 : v52; if (a52 > this.peak52) this.peak52 = a52;
      var a54 = n54 < 0 ? -n54 : n54; if (a54 > this.peak54) this.peak54 = a54;
      var aeng = eng < 0 ? -eng : eng; if (aeng > this.peakEng) this.peakEng = aeng;

      s = (v52 * GAIN_VOICE + n54 * GAIN_NOISE + eng * GAIN_ENGINE) | 0;
      var j = i * 2;
      var l = out[j] + s; if (l > 32767) l = 32767; else if (l < -32768) l = -32768; out[j] = l;
      var r = out[j + 1] + s; if (r > 32767) r = 32767; else if (r < -32768) r = -32768; out[j + 1] = r;
    }

    this.p52 = p52; this.o0 = o0; this.o1 = o1; this.o2 = o2; this.engPos = pos;
  };

  global.PolePositionVoices = PolePositionVoices;
  if (typeof module !== 'undefined' && module.exports) module.exports = PolePositionVoices;
})(typeof window !== 'undefined' ? window : globalThis);
