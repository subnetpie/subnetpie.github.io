// Shared machine-side Namco 54XX DAC/discrete renderer.
// Browser APIs are deliberately excluded. MAME 0.289 galaga_a.cpp and
// discrete filter/mixer implementations are the authoritative reference.
export class Namco54xxDac {
  static MASTER_CLOCK = 18_432_000;
  static CHANNEL_COUNT = 3;
  static VREF = 5 * (2200 / (3300 + 2200));
  static DAC_RESISTORS = Object.freeze([47000, 22000, 10000, 4700]);
  static DAC_R = 1 / Namco54xxDac.DAC_RESISTORS.reduce((g, r) => g + 1 / r, 0);
  static GALAGA = Object.freeze({
    channels: Object.freeze([
      Object.freeze({ channel: 2, r1: Namco54xxDac.DAC_R + 100000, r3: 22000, rF: 220000, c1: 1e-9, c2: 1e-9, mixR: 33000 }),
      Object.freeze({ channel: 1, r1: Namco54xxDac.DAC_R + 47000,  r3: 10000, rF: 150000, c1: 1e-8, c2: 1e-8, mixR: 33000 }),
      Object.freeze({ channel: 0, r1: Namco54xxDac.DAC_R + 150000, r3: 22000, rF: 470000, c1: 1e-8, c2: 1e-8, mixR: 10000 })
    ]),
    mixerRF: 3300,
    mixerCAmp: 1e-7,
    gain: 40800,
    routeGain: 0.90,
    pcmScale: 1 / 32768
  });

  constructor({ sampleRate = 192000, masterClock = Namco54xxDac.MASTER_CLOCK, routing = Namco54xxDac.GALAGA } = {}) {
    this.sampleRate = sampleRate;
    this.masterClock = masterClock;
    this.routing = routing;
    this.channelData = new Uint8Array(Namco54xxDac.CHANNEL_COUNT);
    this.renderState = new Uint8Array(Namco54xxDac.CHANNEL_COUNT);
    this.events = [];
    this.filters = Array.from({ length: Namco54xxDac.CHANNEL_COUNT }, () => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
    this.coefficients = new Array(Namco54xxDac.CHANNEL_COUNT);
    for (const spec of routing.channels) this.coefficients[spec.channel] = this._makeOpAmpBandPass(spec);
    this.mixerCapAmp = 0;
    this.mixerAmpExponent = 1 - Math.exp(-1 / (100000 * routing.mixerCAmp * sampleRate));
  }

  reset() {
    this.channelData.fill(0);
    this.renderState.fill(0);
    this.events.length = 0;
    for (const f of this.filters) f.x1 = f.x2 = f.y1 = f.y2 = 0;
    this.mixerCapAmp = 0;
  }

  nibbleToVoltage(nibble) {
    let current = 0;
    for (let bit = 0; bit < 4; bit++)
      if (nibble & (1 << bit)) current += 4 / Namco54xxDac.DAC_RESISTORS[bit];
    return current * Namco54xxDac.DAC_R;
  }

  writeChannel(channel, value, masterTick = 0, force = false) {
    const ch = channel | 0;
    if (ch < 0 || ch >= Namco54xxDac.CHANNEL_COUNT) return false;
    const next = value & 0x0f;
    if (!force && this.channelData[ch] === next) return false;
    this.channelData[ch] = next;
    this.events.push({ tick: Math.max(0, Math.floor(Number(masterTick) || 0)), channel: ch, value: next });
    return true;
  }

  synchronizeState(masterTick = 0) {
    for (let ch = 0; ch < Namco54xxDac.CHANNEL_COUNT; ch++)
      this.writeChannel(ch, this.channelData[ch], masterTick, true);
  }

  render(out, startTick, endTick) {
    out.fill(0);
    if (!out.length || endTick <= startTick) return out;
    this.events.sort((a, b) => a.tick - b.tick);
    let eventIndex = 0;
    const state = this.renderState;
    while (eventIndex < this.events.length && this.events[eventIndex].tick <= startTick) {
      const e = this.events[eventIndex++]; state[e.channel] = e.value;
    }
    const span = endTick - startTick;
    for (let i = 0; i < out.length; i++) {
      const tick = startTick + span * i / out.length;
      while (eventIndex < this.events.length && this.events[eventIndex].tick <= tick) {
        const e = this.events[eventIndex++]; state[e.channel] = e.value;
      }

      // MAME galaga_discrete: three 54XX resistor DACs -> three clipped
      // 1M op-amp band-pass stages -> 33k/33k/10k inverting mixer.
      let current = 0;
      for (const spec of this.routing.channels) {
        const voltage = this.nibbleToVoltage(state[spec.channel]);
        const filtered = this._filter(spec.channel, voltage);
        current += (Namco54xxDac.VREF - filtered) / spec.mixR;
      }
      let mixed = current * this.routing.mixerRF;

      // DISCRETE_MIXER cAmp=0.1uF uses a 100k assumed output impedance.
      this.mixerCapAmp += (mixed - this.mixerCapAmp) * this.mixerAmpExponent;
      mixed -= this.mixerCapAmp;
      out[i] = mixed * this.routing.gain * this.routing.routeGain * this.routing.pcmScale;
    }
    let cut = 0;
    while (cut < this.events.length && this.events[cut].tick <= endTick) cut++;
    if (cut) this.events.splice(0, cut);
    this.renderState.set(state);
    return out;
  }

  _makeOpAmpBandPass(spec) {
    const rTotal = 1 / (1 / spec.r1 + (spec.r3 ? 1 / spec.r3 : 0));
    const fc = 1 / (2 * Math.PI * Math.sqrt(rTotal * spec.rF * spec.c1 * spec.c2));
    const damp = (spec.c1 + spec.c2) / Math.sqrt((spec.rF / rTotal) * spec.c1 * spec.c2);
    const gain = -(spec.rF / rTotal) * spec.c2 / (spec.c1 + spec.c2);
    const twoOverT = 2 * this.sampleRate;
    const wc = this.sampleRate * 2 * Math.tan(Math.PI * fc / this.sampleRate);
    const wc2 = wc * wc;
    const t2 = twoOverT * twoOverT;
    const den = t2 + damp * wc * twoOverT + wc2;
    const b0 = damp * wc * twoOverT / den * gain;
    return {
      a1: 2 * (-t2 + wc2) / den,
      a2: (t2 - damp * wc * twoOverT + wc2) / den,
      b0, b1: 0, b2: -b0
    };
  }

  _filter(channel, input) {
    const c = this.coefficients[channel], s = this.filters[channel];
    if (!c) return input;
    // MAME first Millmans the input around VREF, then applies the filter.
    const v = (input - Namco54xxDac.VREF) / this.routing.channels.find(x => x.channel === channel).r1;
    const spec = this.routing.channels.find(x => x.channel === channel);
    const rTotal = 1 / (1 / spec.r1 + (spec.r3 ? 1 / spec.r3 : 0));
    const x = v * rTotal;
    let y = -c.a1 * s.y1 - c.a2 * s.y2 + c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 + Namco54xxDac.VREF;
    if (y > 3.5) y = 3.5; // MAME OP_AMP_VP_RAIL_OFFSET = 1.5V from the 5V rail
    if (y < 0) y = 0;
    s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y - Namco54xxDac.VREF;
    return y;
  }
}
