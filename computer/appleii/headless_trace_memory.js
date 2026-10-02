// Opt-in memory trace wrapper for Apple II reverse engineering.
// Keeps normal emulator behavior unchanged.
export class TraceMemory {
  constructor(memory, options = {}) {
    this.memory = memory;
    this.events = [];
    this.maxEvents = options.maxEvents ?? 2_000_000;
    this.pc = options.pc ?? (() => null);
    this.cycles = options.cycles ?? (() => null);
    this.filter = options.filter ?? (() => true);
  }

  _record(type, addr, value) {
    addr &= 0xffff; value &= 0xff;
    if (this.events.length >= this.maxEvents) return;
    const event = { type, addr, value, pc: this.pc(), cycles: this.cycles() };
    if (this.filter(event)) this.events.push(event);
  }

  read(addr) {
    const value = this.memory.read(addr);
    this._record("R", addr, value);
    return value;
  }

  write(addr, value) {
    this._record("W", addr, value);
    return this.memory.write(addr, value);
  }

  read_word(addr) {
    const lo = this.read(addr);
    const hi = this.read((addr + 1) & 0xffff);
    return lo | (hi << 8);
  }

  snapshot(start = 0, end = 0x10000) {
    const out = new Uint8Array(end - start);
    for (let i = start; i < end; i++) out[i - start] = this.memory.read(i);
    return out;
  }

  clear() { this.events.length = 0; }

  // Forward Memory properties/methods not intercepted above.
  get ram() { return this.memory.ram; }
  reset(...args) { return this.memory.reset(...args); }
}

export function crisisMountainFilter(e) {
  return (e.addr >= 0xb600 && e.addr <= 0xb7ff) ||
         (e.addr >= 0xbd00 && e.addr <= 0xbfff) ||
         (e.addr >= 0xc0e0 && e.addr <= 0xc0ef);
}
