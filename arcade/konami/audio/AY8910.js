export class AY8910 {
 static VOLUME_TABLE = (() => {
  const t = new Float32Array(16);

  for (let i = 1; i < 16; i++) {
   t[i] = Math.pow(10, ((i - 15) * 3) / 20);
  }

  return t;
 })();

 /*
  * Envelope shape table, indexed by register R13 bits [Continue, Attack,
  * Alternate, Hold]. Verified against the AY-3-8910 datasheet reference
  * table:
  *
  *   C A Alt H | Shape
  *   0 0 x x   | decay once, hold at 0        (values 0-3)
  *   0 1 x x   | attack once, hold at 0       (values 4-7)  <- FIXED
  *   1 0 0 0   | repeating decay              (value 8)
  *   1 0 0 1   | decay once, hold at 0        (value 9)
  *   1 0 1 0   | repeating triangle down-up   (value 10)
  *   1 0 1 1   | decay once, hold at 15       (value 11)
  *   1 1 0 0   | repeating attack             (value 12)
  *   1 1 0 1   | attack once, hold at 15      (value 13)
  *   1 1 1 0   | repeating triangle up-down   (value 14)
  *   1 1 1 1   | attack once, hold at 0       (value 15)     <- FIXED
  *
  * The previous version held values 4-7 and 15 at 15 instead of 0. This
  * caused any envelope-driven sound using those settings to sustain at
  * full volume instead of decaying to silence, which is audible as a
  * stuck note or a channel that never mutes.
  */
 static ENVELOPE_SHAPES = (() => {
  const shapes = [];

  const make = (fn) => {
   const s = new Uint8Array(32);

   for (let i = 0; i < 32; i++) {
    s[i] = fn(i);
   }

   return s;
  };

  const down = (i) => (i < 16 ? 15 - i : 0);
  const upHoldZero = (i) => (i < 16 ? i : 0);
  const upHoldMax = (i) => (i < 16 ? i : 15);
  const downHoldMax = (i) => (i < 16 ? 15 - i : 15);
  const sawDown = (i) => 15 - (i % 16);
  const sawUp = (i) => i % 16;
  const triDownUp = (i) => {
   const p = i % 32;
   return p < 16 ? 15 - p : p - 16;
  };
  const triUpDown = (i) => {
   const p = i % 32;
   return p < 16 ? p : 31 - p;
  };

  for (let i = 0; i < 4; i++) shapes.push(make(down)); // 0-3
  for (let i = 0; i < 4; i++) shapes.push(make(upHoldZero)); // 4-7  (fixed)

  shapes.push(make(sawDown)); // 8
  shapes.push(make(down)); // 9
  shapes.push(make(triDownUp)); // 10
  shapes.push(make(downHoldMax)); // 11
  shapes.push(make(sawUp)); // 12
  shapes.push(make(upHoldMax)); // 13
  shapes.push(make(triUpDown)); // 14
  shapes.push(make(upHoldZero)); // 15 (fixed)

  return shapes;
 })();

 constructor(
  audioCtx,
  clock = 1_789_750,
  portARead = null,
  portBRead = null,
  portAWrite = null,
  portBWrite = null
 ) {
  this.clock = clock;
  this.regs = new Uint8Array(16);
  this.addrLatch = 0;

  this.portARead = portARead;
  this.portBRead = portBRead;
  this.portAWrite = portAWrite;
  this.portBWrite = portBWrite;

  this.ctx = audioCtx;
  this.masterGain = null;
  this._started = false;
  this._envPhase = 0;
  this._envClock = 0;
  this._noiseClock = 0;
  this._noiseShift = 1;
  this._noiseBit = 1;
  this._toneClock = new Float64Array(3);
  this._toneBit = new Uint8Array(3).fill(1);
  this._sampleClock = 0;
  this._samples = [];
  this._sources = new Set();
  this._nextAudioTime = 0;

  if (!audioCtx) return;
  this.output = this.masterGain = audioCtx.createGain();
  this.masterGain.gain.setValueAtTime(0.16, audioCtx.currentTime);
  // Remove the PSG's DC component before sending PCM to the speakers.
  this._dcFilter = audioCtx.createBiquadFilter();
  this._dcFilter.type = "highpass";
  this._dcFilter.frequency.setValueAtTime(20, audioCtx.currentTime);
  this.masterGain.connect(this._dcFilter);
  this._dcFilter.connect(audioCtx.destination);
 }

 startAudio() {
  if (!this.ctx || this._started || this.ctx.state !== "running") return;
  this._started = true;
  this._samples.length = 0;
  this._nextAudioTime = this.ctx.currentTime + 0.03;
 }

 stopAudio() {
  this._started = false;
  this._samples.length = 0;
  for (const source of this._sources) {
   try { source.stop(); } catch {}
   source.disconnect();
  }
  this._sources.clear();
 }

 writeAddr(val) {
  this.addrLatch = val & 0x0f;
 }

 writeData(val) {
  const r = this.addrLatch;
  this.regs[r] = val & 0xff;

  if (r === 0x0d) {
   this._envPhase = 0;
   this._envClock = 0;

  }

  if (r === 0x0e && this.portAWrite) {
   this.portAWrite(val & 0xff);
  }

  if (r === 0x0f && this.portBWrite) {
   this.portBWrite(val & 0xff);
  }

 }

 readData() {
  if (this.addrLatch === 0x0e && this.portARead) {
   return this.portARead() & 0xff;
  }

  if (this.addrLatch === 0x0f && this.portBRead) {
   return this.portBRead() & 0xff;
  }

  return this.regs[this.addrLatch];
 }

 // Advance from actual sound-CPU instruction cycles, preserving register
 // changes within each frame instead of sampling only the final register state.
 tick(cycles) {
  if (!this.ctx || !this._started || this.ctx.state !== "running") return;
  const clocksPerSample = this.clock / this.ctx.sampleRate;
  this._sampleClock += cycles;
  while (this._sampleClock >= clocksPerSample) {
   this._sampleClock -= clocksPerSample;
   // Two sub-samples reduce aliasing when tone/noise changes within a sample.
   const half = clocksPerSample / 2;
   const sample = (this._renderSample(half) + this._renderSample(half)) / 2;
   this._samples.push(sample);
  }
 }

 _renderSample(clocks) {
  const noisePeriod = Math.max(1, this.regs[6] & 0x1f) * 16;
  this._noiseClock += clocks;
  while (this._noiseClock >= noisePeriod) {
   this._noiseClock -= noisePeriod;
   // AY 17-bit LFSR, feedback from bits 0 and 3, shared by all channels.
   this._noiseShift = (this._noiseShift >>> 1) |
    (((this._noiseShift ^ (this._noiseShift >>> 3)) & 1) << 16);
   this._noiseBit = this._noiseShift & 1;
  }

  const envPeriod = Math.max(1, (this.regs[12] << 8) | this.regs[11]) * 16;
  this._envClock += clocks;
  const envSteps = Math.floor(this._envClock / envPeriod);
  this._envClock %= envPeriod;
  const shape = this.regs[13] & 15;
  if (shape >= 8 && !(shape & 1)) {
   this._envPhase = (this._envPhase + envSteps) % 32;
  } else {
   this._envPhase = Math.min(31, this._envPhase + envSteps);
  }
  const envelope = AY8910.ENVELOPE_SHAPES[shape][this._envPhase];
  const mixer = this.regs[7];
  let sample = 0;
  for (let ch = 0; ch < 3; ch++) {
   const period = Math.max(1, ((this.regs[ch * 2 + 1] & 15) << 8) |
    this.regs[ch * 2]) * 8;
   this._toneClock[ch] += clocks;
   const edges = Math.floor(this._toneClock[ch] / period);
   this._toneClock[ch] %= period;
   this._toneBit[ch] ^= edges & 1;
   // Disabling a generator forces its gate high. The two gates are ANDed.
   const toneGate = (mixer & (1 << ch)) || this._toneBit[ch];
   const noiseGate = (mixer & (8 << ch)) || this._noiseBit;
   const volume = this.regs[8 + ch];
   const level = volume & 16 ? envelope : volume & 15;
   if (toneGate && noiseGate) sample += AY8910.VOLUME_TABLE[level];
  }
  return sample;
 }

 flushAudio() {
  if (!this.ctx || !this._started || this.ctx.state !== "running") {
   this._samples.length = 0;
   return;
  }
  if (!this._samples.length) return;
  const buffer = this.ctx.createBuffer(1, this._samples.length, this.ctx.sampleRate);
  buffer.getChannelData(0).set(this._samples);
  this._samples.length = 0;
  const now = this.ctx.currentTime;
  if (this._nextAudioTime < now || this._nextAudioTime > now + 0.15) {
   // Recover after a background pause without overlapping stale buffers.
   for (const pending of this._sources) {
    try { pending.stop(); } catch {}
    pending.disconnect();
   }
   this._sources.clear();
   this._nextAudioTime = now + 0.03;
  }
  const source = this.ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(this.masterGain);
  this._sources.add(source);
  source.onended = () => {
   this._sources.delete(source);
   source.disconnect();
  };
  source.start(this._nextAudioTime);
  this._nextAudioTime += buffer.duration;
 }
}

