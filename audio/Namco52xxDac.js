// Shared machine-side Namco 52XX DAC renderer.
// Browser APIs are deliberately excluded. MAME 0.289 galaga_a.cpp
// (bosco_discrete) and the discrete filter implementation are authoritative.
export class Namco52xxDac {
  static MASTER_CLOCK = 18_432_000;
  static DAC_RESISTORS = Object.freeze([100000, 47000, 22000, 10000]);
  static DAC_R = 1 / Namco52xxDac.DAC_RESISTORS.reduce((g, r) => g + 1 / r, 0);

  constructor({ sampleRate = 48000, masterClock = Namco52xxDac.MASTER_CLOCK } = {}) {
    this.sampleRate = sampleRate;
    this.masterClock = masterClock;
    this.value = 0;
    this.renderValue = 0;
    this.events = [];
    this.highPass = this._makeFilter2(80, 1 / 0.3, "highpass");
    this.lowPass = this._makeFilter2(2400, 1 / 0.9, "lowpass");
    this.highPassState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    this.lowPassState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  }

  reset() {
    this.value = 0;
    this.renderValue = 0;
    this.events.length = 0;
    Object.assign(this.highPassState, { x1: 0, x2: 0, y1: 0, y2: 0 });
    Object.assign(this.lowPassState, { x1: 0, x2: 0, y1: 0, y2: 0 });
  }

  write(value, masterTick = 0, force = false) {
    const next = value & 0x0f;
    if (!force && this.value === next) return false;
    this.value = next;
    this.events.push({
      tick: Math.max(0, Math.floor(Number(masterTick) || 0)),
      value: next
    });
    return true;
  }

  // Compatibility with the 52XX P-port terminology used by the device.
  pushNibble(value, masterTick = 0) {
    return this.write(value, masterTick);
  }

  synchronizeState(masterTick = 0) {
    this.write(this.value, masterTick, true);
  }

  nibbleToVoltage(nibble) {
    let current = 0;
    for (let bit = 0; bit < 4; bit++)
      if (nibble & (1 << bit)) current += 4 / Namco52xxDac.DAC_RESISTORS[bit];
    return current * Namco52xxDac.DAC_R;
  }

  render(out, startTick, endTick) {
    out.fill(0);
    if (!out.length || endTick <= startTick) return out;

    this.events.sort((a, b) => a.tick - b.tick);
    let eventIndex = 0;
    let state = this.renderValue;
    while (eventIndex < this.events.length && this.events[eventIndex].tick <= startTick)
      state = this.events[eventIndex++].value;

    const span = endTick - startTick;
    for (let i = 0; i < out.length; i++) {
      const tick = startTick + span * i / out.length;
      while (eventIndex < this.events.length && this.events[eventIndex].tick <= tick)
        state = this.events[eventIndex++].value;

      // MAME bosco_discrete:
      // 4-bit 100k/47k/22k/10k DAC -> 80 Hz FILTER2 HP
      // -> 2400 Hz FILTER2 LP -> gain 0.25.
      let sample = this.nibbleToVoltage(state);
      sample = this._filter(sample, this.highPass, this.highPassState);
      sample = this._filter(sample, this.lowPass, this.lowPassState);
      out[i] = sample * 0.25;
    }

    let cut = 0;
    while (cut < this.events.length && this.events[cut].tick <= endTick) cut++;
    if (cut) this.events.splice(0, cut);
    this.renderValue = state;
    return out;
  }

  _makeFilter2(fc, damp, type) {
    const twoOverT = 2 * this.sampleRate;
    const wc = this.sampleRate * 2 * Math.tan(Math.PI * fc / this.sampleRate);
    const t2 = twoOverT * twoOverT;
    const wc2 = wc * wc;
    const den = t2 + damp * wc * twoOverT + wc2;
    const c = {
      a1: 2 * (-t2 + wc2) / den,
      a2: (t2 - damp * wc * twoOverT + wc2) / den,
      b0: 0, b1: 0, b2: 0
    };
    if (type === "lowpass") {
      c.b0 = c.b2 = wc2 / den;
      c.b1 = 2 * c.b0;
    } else if (type === "highpass") {
      c.b0 = c.b2 = t2 / den;
      c.b1 = -2 * c.b0;
    }
    return c;
  }

  _filter(input, c, s) {
    const output =
      -c.a1 * s.y1 - c.a2 * s.y2 +
      c.b0 * input + c.b1 * s.x1 + c.b2 * s.x2;
    s.x2 = s.x1;
    s.x1 = input;
    s.y2 = s.y1;
    s.y1 = output;
    return output;
  }
}
