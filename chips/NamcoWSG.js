// Namco waveform sound generator hardware model.
// MAME 0.289 namco.cpp/namco.h is the behavioral reference.
// This module deliberately contains no Web Audio or browser lifecycle code.

class NamcoWSGVoice {
  constructor() {
    this.volume = new Int32Array(4);
    this.reset();
  }
  reset() {
    this.frequency = 0;
    this.counter = 0;
    this.volume.fill(0);
    this.waveformSelect = 0;
    this.noiseSw = 0;
    this.noiseState = 0;
    this.noiseSeed = 1;
    this.noiseCounter = 0;
    this.noiseHold = 0;
  }
}

export class NamcoWSG {
  static VARIANT_3_VOICE = "3voice";
  static VARIANT_POLEPOS = "polepos";
  static INTERNAL_RATE = 192000;

  constructor({ variant = NamcoWSG.VARIANT_3_VOICE, clock, waveformProm } = {}) {
    if (!(waveformProm instanceof Uint8Array) || waveformProm.length < 0x100)
      throw new TypeError("NamcoWSG requires a 0x100-byte waveform PROM");

    this.variant = variant;
    this.voiceCount = variant === NamcoWSG.VARIANT_POLEPOS ? 8 : 3;
    this.outputCount = variant === NamcoWSG.VARIANT_POLEPOS ? 4 : 1;
    this.clock = clock ?? (variant === NamcoWSG.VARIANT_POLEPOS ? 24000 : 96000);
    this.prom = waveformProm;
    this.regs = new Uint8Array(variant === NamcoWSG.VARIANT_POLEPOS ? 0x40 : 0x20);
    this.voices = Array.from({ length: this.voiceCount }, () => new NamcoWSGVoice());
    this.soundEnabled = true;
    // MAME stream-update bridge: drivers may bracket a machine-time interval
    // and update the current CPU/master time before executing each instruction.
    // A register write then renders the old state through that instant first.
    this.timedClock = 0;
    this.timedPosition = 0;
    this.timedSampleFraction = 0;
    this.timedChunks = [];
    this.configureClock();
  }

  configureClock() {
    let clock = this.clock;
    let multiple = 0;
    while (clock < NamcoWSG.INTERNAL_RATE) {
      clock *= 2;
      multiple++;
    }
    this.namcoClock = clock;
    this.fracBits = multiple + 15;
    this.sampleRate = clock; // MAME stream rate
  }

  reset() {
    this.regs.fill(0);
    for (const voice of this.voices) voice.reset();
    // MAME starts enabled; reset does not turn this into browser mute state.
    this.soundEnabled = true;
  }

  soundEnable(state) { this.soundEnabled = !!state; }

  beginTimedInterval(machineClock) {
    this.timedClock = Number(machineClock) || 0;
    this.timedPosition = 0;
    this.timedSampleFraction = 0;
    this.timedChunks.length = 0;
  }

  setMachineTime(machineCycles) {
    if (!this.timedClock) return;
    const target = Math.max(this.timedPosition, Number(machineCycles) || 0);
    this._streamUpdate(target);
  }

  endTimedInterval(machineCycles) {
    if (this.timedClock) this._streamUpdate(Number(machineCycles) || 0);
  }

  _streamUpdate(targetCycles) {
    if (!this.timedClock || targetCycles <= this.timedPosition) return;
    const delta = targetCycles - this.timedPosition;
    this.timedPosition = targetCycles;
    this.timedSampleFraction += delta * this.sampleRate / this.timedClock;
    const count = Math.floor(this.timedSampleFraction);
    this.timedSampleFraction -= count;
    if (!count) return;
    const pcm = new Float32Array(count);
    this.renderMono(pcm);
    this.timedChunks.push(pcm);
  }

  drainTimedMono() {
    let count = 0;
    for (const chunk of this.timedChunks) count += chunk.length;
    const out = new Float32Array(count);
    let offset = 0;
    for (const chunk of this.timedChunks) { out.set(chunk, offset); offset += chunk.length; }
    this.timedChunks.length = 0;
    return out;
  }

  read(offset) { return this.regs[offset & (this.regs.length - 1)]; }

  write(offset, data) {
    // Equivalent to MAME's m_stream->update() before changing a WSG register.
    // setMachineTime() supplies the current machine time from the driver.
    if (this.timedClock) this._streamUpdate(this.timedPosition);
    if (this.variant === NamcoWSG.VARIANT_POLEPOS)
      this.poleposSoundWrite(offset, data);
    else
      this.pacmanSoundWrite(offset, data);
  }

