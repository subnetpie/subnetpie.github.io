
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

