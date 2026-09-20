import { MB8843 } from '../../chips/MB88xx.js';

// Small event queue in the board's 24.576 MHz master-clock domain.
export class BoardScheduler {
  constructor() { this.reset(); }
  reset() { this.now = this.schedulerTick = 0; this.events = []; }
  synchronize(callback) { callback(); }
  at(tick, callback) {
    const event = { tick, callback, cancelled: false, cancel() { this.cancelled = true; } };
    this.events.push(event);
    this.events.sort((a, b) => a.tick - b.tick);
    return event;
  }
  advanceTo(tick) {
    while (this.events.length && this.events[0].tick <= tick) {
      const event = this.events.shift();
      if (event.cancelled) continue;
      this.now = this.schedulerTick = event.tick;
      event.callback();
    }
    this.now = this.schedulerTick = tick;
  }
}

// MAME 0.289 namco53.cpp: MB8843, O latch, K mode and four R inputs.
export class Namco53XX {
  constructor() {
    this.mcu = new MB8843();
    this.portO = 0; this.resetLine = 1;
    this.mcu.readK = () => 0;
    this.mcu.writeO = value => { this.portO = value & 255; };
  }
  loadROM(data) {
    if (data.length !== 0x400) throw new Error('53XX needs a 1024-byte program ROM');
    this.mcu.loadROM(data);
  }
  read() { return this.portO; }
  chipSelect(state) { this.mcu.setIRQ(state); }
  setResetLine(level) {
    const next = level ? 1 : 0;
    if (next !== this.resetLine && !next) this.mcu.reset();
    this.resetLine = next;
  }
  isReset() { return !this.resetLine; }
}