  pacmanSoundWrite(offset, data) {
    offset &= 0x1f;
    data &= 0x0f;
    if (this.regs[offset] === data) return;
    this.regs[offset] = data;

    let ch;
    if (offset < 0x10) ch = Math.trunc((offset - 5) / 5);
    else if (offset === 0x10) ch = 0;
    else ch = Math.trunc((offset - 0x11) / 5);
    if (ch < 0 || ch >= 3) return;

    const voice = this.voices[ch];
    switch (offset - ch * 5) {
      case 0x05:
        voice.waveformSelect = data & 7;
        break;
      case 0x10:
      case 0x11:
      case 0x12:
      case 0x13:
      case 0x14:
        voice.frequency = ch === 0 ? this.regs[0x10] : 0;
        voice.frequency += this.regs[ch * 5 + 0x11] << 4;
        voice.frequency += this.regs[ch * 5 + 0x12] << 8;
        voice.frequency += this.regs[ch * 5 + 0x13] << 12;
        voice.frequency += this.regs[ch * 5 + 0x14] << 16;
        voice.frequency >>>= 0;
        break;
      case 0x15:
        voice.volume[0] = data;
        break;
    }
  }

  poleposSoundWrite(offset, data) {
    offset &= 0x3f;
    data &= 0xff;
    if (this.regs[offset] === data) return;
    this.regs[offset] = data;

    const ch = (offset & 0x1f) >> 2;
    const voice = this.voices[ch];
    switch (offset & 0x23) {
      case 0x00:
      case 0x01:
        voice.frequency = (this.regs[ch * 4] | (this.regs[ch * 4 + 1] << 8)) >>> 0;
        break;
      case 0x23:
        voice.waveformSelect = data & 7;
        // fall through
      case 0x02:
      case 0x03:
        voice.volume[0] = this.regs[ch * 4 + 3] >> 4;
        voice.volume[1] = this.regs[ch * 4 + 3] & 0x0f;
        voice.volume[2] = this.regs[ch * 4 + 0x23] >> 4;
        voice.volume[3] = this.regs[ch * 4 + 2] >> 4;
        if (this.regs[ch * 4 + 0x23] & 8) voice.volume.fill(0);
        break;
    }
  }

  waveform(position) {
    // NAMCO_WSG and POLEPOS_WSG use unpacked waveform data: low nibble only.
    return (this.prom[position & 0xff] & 0x0f) - 8;
  }

  renderMono(out) {
    out.fill(0);
    if (!this.soundEnabled) return out;
    const mixRes = 128 * this.voiceCount;
    for (const voice of this.voices) {
      const volume = voice.volume[0];
      if (!volume) continue;
      for (let i = 0; i < out.length; i++) {
        const pos = (voice.counter >>> this.fracBits) & 0x1f;
        out[i] += this.waveform((voice.waveformSelect << 5) + pos) * volume / mixRes;
        voice.counter = (voice.counter + voice.frequency) >>> 0;
      }
    }
    return out;
  }

  renderOutputs(outputs) {
    if (this.variant !== NamcoWSG.VARIANT_POLEPOS) {
      const mono = Array.isArray(outputs) ? outputs[0] : outputs;
      return this.renderMono(mono);
    }
    if (!Array.isArray(outputs) || outputs.length < 4)
      throw new TypeError("Pole Position WSG requires four output buffers");
    const count = outputs[0].length;
    for (let o = 0; o < 4; o++) outputs[o].fill(0);
    if (!this.soundEnabled) return outputs;
    const mixRes = 128 * this.voiceCount;
    for (const voice of this.voices) {
      let counter = voice.counter >>> 0;
      for (let o = 0; o < 4; o++) {
        const volume = voice.volume[o];
        if (!volume) continue;
        let c = counter;
        const out = outputs[o];
        for (let i = 0; i < count; i++) {
          const pos = (c >>> this.fracBits) & 0x1f;
          out[i] += this.waveform((voice.waveformSelect << 5) + pos) * volume / mixRes;
          c = (c + voice.frequency) >>> 0;
        }
        counter = c;
      }
      voice.counter = counter;
    }
    return outputs;
  }

  render(out) {
    if (this.variant === NamcoWSG.VARIANT_POLEPOS)
      throw new Error("Pole Position WSG has four hardware outputs; use renderOutputs()");
    return this.renderMono(out);
  }
}

export class PolePositionWSG extends NamcoWSG {
  constructor(sampleRate, waveformProm, clock = 24000) {
    // sampleRate is retained in the compatibility signature only.
    void sampleRate;
    super({ variant: NamcoWSG.VARIANT_POLEPOS, clock, waveformProm });
  }
}
