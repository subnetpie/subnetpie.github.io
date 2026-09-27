// Addressing and normal/direct bus primitives for the W65C816 core.
// Ported from MAME 0.289 g65816.cpp EA_* and g65816i_read/write_* helpers.
export class W65C816Addressing {
  constructor(cpu) { this.cpu = cpu; this.extraCycles = 0; }
  begin() { this.extraCycles = 0; }
  read8(addr) { return this.cpu.mem.read(addr & 0xffffff) & 0xff; }
  write8(addr, value) { this.cpu.mem.write(addr & 0xffffff, value & 0xff); }
  read16(addr) { return this.read8(addr) | (this.read8(addr + 1) << 8); }
  write16(addr, value) { this.write8(addr, value); this.write8(addr + 1, value >> 8); }
  read24(addr) { return this.read16(addr) | (this.read8(addr + 2) << 16); }

  directByteAddress(addr) {
    const r = this.cpu.r;
    return r.e && !(r.d & 0xff) ? (r.d | (addr & 0xff)) & 0xffff : addr & 0xffff;
  }
  read8Direct(addr) { return this.read8(this.directByteAddress(addr)); }
  write8Direct(addr, value) { this.write8(this.directByteAddress(addr), value); }
  read16Direct(addr) { return this.read8Direct(addr) | (this.read8Direct(addr + 1) << 8); }
  write16Direct(addr, value) {
    this.write8Direct(addr, value);
    this.write8Direct(addr + 1, value >> 8);
  }
  read16DirectX(addr) {
    if (this.cpu.r.e && (this.cpu.r.d & 0xff)) {
      const hi = (addr & 0xffff00) | ((addr + 1) & 0xff);
      return this.read8Direct(addr) | (this.read8Direct(hi) << 8);
    }
    return this.read16Direct(addr);
  }

  D() {
    const r = this.cpu.r;
    if (r.d & 0xff) this.extraCycles++;
    return (r.d + this.cpu.fetch8()) & 0xffff;
  }
  DX() { const r = this.cpu.r; return (r.d + this.cpu.fetch8() + r.x) & 0xffff; }
  DY() { const r = this.cpu.r; return (r.d + this.cpu.fetch8() + r.y) & 0xffff; }
  A() { return ((this.cpu.r.db << 16) | this.cpu.fetch16()) & 0xffffff; }
  AL() { return this.cpu.fetch24() & 0xffffff; }
  AX() { const base = this.A(), addr = base + this.cpu.r.x;
    if ((base ^ addr) & 0xff00) this.extraCycles++;
    return addr & 0xffffff;
  }
  AY() { const base = this.A(), addr = base + this.cpu.r.y;
    if ((base ^ addr) & 0xff00) this.extraCycles++;
    return addr & 0xffffff;
  }
  ALX() { return (this.AL() + this.cpu.r.x) & 0xffffff; }
  DI() { return ((this.cpu.r.db << 16) | this.read16Direct(this.D())) & 0xffffff; }
  DLI() { return this.read24(this.D()); }
  DXI() { return ((this.cpu.r.db << 16) | this.read16DirectX(this.DX())) & 0xffffff; }
  DIY() { const base = this.DI(), addr = base + this.cpu.r.y;
    if ((base ^ addr) & 0xff00) this.extraCycles++;
    return addr & 0xffffff;
  }
  DLIY() { return (this.DLI() + this.cpu.r.y) & 0xffffff; }
  AI() { return this.read16(this.cpu.fetch16()); }
  ALI() { return this.read24(this.A()); }
  AXI() { return this.read16((this.cpu.fetch16() + this.cpu.r.x) & 0xffff); }
  S() { return (this.cpu.r.s + this.cpu.fetch8()) & 0xffff; }
  SIY() { const r = this.cpu.r;
    const ptr = this.read16(r.s + this.cpu.fetch8());
    return (((r.db << 16) | ptr) + r.y) & 0xffffff;
  }
}
