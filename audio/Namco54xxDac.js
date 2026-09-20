// Shared machine-side Namco 54XX DAC renderer.
// Browser APIs are deliberately excluded. MAME 0.289 discrete audio is the reference.
export class Namco54xxDac {
  static MASTER_CLOCK = 18_432_000;
  static CHANNEL_COUNT = 3;

  static GALAGA = Object.freeze({
    outputGain: 0.16,
    channels: Object.freeze([
      Object.freeze({ channel: 2, frequency: 2520.9816921671772, q: 1.7423774640682894, gain: 0.1505 }),
      Object.freeze({ channel: 1, frequency: 450.43388318211043, q: 2.1226196674992623, gain: 0.2234 }),
      Object.freeze({ channel: 0, frequency: 167.41656583794713, q: 2.4719868706309156, gain: 1.0 })
    ])
  });

  constructor({ sampleRate = 192000, masterClock = Namco54xxDac.MASTER_CLOCK, routing = Namco54xxDac.GALAGA } = {}) {
    this.sampleRate = sampleRate;
    this.masterClock = masterClock;
    this.routing = routing;
    this.channelData = new Uint8Array(Namco54xxDac.CHANNEL_COUNT);
    this.events = [];
    this.filters = Array.from({ length: Namco54xxDac.CHANNEL_COUNT }, () => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
    this.coefficients = new Array(Namco54xxDac.CHANNEL_COUNT);
    for (const spec of routing.channels) this.coefficients[spec.channel] = this._bandPass(spec.frequency, spec.q);
  }

  reset() {
    this.channelData.fill(0);
    this.events.length = 0;
    for (const f of this.filters) f.x1 = f.x2 = f.y1 = f.y2 = 0;
  }

  nibbleToVoltage(nibble) {
    const resistors = [47000, 22000, 10000, 4700];
    let total = 0, enabled = 0;
    for (let bit = 0; bit < 4; bit++) {
      const g = 1 / resistors[bit];
      total += g;
      if (nibble & (1 << bit)) enabled += g;
    }
    return 4 * enabled / total;
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
    const state = new Uint8Array(this.channelData);
    // Reconstruct state at the start of this block from retained events.
    state.fill(0);
    while (eventIndex < this.events.length && this.events[eventIndex].tick <= startTick) {
      const e = this.events[eventIndex++]; state[e.channel] = e.value;
    }
    const span = endTick - startTick;
    for (let i = 0; i < out.length; i++) {
      const tick = startTick + span * i / out.length;
      while (eventIndex < this.events.length && this.events[eventIndex].tick <= tick) {
        const e = this.events[eventIndex++]; state[e.channel] = e.value;
      }
      let mixed = 0;
      for (const spec of this.routing.channels) {
        const ch = spec.channel;
        mixed += this._filter(ch, this.nibbleToVoltage(state[ch])) * spec.gain;
      }
      out[i] = mixed * this.routing.outputGain;
    }
    // Events at/before endTick are no longer needed; preserve later transitions.
    let cut = 0;
    while (cut < this.events.length && this.events[cut].tick <= endTick) cut++;
    if (cut) this.events.splice(0, cut);
    return out;
  }

  _bandPass(frequency, q) {
    const w0 = 2 * Math.PI * frequency / this.sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    return {
      b0: alpha / a0, b1: 0, b2: -alpha / a0,
      a1: (-2 * Math.cos(w0)) / a0, a2: (1 - alpha) / a0
    };
  }

  _filter(channel, x) {
    const c = this.coefficients[channel], s = this.filters[channel];
    if (!c) return x;
    const y = c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2;
    s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = y;
    return y;
  }
}
