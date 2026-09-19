function _defineProperty(obj, key, value) {if (key in obj) {Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true });} else {obj[key] = value;}return obj;}class Z80 {
  constructor(memRead, memWrite, ioRead, ioWrite) {
    this.A = 0;
    this.F = 0;
    this.B = 0;
    this.C = 0;
    this.D = 0;
    this.E = 0;
    this.H = 0;
    this.L = 0;
    this.IX = 0;
    this.IY = 0;
    this.SP = 0;
    this.PC = 0;
    this.I = 0;
    this.R = 0;
    this.A_ = 0;
    this.F_ = 0;
    this.B_ = 0;
    this.C_ = 0;
    this.D_ = 0;
    this.E_ = 0;
    this.H_ = 0;
    this.L_ = 0;
    this.IFF1 = false;
    this.IFF2 = false;
    this.IM = 0;
    this.halted = false;
    this.inReset = false;
    this.MEMPTR = 0;
    this.eiPending = false;
    this.eiIssuedThisInstruction = false;
    this.cycles = 0;
    this.stallCycles = 0;
    this.irqPending = false;
    this.nmiPending = false;
    this.nmiLine = false;
    this.nmiInProgress = false;
    this.nmiReturnSP = null;
    this.vectorLatch = 0xff;
    this.memRead = memRead || (addr => 0xff);
    this.memWrite = memWrite || ((addr, data) => {});
    this.ioRead = ioRead || (port => 0xff);
    this.ioWrite = ioWrite || ((port, data) => {});
    this.emulator = null;
    this.defineRegisterProperties();
    this.parityTable = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let p = 0,
      v = i;
      while (v) {
        p ^= v & 1;
        v >>= 1;
      }
      this.parityTable[i] = p ? 0 : 1;
    }
    this.buildDAATable();
  }
  addStall(cycles) {
    this.stallCycles = Math.max(this.stallCycles, cycles | 0);
  }
  defineRegisterProperties() {
    const pairs = [
    ["AF", "A", "F"],
    ["BC", "B", "C"],
    ["DE", "D", "E"],
    ["HL", "H", "L"],
    ["AF_", "A_", "F_"],
    ["BC_", "B_", "C_"],
    ["DE_", "D_", "E_"],
    ["HL_", "H_", "L_"]];

    pairs.forEach(([name, hi, lo]) => {
      Object.defineProperty(this, name, {
        get() {
          return (this[hi] << 8 | this[lo]) & 0xffff;
        },
        set(val) {
          this[hi] = val >> 8 & 0xff;
          this[lo] = val & 0xff;
        } });

    });
  }
  buildDAATable() {
    this.daaTable = new Uint16Array(2048);

    for (let i = 0; i < 2048; i++) {
      const a = i & 0xff;
      const f = i >>> 8 & 0xff;
      const c = (f & 0x01) !== 0;
      const n = (f & 0x02) !== 0;
      const h = (f & 0x04) !== 0; // compressed H input

      // MAME z80.cpp daa(): the correction *condition* is identical for the
      // N=0 (add) and N=1 (subtract) paths -- only the sign of the applied
      // correction differs. Carry is likewise set unconditionally from the
      // original (pre-correction) accumulator value, regardless of N.
      const needsLowCorrection = h || (a & 0x0f) > 0x09;
      const needsHighCorrection = c || a > 0x99;

      let correction = 0;
      if (needsLowCorrection) correction |= 0x06;
      if (needsHighCorrection) correction |= 0x60;

      const newCarry = needsHighCorrection;
      const r = (n ? a - correction : a + correction) & 0xff;

      const newF =
      (newCarry ? 0x01 : 0) | (
      n ? 0x02 : 0) | (
      this.parityTable[r] ? 0x04 : 0) |
      r & 0x28 | (
      (a ^ r) & 0x10 ? 0x10 : 0) | (
      r === 0 ? 0x40 : 0) |
      r & 0x80;

      this.daaTable[i] = newF << 8 | r;
    }
  }
  read8(addr) {
    return this.memRead(addr & 0xffff) & 0xff;
  }
  write8(addr, val) {
    this.memWrite(addr & 0xffff, val & 0xff);
  }
  read16(addr) {
    const lo = this.read8(addr);
    const hi = this.read8(addr + 1 & 0xffff);
    return hi << 8 | lo;
  }
  write16(addr, val) {
    this.write8(addr, val & 0xff);
    this.write8(addr + 1 & 0xffff, val >> 8 & 0xff);
  }
  push16(val) {
    this.SP = this.SP - 1 & 0xffff;
    this.write8(this.SP, val >> 8 & 0xff);
    this.SP = this.SP - 1 & 0xffff;
    this.write8(this.SP, val & 0xff);
  }
  pop16() {
    const lo = this.read8(this.SP);
    this.SP = this.SP + 1 & 0xffff;
    const hi = this.read8(this.SP);
    this.SP = this.SP + 1 & 0xffff;
    return hi << 8 | lo;
  }
  initializeState() {
    this.A = this.F = this.B = this.C = 0;
    this.D = this.E = this.H = this.L = 0;
    this.SP = 0x0000;
    this.IX = this.IY = 0xffff; // matches documented Z80 reset behavior
    this.AF_ = this.BC_ = this.DE_ = this.HL_ = 0;
    this.F |= 0x40; // Zero flag set, matching m_f.z_val = 0 semantics
    this.performCoreReset();
  }
  performCoreReset() {
    this.PC = 0x0000;
    this.MEMPTR = this.PC;
    this.I = 0x00;
    this.R = 0x00;
    this.IFF1 = false;
    this.IFF2 = false;

    this.halted = false;
    this.eiPending = false;
    this.nmiPending = false;
    this.nmiInProgress = false;
    this.nmiReturnSP = null;
    // IM is intentionally left untouched here, matching MAME 0.289's
    // z80.cpp device_reset() — only device_start() zeroes m_im.
  }
  reset() {
    this.performCoreReset();
  }
  setReset(assert) {
    const next = !!assert;
    if (next === this.inReset) return;
    this.inReset = next;
    if (next) this.performCoreReset();
  }
  step() {
    if (this.inReset) return 0;

    // EI inhibits only maskable IRQ acceptance for the protected instruction.
    // NMI handling must remain independent of this argument.
    const intCycles = this.handleInterrupts(!!this.eiPending);
    if (intCycles) {
      this.cycles += intCycles;
      return intCycles;
    }

    if (this.halted) {
      this.incR();
      this.cycles += 4;
      return 4;
    }

    // This EI delay existed before the instruction about to execute.
    const hadEiDelay = !!this.eiPending;

    // Set false here. An EI executed by executeInstruction() sets it true again.
    // This makes EI; EI extend the maskable-IRQ inhibit window correctly.
    this.eiIssuedThisInstruction = false;

    const cycles = this.executeInstruction();

    /*
     * EI is responsible for setting IFF1/IFF2 immediately.
     *
     * DI is responsible for clearing IFF1/IFF2 and cancelling eiPending.
     *
     * Here we only consume the pre-existing one-instruction IRQ inhibit:
     *   - ordinary instruction after EI: consume it
     *   - EI after EI: the new EI re-arms it
     *   - DI after EI: DI cleared it; do not resurrect it
     */
    if (hadEiDelay && !this.eiIssuedThisInstruction) {
      this.eiPending = false;
    }

    this.cycles += cycles;
    return cycles;
  }
  handleInterrupts(suppressIrq = false) {
    // NMI has priority and is not blocked by EI's one-instruction delay.
    // Z80 hardware blocks a nested NMI while one is already in service;
    // a latched edge must wait until RETN/RETI re-enables acceptance.
    if (this.nmiPending && !this.nmiInProgress) {
      this.nmiPending = false;
      this.nmiInProgress = true;

      if (this.halted) {
        this.halted = false;
      }

      this.IFF2 = this.IFF1;
      this.IFF1 = false;

      this.push16(this.PC);
      this.nmiReturnSP = this.SP;
      this.PC = 0x0066;
      this.MEMPTR = 0x0066;
      return 11;
    }

    if (!this.irqPending || !this.IFF1 || suppressIrq) {
      return 0;
    }

    if (this.halted) {
      this.halted = false;
    }

    const busByte = this.vectorLatch & 0xff;

    // Interrupt acknowledge: maskable interrupts clear both flip-flops.
    this.irqPending = false;
    this.IFF1 = false;
    this.IFF2 = false;

    switch (this.IM) {
      case 0:
        return this.executeInterruptOpcode(busByte);

      case 1:
        this.push16(this.PC);
        this.PC = 0x0038;
        this.MEMPTR = 0x0038;
        return 13;

      case 2:{
          const vectorAddress = (this.I << 8 | busByte & 0xfe) & 0xffff;
          const handler = this.read16(vectorAddress);

          this.push16(this.PC);
          this.PC = handler;
          this.MEMPTR = handler;
          return 19;
        }

      default:
        throw new Error(`Invalid Z80 interrupt mode: ${this.IM}`);}

  }
  clearInterrupt(nonMaskable) {
    if (nonMaskable) {
      this.clearNmi();
    } else {
      this.clearIrq();
    }
  }
  requestIrq(vector = 0xff) {
    this.vectorLatch = vector & 0xff;
    this.irqPending = true;
  }
  irq(vector = 0xff) {
    this.requestIrq(vector);
  }
  interrupt(isNMI, vector) {
    if (isNMI) {
      this.requestNmi();
    } else {
      this.requestIrq(vector);
    }
  }
  requestNmi() {
    if (!this.nmiLine) {
      this.nmiPending = true;
    }
    this.nmiLine = true;
  }
  clearNmiLatch() {
    this.nmiLine = false;
  }
  nmi() {
    this.requestNmi();
  }
  /*
   * MAME 0.289 equivalent: pulse_input_line(INPUT_LINE_NMI, attotime::zero).
   *
   * Assert the NMI line so the rising edge latches nmiPending (requestNmi only
   * latches while nmiLine is low), then immediately deassert the line again.
   * nmiPending survives the deassert, so the NMI is still serviced on the next
   * step; nmiLine returns low so the next pulse is recognized as a fresh edge.
   *
   * This is required for periodic timer-driven NMI sources (e.g. the Bosconian
   * cpu3_interrupt_timer at scanline 64/192) that pulse every frame. nmi() alone
   * leaves nmiLine asserted, so only the first pulse would ever latch.
   */
  pulseNmi() {
    this.requestNmi();
    this.nmiLine = false;
  }
  clearIrq() {
    this.irqPending = false;
    this.vectorLatch = 0xff;
  }
  executeBase(op) {
    switch (op) {
      case 0x00:
        return 4;
      case 0x01:
        this.BC = this.read16(this.PC);
        this.PC = this.PC + 2 & 0xffff;
        return 10;
      case 0x02:
        this.write8(this.BC, this.A);
        this.MEMPTR = (this.A << 8 | this.BC + 1 & 0xff) & 0xffff;
        return 7;
      case 0x03:
        this.BC = this.BC + 1 & 0xffff;
        return 6;
      case 0x04:
        this.B = this.inc8(this.B);
        return 4;
      case 0x05:
        this.B = this.dec8(this.B);
        return 4;
      case 0x06:
        this.B = this.read8(this.PC++);
        return 7;
      case 0x07:
        this.rlca();
        return 4;
      case 0x08:
        this.exAFAF();
        return 4;
      case 0x09:
        this.HL = this.add16(this.HL, this.BC);
        return 11;
      case 0x0a:
        this.A = this.read8(this.BC);
        this.MEMPTR = this.BC + 1 & 0xffff;
        return 7;
      case 0x0b:
        this.BC = this.BC - 1 & 0xffff;
        return 6;
      case 0x0c:
        this.C = this.inc8(this.C);
        return 4;
      case 0x0d:
        this.C = this.dec8(this.C);
        return 4;
      case 0x0e:
        this.C = this.read8(this.PC++);
        return 7;
      case 0x0f:
        this.rrca();
        return 4;
      case 0x10:{
          // DJNZ e
          const e = this.read8(this.PC++);
          // sign-extend 8-bit displacement
          const disp = e << 24 >> 24;
          this.B = this.B - 1 & 0xff;
          if (this.B !== 0) {
            this.PC = this.PC + disp & 0xffff;
            return 13; // taken
          }
          return 8; // not taken
        }
      case 0x11:
        this.DE = this.read16(this.PC);
        this.PC = this.PC + 2 & 0xffff;
        return 10;
      case 0x12:
        this.write8(this.DE, this.A);
        this.MEMPTR = (this.A << 8 | this.DE + 1 & 0xff) & 0xffff;
        return 7;
      case 0x13:
        this.DE = this.DE + 1 & 0xffff;
        return 6;
      case 0x14:
        this.D = this.inc8(this.D);
        return 4;
      case 0x15:
        this.D = this.dec8(this.D);
        return 4;
      case 0x16:
        this.D = this.read8(this.PC++);
        return 7;
      case 0x17:
        this.rla();
        return 4;
      case 0x18:{
          const e = this.read8(this.PC++);
          this.PC = this.PC + (e << 24 >> 24) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
      case 0x19:
        this.HL = this.add16(this.HL, this.DE);
        return 11;
      case 0x1a:
        this.A = this.read8(this.DE);
        this.MEMPTR = this.DE + 1 & 0xffff;
        return 7;
      case 0x1b:
        this.DE = this.DE - 1 & 0xffff;
        return 6;
      case 0x1c:
        this.E = this.inc8(this.E);
        return 4;
      case 0x1d:
        this.E = this.dec8(this.E);
        return 4;
      case 0x1e:
        this.E = this.read8(this.PC++);
        return 7;
      case 0x1f:
        this.rra();
        return 4;
      case 0x20:{
          const e = this.read8(this.PC++);
          if (!(this.F & 0x40)) {
            this.PC = this.PC + (e << 24 >> 24) & 0xffff;
            this.MEMPTR = this.PC;
            return 12;
          }
          return 7;
        }
      case 0x21:
        this.HL = this.read16(this.PC);
        this.PC = this.PC + 2 & 0xffff;
        return 10;
      case 0x22:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write16(addr, this.HL);
          this.MEMPTR = addr + 1 & 0xffff;
          return 16;
        }
      case 0x23:
        this.HL = this.HL + 1 & 0xffff;
        return 6;
      case 0x24:
        this.H = this.inc8(this.H);
        return 4;
      case 0x25:
        this.H = this.dec8(this.H);
        return 4;
      case 0x26:
        this.H = this.read8(this.PC++);
        return 7;
      case 0x27:
        this.daa();
        return 4;
      case 0x28:{
          const e = this.read8(this.PC++);
          if (this.F & 0x40) {
            this.PC = this.PC + (e << 24 >> 24) & 0xffff;
            this.MEMPTR = this.PC;
            return 12;
          }
          return 7;
        }
      case 0x29:
        this.HL = this.add16(this.HL, this.HL);
        return 11;
      case 0x2a:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.HL = this.read16(addr);
          this.MEMPTR = addr + 1 & 0xffff;
          return 16;
        }
      case 0x2b:
        this.HL = this.HL - 1 & 0xffff;
        return 6;
      case 0x2c:
        this.L = this.inc8(this.L);
        return 4;
      case 0x2d:
        this.L = this.dec8(this.L);
        return 4;
      case 0x2e:
        this.L = this.read8(this.PC++);
        return 7;
      case 0x2f:
        this.A ^= 0xff;
        this.F = this.F & 0xc5 | 0x12 | this.A & 0x28;
        return 4;
      case 0x30:{
          const e = this.read8(this.PC++);
          if (!(this.F & 0x01)) {
            this.PC = this.PC + (e << 24 >> 24) & 0xffff;
            this.MEMPTR = this.PC;
            return 12;
          }
          return 7;
        }
      case 0x31:
        this.SP = this.read16(this.PC);
        this.PC = this.PC + 2 & 0xffff;
        return 10;
      case 0x32:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write8(addr, this.A);
          this.MEMPTR = (this.A << 8 | addr + 1 & 0xff) & 0xffff;
          return 13;
        }
      case 0x33:
        this.SP = this.SP + 1 & 0xffff;
        return 6;
      case 0x34:{
          const v = this.inc8(this.read8(this.HL));
          this.write8(this.HL, v);
          return 11;
        }
      case 0x35:{
          const v = this.dec8(this.read8(this.HL));
          this.write8(this.HL, v);
          return 11;
        }
      case 0x36:
        this.write8(this.HL, this.read8(this.PC++));
        return 10;
      case 0x37:
        this.scf();
        return 4;
      case 0x38:{
          const e = this.read8(this.PC++);
          if (this.F & 0x01) {
            this.PC = this.PC + (e << 24 >> 24) & 0xffff;
            this.MEMPTR = this.PC;
            return 12;
          }
          return 7;
        }
      case 0x39:
        this.HL = this.add16(this.HL, this.SP);
        return 11;
      case 0x3a:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.A = this.read8(addr);
          this.MEMPTR = addr + 1 & 0xffff;
          return 13;
        }
      case 0x3b:
        this.SP = this.SP - 1 & 0xffff;
        return 6;
      case 0x3c:
        this.A = this.inc8(this.A);
        return 4;
      case 0x3d:
        this.A = this.dec8(this.A);
        return 4;
      case 0x3e:
        this.A = this.read8(this.PC++);
        return 7;
      case 0x3f:
        this.ccf();
        return 4;
      case 0x40:
        return 4;
      case 0x41:
        this.B = this.C;
        return 4;
      case 0x42:
        this.B = this.D;
        return 4;
      case 0x43:
        this.B = this.E;
        return 4;
      case 0x44:
        this.B = this.H;
        return 4;
      case 0x45:
        this.B = this.L;
        return 4;
      case 0x46:
        this.B = this.read8(this.HL);
        return 7;
      case 0x47:
        this.B = this.A;
        return 4;
      case 0x48:
        this.C = this.B;
        return 4;
      case 0x49:
        return 4;
      case 0x4a:
        this.C = this.D;
        return 4;
      case 0x4b:
        this.C = this.E;
        return 4;
      case 0x4c:
        this.C = this.H;
        return 4;
      case 0x4d:
        this.C = this.L;
        return 4;
      case 0x4e:
        this.C = this.read8(this.HL);
        return 7;
      case 0x4f:
        this.C = this.A;
        return 4;
      case 0x50:
        this.D = this.B;
        return 4;
      case 0x51:
        this.D = this.C;
        return 4;
      case 0x52:
        return 4;
      case 0x53:
        this.D = this.E;
        return 4;
      case 0x54:
        this.D = this.H;
        return 4;
      case 0x55:
        this.D = this.L;
        return 4;
      case 0x56:
        this.D = this.read8(this.HL);
        return 7;
      case 0x57:
        this.D = this.A;
        return 4;
      case 0x58:
        this.E = this.B;
        return 4;
      case 0x59:
        this.E = this.C;
        return 4;
      case 0x5a:
        this.E = this.D;
        return 4;
      case 0x5b:
        return 4;
      case 0x5c:
        this.E = this.H;
        return 4;
      case 0x5d:
        this.E = this.L;
        return 4;
      case 0x5e:
        this.E = this.read8(this.HL);
        return 7;
      case 0x5f:
        this.E = this.A;
        return 4;
      case 0x60:
        this.H = this.B;
        return 4;
      case 0x61:
        this.H = this.C;
        return 4;
      case 0x62:
        this.H = this.D;
        return 4;
      case 0x63:
        this.H = this.E;
        return 4;
      case 0x64:
        return 4;
      case 0x65:
        this.H = this.L;
        return 4;
      case 0x66:
        this.H = this.read8(this.HL);
        return 7;
      case 0x67:
        this.H = this.A;
        return 4;
      case 0x68:
        this.L = this.B;
        return 4;
      case 0x69:
        this.L = this.C;
        return 4;
      case 0x6a:
        this.L = this.D;
        return 4;
      case 0x6b:
        this.L = this.E;
        return 4;
      case 0x6c:
        this.L = this.H;
        return 4;
      case 0x6d:
        return 4;
      case 0x6e:
        this.L = this.read8(this.HL);
        return 7;
      case 0x6f:
        this.L = this.A;
        return 4;
      case 0x70:
        this.write8(this.HL, this.B);
        return 7;
      case 0x71:
        this.write8(this.HL, this.C);
        return 7;
      case 0x72:
        this.write8(this.HL, this.D);
        return 7;
      case 0x73:
        this.write8(this.HL, this.E);
        return 7;
      case 0x74:
        this.write8(this.HL, this.H);
        return 7;
      case 0x75:
        this.write8(this.HL, this.L);
        return 7;
      case 0x76:
        this.halted = true;
        return 4;
      case 0x77:
        this.write8(this.HL, this.A);
        return 7;
      case 0x78:
        this.A = this.B;
        return 4;
      case 0x79:
        this.A = this.C;
        return 4;
      case 0x7a:
        this.A = this.D;
        return 4;
      case 0x7b:
        this.A = this.E;
        return 4;
      case 0x7c:
        this.A = this.H;
        return 4;
      case 0x7d:
        this.A = this.L;
        return 4;
      case 0x7e:
        this.A = this.read8(this.HL);
        return 7;
      case 0x7f:
        return 4;
      case 0x80:
        this.add8(this.B);
        return 4;
      case 0x81:
        this.add8(this.C);
        return 4;
      case 0x82:
        this.add8(this.D);
        return 4;
      case 0x83:
        this.add8(this.E);
        return 4;
      case 0x84:
        this.add8(this.H);
        return 4;
      case 0x85:
        this.add8(this.L);
        return 4;
      case 0x86:
        this.add8(this.read8(this.HL));
        return 7;
      case 0x87:
        this.add8(this.A);
        return 4;
      case 0x88:
        this.adc8(this.B);
        return 4;
      case 0x89:
        this.adc8(this.C);
        return 4;
      case 0x8a:
        this.adc8(this.D);
        return 4;
      case 0x8b:
        this.adc8(this.E);
        return 4;
      case 0x8c:
        this.adc8(this.H);
        return 4;
      case 0x8d:
        this.adc8(this.L);
        return 4;
      case 0x8e:
        this.adc8(this.read8(this.HL));
        return 7;
      case 0x8f:
        this.adc8(this.A);
        return 4;
      case 0x90:
        this.sub8(this.B);
        return 4;
      case 0x91:
        this.sub8(this.C);
        return 4;
      case 0x92:
        this.sub8(this.D);
        return 4;
      case 0x93:
        this.sub8(this.E);
        return 4;
      case 0x94:
        this.sub8(this.H);
        return 4;
      case 0x95:
        this.sub8(this.L);
        return 4;
      case 0x96:
        this.sub8(this.read8(this.HL));
        return 7;
      case 0x97:
        this.sub8(this.A);
        return 4;
      case 0x98:
        this.sbc8(this.B);
        return 4;
      case 0x99:
        this.sbc8(this.C);
        return 4;
      case 0x9a:
        this.sbc8(this.D);
        return 4;
      case 0x9b:
        this.sbc8(this.E);
        return 4;
      case 0x9c:
        this.sbc8(this.H);
        return 4;
      case 0x9d:
        this.sbc8(this.L);
        return 4;
      case 0x9e:
        this.sbc8(this.read8(this.HL));
        return 7;
      case 0x9f:
        this.sbc8(this.A);
        return 4;
      case 0xa0:
        this.and8(this.B);
        return 4;
      case 0xa1:
        this.and8(this.C);
        return 4;
      case 0xa2:
        this.and8(this.D);
        return 4;
      case 0xa3:
        this.and8(this.E);
        return 4;
      case 0xa4:
        this.and8(this.H);
        return 4;
      case 0xa5:
        this.and8(this.L);
        return 4;
      case 0xa6:
        this.and8(this.read8(this.HL));
        return 7;
      case 0xa7:
        this.and8(this.A);
        return 4;
      case 0xa8:
        this.xor8(this.B);
        return 4;
      case 0xa9:
        this.xor8(this.C);
        return 4;
      case 0xaa:
        this.xor8(this.D);
        return 4;
      case 0xab:
        this.xor8(this.E);
        return 4;
      case 0xac:
        this.xor8(this.H);
        return 4;
      case 0xad:
        this.xor8(this.L);
        return 4;
      case 0xae:
        this.xor8(this.read8(this.HL));
        return 7;
      case 0xaf:
        this.xor8(this.A);
        return 4;
      case 0xb0:
        this.or8(this.B);
        return 4;
      case 0xb1:
        this.or8(this.C);
        return 4;
      case 0xb2:
        this.or8(this.D);
        return 4;
      case 0xb3:
        this.or8(this.E);
        return 4;
      case 0xb4:
        this.or8(this.H);
        return 4;
      case 0xb5:
        this.or8(this.L);
        return 4;
      case 0xb6:
        this.or8(this.read8(this.HL));
        return 7;
      case 0xb7:
        this.or8(this.A);
        return 4;
      case 0xb8:
        this.cp8(this.B);
        return 4;
      case 0xb9:
        this.cp8(this.C);
        return 4;
      case 0xba:
        this.cp8(this.D);
        return 4;
      case 0xbb:
        this.cp8(this.E);
        return 4;
      case 0xbc:
        this.cp8(this.H);
        return 4;
      case 0xbd:
        this.cp8(this.L);
        return 4;
      case 0xbe:
        this.cp8(this.read8(this.HL));
        return 7;
      case 0xbf:
        this.cp8(this.A);
        return 4;
      case 0xc0:{
          if (!(this.F & 0x40)) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xc1:
        this.BC = this.pop16();
        return 10;
      case 0xc2:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x40)) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xc3:{
          const addr = this.read16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 10;
        }
      case 0xc4:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x40)) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xc5:
        this.push16(this.BC);
        return 11;
      case 0xc6:
        this.add8(this.read8(this.PC++));
        return 7;
      case 0xc7:
        this.push16(this.PC);
        this.PC = 0x00;
        this.MEMPTR = 0x00;
        return 11;
      case 0xc8:{
          if (this.F & 0x40) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xc9:{
          const retSP = this.SP;
          this.PC = this.pop16();
          this.maybeCompleteNmiReturn(retSP);
          this.MEMPTR = this.PC;
          return 10;
        }
      case 0xca:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x40) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xcc:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x40) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xcd:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
      case 0xce:
        this.adc8(this.read8(this.PC++));
        return 7;
      case 0xcf:
        this.push16(this.PC);
        this.PC = 0x08;
        this.MEMPTR = 0x08;
        return 11;
      case 0xd0:{
          if (!(this.F & 0x01)) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xd1:
        this.DE = this.pop16();
        return 10;
      case 0xd2:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x01)) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xd3:{
          const port = this.read8(this.PC++);
          this.ioWrite(this.A << 8 | port, this.A);
          this.MEMPTR = (this.A << 8 | port + 1 & 0xff) & 0xffff;
          return 11;
        }
      case 0xd4:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x01)) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xd5:
        this.push16(this.DE);
        return 11;
      case 0xd6:
        this.sub8(this.read8(this.PC++));
        return 7;
      case 0xd7:
        this.push16(this.PC);
        this.PC = 0x10;
        this.MEMPTR = 0x10;
        return 11;
      case 0xd8:{
          if (this.F & 0x01) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xd9:
        this.exx();
        return 4;
      case 0xda:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x01) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xdb:{
          const port = this.read8(this.PC++);
          const oldA = this.A;
          this.A = this.ioRead(oldA << 8 | port);
          this.MEMPTR = (oldA << 8 | port + 1 & 0xff) & 0xffff;
          return 11;
        }
      case 0xdc:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x01) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xde:
        this.sbc8(this.read8(this.PC++));
        return 7;
      case 0xdf:
        this.push16(this.PC);
        this.PC = 0x18;
        this.MEMPTR = 0x18;
        return 11;
      case 0xe0:{
          if (!(this.F & 0x04)) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xe1:
        this.HL = this.pop16();
        return 10;
      case 0xe2:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x04)) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xe3:{
          const tmp = this.read16(this.SP);
          this.write16(this.SP, this.HL);
          this.HL = tmp;
          this.MEMPTR = tmp;
          return 19;
        }
      case 0xe4:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x04)) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xe5:
        this.push16(this.HL);
        return 11;
      case 0xe6:
        this.and8(this.read8(this.PC++));
        return 7;
      case 0xe7:
        this.push16(this.PC);
        this.PC = 0x20;
        this.MEMPTR = 0x20;
        return 11;
      case 0xe8:{
          if (this.F & 0x04) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xe9:
        this.PC = this.HL;
        return 4;
      case 0xea:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x04) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xeb:{
          const tmp = this.DE;
          this.DE = this.HL;
          this.HL = tmp;
          return 4;
        }
      case 0xec:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x04) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xee:
        this.xor8(this.read8(this.PC++));
        return 7;
      case 0xef:
        this.push16(this.PC);
        this.PC = 0x28;
        this.MEMPTR = 0x28;
        return 11;
      case 0xf0:{
          if (!(this.F & 0x80)) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xf1:
        this.AF = this.pop16();
        return 10;
      case 0xf2:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x80)) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xf3: // DI
        this.IFF1 = false;
        this.IFF2 = false;
        this.eiPending = false;
        this.eiIssuedThisInstruction = false;
        return 4;
      case 0xf4:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (!(this.F & 0x80)) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xf5:
        this.push16(this.AF);
        return 11;
      case 0xf6:
        this.or8(this.read8(this.PC++));
        return 7;
      case 0xf7:
        this.push16(this.PC);
        this.PC = 0x30;
        this.MEMPTR = 0x30;
        return 11;
      case 0xf8:{
          if (this.F & 0x80) {
            const retSP = this.SP;
            this.PC = this.pop16();
            this.maybeCompleteNmiReturn(retSP);
            this.MEMPTR = this.PC;
            return 11;
          }
          return 5;
        }
      case 0xf9:
        this.SP = this.HL;
        return 6;
      case 0xfa:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x80) {
            this.PC = addr;
            this.MEMPTR = addr;
          }
          return 10;
        }
      case 0xfb: // EI
        this.IFF1 = true;
        this.IFF2 = true;
        this.eiPending = true; // inhibit IRQ for next instruction
        this.eiIssuedThisInstruction = true;
        return 4;
      case 0xfc:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          if (this.F & 0x80) {
            this.push16(this.PC);
            this.PC = addr;
            this.MEMPTR = addr;
            return 17;
          }
          return 10;
        }
      case 0xfe:
        this.cp8(this.read8(this.PC++));
        return 7;
      case 0xff:
        this.push16(this.PC);
        this.PC = 0x38;
        this.MEMPTR = 0x38;
        return 11;
      default:
        return 4;}

  }
  executeIndexed(op, reg) {
    const getIXY = () => reg === "IX" ? this.IX : this.IY;
    const setIXY = v => reg === "IX" ? this.IX = v : this.IY = v;
    const getH = () =>
    reg === "IX" ? this.IX >> 8 & 0xff : this.IY >> 8 & 0xff;
    const setH = (v) =>
    reg === "IX" ?
    this.IX = this.IX & 0x00ff | (v & 0xff) << 8 :
    this.IY = this.IY & 0x00ff | (v & 0xff) << 8;
    const getL = () => reg === "IX" ? this.IX & 0xff : this.IY & 0xff;
    const setL = (v) =>
    reg === "IX" ?
    this.IX = this.IX & 0xff00 | v & 0xff :
    this.IY = this.IY & 0xff00 | v & 0xff;
    switch (op) {
      case 0x09:
        setIXY(this.add16(getIXY(), this.BC));
        return 15;
      case 0x19:
        setIXY(this.add16(getIXY(), this.DE));
        return 15;
      case 0x21:
        setIXY(this.read16(this.PC));
        this.PC = this.PC + 2 & 0xffff;
        return 14;
      case 0x22:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write16(addr, getIXY());
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x23:
        setIXY(getIXY() + 1 & 0xffff);
        return 10;
      case 0x24:
        setH(this.inc8(getH()));
        return 8;
      case 0x25:
        setH(this.dec8(getH()));
        return 8;
      case 0x26:
        setH(this.read8(this.PC++));
        return 11;
      case 0x29:
        setIXY(this.add16(getIXY(), getIXY()));
        return 15;
      case 0x2a:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          setIXY(this.read16(addr));
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x2b:
        setIXY(getIXY() - 1 & 0xffff);
        return 10;
      case 0x2c:
        setL(this.inc8(getL()));
        return 8;
      case 0x2d:
        setL(this.dec8(getL()));
        return 8;
      case 0x2e:
        setL(this.read8(this.PC++));
        return 11;
      case 0x34:{
          const d = this.read8(this.PC++);
          const addr = getIXY() + (d << 24 >> 24) & 0xffff;
          this.write8(addr, this.inc8(this.read8(addr)));
          return 23;
        }
      case 0x35:{
          const d = this.read8(this.PC++);
          const addr = getIXY() + (d << 24 >> 24) & 0xffff;
          this.write8(addr, this.dec8(this.read8(addr)));
          return 23;
        }
      case 0x36:{
          const d = this.read8(this.PC++);
          const n = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, n);
          return 19;
        }
      case 0x39:
        setIXY(this.add16(getIXY(), this.SP));
        return 15;
      case 0x46:{
          const d = this.read8(this.PC++);
          this.B = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x4e:{
          const d = this.read8(this.PC++);
          this.C = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x56:{
          const d = this.read8(this.PC++);
          this.D = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x5e:{
          const d = this.read8(this.PC++);
          this.E = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x66:{
          const d = this.read8(this.PC++);
          this.H = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x6e:{
          const d = this.read8(this.PC++);
          this.L = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x7e:{
          const d = this.read8(this.PC++);
          this.A = this.read8(getIXY() + (d << 24 >> 24) & 0xffff);
          return 19;
        }
      case 0x70:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.B);
          return 19;
        }
      case 0x71:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.C);
          return 19;
        }
      case 0x72:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.D);
          return 19;
        }
      case 0x73:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.E);
          return 19;
        }
      case 0x74:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.H);
          return 19;
        }
      case 0x75:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.L);
          return 19;
        }
      case 0x77:{
          const d = this.read8(this.PC++);
          this.write8(getIXY() + (d << 24 >> 24) & 0xffff, this.A);
          return 19;
        }
      case 0x86:{
          const d = this.read8(this.PC++);
          this.add8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0x8e:{
          const d = this.read8(this.PC++);
          this.adc8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0x96:{
          const d = this.read8(this.PC++);
          this.sub8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0x9e:{
          const d = this.read8(this.PC++);
          this.sbc8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0xa6:{
          const d = this.read8(this.PC++);
          this.and8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0xae:{
          const d = this.read8(this.PC++);
          this.xor8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0xb6:{
          const d = this.read8(this.PC++);
          this.or8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0xbe:{
          const d = this.read8(this.PC++);
          this.cp8(this.read8(getIXY() + (d << 24 >> 24) & 0xffff));
          return 19;
        }
      case 0xe1:
        setIXY(this.pop16());
        return 14;
      case 0xe3:{
          const tmp = this.read16(this.SP);
          this.write16(this.SP, getIXY());
          setIXY(tmp);
          this.MEMPTR = tmp;
          return 23;
        }
      case 0xe5:
        this.push16(getIXY());
        return 15;
      case 0xe9:
        this.PC = getIXY();
        return 8;
      case 0xf9:
        this.SP = getIXY();
        return 10;
      // --- LD r,IXH / LD r,IXL ---
      case 0x44:
        this.B = getH();
        return 8;
      case 0x45:
        this.B = getL();
        return 8;
      case 0x4c:
        this.C = getH();
        return 8;
      case 0x4d:
        this.C = getL();
        return 8;
      case 0x54:
        this.D = getH();
        return 8;
      case 0x55:
        this.D = getL();
        return 8;
      case 0x5c:
        this.E = getH();
        return 8;
      case 0x5d:
        this.E = getL();
        return 8;
      case 0x7c:
        this.A = getH();
        return 8;
      case 0x7d:
        this.A = getL();
        return 8;

      // --- LD IXH,r / LD IXL,r ---
      case 0x60:
        setH(this.B);
        return 8;
      case 0x61:
        setH(this.C);
        return 8;
      case 0x62:
        setH(this.D);
        return 8;
      case 0x63:
        setH(this.E);
        return 8;
      case 0x64:
        setH(getH());
        return 8; // LD IXH,IXH (documented no-op form)
      case 0x65:
        setH(getL());
        return 8; // LD IXH,IXL
      case 0x67:
        setH(this.A);
        return 8;
      case 0x68:
        setL(this.B);
        return 8;
      case 0x69:
        setL(this.C);
        return 8;
      case 0x6a:
        setL(this.D);
        return 8;
      case 0x6b:
        setL(this.E);
        return 8;
      case 0x6c:
        setL(getH());
        return 8; // LD IXL,IXH
      case 0x6d:
        setL(getL());
        return 8; // LD IXL,IXL (documented no-op form)
      case 0x6f:
        setL(this.A);
        return 8;

      // --- ALU A,IXH / ALU A,IXL ---
      case 0x84:
        this.add8(getH());
        return 8;
      case 0x85:
        this.add8(getL());
        return 8;
      case 0x8c:
        this.adc8(getH());
        return 8;
      case 0x8d:
        this.adc8(getL());
        return 8;
      case 0x94:
        this.sub8(getH());
        return 8;
      case 0x95:
        this.sub8(getL());
        return 8;
      case 0x9c:
        this.sbc8(getH());
        return 8;
      case 0x9d:
        this.sbc8(getL());
        return 8;
      case 0xa4:
        this.and8(getH());
        return 8;
      case 0xa5:
        this.and8(getL());
        return 8;
      case 0xac:
        this.xor8(getH());
        return 8;
      case 0xad:
        this.xor8(getL());
        return 8;
      case 0xb4:
        this.or8(getH());
        return 8;
      case 0xb5:
        this.or8(getL());
        return 8;
      case 0xbc:
        this.cp8(getH());
        return 8;
      case 0xbd:
        this.cp8(getL());
        return 8;
      default:
        return 4 + this.executeBase(op);}

  }
  executeInstruction() {
    const op = this.read8(this.PC++);
    this.incR();
    this.Q = this.QT;
    this.QT = 0x28;
    switch (op) {
      case 0xcb:
        return this.decodeCB();
      case 0xdd:
        return this.decodeDD();
      case 0xed:
        return this.decodeED();
      case 0xfd:
        return this.decodeFD();
      default:
        return this.executeBase(op);}

  }
  bitTest(bit, v, yxSource) {
    this.QT = 0;
    const res = v & 1 << bit;
    this.F =
    this.F & 0x01 |
    0x10 |
    res & 0x80 | (
    res ? 0 : 0x40) |
    this.parityTable[res ? 1 : 0] << 2 |
    yxSource & 0x28;
  }
  decodeCB() {
    const op = this.read8(this.PC++);
    this.incR();
    const r = op & 0x07;
    const bit = op >> 3 & 0x07;
    const opType = op >> 6 & 0x03;

    const getReg = () => {
      switch (r) {
        case 0:
          return this.B;
        case 1:
          return this.C;
        case 2:
          return this.D;
        case 3:
          return this.E;
        case 4:
          return this.H;
        case 5:
          return this.L;
        case 6:
          return this.read8(this.HL);
        case 7:
          return this.A;}

    };
    const setReg = val => {
      switch (r) {
        case 0:
          this.B = val;
          break;
        case 1:
          this.C = val;
          break;
        case 2:
          this.D = val;
          break;
        case 3:
          this.E = val;
          break;
        case 4:
          this.H = val;
          break;
        case 5:
          this.L = val;
          break;
        case 6:
          this.write8(this.HL, val);
          break;
        case 7:
          this.A = val;
          break;}

    };

    if (opType === 0) {
      const v = getReg();
      let result;
      switch (bit) {
        case 0:
          result = this.rlc(v);
          break;
        case 1:
          result = this.rrc(v);
          break;
        case 2:
          result = this.rl(v);
          break;
        case 3:
          result = this.rr(v);
          break;
        case 4:
          result = this.sla(v);
          break;
        case 5:
          result = this.sra(v);
          break;
        case 6:
          result = this.sll(v);
          break;
        case 7:
          result = this.srl(v);
          break;}

      setReg(result);
      return r === 6 ? 15 : 8;
    } else if (opType === 1) {
      // BIT b,r  -- Y/X source depends on addressing mode (see header comment).
      const v = getReg();
      if (r === 6) {
        // BIT b,(HL): mirrors z80.cpp bit_hl() -- Y/X from MEMPTR high byte,
        // which this opcode does NOT update (matches z80.lst cb46-style entries).
        this.bitTest(bit, v, this.MEMPTR >> 8);
      } else {
        // BIT b,r: mirrors z80.cpp bit() -- Y/X from the tested value itself.
        this.bitTest(bit, v, v);
      }
      return r === 6 ? 12 : 8;
    } else if (opType === 2) {
      const v = getReg();
      setReg(v & ~(1 << bit));
      return r === 6 ? 15 : 8;
    } else {
      const v = getReg();
      setReg(v | 1 << bit);
      return r === 6 ? 15 : 8;
    }
  }
  decodeIndexCB(base) {
    const d = this.read8(this.PC++);
    const op = this.read8(this.PC++);
    const addr = base + (d << 24 >> 24) & 0xffff;

    // Mirrors z80.lst @eax/@eay: WZ (MEMPTR) is set to the effective address
    // for EVERY DD CB / FD CB instruction, not just BIT. This keeps MEMPTR
    // correct for any *later* plain "BIT n,(HL)" that depends on its stale
    // value, and matches m_ea's role in bit_xy() for this instruction itself.
    this.MEMPTR = addr;

    const r = op & 0x07;
    const bit = op >> 3 & 0x07;
    const opType = op >> 6 & 0x03;

    const writeBackReg = result => {
      if (r === 6) return;
      switch (r) {
        case 0:
          this.B = result;
          break;
        case 1:
          this.C = result;
          break;
        case 2:
          this.D = result;
          break;
        case 3:
          this.E = result;
          break;
        case 4:
          this.H = result;
          break;
        case 5:
          this.L = result;
          break;
        case 7:
          this.A = result;
          break;}

    };

    if (opType === 0) {
      const v = this.read8(addr);
      let result;
      switch (bit) {
        case 0:
          result = this.rlc(v);
          break;
        case 1:
          result = this.rrc(v);
          break;
        case 2:
          result = this.rl(v);
          break;
        case 3:
          result = this.rr(v);
          break;
        case 4:
          result = this.sla(v);
          break;
        case 5:
          result = this.sra(v);
          break;
        case 6:
          result = this.sll(v);
          break;
        case 7:
          result = this.srl(v);
          break;}

      this.write8(addr, result);
      writeBackReg(result);
      return 23;
    } else if (opType === 1) {
      // BIT b,(IX+d)/(IY+d): mirrors z80.cpp bit_xy() -- Y/X from the
      // effective address high byte (equal to MEMPTR here, sourced from
      // `addr` directly to match m_ea semantics exactly).
      const v = this.read8(addr);
      this.bitTest(bit, v, addr >> 8);
      return 20;
    } else if (opType === 2) {
      const v = this.read8(addr);
      const result = v & ~(1 << bit);
      this.write8(addr, result);
      writeBackReg(result);
      return 23;
    } else {
      const v = this.read8(addr);
      const result = v | 1 << bit;
      this.write8(addr, result);
      writeBackReg(result);
      return 23;
    }
  }
  decodeED() {
    const op = this.read8(this.PC++);
    this.incR();
    switch (op) {
      case 0x40:
        this.B = this.inPort(this.BC);
        return 12;
      case 0x41:
        this.outPort(this.BC, this.B);
        return 12;
      case 0x42:
        this.HL = this.sbc16(this.HL, this.BC);
        return 15;
      case 0x43:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write16(addr, this.BC);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x44:
        this.neg();
        return 8;
      case 0x45:
        this.retn();
        return 14;
      case 0x46:
        this.IM = 0;
        return 8;
      case 0x47:
        this.I = this.A;
        return 9;
      case 0x48:
        this.C = this.inPort(this.BC);
        return 12;
      case 0x49:
        this.outPort(this.BC, this.C);
        return 12;
      case 0x4a:
        this.HL = this.adc16(this.HL, this.BC);
        return 15;
      case 0x4b:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.BC = this.read16(addr);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x4d:
        this.reti();
        return 14;
      case 0x4f:
        this.R = this.A;
        return 9;
      case 0x50:
        this.D = this.inPort(this.BC);
        return 12;
      case 0x51:
        this.outPort(this.BC, this.D);
        return 12;
      case 0x52:
        this.HL = this.sbc16(this.HL, this.DE);
        return 15;
      case 0x53:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write16(addr, this.DE);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x56:
        this.IM = 1;
        return 8;
      case 0x57:
        this.QT = 0;
        this.A = this.I;
        this.F =
        this.F & 0x01 |
        this.A & 0xa8 | (
        this.A ? 0 : 0x40) | (
        this.IFF2 ? 0x04 : 0);
        return 9;
      case 0x58:
        this.E = this.inPort(this.BC);
        return 12;
      case 0x59:
        this.outPort(this.BC, this.E);
        return 12;
      case 0x5a:
        this.HL = this.adc16(this.HL, this.DE);
        return 15;
      case 0x5b:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.DE = this.read16(addr);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x5e:
        this.IM = 2;
        return 8;
      case 0x5f:
        this.QT = 0;
        this.A = this.R;
        this.F =
        this.F & 0x01 |
        this.A & 0xa8 | (
        this.A ? 0 : 0x40) | (
        this.IFF2 ? 0x04 : 0);
        return 9;
      case 0x60:
        this.H = this.inPort(this.BC);
        return 12;
      case 0x61:
        this.outPort(this.BC, this.H);
        return 12;
      case 0x62:
        this.HL = this.sbc16(this.HL, this.HL);
        return 15;
      case 0x67:
        this.rrd();
        return 18;
      case 0x68:
        this.L = this.inPort(this.BC);
        return 12;
      case 0x69:
        this.outPort(this.BC, this.L);
        return 12;
      case 0x6a:
        this.HL = this.adc16(this.HL, this.HL);
        return 15;
      case 0x6f:
        this.rld();
        return 18;
      case 0x70:{
          this.inPort(this.BC);
          return 12;
        }
      case 0x71:
        this.outPort(this.BC, 0);
        return 12;
      case 0x72:
        this.HL = this.sbc16(this.HL, this.SP);
        return 15;
      case 0x73:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.write16(addr, this.SP);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0x78:
        this.A = this.inPort(this.BC);
        return 12;
      case 0x79:
        this.outPort(this.BC, this.A);
        return 12;
      case 0x7a:
        this.HL = this.adc16(this.HL, this.SP);
        return 15;
      case 0x7b:{
          const addr = this.read16(this.PC);
          this.PC = this.PC + 2 & 0xffff;
          this.SP = this.read16(addr);
          this.MEMPTR = addr + 1 & 0xffff;
          return 20;
        }
      case 0xa0:
        return this.ldi();
      case 0xa1:
        return this.cpi();
      case 0xa2:
        return this.ini();
      case 0xa3:
        return this.outi();
      case 0xa8:
        return this.ldd();
      case 0xa9:
        return this.cpd();
      case 0xaa:
        return this.ind();
      case 0xab:
        return this.outd();
      case 0xb0:
        return this.ldir();
      case 0xb1:
        return this.cpir();
      case 0xb2:
        return this.inir();
      case 0xb3:
        return this.otir();
      case 0xb8:
        return this.lddr();
      case 0xb9:
        return this.cpdr();
      case 0xba:
        return this.indr();
      case 0xbb:
        return this.otdr();
      default:
        return 8;}

  }
  decodeDD() {
    const op = this.read8(this.PC++);
    this.incR();
    if (op === 0xcb) return this.decodeIndexCB(this.IX);
    return this.executeIndexed(op, "IX");
  }
  decodeFD() {
    const op = this.read8(this.PC++);
    this.incR();
    if (op === 0xcb) return this.decodeIndexCB(this.IY);
    return this.executeIndexed(op, "IY");
  }
  inc8(v) {
    this.QT = 0;
    const res = v + 1 & 0xff;
    this.F =
    this.F & 0x01 |
    res & 0xa8 | (
    res ? 0 : 0x40) | (
    (v & 0x0f) === 0x0f ? 0x10 : 0) | (
    v === 0x7f ? 0x04 : 0);
    return res;
  }
  dec8(v) {
    this.QT = 0;
    const res = v - 1 & 0xff;
    this.F =
    this.F & 0x01 |
    0x02 |
    res & 0xa8 | (
    res ? 0 : 0x40) | (
    (v & 0x0f) === 0 ? 0x10 : 0) | (
    v === 0x80 ? 0x04 : 0);
    return res;
  }
  add8(v) {
    this.QT = 0;
    const a = this.A;
    const res = a + v;
    const carry = res > 0xff ? 1 : 0;
    const halfCarry = (a & 0x0f) + (v & 0x0f) > 0x0f ? 1 : 0;
    const overflow = ((a ^ res) & (v ^ res) & 0x80) !== 0 ? 1 : 0;
    this.A = res & 0xff;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    carry;
  }
  adc8(v) {
    this.QT = 0;
    const a = this.A;
    const c = this.F & 0x01;
    const res = a + v + c;
    const carry = res > 0xff ? 1 : 0;
    const halfCarry = (a & 0x0f) + (v & 0x0f) + c > 0x0f ? 1 : 0;
    const overflow = ((a ^ res) & (v ^ res) & 0x80) !== 0 ? 1 : 0;
    this.A = res & 0xff;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    carry;
  }
  sub8(v) {
    this.QT = 0;
    const a = this.A;
    const res = a - v;
    const carry = res < 0 ? 1 : 0;
    const halfCarry = (a & 0x0f) - (v & 0x0f) < 0 ? 1 : 0;
    const overflow = ((a ^ v) & (a ^ res) & 0x80) !== 0 ? 1 : 0;
    this.A = res & 0xff;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    0x02 |
    carry;
  }
  sbc8(v) {
    this.QT = 0;
    const a = this.A;
    const c = this.F & 0x01;
    const res = a - v - c;
    const carry = res < 0 ? 1 : 0;
    const halfCarry = (a & 0x0f) - (v & 0x0f) - c < 0 ? 1 : 0;
    const overflow = ((a ^ v) & (a ^ res) & 0x80) !== 0 ? 1 : 0;
    this.A = res & 0xff;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    0x02 |
    carry;
  }
  and8(v) {
    this.QT = 0;
    this.A &= v;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    0x10 |
    this.parityTable[this.A] << 2;
  }
  xor8(v) {
    this.QT = 0;
    this.A ^= v;
    this.F =
    this.A & 0xa8 | (this.A ? 0 : 0x40) | this.parityTable[this.A] << 2;
  }
  or8(v) {
    this.QT = 0;
    this.A |= v;
    this.F =
    this.A & 0xa8 | (this.A ? 0 : 0x40) | this.parityTable[this.A] << 2;
  }
  cp8(v) {
    this.QT = 0;
    const res = this.A - v;
    const carry = res < 0 ? 1 : 0;
    const halfCarry = (this.A & 0x0f) - (v & 0x0f) < 0 ? 1 : 0;
    const overflow = ((this.A ^ v) & (this.A ^ res) & 0x80) !== 0 ? 1 : 0;
    this.F =
    res & 0xff & 0x80 |
    v & 0x28 | (
    res & 0xff ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    0x02 |
    carry;
  }
  rlca() {
    this.QT = 0;
    const carry = this.A >> 7 & 1;
    this.A = (this.A << 1 | carry) & 0xff;
    this.F = this.F & 0xc4 | this.A & 0x28 | carry;
  }
  rrca() {
    this.QT = 0;
    const carry = this.A & 1;
    this.A = (this.A >> 1 | carry << 7) & 0xff;
    this.F = this.F & 0xc4 | this.A & 0x28 | carry;
  }
  rla() {
    this.QT = 0;
    const carry = this.A >> 7 & 1;
    this.A = (this.A << 1 | this.F & 1) & 0xff;
    this.F = this.F & 0xc4 | this.A & 0x28 | carry;
  }
  rra() {
    this.QT = 0;
    const carry = this.A & 1;
    this.A = (this.A >> 1 | (this.F & 1) << 7) & 0xff;
    this.F = this.F & 0xc4 | this.A & 0x28 | carry;
  }
  rlc(v) {
    this.QT = 0;
    const carry = v >> 7 & 1;
    const res = (v << 1 | carry) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  rrc(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = (v >> 1 | carry << 7) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  rl(v) {
    this.QT = 0;
    const carry = v >> 7 & 1;
    const res = (v << 1 | this.F & 1) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  rr(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = (v >> 1 | (this.F & 1) << 7) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  sla(v) {
    this.QT = 0;
    const carry = v >> 7 & 1;
    const res = v << 1 & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  sra(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = (v >> 1 | v & 0x80) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  sll(v) {
    this.QT = 0;
    const carry = v >> 7 & 1;
    const res = (v << 1 | 1) & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  srl(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = v >> 1 & 0xff;
    this.F =
    res & 0xa8 | (res ? 0 : 0x40) | this.parityTable[res] << 2 | carry;
    return res;
  }
  daa() {
    this.QT = 0;
    const fCompressed =
    this.F & 0x01 | this.F & 0x02 | (this.F & 0x10) >> 2;
    const idx = this.A & 0xff | fCompressed << 8;
    const val = this.daaTable[idx];
    this.A = val & 0xff;
    this.F = val >> 8 & 0xff;
  }
  neg() {
    this.QT = 0;
    const a = this.A;
    this.A = -a & 0xff;
    this.F =
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) | (
    a & 0x0f ? 0x10 : 0) | (
    a === 0x80 ? 0x04 : 0) |
    0x02 | (
    a ? 0x01 : 0);
  }
  add16(a, b) {
    this.QT = 0;
    const res = a + b;
    const carry = res > 0xffff ? 1 : 0;
    const halfCarry = (a & 0x0fff) + (b & 0x0fff) > 0x0fff ? 1 : 0;
    this.F =
    this.F & 0xc4 | res >> 8 & 0xff & 0x28 | halfCarry << 4 | carry;
    this.MEMPTR = a + 1 & 0xffff;
    return res & 0xffff;
  }
  adc16(a, b) {
    this.QT = 0;
    const c = this.F & 0x01;
    const res = a + b + c;
    const carry = res > 0xffff ? 1 : 0;
    const halfCarry = (a & 0x0fff) + (b & 0x0fff) + c > 0x0fff ? 1 : 0;
    const overflow = ((a ^ res) & (b ^ res) & 0x8000) !== 0 ? 1 : 0;
    const result = res & 0xffff;
    this.F =
    result >> 8 & 0xa8 | (
    result ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    carry;
    this.MEMPTR = a + 1 & 0xffff;
    return result;
  }
  sbc16(a, b) {
    this.QT = 0;
    const c = this.F & 0x01;
    const res = a - b - c;
    const carry = res < 0 ? 1 : 0;
    const halfCarry = (a & 0x0fff) - (b & 0x0fff) - c < 0 ? 1 : 0;
    const overflow = ((a ^ b) & (a ^ res) & 0x8000) !== 0 ? 1 : 0;
    const result = res & 0xffff;
    this.F =
    result >> 8 & 0xa8 | (
    result ? 0 : 0x40) |
    overflow << 2 |
    halfCarry << 4 |
    0x02 |
    carry;
    this.MEMPTR = a + 1 & 0xffff;
    return result;
  }
  scf() {
    this.QT = 0;
    const oldYx = this.F & 0x28;
    const newYx = (oldYx & this.Q | this.A) & 0x28;
    // keep S,Z,P/V (0xc4); clear H,N; set C; apply computed Y/X
    this.F = this.F & 0xc4 | newYx | 0x01;
  }
  ccf() {
    this.QT = 0;
    const oldYx = this.F & 0x28;
    const newYx = (oldYx & this.Q | this.A) & 0x28;
    const oldCarry = this.F & 0x01;
    // keep S,Z,P/V (0xc4); H becomes old carry; N clear; C inverted; apply Y/X
    this.F = this.F & 0xc4 | newYx | oldCarry << 4 | oldCarry ^ 0x01;
  }
  exAFAF() {
    const tmp = this.AF;
    this.AF = this.AF_;
    this.AF_ = tmp;
  }
  exx() {
    let tmp = this.BC;
    this.BC = this.BC_;
    this.BC_ = tmp;
    tmp = this.DE;
    this.DE = this.DE_;
    this.DE_ = tmp;
    tmp = this.HL;
    this.HL = this.HL_;
    this.HL_ = tmp;
  }
  maybeCompleteNmiReturn(retSP) {
    if (
    this.nmiInProgress &&
    this.nmiReturnSP !== null &&
    retSP === this.nmiReturnSP)
    {
      this.nmiInProgress = false;
      this.nmiReturnSP = null;
    }
  }
  retn() {
    this.IFF1 = this.IFF2;
    this.nmiInProgress = false;
    this.nmiReturnSP = null;
    this.PC = this.pop16();
    this.MEMPTR = this.PC;
  }
  reti() {
    this.IFF1 = this.IFF2;
    this.nmiInProgress = false;
    this.nmiReturnSP = null;
    this.PC = this.pop16();
    this.MEMPTR = this.PC;
  }
  rld() {
    this.QT = 0;
    const hl = this.read8(this.HL);
    const a = this.A;
    this.A = a & 0xf0 | hl >> 4 & 0x0f;
    this.write8(this.HL, (hl << 4 | a & 0x0f) & 0xff);
    this.F =
    this.F & 0x01 |
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    this.parityTable[this.A] << 2;
    this.MEMPTR = this.HL + 1 & 0xffff;
  }
  rrd() {
    this.QT = 0;
    const hl = this.read8(this.HL);
    const a = this.A;
    this.A = a & 0xf0 | hl & 0x0f;
    this.write8(this.HL, (hl >> 4 | (a & 0x0f) << 4) & 0xff);
    this.F =
    this.F & 0x01 |
    this.A & 0xa8 | (
    this.A ? 0 : 0x40) |
    this.parityTable[this.A] << 2;
    this.MEMPTR = this.HL + 1 & 0xffff;
  }
  inPort(port) {
    this.QT = 0;
    const val = this.ioRead(port);
    this.F =
    this.F & 0x01 |
    val & 0xa8 | (
    val ? 0 : 0x40) |
    this.parityTable[val] << 2;
    this.MEMPTR = port + 1 & 0xffff;
    return val;
  }
  outPort(port, val) {
    this.QT = 0;
    this.ioWrite(port, val);
    this.MEMPTR = port + 1 & 0xffff;
  }
  ldi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    this.write8(this.DE, val);
    this.HL = this.HL + 1 & 0xffff;
    this.DE = this.DE + 1 & 0xffff;
    this.BC = this.BC - 1 & 0xffff;
    const n = val + this.A & 0xff;
    this.F =
    this.F & 0xc1 | (this.BC ? 0x04 : 0) | n & 0x08 | (n & 0x02) << 4;
    return 16;
  }
  ldir() {
    this.ldi();
    if (this.BC !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.MEMPTR = this.PC + 1 & 0xffff;
      return 21;
    }
    return 16;
  }
  ldd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    this.write8(this.DE, val);
    this.HL = this.HL - 1 & 0xffff;
    this.DE = this.DE - 1 & 0xffff;
    this.BC = this.BC - 1 & 0xffff;
    const n = val + this.A & 0xff;
    this.F =
    this.F & 0xc1 | (this.BC ? 0x04 : 0) | n & 0x08 | (n & 0x02) << 4;
    return 16;
  }
  incR() {
    this.R = this.R & 0x80 | this.R + 1 & 0x7f;
  }
  lddr() {
    this.ldd();
    if (this.BC !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.MEMPTR = this.PC + 1 & 0xffff;
      return 21;
    }
    return 16;
  }
  cpi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const res = this.A - val & 0xff;
    this.HL = this.HL + 1 & 0xffff;
    this.BC = this.BC - 1 & 0xffff;
    const hf = (this.A & 0x0f) - (val & 0x0f) < 0 ? 1 : 0;
    const n = res - hf & 0xff;
    this.F =
    res & 0x80 | (
    res ? 0 : 0x40) | (
    this.BC ? 0x04 : 0) |
    0x02 |
    hf << 4 |
    n & 0x08 |
    (n & 0x02) << 4 |
    this.F & 0x01;
    this.MEMPTR = this.MEMPTR + 1 & 0xffff;
    return 16;
  }
  cpir() {
    this.cpi();
    if (this.BC !== 0 && !(this.F & 0x40)) {
      this.PC = this.PC - 2 & 0xffff;
      this.MEMPTR = this.PC + 1 & 0xffff;
      return 21;
    }
    return 16;
  }
  cpd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const res = this.A - val & 0xff;
    this.HL = this.HL - 1 & 0xffff;
    this.BC = this.BC - 1 & 0xffff;
    const hf = (this.A & 0x0f) - (val & 0x0f) < 0 ? 1 : 0;
    const n = res - hf & 0xff;
    this.F =
    res & 0x80 | (
    res ? 0 : 0x40) | (
    this.BC ? 0x04 : 0) |
    0x02 |
    hf << 4 |
    n & 0x08 |
    (n & 0x02) << 4 |
    this.F & 0x01;
    this.MEMPTR = this.MEMPTR - 1 & 0xffff;
    return 16;
  }
  cpdr() {
    this.cpd();
    if (this.BC !== 0 && !(this.F & 0x40)) {
      this.PC = this.PC - 2 & 0xffff;
      this.MEMPTR = this.PC + 1 & 0xffff;
      return 21;
    }
    return 16;
  }
  blockIoInterruptedFlags() {
    const transferredByte = this._blockIoValue;
    const yx = this.PC >> 8 & 0x28;
    const pvOldBit = this.F & 0x04;
    const carrySet = (this.F & 0x01) !== 0;

    let hBit = 0;
    let pvRaw;
    if (carrySet) {
      if (transferredByte & 0x80) {
        pvRaw = this.B - 1 & 0x07;
        if ((this.B & 0x0f) === 0x00) hBit = 0x10;
      } else {
        pvRaw = this.B + 1 & 0x07;
        if ((this.B & 0x0f) === 0x0f) hBit = 0x10;
      }
    } else {
      pvRaw = this.B & 0x07;
    }

    const newPvBit = this.parityTable[pvRaw] << 2;
    const finalPvBit = (pvOldBit ^ newPvBit) & 0x04;

    // Keep S,Z,N,C (0xC3); overwrite Y,X,H,P/V.
    this.F = this.F & 0xc3 | yx | hBit | finalPvBit;
  }
  ini() {
    this.QT = 0;
    const originalBC = this.BC; // WZ uses BC BEFORE B is decremented
    const val = this.ioRead(originalBC);
    this.MEMPTR = originalBC + 1 & 0xffff;
    const newB = this.B - 1 & 0xff;
    this.write8(this.HL, val);
    this.HL = this.HL + 1 & 0xffff;

    const t = (this.C + 1 & 0xff) + val; // C is unchanged by this op
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[t & 0x07 ^ newB] << 2;

    this.B = newB;
    this.F =
    newB & 0x80 | ( // S
    newB === 0 ? 0x40 : 0) | // Z
    newB & 0x28 | ( // Y/X
    carryOut ? 0x10 : 0) | // H  (same bit as C, per hardware)
    pvBit | ( // P/V
    val & 0x80 ? 0x02 : 0) | ( // N  (bit 7 of transferred byte)
    carryOut ? 0x01 : 0); // C

    this._blockIoValue = val; // stashed for repeat-form correction
    return 16;
  }
  ind() {
    this.QT = 0;
    const originalBC = this.BC; // WZ uses BC BEFORE B is decremented
    const val = this.ioRead(originalBC);
    this.MEMPTR = originalBC - 1 & 0xffff;
    const newB = this.B - 1 & 0xff;
    this.write8(this.HL, val);
    this.HL = this.HL - 1 & 0xffff;

    const t = (this.C - 1 & 0xff) + val; // C is unchanged by this op
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[t & 0x07 ^ newB] << 2;

    this.B = newB;
    this.F =
    newB & 0x80 | (
    newB === 0 ? 0x40 : 0) |
    newB & 0x28 | (
    carryOut ? 0x10 : 0) |
    pvBit | (
    val & 0x80 ? 0x02 : 0) | (
    carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  outi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const newB = this.B - 1 & 0xff; // B decrements BEFORE WZ/port are formed
    this.B = newB;
    const portBC = this.BC; // now reflects decremented B
    this.MEMPTR = portBC + 1 & 0xffff;
    this.ioWrite(portBC, val);
    this.HL = this.HL + 1 & 0xffff;

    const t = (this.HL & 0xff) + val; // L is POST-increment here
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[t & 0x07 ^ newB] << 2;

    this.F =
    newB & 0x80 | (
    newB === 0 ? 0x40 : 0) |
    newB & 0x28 | (
    carryOut ? 0x10 : 0) |
    pvBit | (
    val & 0x80 ? 0x02 : 0) | (
    carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  outd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const newB = this.B - 1 & 0xff; // B decrements BEFORE WZ/port are formed
    this.B = newB;
    const portBC = this.BC; // now reflects decremented B
    this.MEMPTR = portBC - 1 & 0xffff;
    this.ioWrite(portBC, val);
    this.HL = this.HL - 1 & 0xffff;

    const t = (this.HL & 0xff) + val; // L is POST-decrement here
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[t & 0x07 ^ newB] << 2;

    this.F =
    newB & 0x80 | (
    newB === 0 ? 0x40 : 0) |
    newB & 0x28 | (
    carryOut ? 0x10 : 0) |
    pvBit | (
    val & 0x80 ? 0x02 : 0) | (
    carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  inir() {
    this.ini();
    if (this.B !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  indr() {
    this.ind();
    if (this.B !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  otir() {
    this.outi();
    if (this.B !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  otdr() {
    this.outd();
    if (this.B !== 0) {
      this.PC = this.PC - 2 & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }}


class EmulatorConfig {
  constructor() {
    this.display = {
      orientation: "landscape",
      width: 288,
      height: 224,
      scale: 1,
      pixelated: true };

    this.performance = {
      targetFPS: 60.606,
      cyclesPerFrame: 50688,
      interleaveQuantum: 64,
      enableFrameSkip: false };

    this.audio = {
      enabled: true,
      masterVolume: 0.5,
      bufferSize: 4096,
      sampleRate: 48000 };

    this.input = {
      touchDeadzone: 10,
      doubleTapTimeout: 300,
      preventScroll: true };

    this.debug = {
      showOverlay: false,
      logLevel: "info",
      showFPS: true,
      showCPUState: true };

    this.roms = {
      baseUrl: "https://subnetpie.github.io/arcade/bosco/",
      files: [
      {
        name: "bos5_1.3p",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "b1482ad1" },

      {
        name: "bos5_2.3m",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x1000,
        critical: true,
        crc32: "e0828ef8" },

      {
        name: "bos5_3.2m",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x2000,
        critical: true,
        crc32: "229edd51" },

      {
        name: "bos5_4.2l",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x3000,
        critical: true,
        crc32: "928a39a0" },

      {
        name: "bos5_5.3f",
        size: 0x1000,
        target: "subCpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "84f7c1ea" },

      {
        name: "bos5_6.3j",
        size: 0x1000,
        target: "subCpuRom",
        offset: 0x1000,
        critical: true,
        crc32: "7fa34d5e" },

      {
        name: "bos1_7.2c",
        size: 0x1000,
        target: "sub2CpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "d45a4911" },

      {
        name: "bos1_14.5d",
        size: 0x1000,
        target: "charRom",
        offset: 0x0000,
        critical: true,
        crc32: "a956d3c5" },

      {
        name: "bos1_13.5e",
        size: 0x1000,
        target: "spriteRom",
        offset: 0x0000,
        critical: true,
        crc32: "e869219c" },

      {
        name: "bos1-4.2r",
        size: 0x0100,
        target: "spriteShapeRom",
        offset: 0x0000,
        critical: true,
        crc32: "9b69b543" },

      {
        name: "bos1-6.6b",
        size: 0x0020,
        target: "proms",
        offset: 0x0000,
        critical: true,
        crc32: "d2b96fb0" },

      {
        name: "bos1-5.4m",
        size: 0x0100,
        target: "proms",
        offset: 0x0020,
        critical: true,
        crc32: "4e15d59c" },

      {
        name: "bos1-3.2d",
        size: 0x0020,
        target: "proms",
        offset: 0x0120,
        critical: true,
        crc32: "b88d5ba9" },

      {
        name: "bos1-7.7h",
        size: 0x0020,
        target: "proms",
        offset: 0x0140,
        critical: true,
        crc32: "87d61353" },

      {
        name: "bos1-1.1d",
        size: 0x0100,
        target: "soundProms",
        offset: 0x0000,
        soundPromRole: "waveform",
        critical: true,
        crc32: "de2316c6" },

      {
        name: "bos1-2.5c",
        size: 0x0100,
        target: "soundProms",
        offset: 0x0100,
        soundPromRole: "timing",
        emulationRequired: false,
        critical: false,
        crc32: "77245b66" },

      {
        name: "bos1_9.5n",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x0000,
        critical: true,
        crc32: "09acc978" },

      {
        name: "bos1_10.5m",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x1000,
        critical: true,
        crc32: "e571e959" },

      {
        name: "bos1_11.5k",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x2000,
        critical: true,
        crc32: "17ac9511" },

      {
        name: "50xx.bin",
        size: 0x0800,
        target: "mcuRom50",
        offset: 0x0000,
        critical: true,
        crc32: "a0acbaf7" },

      {
        name: "51xx.bin",
        size: 0x0400,
        target: "mcuRom51",
        offset: 0x0000,
        critical: true,
        crc32: "c2f57ef8" },

      {
        name: "52xx.bin",
        size: 0x0400,
        target: "mcuRom52",
        offset: 0x0000,
        critical: true,
        crc32: "3257d11e" },

      {
        name: "54xx.bin",
        size: 0x0400,
        target: "mcuRom54",
        offset: 0x0000,
        critical: true,
        crc32: "ee7357e0" }] };



  }
  getCanvasSize() {
    return { width: this.display.width, height: this.display.height };
  }
  isPortrait() {
    return this.display.orientation === "portrait";
  }}

class BoscoDipSwitches {
  constructor() {
    this.settings = {
      difficulty: 0x03, // raw 2-bit hw code: 0x01=Easy 0x03=Medium 0x02=Hardest 0x00=Auto
      allowContinue: 1, // 0 = No, 1 = Yes   (bit 0x04, default Yes)
      demoSounds: 1, // 0 = Off, 1 = On   (bit 0x08, active-low: 0x08=Off)
      freeze: 0, // 0 = Off, 1 = On   (bit 0x10, active-low: 0x10=Off)
      cabinet: 0, // 0 = Upright, 1 = Cocktail (bit 0x80, 0x80=Upright)
      coinage: 0x07, // raw 3-bit hw code, default 0x07 = 1 Coin/1 Credit
      bonusFighter: 0x20, // raw 3-bit hw code (bits 0x38), meaning depends on `lives`
      lives: 3 // 1, 2, 3, or 5
    };
  }

  // DSWA
  getBankA() {
    const s = this.settings;
    let val = 0xff;
    val = val & ~0x03 | s.difficulty & 0x03;
    val = val & ~0x04 | (s.allowContinue ? 0x04 : 0x00);
    val = val & ~0x08 | (s.demoSounds ? 0x00 : 0x08); // active-low
    val = val & ~0x10 | (s.freeze ? 0x00 : 0x10); // active-low
    val = val & ~0x80 | (s.cabinet === 1 ? 0x00 : 0x80);
    return val & 0xff;
  }

  // DSWB
  getBankB() {var _livesMap$s$lives;
    const s = this.settings;
    let val = 0xff;
    val = val & ~0x07 | s.coinage & 0x07;
    val = val & ~0x38 | s.bonusFighter & 0x38;
    const livesMap = { 1: 0x00, 2: 0x40, 3: 0x80, 5: 0xc0 };
    val = val & ~0xc0 | ((_livesMap$s$lives = livesMap[s.lives]) !== null && _livesMap$s$lives !== void 0 ? _livesMap$s$lives : 0x80);
    return val & 0xff;
  }

  readHardware(offset) {
    offset &= 0x07;
    const bit0 = this.getBankB() >> offset & 1;
    const bit1 = this.getBankA() >> offset & 1;
    return bit0 | bit1 << 1;
  }

  getDifficultyText() {
    const map = { 0x00: "Auto", 0x01: "Easy", 0x03: "Medium", 0x02: "Hardest" };
    return map[this.settings.difficulty & 0x03];
  }

  getLivesText() {
    return this.settings.lives + " ships";
  }

  getCabinetText() {
    return this.settings.cabinet === 0 ? "Upright" : "Cocktail";
  }}

class InputManager {
  // keyboard pulse duration (coin/start/service)
  // touch pulse duration (longer: finger dwell/debounce)

  // Canonical hardware buttons, each optionally carrying lowercase aliases
  // used by virtual/analog controls (e.g. Touchpads). Keeping aliases here
  // means there is exactly one table to update when adding an input.














  constructor(config) {
    this.config = config;

    this.ports = {
      in0: 0xff,
      in1: 0xff };


    this.buttons = InputManager.BUTTONS;

    // Reverse lookup: lowercase alias -> uppercase button key. Built once
    // from BUTTONS so aliases can never drift out of sync with the
    // canonical table.
    this._aliasToButton = {};
    for (const [key, def] of Object.entries(this.buttons)) {
      if (def.alias) this._aliasToButton[def.alias] = key;
    }
    // Bosconian's real cabinet has no second action button. "bomb" is
    // accepted as a known-but-inert alias so virtual controls that offer
    // it don't spam console warnings; it resolves to null, and
    // pressButton(null)/releaseButton(null) are safe no-ops.
    this._aliasToButton.bomb = null;

    this.onStateChange = null;
    this._lastNotifiedIn0 = undefined;
    this._lastNotifiedIn1 = undefined;

    this.heldButtons = new Set();
    this.pulseTimers = new Map();

    this._keyboardBound = false;
    this._blurBound = false;

    // Bound handler references, populated by setupKeyboardControls() /
    // _setupButton(), needed so destroy() can actually remove them.
    this._onKeydown = null;
    this._onKeyup = null;
    this._onBlur = null;
    this._onVisibility = null;
    this._boundElements = new Map(); // element -> { press, release, contextmenu }
  }

  getState() {
    return {
      in0: this.ports.in0 & 0xff,
      in1: this.ports.in1 & 0xff };

  }

  setOnStateChange(fn, notifyImmediately = true) {
    this.onStateChange = typeof fn === "function" ? fn : null;

    if (this.onStateChange && notifyImmediately) {
      this._notifyStateChange(true);
    }
  }

  pressButton(button) {
    const b = this.buttons[button];
    if (!b) return false;

    if (this.heldButtons.has(button)) return false;

    const before = this.ports[b.port];
    const after = before & ~b.mask & 0xff;

    this.heldButtons.add(button);
    this.ports[b.port] = after;

    if (after !== before) {
      this._notifyStateChange();
    }

    return true;
  }

  releaseButton(button) {
    const b = this.buttons[button];
    if (!b) return false;

    const timer = this.pulseTimers.get(button);
    if (timer != null) {
      clearTimeout(timer);
      this.pulseTimers.delete(button);
    }

    const wasHeld = this.heldButtons.delete(button);
    const before = this.ports[b.port];
    const after = (before | b.mask) & 0xff;

    this.ports[b.port] = after;

    if (wasHeld && after !== before) {
      this._notifyStateChange();
    }

    return wasHeld;
  }

  pulseButton(button, duration = InputManager.PULSE_MS) {
    const b = this.buttons[button];
    if (!b) return false;

    if (this.heldButtons.has(button)) return false;

    this.pressButton(button);

    const timer = setTimeout(() => {
      this.pulseTimers.delete(button);
      this.releaseButton(button);
    }, Math.max(1, duration | 0));

    this.pulseTimers.set(button, timer);
    return true;
  }

  releaseAll() {
    for (const timer of this.pulseTimers.values()) {
      clearTimeout(timer);
    }

    this.pulseTimers.clear();
    this.heldButtons.clear();

    const changed = this.ports.in0 !== 0xff || this.ports.in1 !== 0xff;

    this.ports.in0 = 0xff;
    this.ports.in1 = 0xff;

    if (changed) {
      this._notifyStateChange();
    }
  }

  _notifyStateChange(force = false) {
    if (!this.onStateChange) return;

    const state = this.getState();

    if (
    !force &&
    this._lastNotifiedIn0 === state.in0 &&
    this._lastNotifiedIn1 === state.in1)
    {
      return;
    }

    this._lastNotifiedIn0 = state.in0;
    this._lastNotifiedIn1 = state.in1;

    this.onStateChange(state);
  }

  /* ---------------- virtual/analog control bridge ---------------- */

  setInput(name, state) {
    const button = this._resolveAlias(name);
    if (button === undefined) return; // unmapped name, already warned
    if (state) {
      this.pressButton(button);
    } else {
      this.releaseButton(button);
    }
  }

  pulseInput(name, duration = InputManager.PULSE_MS) {
    const button = this._resolveAlias(name);
    if (button === undefined) return;
    this.pulseButton(button, duration);
  }

  _resolveAlias(name) {
    if (!(name in this._aliasToButton)) {
      console.warn(`[InputManager] Unknown touch input "${name}"`);
      return undefined;
    }
    return this._aliasToButton[name]; // may be null (known, intentionally inert)
  }

  /* ---------------- discrete on-screen buttons ---------------- */

  setupTouchControls(containerElement) {var _this$config, _this$config$input;
    const coin = document.getElementById("btnCoin");
    const start = document.getElementById("btnStart");

    if (!coin && !start) return false;

    if ((_this$config = this.config) !== null && _this$config !== void 0 && (_this$config$input = _this$config.input) !== null && _this$config$input !== void 0 && _this$config$input.preventScroll && containerElement) {
      containerElement.addEventListener(
      "touchmove",
      event => event.preventDefault(),
      { passive: false });

    }

    if (coin) this._setupButton(coin, "COIN1", true);
    if (start) this._setupButton(start, "START1", true);

    return true;
  }

  _setupButton(element, button, isPulse) {
    if (!element || element.dataset.inputBound === "true") return;

    element.dataset.inputBound = "true";
    element.style.touchAction = "none";

    const press = event => {
      event.preventDefault();
      event.stopPropagation();

      if (isPulse) {
        this.pulseButton(button, InputManager.TOUCH_PULSE_MS);
        this._visualFeedback(element, InputManager.TOUCH_PULSE_MS);
      } else {
        this.pressButton(button);
        this._visualFeedback(element);
      }

      if (event.pointerId != null) {var _element$setPointerCa;
        (_element$setPointerCa = element.setPointerCapture) === null || _element$setPointerCa === void 0 ? void 0 : _element$setPointerCa.call(element, event.pointerId);
      }
    };

    const release = event => {
      event.preventDefault();
      event.stopPropagation();

      if (!isPulse) {
        this.releaseButton(button);
      }

      this._clearVisualFeedback(element);
    };

    const contextmenu = event => event.preventDefault();

    element.addEventListener("pointerdown", press, { passive: false });
    element.addEventListener("pointerup", release, { passive: false });
    element.addEventListener("pointercancel", release, { passive: false });
    element.addEventListener("lostpointercapture", release, { passive: false });
    element.addEventListener("contextmenu", contextmenu);

    // Stashed so destroy() can remove exactly what was added.
    this._boundElements.set(element, { press, release, contextmenu });
  }

  _visualFeedback(element, duration = null) {
    element.classList.add("pressed");

    if (duration != null) {
      setTimeout(() => this._clearVisualFeedback(element), duration);
    }
  }

  _clearVisualFeedback(element) {
    element.classList.remove("pressed");
  }

  /* ---------------- keyboard ---------------- */



























  setupKeyboardControls() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;

    this._onKeydown = event => {
      const mapped = InputManager.KEY_MAP[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (mapped.pulse) {
        if (!event.repeat) this.pulseButton(mapped.button);
      } else {
        this.pressButton(mapped.button);
      }
    };

    this._onKeyup = event => {
      const mapped = InputManager.KEY_MAP[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (!mapped.pulse) this.releaseButton(mapped.button);
    };

    document.addEventListener("keydown", this._onKeydown);
    document.addEventListener("keyup", this._onKeyup);

    if (!this._blurBound) {
      this._blurBound = true;
      this._onBlur = () => this.releaseAll();
      this._onVisibility = () => {
        if (document.hidden) this.releaseAll();
      };
      window.addEventListener("blur", this._onBlur);
      document.addEventListener("visibilitychange", this._onVisibility);
    }
  }

  /* ---------------- teardown ----------------
     Call this before discarding an InputManager instance (e.g. at the top
     of a CodePen re-run) to avoid stacking duplicate document/window
     listeners across reloads — the original class had no way to undo
     setupKeyboardControls()/setupTouchControls(), so every re-run left the
     previous instance's handlers permanently attached. */
  destroy() {
    this.releaseAll();

    if (this._onKeydown)
    document.removeEventListener("keydown", this._onKeydown);
    if (this._onKeyup) document.removeEventListener("keyup", this._onKeyup);
    if (this._onBlur) window.removeEventListener("blur", this._onBlur);
    if (this._onVisibility) {
      document.removeEventListener("visibilitychange", this._onVisibility);
    }

    for (const [element, handlers] of this._boundElements) {
      element.removeEventListener("pointerdown", handlers.press);
      element.removeEventListener("pointerup", handlers.release);
      element.removeEventListener("pointercancel", handlers.release);
      element.removeEventListener("lostpointercapture", handlers.release);
      element.removeEventListener("contextmenu", handlers.contextmenu);
      delete element.dataset.inputBound;
    }
    this._boundElements.clear();

    this._keyboardBound = false;
    this._blurBound = false;
    this._onKeydown = null;
    this._onKeyup = null;
    this._onBlur = null;
    this._onVisibility = null;
    this.onStateChange = null;
  }}_defineProperty(InputManager, "PULSE_MS", 100);_defineProperty(InputManager, "TOUCH_PULSE_MS", 250);_defineProperty(InputManager, "BUTTONS", Object.freeze({ UP: { port: "in0", mask: 0x01, pulse: false, alias: "up" }, RIGHT: { port: "in0", mask: 0x02, pulse: false, alias: "right" }, DOWN: { port: "in0", mask: 0x04, pulse: false, alias: "down" }, LEFT: { port: "in0", mask: 0x08, pulse: false, alias: "left" }, FIRE: { port: "in1", mask: 0x01, pulse: false, alias: "fire" }, START1: { port: "in1", mask: 0x04, pulse: true }, START2: { port: "in1", mask: 0x08, pulse: true }, COIN1: { port: "in1", mask: 0x10, pulse: true }, COIN2: { port: "in1", mask: 0x20, pulse: true }, SERVICE: { port: "in1", mask: 0x40, pulse: true } }));_defineProperty(InputManager, "KEY_MAP", Object.freeze({ arrowup: { button: "UP", pulse: false }, w: { button: "UP", pulse: false }, arrowleft: { button: "LEFT", pulse: false }, a: { button: "LEFT", pulse: false }, arrowright: { button: "RIGHT", pulse: false }, d: { button: "RIGHT", pulse: false }, arrowdown: { button: "DOWN", pulse: false }, s: { button: "DOWN", pulse: false }, " ": { button: "FIRE", pulse: false }, z: { button: "FIRE", pulse: false }, x: { button: "FIRE", pulse: false }, 5: { button: "COIN1", pulse: true }, 6: { button: "COIN2", pulse: true }, 1: { button: "START1", pulse: true }, 2: { button: "START2", pulse: true }, 9: { button: "SERVICE", pulse: true } }));

class Touchpads {


  constructor(inputs = {}, options = {}) {var _options$deadzone, _options$dpadRadius, _options$ringRadius, _this$canvas$getConte, _this$canvas, _this$canvas$width, _this$canvas2, _this$canvas$height, _this$canvas3;
    this.inputs = inputs;

    this.deadzone = (_options$deadzone = options.deadzone) !== null && _options$deadzone !== void 0 ? _options$deadzone : 20;
    this.dpadRadius = (_options$dpadRadius = options.dpadRadius) !== null && _options$dpadRadius !== void 0 ? _options$dpadRadius : 90;
    this.ringRadius = (_options$ringRadius = options.ringRadius) !== null && _options$ringRadius !== void 0 ? _options$ringRadius : 18;

    this.dpadTouchId = null;
    this.fireTouchId = null;

    this.dpadEl = document.getElementById("dpad-ring");
    this.fireEl = document.getElementById("btn-fire");
    this.canvas = document.getElementById("dpad-canvas");
    this.dpadCtx = (_this$canvas$getConte = (_this$canvas = this.canvas) === null || _this$canvas === void 0 ? void 0 : _this$canvas.getContext("2d")) !== null && _this$canvas$getConte !== void 0 ? _this$canvas$getConte : null;

    this.canvasW = (_this$canvas$width = (_this$canvas2 = this.canvas) === null || _this$canvas2 === void 0 ? void 0 : _this$canvas2.width) !== null && _this$canvas$width !== void 0 ? _this$canvas$width : 200;
    this.canvasH = (_this$canvas$height = (_this$canvas3 = this.canvas) === null || _this$canvas3 === void 0 ? void 0 : _this$canvas3.height) !== null && _this$canvas$height !== void 0 ? _this$canvas$height : 200;

    this._dpadActive = {
      up: false,
      down: false,
      left: false,
      right: false };


    this._bound = {
      dpadStart: event => this._dpadStart(event),
      dpadMove: event => this._dpadMove(event),
      dpadEnd: event => this._dpadEnd(event),
      fireStart: event => this._fireStart(event),
      fireEnd: event => this._fireEnd(event),
      preventContextMenu: event => event.preventDefault() };


    this.bindEvents();
  }

  bindEvents() {
    const opts = { passive: false };

    if (this.dpadEl) {
      this.dpadEl.style.touchAction = "none";
      this.dpadEl.addEventListener("touchstart", this._bound.dpadStart, opts);
      this.dpadEl.addEventListener("touchmove", this._bound.dpadMove, opts);
      this.dpadEl.addEventListener("touchend", this._bound.dpadEnd, opts);
      this.dpadEl.addEventListener("touchcancel", this._bound.dpadEnd, opts);
      this.dpadEl.addEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    if (this.fireEl) {
      this.fireEl.style.touchAction = "none";
      this.fireEl.addEventListener("touchstart", this._bound.fireStart, opts);
      this.fireEl.addEventListener("touchend", this._bound.fireEnd, opts);
      this.fireEl.addEventListener("touchcancel", this._bound.fireEnd, opts);
      this.fireEl.addEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }
  }

  destroy() {
    const opts = { passive: false };

    if (this.dpadEl) {
      this.dpadEl.removeEventListener(
      "touchstart",
      this._bound.dpadStart,
      opts);

      this.dpadEl.removeEventListener("touchmove", this._bound.dpadMove, opts);
      this.dpadEl.removeEventListener("touchend", this._bound.dpadEnd, opts);
      this.dpadEl.removeEventListener("touchcancel", this._bound.dpadEnd, opts);
      this.dpadEl.removeEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    if (this.fireEl) {
      this.fireEl.removeEventListener(
      "touchstart",
      this._bound.fireStart,
      opts);

      this.fireEl.removeEventListener("touchend", this._bound.fireEnd, opts);
      this.fireEl.removeEventListener("touchcancel", this._bound.fireEnd, opts);
      this.fireEl.removeEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    this.releaseAll();
  }

  releaseAll() {var _this$fireEl;
    this.dpadTouchId = null;
    this.fireTouchId = null;
    this._setDirections({
      up: false,
      down: false,
      left: false,
      right: false });

    this.setInput("fire", false);
    (_this$fireEl = this.fireEl) === null || _this$fireEl === void 0 ? void 0 : _this$fireEl.classList.remove("pressed");
    this.clearCanvas();
  }

  _dpadStart(event) {
    event.preventDefault();

    if (this.dpadTouchId !== null) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    this.dpadTouchId = touch.identifier;
    this._updateDpad(touch);
  }

  _dpadMove(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.dpadTouchId) {
        this._updateDpad(touch);
        return;
      }
    }
  }

  _dpadEnd(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.dpadTouchId) {
        this.dpadTouchId = null;
        this._setDirections({
          up: false,
          down: false,
          left: false,
          right: false });

        this.clearCanvas();
        return;
      }
    }
  }

  _fireStart(event) {var _this$fireEl2;
    event.preventDefault();

    if (this.fireTouchId !== null) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    this.fireTouchId = touch.identifier;
    this.setInput("fire", true);
    (_this$fireEl2 = this.fireEl) === null || _this$fireEl2 === void 0 ? void 0 : _this$fireEl2.classList.add("pressed");
  }

  _fireEnd(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.fireTouchId) {var _this$fireEl3;
        this.fireTouchId = null;
        this.setInput("fire", false);
        (_this$fireEl3 = this.fireEl) === null || _this$fireEl3 === void 0 ? void 0 : _this$fireEl3.classList.remove("pressed");
        return;
      }
    }
  }

  _updateDpad(touch) {
    if (!this.dpadEl) return;

    const rect = this.dpadEl.getBoundingClientRect();

    const dx = touch.clientX - (rect.left + rect.width / 2);
    const dy = touch.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);

    if (distance < this.deadzone) {
      this._setDirections({
        up: false,
        down: false,
        left: false,
        right: false });

      this.drawTouchRing(0, 0, distance);
      return;
    }

    /*
     * Eight equal 45-degree sectors, centered on each cardinal/diagonal:
     *
     *                 UP
     *           UL           UR
     *       LEFT                 RIGHT
     *           DL           DR
     *                DOWN
     *
     * A diagonal produces two simultaneously asserted hardware direction
     * bits, which is precisely how the cabinet's 8-way joystick behaves.
     */
    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4));
    const octant = sector + 8 & 7;

    const next = {
      up: false,
      down: false,
      left: false,
      right: false };


    switch (octant) {
      case 0: // right
        next.right = true;
        break;

      case 1: // down-right
        next.down = true;
        next.right = true;
        break;

      case 2: // down
        next.down = true;
        break;

      case 3: // down-left
        next.down = true;
        next.left = true;
        break;

      case 4: // left
        next.left = true;
        break;

      case 5: // up-left
        next.up = true;
        next.left = true;
        break;

      case 6: // up
        next.up = true;
        break;

      case 7: // up-right
        next.up = true;
        next.right = true;
        break;}


    this._setDirections(next);

    const visualLimit = Math.min(
    distance,
    Math.min(this.dpadRadius, Math.min(rect.width, rect.height) / 2));


    this.drawTouchRing(
    Math.cos(angle) * visualLimit,
    Math.sin(angle) * visualLimit,
    distance);

  }

  _setDirections(next) {
    for (const direction of Touchpads.DIRECTIONS) {
      const state = !!next[direction];

      if (this._dpadActive[direction] !== state) {
        this._dpadActive[direction] = state;
        this.setInput(direction, state);
      }
    }
  }

  setInput(name, state) {var _this$inputs$setInput, _this$inputs;
    (_this$inputs$setInput = (_this$inputs = this.inputs).setInput) === null || _this$inputs$setInput === void 0 ? void 0 : _this$inputs$setInput.call(_this$inputs, name, state);
  }

  clearCanvas() {
    if (!this.dpadCtx) return;
    this.dpadCtx.clearRect(0, 0, this.canvasW, this.canvasH);
  }

  drawTouchRing(tx, ty, distance) {
    if (!this.dpadCtx) return;

    const ctx = this.dpadCtx;
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;

    const alpha =
    distance < this.deadzone ? 0.25 : Math.min(1, distance / this.dpadRadius);

    this.clearCanvas();

    ctx.beginPath();
    ctx.arc(cx + tx, cy + ty, this.ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200, 50, 200, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }}_defineProperty(Touchpads, "DIRECTIONS", Object.freeze(["up", "down", "left", "right"]));

class UIManager {
  constructor(config) {
    this.config = config;
    this.canvas = null;
    this.ctx = null;
  }
  initCanvas(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return false;
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    if (!this.ctx) return false;

    this.canvas.width = 288;
    this.canvas.height = 224;

    if (this.config.display.pixelated) {
      this.ctx.imageSmoothingEnabled = false;
    }
    return true;
  }
  beginFrame() {
    let color = "#000";
    if (!this.ctx) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  endFrame() {}
  updateStatusBar(frameCount, cpuStates) {
    const statusBar = document.getElementById("statusBar");
    if (!statusBar) return;

    let html = `Frame: ${frameCount}`;

    if (this.config.debug.showCPUState && cpuStates) {
      html += ` | M:0x${cpuStates.mainPC} S:0x${cpuStates.subPC} A:0x${cpuStates.soundPC}`;
    }

    if (this.config.debug.showFPS) {
      html += ` | FPS: ${this.fpsCounter.fps}`;
    }
    statusBar.innerHTML = html;
  }
  getContext() {
    return this.ctx;
  }}


class BoscoTimingSequencer {


  // All three Z80 CPUs run at MASTER_CLOCK / 6.


  // Pixel clock is MASTER_CLOCK / 3.




















  constructor(machine) {
    this.machine = machine;

    this.now = 0;

    this.sequence = 0;
    this.events = [];
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;

    this.rasterTimersArmed = false;
    this.cpu3NmiTimerArmed = false;
    this.cpu3NmiGateOpen = true;
    this.cpuSlots = [
    {
      kind: "cpu",
      name: "main",
      local: 0,
      cpu: () => this.machine.mainCpu },

    {
      kind: "cpu",
      name: "sub",
      local: 0,
      cpu: () => this.machine.subCpu },

    {
      kind: "cpu",
      name: "sub2",
      local: 0,
      cpu: () => this.machine.sub2Cpu }];


    this.mcuSlots = [
    {
      kind: "mcu",
      name: "51xx",
      local: 0,
      device: () => this.machine.inputController },

    {
      kind: "mcu",
      name: "50xx-cpu-board",
      local: 0,
      device: () => {var _this$machine$cpuBoar;return (_this$machine$cpuBoar = this.machine.cpuBoard50xx) !== null && _this$machine$cpuBoar !== void 0 ? _this$machine$cpuBoar : this.machine.movementMcu1;} },

    {
      kind: "mcu",
      name: "50xx-video-board",
      local: 0,
      device: () => {var _this$machine$videoBo;return (_this$machine$videoBo = this.machine.videoBoard50xx) !== null && _this$machine$videoBo !== void 0 ? _this$machine$videoBo : this.machine.movementMcu2;} },

    {
      kind: "mcu",
      name: "52xx",
      local: 0,
      device: () => this.machine.voiceChip },

    {
      kind: "mcu",
      name: "54xx",
      local: 0,
      device: () => this.machine.namco54xx }];


  }
  get schedulerTick() {var _this$activeTick;
    return (_this$activeTick = this.activeTick) !== null && _this$activeTick !== void 0 ? _this$activeTick : this.now;
  }
  get eventCount() {
    return this.events.length - this.eventHead;
  }
  get nextDeadline() {
    this.discardCancelledHead();

    return this.eventHead < this.events.length ?
    this.events[this.eventHead].deadline :
    Infinity;
  }
  reset() {
    this.now = 0;

    this.sequence = 0;
    this.events.length = 0;
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;

    this.rasterTimersArmed = false;
    this.cpu3NmiTimerArmed = false;
    this.cpu3NmiGateOpen = true;

    this.machine._activeCpuName = null;

    for (const slot of this.cpuSlots) {
      slot.local = 0;
    }

    for (const slot of this.mcuSlots) {
      slot.local = 0;
    }
  }
  at(deadline, callback, owner = null) {
    if (typeof callback !== "function") {
      throw new TypeError("Timing event callback must be a function");
    }

    const requestedDeadline = Math.floor(Number(deadline));

    if (!Number.isFinite(requestedDeadline)) {
      throw new RangeError(
      "Invalid timing-event deadline: " + String(deadline));

    }

    const event = {
      deadline: Math.max(this.schedulerTick, requestedDeadline),
      sequence: ++this.sequence,
      callback,
      owner,
      cancelled: false };


    let low = this.eventHead;
    let high = this.events.length;

    while (low < high) {
      const middle = low + high >> 1;
      const other = this.events[middle];

      const insertAfter =
      other.deadline < event.deadline ||
      other.deadline === event.deadline && other.sequence <= event.sequence;

      if (insertAfter) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    this.events.splice(low, 0, event);

    return {
      cancel: () => {
        event.cancelled = true;
      } };

  }
  synchronize(callback, owner = null) {
    return this.at(this.schedulerTick, callback, owner);
  }
  cancelOwner(owner) {
    for (let index = this.eventHead; index < this.events.length; index++) {
      if (this.events[index].owner === owner) {
        this.events[index].cancelled = true;
      }
    }
  }
  discardCancelledHead() {
    while (
    this.eventHead < this.events.length &&
    this.events[this.eventHead].cancelled)
    {
      this.eventHead++;
    }

    this.compactQueue();
  }
  compactQueue() {
    if (this.eventHead > 256 && this.eventHead * 2 > this.events.length) {
      this.events = this.events.slice(this.eventHead);
      this.eventHead = 0;
    }
  }
  ownerName(owner) {var _owner$constructor$na, _owner$constructor;
    if (owner == null) {
      return "anonymous";
    }

    if (typeof owner === "string") {
      return owner;
    }

    return (_owner$constructor$na = (_owner$constructor = owner.constructor) === null || _owner$constructor === void 0 ? void 0 : _owner$constructor.name) !== null && _owner$constructor$na !== void 0 ? _owner$constructor$na : String(owner);
  }
  dispatchCurrentTime() {
    let dispatched = 0;

    for (;;) {
      this.discardCancelledHead();

      if (this.eventHead >= this.events.length) {
        return;
      }

      const event = this.events[this.eventHead];

      if (event.deadline > this.now) {
        return;
      }

      this.eventHead++;

      if (event.cancelled) {
        continue;
      }

      try {
        event.callback();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);

        const error = new Error(
        "Timing callback failed at tick " +
        this.now +
        " owner " +
        this.ownerName(event.owner) +
        ": " +
        message);


        error.cause = cause;
        throw error;
      }

      dispatched++;

      if (dispatched > this.constructor.MAX_EVENTS_AT_ONE_TICK) {
        throw new Error(
        "Timing event-loop overflow at tick " +
        this.now +
        " owner " +
        this.ownerName(event.owner));

      }
    }
  }
  cpuIsHeld(slot) {var _slot$cpu;
    const cpu = (_slot$cpu = slot.cpu) === null || _slot$cpu === void 0 ? void 0 : _slot$cpu.call(slot);

    if (!cpu || cpu.inReset) {
      return true;
    }

    if (typeof cpu.isReset === "function" && cpu.isReset()) {
      return true;
    }

    /*
     * Q3 holds sub and sound CPU reset.
     * Main CPU always remains eligible to run.
     */
    if (slot.name !== "main") {var _this$machine$cpuBoar2;
      return !!((_this$machine$cpuBoar2 =
      this.machine.cpuBoardResetAsserted) !== null && _this$machine$cpuBoar2 !== void 0 ? _this$machine$cpuBoar2 : this.machine.subsystemsReset);

    }

    return false;
  }
  deviceIsHeld(slot, device) {
    void slot;

    if (!device || device.inReset) {
      return true;
    }

    return typeof device.isReset === "function" && device.isReset();
  }
  liveCpuSlots() {
    const slots = [];

    for (const slot of this.cpuSlots) {
      if (this.cpuIsHeld(slot)) {
        slot.local = Math.max(slot.local, this.now);
        continue;
      }

      slots.push(slot);
    }

    return slots;
  }
  liveMcuSlots() {
    const slots = [];

    for (const slot of this.mcuSlots) {var _slot$device;
      const device = (_slot$device = slot.device) === null || _slot$device === void 0 ? void 0 : _slot$device.call(slot);

      if (this.deviceIsHeld(slot, device)) {
        slot.local = Math.max(slot.local, this.now);
        continue;
      }

      slots.push(slot);
    }

    return slots;
  }
  pickEarliest(limit) {
    let best = null;
    let bestLocal = Infinity;

    const consider = slot => {
      if (slot.local >= limit || slot.local >= bestLocal) {
        return;
      }

      best = slot;
      bestLocal = slot.local;
    };

    for (const slot of this.liveCpuSlots()) {
      consider(slot);
    }

    for (const slot of this.liveMcuSlots()) {
      consider(slot);
    }

    return best;
  }
  syncNow() {
    let earliest = Infinity;

    for (const slot of this.liveCpuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    for (const slot of this.liveMcuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    if (Number.isFinite(earliest)) {
      this.now = earliest;
    }
  }
  runOneCpuInstruction(slot, barrier) {var _slot$cpu2;
    const cpu = (_slot$cpu2 = slot.cpu) === null || _slot$cpu2 === void 0 ? void 0 : _slot$cpu2.call(slot);

    if (!cpu || this.cpuIsHeld(slot)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    this.activeTick = slot.local;
    this.activeSlot = slot;
    this.machine._activeCpuName = slot.name;

    try {var _cpu$step, _cpu$step2;
      const cycles = (_cpu$step = (_cpu$step2 = cpu.step) === null || _cpu$step2 === void 0 ? void 0 : _cpu$step2.call(cpu)) !== null && _cpu$step !== void 0 ? _cpu$step : 0;

      if (!Number.isFinite(cycles) || cycles < 0) {
        throw new Error(
        "Invalid Z80 cycle result for " + slot.name + ": " + String(cycles));

      }

      if (cycles === 0) {
        slot.local = Math.max(slot.local, barrier);
        return;
      }

      slot.local += cycles * this.constructor.Z80_TICKS;
    } finally {
      this.activeTick = null;
      this.activeSlot = null;
      this.machine._activeCpuName = null;
    }
  }
  deviceQuantumTicks(device, name) {var _device$constructor;
    const quantum =
    typeof device.nextMasterTickBoundary === "function" ?
    device.nextMasterTickBoundary() : (_device$constructor =
    device.constructor) === null || _device$constructor === void 0 ? void 0 : _device$constructor.MASTER_TICKS_PER_MCU_CYCLE;

    if (!Number.isFinite(quantum) || quantum <= 0) {
      throw new Error(
      "Timing device " +
      name +
      " must expose nextMasterTickBoundary() or " +
      "MASTER_TICKS_PER_MCU_CYCLE");

    }

    return Math.floor(quantum);
  }
  runOneMcuQuantum(slot, barrier) {var _slot$device2;
    const device = (_slot$device2 = slot.device) === null || _slot$device2 === void 0 ? void 0 : _slot$device2.call(slot);

    if (!device || this.deviceIsHeld(slot, device)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    if (typeof device.advanceMasterTicks !== "function") {
      throw new Error(
      "Timing device " +
      slot.name +
      " must implement advanceMasterTicks(deltaMasterTicks)");

    }

    const quantum = this.deviceQuantumTicks(device, slot.name);

    const sliceEnd = Math.min(barrier, slot.local + quantum);

    const delta = sliceEnd - slot.local;

    if (delta <= 0) {
      return;
    }

    this.activeTick = slot.local;
    this.activeSlot = slot;

    try {
      device.advanceMasterTicks(delta);
      slot.local = sliceEnd;
    } finally {
      this.activeTick = null;
      this.activeSlot = null;
    }
  }
  advanceTo(limit) {
    let idleSpins = 0;

    while (this.now < limit) {
      this.dispatchCurrentTime();

      const barrier = Math.min(limit, this.nextDeadline);

      if (barrier < this.now) {
        throw new Error(
        "Timing deadline moved backward: " + barrier + " < " + this.now);

      }

      if (this.nextDeadline === this.now) {
        idleSpins++;

        if (idleSpins > this.constructor.MAX_EVENTS_AT_ONE_TICK) {
          throw new Error("Timing scheduler stalled at tick " + this.now);
        }

        continue;
      }

      idleSpins = 0;

      const slot = this.pickEarliest(barrier);

      if (!slot) {
        this.now = barrier;
        continue;
      }

      if (slot.kind === "cpu") {
        this.runOneCpuInstruction(slot, barrier);
      } else {
        this.runOneMcuQuantum(slot, barrier);
      }

      this.syncNow();
    }

    this.dispatchCurrentTime();
  }
  runUntil(targetTick) {
    const target = Math.floor(Number(targetTick));

    if (!Number.isFinite(target)) {
      throw new RangeError("Invalid runUntil target: " + String(targetTick));
    }

    if (target < this.now) {
      throw new Error(
      "Cannot run scheduler backward: " + target + " < " + this.now);

    }

    this.advanceTo(target);
  }
  frameOrigin() {
    return (
      Math.floor(this.now / this.constructor.FRAME_TICKS) *
      this.constructor.FRAME_TICKS);

  }
  timeUntilPos(scanline) {
    const frameStart = this.frameOrigin();

    let deadline = frameStart + scanline * this.constructor.SCANLINE_TICKS;

    if (deadline <= this.now) {
      deadline += this.constructor.FRAME_TICKS;
    }

    return deadline;
  }
  armRasterTimers() {
    if (this.rasterTimersArmed) {
      return;
    }

    this.rasterTimersArmed = true;

    this.scheduleVblankFalling(this.timeUntilPos(this.constructor.VBLANK_END));

    this.scheduleVblankRising(this.timeUntilPos(this.constructor.VBLANK_START));
  }
  scheduleVblankFalling(deadline) {
    this.at(
    deadline,
    () => {var _this$machine$onVblan, _this$machine;
      (_this$machine$onVblan = (_this$machine = this.machine).onVblankFalling) === null || _this$machine$onVblan === void 0 ? void 0 : _this$machine$onVblan.call(_this$machine);

      this.scheduleVblankFalling(deadline + this.constructor.FRAME_TICKS);
    },
    "vblank-falling");

  }
  scheduleVblankRising(deadline) {
    this.at(
    deadline,
    () => {var _this$machine$onVblan2, _this$machine2;
      (_this$machine$onVblan2 = (_this$machine2 = this.machine).onVblankRising) === null || _this$machine$onVblan2 === void 0 ? void 0 : _this$machine$onVblan2.call(_this$machine2);

      this.scheduleVblankRising(deadline + this.constructor.FRAME_TICKS);
    },
    "vblank-rising");

  }
  setCpu3NmiGateFromQ2(q2State) {
    this.cpu3NmiGateOpen = !Boolean(q2State);

    return this.cpu3NmiGateOpen;
  }
  latchCpu3NmiFromTimer() {var _machine$cpuBoardRese, _soundCpu$isReset, _machine$soundNmiCoun;
    const machine = this.machine;
    const soundCpu = machine.sub2Cpu;

    const cpuBoardResetAsserted = !!((_machine$cpuBoardRese =
    machine.cpuBoardResetAsserted) !== null && _machine$cpuBoardRese !== void 0 ? _machine$cpuBoardRese : machine.subsystemsReset);


    const soundCpuReset = !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.inReset || soundCpu !== null && soundCpu !== void 0 && (_soundCpu$isReset = soundCpu.isReset) !== null && _soundCpu$isReset !== void 0 && _soundCpu$isReset.call(soundCpu));

    const accepted =
    this.cpu3NmiGateOpen && !cpuBoardResetAsserted && !soundCpuReset;

    if (!accepted) {
      return false;
    }

    // MAME-style timer NMI pulse: one edge per source event,
    // with the line returned low immediately. pulseNmi is always
    // defined on the Z80 class, so no fallback is needed.
    soundCpu.pulseNmi();

    /*
     * Harmless scalar health counter.
     * Delete this line too if you want absolutely no runtime diagnostics.
     */
    machine.soundNmiCount = ((_machine$soundNmiCoun = machine.soundNmiCount) !== null && _machine$soundNmiCoun !== void 0 ? _machine$soundNmiCoun : 0) + 1;

    return true;
  }
  armCpu3NmiTimer() {
    if (this.cpu3NmiTimerArmed) {
      return;
    }

    this.cpu3NmiTimerArmed = true;

    this.scheduleCpu3NmiAtScanline(this.constructor.CPU3_NMI_INITIAL_SCANLINE);
  }
  scheduleCpu3NmiAtScanline(scanline) {
    const sourceScanline = scanline | 0;
    const deadline = this.timeUntilPos(sourceScanline);

    this.at(
    deadline,
    () => {
      this.latchCpu3NmiFromTimer();

      let nextScanline =
      sourceScanline + this.constructor.CPU3_NMI_SCANLINE_STEP;

      if (nextScanline >= this.constructor.CPU3_NMI_WRAP) {
        nextScanline = this.constructor.CPU3_NMI_INITIAL_SCANLINE;
      }

      this.scheduleCpu3NmiAtScanline(nextScanline);
    },
    "cpu3-nmi-timer");

  }
  runFrame() {
    this.armRasterTimers();
    this.armCpu3NmiTimer();

    const frameEnd = this.frameOrigin() + this.constructor.FRAME_TICKS;

    this.runUntil(Math.max(frameEnd, this.now + 1));
  }}_defineProperty(BoscoTimingSequencer, "MASTER_CLOCK", 18432000);_defineProperty(BoscoTimingSequencer, "Z80_TICKS", 6);_defineProperty(BoscoTimingSequencer, "PIXEL_TICKS", 3);_defineProperty(BoscoTimingSequencer, "HTOTAL", 384);_defineProperty(BoscoTimingSequencer, "VTOTAL", 264);_defineProperty(BoscoTimingSequencer, "VISIBLE_Y_START", 16);_defineProperty(BoscoTimingSequencer, "VISIBLE_Y_END_EXCLUSIVE", 240);_defineProperty(BoscoTimingSequencer, "VBLANK_START", 240);_defineProperty(BoscoTimingSequencer, "VBLANK_END", 16);_defineProperty(BoscoTimingSequencer, "SCANLINE_TICKS", BoscoTimingSequencer.HTOTAL * BoscoTimingSequencer.PIXEL_TICKS);_defineProperty(BoscoTimingSequencer, "FRAME_TICKS", BoscoTimingSequencer.SCANLINE_TICKS * BoscoTimingSequencer.VTOTAL);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_INITIAL_SCANLINE", 64);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_SCANLINE_STEP", 128);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_WRAP", 272);_defineProperty(BoscoTimingSequencer, "MAX_EVENTS_AT_ONE_TICK", 100000);

class Namco05XX {







  /*
   * MAME starfield speed timing.
   *
   * The 05XX does not scroll stars by adding a pixel-coordinate offset.
   * Motion comes from advancing the LFSR a different number of times
   * during horizontal blanking before/after visible pixels.
   */
























  /*
   * Fixed Bosconian/Namco 05XX star palette resistor weights.
   *
   * Red and green:
   *   470 ohm, 220 ohm resistor ladder
   *   1 kohm pulldown
   *
   * Blue:
   *   470 ohm, 220 ohm resistor ladder
   *   no pulldown
   *
   * These are the already-scaled 8-bit output levels. Keeping them here
   * eliminates the dependency on ResNet while retaining the same palette
   * values used by the prior ResNet.build() star calculation.
   */




  /*
   * Prebuilt CSS colors indexed by the 6-bit 05XX star color value.
   *
   * Color bit arrangement:
   *   bits 0-1 = red
   *   bits 2-3 = green
   *   bits 4-5 = blue
   *
   * This avoids allocating an RGB object and formatting a new CSS string
   * for every star on every frame.
   */


  constructor(opts = {}) {var _opts$offsetX, _opts$offsetY, _opts$limitX, _opts$scrollXIndex, _opts$scrollYIndex, _opts$sf, _opts$sf2;
    /*
     * The physical 05XX produces a 256-pixel star window. Bosconian's
     * visible landscape presentation places that in a 288-pixel-wide area.
     */
    this.offsetX = (_opts$offsetX = opts.offsetX) !== null && _opts$offsetX !== void 0 ? _opts$offsetX : 0;
    this.offsetY = (_opts$offsetY = opts.offsetY) !== null && _opts$offsetY !== void 0 ? _opts$offsetY : 0;
    this.limitX = (_opts$limitX = opts.limitX) !== null && _opts$limitX !== void 0 ? _opts$limitX : Namco05XX.STARFIELD_PIXEL_WIDTH;

    /*
     * Retained only as a compatibility/public debug field. It is always
     * zero because MAME star motion is LFSR-cycle based, not coordinate
     * offset based.
     */
    this.scrollX = 0;

    this.flip = !!opts.flip;
    this.enabled = false;

    this.lfsr = Namco05XX.LFSR_SEED;

    this.preVisCycleCount = 0;
    this.postVisCycleCount = 0;

    /*
     * The 05XX has four star sets. Bosconian enables two at a time through
     * its SF0/SF1 control lines.
     */
    this.setA = 0;
    this.setB = 2;

    this.scrollXIndex = (_opts$scrollXIndex = opts.scrollXIndex) !== null && _opts$scrollXIndex !== void 0 ? _opts$scrollXIndex : 7;
    this.scrollYIndex = (_opts$scrollYIndex = opts.scrollYIndex) !== null && _opts$scrollYIndex !== void 0 ? _opts$scrollYIndex : 0;

    this.sf0 = (_opts$sf = opts.sf0) !== null && _opts$sf !== void 0 ? _opts$sf : 0;
    this.sf1 = (_opts$sf2 = opts.sf1) !== null && _opts$sf2 !== void 0 ? _opts$sf2 : 0;

    /*
     * Bosconian control latch bits:
     *   0-2: horizontal speed selection
     *   3:   SF0
     *   4:   SF1
     *   5:   starfield enable
     */
    this.boscoLatch = new Uint8Array(6);

    this.setScrollSpeed(this.scrollXIndex, this.scrollYIndex);
    this.setActiveSetLines(this.sf0, this.sf1);

    if (opts.enabled) {
      this.enableStarfield(true);
    }
  }

  static buildStarCssPalette() {
    const colors = new Array(64);

    for (let color = 0; color < 64; color++) {
      const r = Namco05XX.STAR_R[color & 0x03];
      const g = Namco05XX.STAR_G[color >>> 2 & 0x03];
      const b = Namco05XX.STAR_B[color >>> 4 & 0x03];

      colors[color] = `rgb(${r},${g},${b})`;
    }

    return colors;
  }

  reset() {
    this.enabled = false;
    this.lfsr = Namco05XX.LFSR_SEED;

    this.scrollX = 0;

    this.scrollXIndex = 7;
    this.scrollYIndex = 0;
    this.setScrollSpeed(this.scrollXIndex, this.scrollYIndex);

    this.sf0 = 0;
    this.sf1 = 0;
    this.setActiveSetLines(this.sf0, this.sf1);

    this.boscoLatch.fill(0);
  }

  enableStarfield(on) {
    const next = !!on;

    /*
     * Preserve the existing expected reset behavior: disabling an active
     * starfield restores the LFSR seed so re-enabling begins predictably.
     */
    if (!next && this.enabled) {
      this.lfsr = Namco05XX.LFSR_SEED;
    }

    this.enabled = next;
  }

  setScrollSpeed(indexX, indexY = 0) {
    this.scrollXIndex = indexX & 0x07;
    this.scrollYIndex = indexY & 0x07;

    this.preVisCycleCount =
    Namco05XX.PRE_VIS_CYCLE_COUNT_VALUES[this.scrollYIndex] +
    Namco05XX.SPEED_X_CYCLE_COUNT_OFFSET[this.scrollXIndex];

    this.postVisCycleCount =
    Namco05XX.POST_VIS_CYCLE_COUNT_VALUES[this.scrollYIndex];
  }

  setActiveStarfieldSets(setA, setB) {
    this.setA = setA & 0x03;
    this.setB = setB & 0x03;
  }

  setActiveSetLines(sf0, sf1) {
    this.sf0 = sf0 ? 1 : 0;
    this.sf1 = sf1 ? 1 : 0;

    switch (this.sf1 << 1 | this.sf0) {
      case 0b00:
        this.setActiveStarfieldSets(0, 2);
        break;

      case 0b01:
        this.setActiveStarfieldSets(1, 2);
        break;

      case 0b10:
        this.setActiveStarfieldSets(0, 3);
        break;

      case 0b11:
        this.setActiveStarfieldSets(1, 3);
        break;}

  }

  setStarfieldConfig(offX, offY, limX) {
    this.offsetX = offX | 0;
    this.offsetY = offY | 0;

    /*
     * limitX is a width measured from offsetX, not an absolute X
     * coordinate. Clamp it to the physical 256-pixel generator window.
     */
    this.limitX = Math.max(
    0,
    Math.min(Namco05XX.STARFIELD_PIXEL_WIDTH, limX | 0));

  }

  static getNextLfsrState(lfsr) {
    const bit = (lfsr >> 0 ^ lfsr >> 3 ^ lfsr >> 5 ^ lfsr >> 10) & 0x01;

    return (lfsr >> 1 | bit << 15) & 0xffff;
  }

  static isHit(lfsr) {
    return (lfsr & Namco05XX.LFSR_HIT_MASK) === Namco05XX.LFSR_HIT_VALUE;
  }

  static getStarSet(lfsr) {
    return (lfsr >> 10 & 0x01) << 1 | lfsr >> 8 & 0x01;
  }

  static decodeColor6(lfsr) {
    let color = lfsr >> 5 & 0x07;
    color |= lfsr << 3 & 0x18;
    color |= lfsr << 2 & 0x20;

    return ~color & 0x3f;
  }

  static color6ToRgb(color6) {
    const color = color6 & 0x3f;

    return {
      r: Namco05XX.STAR_R[color & 0x03],
      g: Namco05XX.STAR_G[color >>> 2 & 0x03],
      b: Namco05XX.STAR_B[color >>> 4 & 0x03] };

  }

  render(ctx, opts = {}) {var _opts$flip, _opts$pixelSize, _opts$width, _opts$height, _opts$clipX, _opts$clipY, _opts$clipX2, _opts$clipY2;
    if (!this.enabled) {
      return;
    }

    const flip = (_opts$flip = opts.flip) !== null && _opts$flip !== void 0 ? _opts$flip : this.flip;
    const pixelSize = Math.max(1, (_opts$pixelSize = opts.pixelSize) !== null && _opts$pixelSize !== void 0 ? _opts$pixelSize : 1);

    const width = (_opts$width = opts.width) !== null && _opts$width !== void 0 ? _opts$width : 288;
    const height = (_opts$height = opts.height) !== null && _opts$height !== void 0 ? _opts$height : Namco05XX.VISIBLE_LINES;

    const clipX0 = (_opts$clipX = opts.clipX0) !== null && _opts$clipX !== void 0 ? _opts$clipX : 0;
    const clipY0 = (_opts$clipY = opts.clipY0) !== null && _opts$clipY !== void 0 ? _opts$clipY : 0;
    const clipX1 = (_opts$clipX2 = opts.clipX1) !== null && _opts$clipX2 !== void 0 ? _opts$clipX2 : width;
    const clipY1 = (_opts$clipY2 = opts.clipY1) !== null && _opts$clipY2 !== void 0 ? _opts$clipY2 : height;

    const startX = this.offsetX;
    const endX = this.offsetX + Namco05XX.STARFIELD_PIXEL_WIDTH;

    const visibleWindowEnd =
    this.offsetX + Math.min(this.limitX, Namco05XX.STARFIELD_PIXEL_WIDTH);

    let lfsr = this.lfsr;

    /*
     * Advance through the pre-visible timing interval. The exact number of
     * LFSR clocks changes with the selected speed and is responsible for
     * star motion.
     */
    for (let i = 0; i < this.preVisCycleCount; i++) {
      lfsr = Namco05XX.getNextLfsrState(lfsr);
    }

    for (let sourceY = 0; sourceY < Namco05XX.VISIBLE_LINES; sourceY++) {
      for (let sourceX = startX; sourceX < endX; sourceX++) {
        if (Namco05XX.isHit(lfsr)) {
          const starSet = Namco05XX.getStarSet(lfsr);

          if (
          sourceX < visibleWindowEnd && (
          starSet === this.setA || starSet === this.setB))
          {
            /*
             * The 256-pixel star-generator window begins 16 pixels into
             * Bosconian's 288-pixel landscape raster.
             */
            let drawX = sourceX - this.offsetX + 16;
            let drawY = sourceY - this.offsetY;

            if (flip) {
              drawX = width - 1 - drawX;
              drawY = height - 1 - drawY;
            }

            if (
            drawX >= 0 &&
            drawX < width &&
            drawY >= 0 &&
            drawY < height &&
            drawX >= clipX0 &&
            drawX < clipX1 &&
            drawY >= clipY0 &&
            drawY < clipY1)
            {
              const color6 = Namco05XX.decodeColor6(lfsr);
              ctx.fillStyle = Namco05XX.STAR_CSS[color6];
              ctx.fillRect(drawX, drawY, pixelSize, pixelSize);
            }
          }
        }

        lfsr = Namco05XX.getNextLfsrState(lfsr);
      }
    }

    /*
     * Advance through the post-visible timing interval, then retain the
     * final LFSR state for the next rendered frame.
     */
    for (let i = 0; i < this.postVisCycleCount; i++) {
      lfsr = Namco05XX.getNextLfsrState(lfsr);
    }

    this.lfsr = lfsr;
  }}_defineProperty(Namco05XX, "VISIBLE_LINES", 224);_defineProperty(Namco05XX, "STARFIELD_PIXEL_WIDTH", 256);_defineProperty(Namco05XX, "LFSR_HIT_MASK", 0xfa14);_defineProperty(Namco05XX, "LFSR_HIT_VALUE", 0x7800);_defineProperty(Namco05XX, "LFSR_SEED", 0x7fff);_defineProperty(Namco05XX, "SPEED_X_CYCLE_COUNT_OFFSET", [0, 1, 2, 3, -4, -3, -2, -1]);_defineProperty(Namco05XX, "PRE_VIS_CYCLE_COUNT_VALUES", [22 * 256, 23 * 256, 22 * 256, 23 * 256, 19 * 256, 20 * 256, 20 * 256, 22 * 256]);_defineProperty(Namco05XX, "POST_VIS_CYCLE_COUNT_VALUES", [10 * 256, 10 * 256, 12 * 256, 12 * 256, 9 * 256, 9 * 256, 10 * 256, 9 * 256]);_defineProperty(Namco05XX, "STAR_R", new Uint8Array([0, 71, 151, 222]));_defineProperty(Namco05XX, "STAR_G", new Uint8Array([0, 71, 151, 222]));_defineProperty(Namco05XX, "STAR_B", new Uint8Array([0, 81, 174, 255]));_defineProperty(Namco05XX, "STAR_CSS", Namco05XX.buildStarCssPalette());

class Namco06XX {
  /*
   * Default only.
   *
   * Galaga and Bosconian CPU-board 06XX:
   *
   *   MASTER_CLOCK / 6 / 64 = 48 kHz
   *   18,432,000 / 48,000 = 384 master ticks/device clock
   *
   * Bosconian video-board 06XX must instead be constructed with:
   *
   *   z80CyclesPerDeviceClock: 512
   *
   * yielding 6 * 512 = 3072 master ticks/device clock.
   */



  constructor(opts = {}) {var _opts$masterTicksPerZ;
    /*
     * Four MAME namco_06xx_device custom-chip positions.
     *
     * Galaga:
     *   slot 0 = 51XX
     *   slot 1 = unused
     *   slot 2 = unused
     *   slot 3 = 54XX
     *
     * Bosconian CPU board:
     *   slot 0 = 51XX
     *   slot 1 = unused
     *   slot 2 = CPU-board 50XX
     *   slot 3 = 54XX
     *
     * Bosconian video board:
     *   slot 0 = video-board 50XX
     *   slot 1 = 52XX
     *   slot 2 = unused
     *   slot 3 = unused
     */
    this.devices = [null, null, null, null];

    /*
     * Master-clock domain.
     *
     * Galaga/Bosconian Z80 clocks are MASTER_CLOCK / 6, so one Z80
     * cycle consumes six master ticks.
     */
    this.masterTicksPerZ80Cycle = (_opts$masterTicksPerZ =
    opts.masterTicksPerZ80Cycle) !== null && _opts$masterTicksPerZ !== void 0 ? _opts$masterTicksPerZ :
    Namco06XX.DEFAULT_MASTER_TICKS_PER_Z80_CYCLE;

    if (
    !Number.isInteger(this.masterTicksPerZ80Cycle) ||
    this.masterTicksPerZ80Cycle <= 0)
    {
      throw new RangeError(
      "Namco06XX: masterTicksPerZ80Cycle must be a positive integer");

    }

    /*
     * Prefer the direct hardware interval when supplied. This avoids
     * tying the class unnecessarily to Z80-specific terminology while
     * still allowing the MAME Bosconian clocks to be expressed naturally.
     */
    const explicitDeviceEdge = opts.masterTicksPerDeviceEdge;

    if (explicitDeviceEdge != null) {
      this.masterTicksPerDeviceEdge = Math.floor(
      Number(explicitDeviceEdge));


      if (
      !Number.isFinite(this.masterTicksPerDeviceEdge) ||
      this.masterTicksPerDeviceEdge <= 0)
      {
        throw new RangeError(
        "Namco06XX: masterTicksPerDeviceEdge must be a positive integer");

      }

      this.z80CyclesPerDeviceClock =
      this.masterTicksPerDeviceEdge / this.masterTicksPerZ80Cycle;
    } else {var _opts$z80CyclesPerDev;
      this.z80CyclesPerDeviceClock = (_opts$z80CyclesPerDev =
      opts.z80CyclesPerDeviceClock) !== null && _opts$z80CyclesPerDev !== void 0 ? _opts$z80CyclesPerDev :
      Namco06XX.DEFAULT_Z80_CYCLES_PER_DEVICE_CLOCK;

      if (
      !Number.isInteger(this.z80CyclesPerDeviceClock) ||
      this.z80CyclesPerDeviceClock <= 0)
      {
        throw new RangeError(
        "Namco06XX: z80CyclesPerDeviceClock must be a positive integer");

      }

      this.masterTicksPerDeviceEdge =
      this.masterTicksPerZ80Cycle *
      this.z80CyclesPerDeviceClock;
    }

    /*
     * MAME invokes the internal 06XX timer on both clock phases, therefore
     * its callback period is one-half of the divided device clock period.
     *
     * Both supported Bosconian values are even:
     *
     * CPU board:   384 / 2 = 192 ticks
     * Video board: 3072 / 2 = 1536 ticks
     */
    if ((this.masterTicksPerDeviceEdge & 1) !== 0) {
      throw new RangeError(
      "Namco06XX: masterTicksPerDeviceEdge must be even");

    }

    /*
     * Optional host CPU resolver.
     *
     * MAME suppresses a 06XX NMI line write if its configured controlling
     * CPU is suspended for HALT/reset/disable reasons. Do not confuse a
     * normal Z80 HALT instruction with that machine-level suspension:
     * NMI must wake a halted Z80.
     */
    this.hostCpu =
    typeof opts.hostCpu === "function" ? opts.hostCpu : null;

    /*
     * These callbacks must be level-sensitive operations:
     *
     *   onHostNmi()      -> hostCpu.setNmiLine(true)
     *   onHostNmiClear() -> hostCpu.setNmiLine(false)
     *
     * Do not connect onHostNmi() to pulseNmi().
     */
    this.onHostNmi =
    typeof opts.onHostNmi === "function" ? opts.onHostNmi : null;

    this.onHostNmiClear =
    typeof opts.onHostNmiClear === "function" ?
    opts.onHostNmiClear :
    null;

    this.scheduler = null;

    /*
     * MAME namco_06xx_device state.
     */
    this.control = 0x00;
    this.timerState = false;
    this.readStretch = false;

    /*
     * JavaScript timer ownership. Incrementing this invalidates any event
     * previously armed by a replaced control register value or full reset.
     */
    this.timerGeneration = 0;
    this.timerHandle = null;
    this.nextDeadline = null;

    /*
     * Optional passive diagnostic fields.
     */
    this.traceTransactions = !!opts.traceTransactions;
    this.traceHud50xxTransactions = !!opts.traceHud50xxTransactions;
    this.transactionSequence = 0;
    this.transactionHistory = [];
    this.lastTransaction = null;

    /*
     * This is intentionally a full construction/power-on reset, not the
     * narrow MAME device_reset() behavior.
     */
    this.powerOnReset();
  }

  /*
   * Install the shared master-tick scheduler.
   *
   * Call this before normal 06XX traffic begins. Changing schedulers cancels
   * any existing timer since a scheduled callback belongs to the old queue.
   */
  setScheduler(scheduler) {
    this.cancelTimer();
    this.scheduler = scheduler || null;
    return this;
  }

  /*
   * Attach a custom-chip interface.
   *
   * The immediate line propagation is intentional for JavaScript construction:
   * a device attached after power-on must see the current static line state.
   */
  attachDevice(slot, device) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
      throw new RangeError(`Namco06XX: invalid slot ${slot}`);
    }

    this.devices[slot] = device || null;
    this.applyLinesToSlot(slot);

    return this;
  }

  get selectedMask() {
    return this.control & 0x0f;
  }

  /*
   * MAME control bit 4:
   *
   * 0 = write mode
   * 1 = read mode
   */
  get isReadMode() {
    return (this.control & 0x10) !== 0;
  }

  /*
   * MAME control bits 5-7 are the clock-divider field.
   */
  get shiftCount() {
    return this.control >>> 5 & 0x07;
  }

  get divider() {
    const shifts = this.shiftCount;
    return shifts === 0 ? 0 : 1 << shifts;
  }

  /*
   * MAME:
   *
   *   attotime::from_hz(clock() / divisor) / 2
   *
   * Equivalent master-tick interval:
   *
   *   masterTicksPerDeviceEdge * divisor / 2
   */
  get callbackPeriodTicks() {
    if (this.divider === 0) {
      return Infinity;
    }

    return this.masterTicksPerDeviceEdge / 2 * this.divider;
  }

  /*
   * Full machine/power-on reset.
   *
   * Use this at emulator startup and when the user requests a complete
   * machine reset. It deliberately clears JavaScript-side scheduled events
   * and line state.
   */
  powerOnReset() {
    this.cancelTimer();

    this.control = 0x00;
    this.timerState = false;
    this.readStretch = false;

    this.applyAllLines();
    this.clearHostNmi();

    return this;
  }

  /*
   * Compatibility alias for existing emulator code that calls reset().
   *
   * Keep reset() as the complete machine-level reset to avoid changing
   * existing integration behavior unexpectedly.
   */
  reset() {
    return this.powerOnReset();
  }

  /*
   * MAME namco_06xx_device::device_reset() itself only assigns m_control = 0.
   *
   * Do not use this for a browser-emulator full reset. This narrow method
   * exists only where a caller explicitly needs MAME device-reset semantics.
   */
  deviceReset() {
    this.control = 0x00;
    return this;
  }

  cancelTimer() {var _this$timerHandle, _this$timerHandle$can;
    this.timerGeneration++;

    (_this$timerHandle = this.timerHandle) === null || _this$timerHandle === void 0 ? void 0 : (_this$timerHandle$can = _this$timerHandle.cancel) === null || _this$timerHandle$can === void 0 ? void 0 : _this$timerHandle$can.call(_this$timerHandle);
    this.timerHandle = null;
    this.nextDeadline = null;
  }

  synchronize(callback) {var _this$scheduler;
    if (typeof callback !== "function") {
      throw new TypeError(
      "Namco06XX: synchronize callback must be a function");

    }

    if ((_this$scheduler = this.scheduler) !== null && _this$scheduler !== void 0 && _this$scheduler.synchronize) {
      return this.scheduler.synchronize(callback, this);
    }

    callback();
    return null;
  }

  /*
   * MAME ctrl_w() synchronizes before changing m_control.
   */
  controlWrite(data) {
    const value = data & 0xff;

    this.synchronize(() => {
      this.controlWriteNow(value);
    });
  }

  controlWriteNow(data) {
    this.cancelTimer();
    this.control = data & 0xff;

    /*
     * MAME ctrl_w_sync(), divider-zero branch:
     *
     * - stop timer
     * - timer state low
     * - clear NMI
     * - force all chip selects low
     * - leave R/W at its previous driven state
     */
    if (this.divider === 0) {
      this.timerState = false;
      this.readStretch = false;

      this.clearHostNmi();
      this.applyAllChipSelects();

      return;
    }

    /*
     * On entry to read mode, MAME clears NMI immediately and suppresses the
     * next active NMI edge to give the selected custom device one cycle to
     * put data onto the shared bus.
     */
    if (this.isReadMode) {
      this.clearHostNmi();
      this.readStretch = true;
    } else {
      this.readStretch = false;
    }

    this.armFirstEdge();
  }

  /*
   * MAME schedules the first callback at the next 06XX source-clock tick.
   *
   * If time is exactly on a source-clock edge, schedule the following edge,
   * never an event at the current timestamp.
   */
  armFirstEdge() {
    if (!this.scheduler || this.divider === 0) {
      return;
    }

    const edge = this.masterTicksPerDeviceEdge;
    const now = this.scheduler.now;

    const deadline = (Math.floor(now / edge) + 1) * edge;

    this.armAt(deadline, () => {
      this.clockTimerEdge();
      this.armRepeatingEdge();
    });
  }

  armRepeatingEdge() {
    if (!this.scheduler || this.divider === 0) {
      return;
    }

    this.armAt(
    this.scheduler.now + this.callbackPeriodTicks,
    () => {
      this.clockTimerEdge();
      this.armRepeatingEdge();
    });

  }

  armAt(deadline, callback) {
    if (!this.scheduler) {
      return;
    }

    const generation = this.timerGeneration;
    const target = Math.floor(Number(deadline));

    if (!Number.isFinite(target)) {
      throw new RangeError(
      `Namco06XX: invalid timer deadline ${String(deadline)}`);

    }

    this.nextDeadline = target;

    this.timerHandle = this.scheduler.at(
    target,
    () => {
      this.timerHandle = null;
      this.nextDeadline = null;

      if (
      generation !== this.timerGeneration ||
      this.divider === 0)
      {
        return;
      }

      callback();
    },
    this);

  }

  /*
   * Exact MAME nmi_generate() order:
   *
   *   timerState = !timerState
   *   if (timerState) RW = control bit 4
   *   NMI = timerState && !readStretch
   *   readStretch = false
   *   CS = timerState && selected
   */
  clockTimerEdge() {
    this.timerState = !this.timerState;

    if (this.timerState) {
      this.applyAllRwLines();
    }

    this.setHostNmi(this.timerState && !this.readStretch);

    this.readStretch = false;
    this.applyAllChipSelects();
  }

  applyAllLines() {
    this.applyAllRwLines();
    this.applyAllChipSelects();
  }

  /*
   * R/W is driven from control bit 4. The 06XX pushes it to all devices only
   * on the timerState=true clock phase during normal operation.
   */
  applyAllRwLines() {
    const level = this.isReadMode ? 1 : 0;

    for (let slot = 0; slot < 4; slot++) {var _this$devices$slot, _this$devices$slot$rw;
      (_this$devices$slot = this.devices[slot]) === null || _this$devices$slot === void 0 ? void 0 : (_this$devices$slot$rw = _this$devices$slot.rw) === null || _this$devices$slot$rw === void 0 ? void 0 : _this$devices$slot$rw.call(_this$devices$slot, level);
    }
  }

  applyAllChipSelects() {
    for (let slot = 0; slot < 4; slot++) {
      this.applyChipSelectToSlot(slot);
    }
  }

  applyLinesToSlot(slot) {var _device$rw;
    const device = this.devices[slot];

    if (!device) {
      return;
    }

    /*
     * Construction-time propagation. Runtime MAME R/W updates happen only
     * during timerState=true; this establishes the currently driven state
     * for an object attached after construction.
     */
    (_device$rw = device.rw) === null || _device$rw === void 0 ? void 0 : _device$rw.call(device, this.isReadMode ? 1 : 0);
    this.applyChipSelectToSlot(slot);
  }

  applyChipSelectToSlot(slot) {var _this$devices$slot2, _this$devices$slot2$c;
    const selected = (this.selectedMask & 1 << slot) !== 0;
    const level = this.timerState && selected;

    (_this$devices$slot2 = this.devices[slot]) === null || _this$devices$slot2 === void 0 ? void 0 : (_this$devices$slot2$c = _this$devices$slot2.chipSelect) === null || _this$devices$slot2$c === void 0 ? void 0 : _this$devices$slot2$c.call(_this$devices$slot2, level ? 1 : 0);
  }

  /*
   * MAME checks machine-level suspended state before driving NMI.
   *
   * Important: do not test hostCpu.halted here. A normal Z80 HALT instruction
   * is exited by NMI and must continue to observe the NMI line.
   *
   * If no hostCpu resolver was supplied, retain callback-only compatibility:
   * the caller is responsible for gating NMI delivery.
   */
  hostCanObserveNmi() {var _this$hostCpu, _hostCpu$isReset, _hostCpu$isDisabled;
    const hostCpu = (_this$hostCpu = this.hostCpu) === null || _this$hostCpu === void 0 ? void 0 : _this$hostCpu.call(this);

    if (!hostCpu) {
      return true;
    }

    return !(
    hostCpu.inReset ||
    hostCpu.disabled ||
    hostCpu.suspended || (_hostCpu$isReset =
    hostCpu.isReset) !== null && _hostCpu$isReset !== void 0 && _hostCpu$isReset.call(hostCpu) || (_hostCpu$isDisabled =
    hostCpu.isDisabled) !== null && _hostCpu$isDisabled !== void 0 && _hostCpu$isDisabled.call(hostCpu));

  }

  /*
   * Level-sensitive NMI interface.
   */
  setHostNmi(level) {
    if (!this.hostCanObserveNmi()) {
      return;
    }

    if (level) {var _this$onHostNmi;
      (_this$onHostNmi = this.onHostNmi) === null || _this$onHostNmi === void 0 ? void 0 : _this$onHostNmi.call(this);
    } else {var _this$onHostNmiClear;
      (_this$onHostNmiClear = this.onHostNmiClear) === null || _this$onHostNmiClear === void 0 ? void 0 : _this$onHostNmiClear.call(this);
    }
  }

  assertHostNmi() {
    this.setHostNmi(true);
  }

  clearHostNmi() {
    this.setHostNmi(false);
  }

  /*
   * MAME data_w() is scheduler-synchronized.
   *
   * This is significant for the 54XX path:
   *
   *   06XX data write -> 54XX synchronized command-latch update
   *   later 06XX timer phase -> slot-3 chip-select / 54XX IRQ level
   */
  dataWrite(offset, data) {
    void offset;

    const value = data & 0xff;

    this.synchronize(() => {
      this.dataWriteNow(value);
    });
  }

  dataWriteNow(data) {
    if (this.isReadMode) {
      return;
    }

    const value = data & 0xff;

    for (let slot = 0; slot < 4; slot++) {
      if ((this.selectedMask & 1 << slot) !== 0) {var _this$devices$slot3, _this$devices$slot3$w;
        (_this$devices$slot3 = this.devices[slot]) === null || _this$devices$slot3 === void 0 ? void 0 : (_this$devices$slot3$w = _this$devices$slot3.write) === null || _this$devices$slot3$w === void 0 ? void 0 : _this$devices$slot3$w.call(_this$devices$slot3, value);
      }
    }
  }

  /*
   * MAME data_r() wire-ANDs the selected custom-device read values.
   *
   * Unbound device callbacks default to 0xff, so an unbound selected slot
   * has no effect on the bus result.
   */
  dataRead(offset) {
    void offset;

    if (!this.isReadMode) {
      return 0x00;
    }

    let result = 0xff;

    for (let slot = 0; slot < 4; slot++) {
      if ((this.selectedMask & 1 << slot) === 0) {
        continue;
      }

      const device = this.devices[slot];

      const value =
      device && typeof device.read === "function" ?
      device.read() :
      0xff;

      if (!Number.isInteger(value)) {
        throw new Error(
        `Namco06XX: slot ${slot} returned invalid read value ` +
        String(value));

      }

      result &= value & 0xff;
    }

    return result & 0xff;
  }

  readControl() {
    return this.control & 0xff;
  }}_defineProperty(Namco06XX, "DEFAULT_Z80_CYCLES_PER_DEVICE_CLOCK", 64);_defineProperty(Namco06XX, "DEFAULT_MASTER_TICKS_PER_Z80_CYCLE", 6);

class MB88xx {





  constructor({ programWidth = 10, dataWidth = 6 } = {}) {
    this.programWidth = programWidth;
    this.dataWidth = dataWidth;

    this.pageMask = (1 << programWidth - 6) - 1;
    this.romMask = (1 << programWidth) - 1;
    this.dataMask = (1 << dataWidth) - 1;

    this.rom = new Uint8Array(1 << programWidth);
    this.data = new Uint8Array(1 << dataWidth); // zeroed once, here (cold start)

    this.readK = () => 0;
    this.readR = [() => 0, () => 0, () => 0, () => 0];
    this.writeR = [() => {}, () => {}, () => {}, () => {}];
    this.writeO = (_data, _mask) => {};
    this.writeP = _data => {};
    this.readSI = () => 0;
    this.writeSO = _bit => {};

    this.oOutput = 0; // zeroed once, here (cold start) — matches device_start()

    this.halted = false;
    this.romLoaded = false;

    this.reset();
  }

  loadROM(romData) {
    this.rom.fill(0);
    const src =
    romData instanceof Uint8Array ? romData : new Uint8Array(romData);
    this.rom.set(src.subarray(0, Math.min(src.length, this.rom.length)));
    this.romLoaded = true;
  }

  // Mirrors mb88_cpu_device::device_reset() exactly — does NOT touch
  // `data` or `oOutput`. A real /RESET pulse resets the program counter
  // and instruction-level flags; it does not clear internal RAM cells or
  // the last-driven O-port latch.
  reset() {
    this.PC = 0;
    this.PA = 0;
    this.SP = [0, 0, 0, 0];
    this.SI = 0;

    this.A = 0;
    this.X = 0;
    this.Y = 0;

    this.st = 1;
    this.zf = 0;
    this.cf = 0;
    this.vf = 0;
    this.sf = 0;
    this.ifLine = 0;

    this.pio = 0;
    this.TH = 0;
    this.TL = 0;
    this.TP = 0;
    this.ctr = 0;

    this.SB = 0;
    this.SBcount = 0;

    this.pendingIrq = 0;
    this.inIrq = false;
    this.serialEnabled = false;

    this.halted = false;
  }

  setHalt(state) {
    this.halted = !!state;
  }

  getPC() {
    return (this.PA << 6) + this.PC;
  }

  incPC() {
    this.PC++;
    if (this.PC >= 0x40) {
      this.PC = 0;
      this.PA = this.PA + 1 & this.pageMask;
    }
  }

  getEA() {
    return (this.X << 4) + this.Y & this.dataMask;
  }

  readOp(addr) {
    return this.rom[addr & this.romMask];
  }

  readMem(addr) {
    return this.data[addr & this.dataMask] & 0x0f;
  }

  writeMem(addr, value) {
    this.data[addr & this.dataMask] = value & 0x0f;
  }

  writePla(index) {
    const shift = index & 0x10 ? 4 : 0;
    const mask = 0x0f << shift;

    this.oOutput = this.oOutput & ~mask | index << shift & mask;

    this.writeO(this.oOutput, mask);
  }

  pioEnable(newpio) {
    if ((this.pio ^ newpio) & 0x30) {
      const serialBits = newpio & 0x30;
      if (serialBits === 0x00) {
        this.serialEnabled = false;
      } else if (serialBits === 0x20) {
        this.serialEnabled = true;
      }
    }
    this.pio = newpio & 0xff;
  }

  incrementTimer() {
    const C = this.constructor;
    this.TL = this.TL + 1 & 0x0f;
    if (this.TL === 0) {
      this.TH = this.TH + 1 & 0x0f;
      if (this.TH === 0) {
        this.vf = 1;
        this.pendingIrq |= C.INT_CAUSE_TIMER;
      }
    }
  }

  setIRQ(state) {
    const C = this.constructor;
    const next = state ? 1 : 0;
    const rising = !this.ifLine && next;
    const enabled = (this.pio & C.INT_CAUSE_EXTERNAL) !== 0;

    if (rising && enabled) {
      this.pendingIrq |= C.INT_CAUSE_EXTERNAL;
    }

    this.ifLine = next;
  }

  setTC(state) {
    state = state ? 1 : 0;
    if (this.ctr && !state && this.pio & 0x40) this.incrementTimer();
    this.ctr = state;
  }

  burnCycles(cycles) {
    const C = this.constructor;

    if (this.pio & 0x80) {
      this.TP += cycles;
      while (this.TP >= C.TIMER_PRESCALE) {
        this.TP -= C.TIMER_PRESCALE;
        this.incrementTimer();
      }
    }

    const activePending = this.pendingIrq & this.pio;

    if (!this.inIrq && activePending) {
      const intpc = this.getPC();
      let vector = null;

      if (activePending & C.INT_CAUSE_EXTERNAL) {
        vector = 0x02;
      } else if (activePending & C.INT_CAUSE_TIMER) {
        vector = 0x04;
      } else if (activePending & C.INT_CAUSE_SERIAL) {
        vector = 0x06;
      }

      this.inIrq = true;

      this.SP[this.SI] =
      intpc |
      (this.cf & 1) << 15 |
      (this.zf & 1) << 14 |
      (this.st & 1) << 13;

      this.SI = this.SI + 1 & 3;
      this.PC = vector;
      this.PA = 0x00;
      this.st = 1;
      this.pendingIrq = 0;

      this.burnCycles(3);
    }
  }

  step() {
    if (this.halted) return 0;

    const executedPC = this.getPC();
    const opcode = this.readOp(executedPC);
    this.incPC();

    this.executedPC = executedPC;

    let oc = 1;
    let arg;

    switch (opcode) {
      case 0x00:
        this.st = 1;
        break;
      case 0x01:
        this.writePla((this.cf & 1) << 4 | this.A);
        this.st = 1;
        break;
      case 0x02:
        this.writeP(this.A);
        this.st = 1;
        break;
      case 0x03:
        this.writeR[this.Y & 3](this.A);
        this.st = 1;
        break;
      case 0x04:
        this.Y = this.A;
        this.st = 1;
        break;
      case 0x05:
        this.TH = this.A;
        this.st = 1;
        break;
      case 0x06:
        this.TL = this.A;
        this.st = 1;
        break;
      case 0x07:
        this.SB = this.A;
        this.st = 1;
        break;
      case 0x08:
        this.Y++;
        this.st = this.Y & 0x10 ? 0 : 1;
        this.Y &= 0x0f;
        this.zf = this.Y !== 0 ? 0 : 1;
        break;
      case 0x09:
        arg = this.readMem(this.getEA());
        arg++;
        this.st = arg & 0x10 ? 0 : 1;
        arg &= 0x0f;
        this.zf = arg !== 0 ? 0 : 1;
        this.writeMem(this.getEA(), arg);
        break;
      case 0x0a:
        this.writeMem(this.getEA(), this.A);
        this.Y++;
        this.st = this.Y & 0x10 ? 0 : 1;
        this.Y &= 0x0f;
        this.zf = this.Y !== 0 ? 0 : 1;
        break;
      case 0x0b:
        arg = this.readMem(this.getEA());
        this.writeMem(this.getEA(), this.A);
        this.A = arg;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x0c:
        this.A = this.A << 1 | this.cf & 1;
        this.st = this.A & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A &= 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        break;
      case 0x0d:
        this.A = this.readMem(this.getEA());
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x0e:
        arg = this.readMem(this.getEA()) + this.A + (this.cf & 1);
        this.st = arg & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A = arg & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        break;
      case 0x0f:
        this.A &= this.readMem(this.getEA());
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = this.zf ^ 1;
        break;
      case 0x10:
        if (this.cf & 1 || this.A > 9) this.A += 6;
        this.st = this.A & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A &= 0x0f;
        break;
      case 0x11:
        if (this.cf & 1 || this.A > 9) this.A += 10;
        this.st = this.A & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A &= 0x0f;
        break;
      case 0x12:
        this.A = this.readK() & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x13:
        this.A = this.readR[this.Y & 3]() & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x14:
        this.A = this.Y;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x15:
        this.A = this.TH;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x16:
        this.A = this.TL;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x17:
        this.A = this.SB;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x18:
        this.Y--;
        this.st = this.Y & 0x10 ? 0 : 1;
        this.Y &= 0x0f;
        break;
      case 0x19:
        arg = this.readMem(this.getEA());
        arg--;
        this.st = arg & 0x10 ? 0 : 1;
        arg &= 0x0f;
        this.zf = arg !== 0 ? 0 : 1;
        this.writeMem(this.getEA(), arg);
        break;
      case 0x1a:
        this.writeMem(this.getEA(), this.A);
        this.Y--;
        this.st = this.Y & 0x10 ? 0 : 1;
        this.Y &= 0x0f;
        this.zf = this.Y !== 0 ? 0 : 1;
        break;
      case 0x1b:
        arg = this.X;
        this.X = this.A;
        this.A = arg;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x1c:
        this.A |= (this.cf & 1) << 4;
        this.st = this.A << 4 & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A = this.A >>> 1 & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        break;
      case 0x1d:
        this.writeMem(this.getEA(), this.A);
        this.st = 1;
        break;
      case 0x1e:
        arg = this.readMem(this.getEA()) - this.A - (this.cf & 1);
        this.st = arg & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A = arg & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        break;
      case 0x1f:
        this.A |= this.readMem(this.getEA());
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = this.zf ^ 1;
        break;
      case 0x20:
        arg = this.readR[this.Y >> 2]() & 0x0f;
        this.writeR[this.Y >> 2](arg | 1 << (this.Y & 3));
        this.st = 1;
        break;
      case 0x21:
        this.cf = 1;
        this.st = 1;
        break;
      case 0x22:
        arg = this.readR[this.Y >> 2]() & 0x0f;
        this.writeR[this.Y >> 2](arg & ~(1 << (this.Y & 3)));
        this.st = 1;
        break;
      case 0x23:
        this.cf = 0;
        this.st = 1;
        break;
      case 0x24:
        arg = this.readR[this.Y >> 2]() & 0x0f;
        this.st = arg & 1 << (this.Y & 3) ? 0 : 1;
        break;
      case 0x25:
        this.st = this.ifLine ^ 1;
        break;
      case 0x26:
        this.st = this.vf ^ 1;
        this.vf = 0;
        break;
      case 0x27:
        this.st = this.sf ^ 1;
        if (this.sf) this.SBcount = 0;
        this.sf = 0;
        break;
      case 0x28:
        this.st = this.cf ^ 1;
        break;
      case 0x29:
        this.st = this.zf ^ 1;
        break;
      case 0x2a:
        this.writeMem(this.getEA(), this.SB);
        this.zf = this.SB !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x2b:
        this.SB = this.readMem(this.getEA());
        this.zf = this.SB !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x2c:
        this.SI = this.SI - 1 & 3;
        this.PC = this.SP[this.SI] & 0x3f;
        this.PA = this.SP[this.SI] >> 6 & this.pageMask;
        this.st = 1;
        break;
      case 0x2d:
        this.A = ~this.A + 1 & 0x0f;
        this.st = this.A === 0 ? 0 : 1;
        break;
      case 0x2e:
        arg = this.readMem(this.getEA()) - this.A;
        this.cf = (arg & 0x10) === 0 ? 0 : 1;
        arg &= 0x0f;
        this.st = arg === 0 ? 0 : 1;
        this.zf = this.st ^ 1;
        break;
      case 0x2f:
        this.A ^= this.readMem(this.getEA());
        this.st = this.A === 0 ? 0 : 1;
        this.zf = this.st ^ 1;
        break;
      case 0x30:
      case 0x31:
      case 0x32:
      case 0x33:
        arg = this.readMem(this.getEA());
        this.writeMem(this.getEA(), arg | 1 << (opcode & 3));
        this.st = 1;
        break;
      case 0x34:
      case 0x35:
      case 0x36:
      case 0x37:
        arg = this.readMem(this.getEA());
        this.writeMem(this.getEA(), arg & ~(1 << (opcode & 3)));
        this.st = 1;
        break;
      case 0x38:
      case 0x39:
      case 0x3a:
      case 0x3b:
        arg = this.readMem(this.getEA());
        this.st = arg & 1 << (opcode & 3) ? 0 : 1;
        break;
      case 0x3c:
        this.inIrq = false;
        this.SI = this.SI - 1 & 3;
        this.PC = this.SP[this.SI] & 0x3f;
        this.PA = this.SP[this.SI] >> 6 & this.pageMask;
        this.st = this.SP[this.SI] >> 13 & 1;
        this.zf = this.SP[this.SI] >> 14 & 1;
        this.cf = this.SP[this.SI] >> 15 & 1;
        break;
      case 0x3d:
        this.PA = this.readOp(this.getPC()) & this.pageMask;
        this.PC = this.A * 4;
        oc++;
        this.st = 1;
        break;
      case 0x3e:
        this.pioEnable(this.pio | this.readOp(this.getPC()));
        this.incPC();
        oc++;
        this.st = 1;
        break;
      case 0x3f:
        this.pioEnable(this.pio & ~this.readOp(this.getPC()));
        this.incPC();
        oc++;
        this.st = 1;
        break;
      case 0x40:
      case 0x41:
      case 0x42:
      case 0x43:
        arg = this.readR[0]() & 0x0f;
        arg |= 1 << (opcode & 3);
        this.writeR[0](arg);
        this.st = 1;
        break;
      case 0x44:
      case 0x45:
      case 0x46:
      case 0x47:
        arg = this.readR[0]() & 0x0f;
        arg &= ~(1 << (opcode & 3));
        this.writeR[0](arg);
        this.st = 1;
        break;
      case 0x48:
      case 0x49:
      case 0x4a:
      case 0x4b:
        arg = this.readR[2]() & 0x0f;
        this.st = arg & 1 << (opcode & 3) ? 0 : 1;
        break;
      case 0x4c:
      case 0x4d:
      case 0x4e:
      case 0x4f:
        this.st = this.A & 1 << (opcode & 3) ? 0 : 1;
        break;
      case 0x50:
      case 0x51:
      case 0x52:
      case 0x53:
        arg = this.readMem(opcode & 3);
        this.writeMem(opcode & 3, this.A);
        this.A = arg;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x54:
      case 0x55:
      case 0x56:
      case 0x57:
        arg = this.readMem((opcode & 3) + 4);
        this.writeMem((opcode & 3) + 4, this.Y);
        this.Y = arg;
        this.zf = this.Y !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x58:
      case 0x59:
      case 0x5a:
      case 0x5b:
      case 0x5c:
      case 0x5d:
      case 0x5e:
      case 0x5f:
        this.X = opcode & 7;
        this.zf = this.X !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x60:
      case 0x61:
      case 0x62:
      case 0x63:
      case 0x64:
      case 0x65:
      case 0x66:
      case 0x67:
        arg = this.readOp(this.getPC());
        this.incPC();
        oc++;
        if (this.st & 1) {
          this.SP[this.SI] = this.getPC();
          this.SI = this.SI + 1 & 3;
          this.PC = arg & 0x3f;
          this.PA = (opcode & 7) << 2 | arg >> 6;
        }
        this.st = 1;
        break;
      case 0x68:
      case 0x69:
      case 0x6a:
      case 0x6b:
      case 0x6c:
      case 0x6d:
      case 0x6e:
      case 0x6f:
        arg = this.readOp(this.getPC());
        this.incPC();
        oc++;
        if (this.st & 1) {
          this.PC = arg & 0x3f;
          this.PA = (opcode & 7) << 2 | arg >> 6;
        }
        this.st = 1;
        break;
      case 0x70:
      case 0x71:
      case 0x72:
      case 0x73:
      case 0x74:
      case 0x75:
      case 0x76:
      case 0x77:
      case 0x78:
      case 0x79:
      case 0x7a:
      case 0x7b:
      case 0x7c:
      case 0x7d:
      case 0x7e:
      case 0x7f:
        arg = (opcode & 0x0f) + this.A;
        this.st = arg & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;
        this.A = arg & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        break;
      case 0x80:
      case 0x81:
      case 0x82:
      case 0x83:
      case 0x84:
      case 0x85:
      case 0x86:
      case 0x87:
      case 0x88:
      case 0x89:
      case 0x8a:
      case 0x8b:
      case 0x8c:
      case 0x8d:
      case 0x8e:
      case 0x8f:
        this.Y = opcode & 0x0f;
        this.zf = this.Y !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0x90:
      case 0x91:
      case 0x92:
      case 0x93:
      case 0x94:
      case 0x95:
      case 0x96:
      case 0x97:
      case 0x98:
      case 0x99:
      case 0x9a:
      case 0x9b:
      case 0x9c:
      case 0x9d:
      case 0x9e:
      case 0x9f:
        this.A = opcode & 0x0f;
        this.zf = this.A !== 0 ? 0 : 1;
        this.st = 1;
        break;
      case 0xa0:
      case 0xa1:
      case 0xa2:
      case 0xa3:
      case 0xa4:
      case 0xa5:
      case 0xa6:
      case 0xa7:
      case 0xa8:
      case 0xa9:
      case 0xaa:
      case 0xab:
      case 0xac:
      case 0xad:
      case 0xae:
      case 0xaf:
        arg = (opcode & 0x0f) - this.Y;
        this.cf = (arg & 0x10) === 0 ? 0 : 1;
        arg &= 0x0f;
        this.st = arg === 0 ? 0 : 1;
        this.zf = this.st ^ 1;
        break;
      case 0xb0:
      case 0xb1:
      case 0xb2:
      case 0xb3:
      case 0xb4:
      case 0xb5:
      case 0xb6:
      case 0xb7:
      case 0xb8:
      case 0xb9:
      case 0xba:
      case 0xbb:
      case 0xbc:
      case 0xbd:
      case 0xbe:
      case 0xbf:
        arg = (opcode & 0x0f) - this.A;
        this.cf = (arg & 0x10) === 0 ? 0 : 1;
        arg &= 0x0f;
        this.st = arg === 0 ? 0 : 1;
        this.zf = this.st ^ 1;
        break;
      default:
        if (this.st & 1) this.PC = opcode & 0x3f;
        this.st = 1;
        break;}


    this.burnCycles(oc);
    return oc;
  }}_defineProperty(MB88xx, "INT_CAUSE_SERIAL", 0x01);_defineProperty(MB88xx, "INT_CAUSE_TIMER", 0x02);_defineProperty(MB88xx, "INT_CAUSE_EXTERNAL", 0x04);_defineProperty(MB88xx, "TIMER_PRESCALE", 32);

class MB8841 extends MB88xx {
  constructor() {
    super({ programWidth: 11, dataWidth: 7 });
  }}

class MB8842 extends MB88xx {
  constructor() {
    super({ programWidth: 11, dataWidth: 7 });
  }}

class MB8843 extends MB88xx {
  constructor() {
    super({ programWidth: 10, dataWidth: 6 });
  }}

class MB8844 extends MB88xx {
  constructor() {
    super({ programWidth: 10, dataWidth: 6 });
  }}

class Namco50XX {
  /*
   * MAME 0.289 Bosconian 50XX timing.
   *
   * Parent 50XX clock:
   *
   *   MASTER_CLOCK / 6 / 2
   * = 18.432 MHz / 12
   * = 1.536 MHz
   *
   * namco50.cpp creates MB8842 at the parent device clock:
   *
   *   MB8842(config, m_cpu, DERIVED_CLOCK(1,1));
   *
   * The MB8842 core internally divides that clock by 6:
   *
   *   1.536 MHz / 6 = 256 kHz
   *
   * Therefore one MB8842 execution cycle is:
   *
   *   18.432 MHz / 256 kHz = 72 master ticks.
   */






  /*
   * Retained for compatibility with legacy callers only.
   *
   * New scheduler code must use:
   *
   *   advanceMasterTicks(deltaMasterTicks)
   *   nextMasterTickBoundary()
   */





  constructor(opts = {}) {
    void opts;

    this.mcu = new MB8842();

    this.romLoaded = false;

    /*
     * MAME namco_50xx_device constructor initializes:
     *
     * m_rw(0), m_cmd(0), m_portO(0)
     *
     * The wrapper reset signal subsequently drives the embedded MB8842
     * reset input only; it does not clear these three external latches.
     */
    this.cmd = 0x00;
    this.rwLine = 0x00;
    this.portO = 0x00;

    /*
     * External 50XX reset line level:
     *
     * 0 = asserted, matching MAME's active-low reset input
     * 1 = released
     */
    this.resetLine = 1;

    /*
     * Current level passed from Namco06XX chip select to MB88XX IRQ.
     *
     * MAME sends every transition directly to MB88XX_IRQ_LINE. Do not
     * edge-filter it in this wrapper; MB88xx owns IRQ edge/level handling.
     */
    this.irqState = false;

    this.scheduler = null;

    /*
     * Elapsed master ticks not yet converted into a complete 72-tick
     * MB8842 execution-cycle credit.
     *
     * Invariant:
     *
     *   0 <= pendingMasterTicks < MASTER_TICKS_PER_MCU_CYCLE
     */
    this.pendingMasterTicks = 0;

    /*
     * Diagnostic state only. None of this state may affect emulation.
     */
    this.traceReads = false;
    this.traceOChanges = false;

    this.breakOnBadOWrite = false;
    this.breakOnMissingSchedulerTick = false;

    this.oTraceSequence = 0;
    this.lastOEvent = null;
    this.oTraceHistory = [];

    this.installMcuCallbacks();
    this.applyResetLineToMcu();
  }

  /* =====================================================================
   * Scheduler connection
   * ===================================================================== */

  setScheduler(scheduler) {
    this.scheduler = scheduler || null;
  }

  /*
   * JavaScript equivalent of machine().scheduler().synchronize().
   *
   * MAME uses synchronization for:
   *
   *   namco_50xx_device::O_w()
   *   namco_50xx_device::rw()
   *   namco_50xx_device::write()
   *
   * A missing scheduler is acceptable only during construction/setup.
   */
  synchronize(callback) {
    const scheduler = this.scheduler;

    if (scheduler && typeof scheduler.synchronize === "function") {
      return scheduler.synchronize(callback, this);
    }

    if (scheduler && typeof scheduler.at === "function") {
      return scheduler.at(scheduler.schedulerTick, callback, this);
    }

    if (this.breakOnMissingSchedulerTick) {
      console.warn(
      "[50XX] scheduler missing; applying synchronized operation immediately");

      debugger;
    }

    callback();
    return null;
  }

  /* =====================================================================
   * MAME MB8842 port callbacks
   *
   * namco_50xx_device::device_add_mconfig():
   *
   * read_k()       -> K_r()
   * read_r<0>()    -> R0_r()
   * read_r<2>()    -> R2_r()
   * write_o()      -> O_w()
   * ===================================================================== */

  installMcuCallbacks() {
    /*
     * MAME:
     *
     * return m_cmd >> 4;
     */
    this.mcu.readK = () => this.cmd >>> 4 & 0x0f;

    /*
     * MAME:
     *
     * return m_cmd & 0x0f;
     */
    this.mcu.readR[0] = () => this.cmd & 0x0f;

    /*
     * MAME:
     *
     * return m_rw & 1;
     */
    this.mcu.readR[2] = () => this.rwLine & 0x01;

    /*
     * MAME O_w() schedules O_w_sync(), which assigns m_portO.
     */
    this.mcu.writeO = data => {
      this.oWrite(data & 0xff);
    };
  }

  /* =====================================================================
   * ROM loading
   * ===================================================================== */

  loadROM(romData) {
    if (!(romData instanceof Uint8Array)) {
      throw new TypeError("Namco50XX.loadROM() requires a Uint8Array");
    }

    if (romData.length < Namco50XX.ROM_SIZE) {
      throw new RangeError(
      "Namco50XX.loadROM() requires at least 0x800 bytes; got 0x" +
      romData.length.toString(16));

    }

    /*
     * MAME declares a 0x800-byte MCU region for 50xx.bin.
     *
     * Pass only the device's addressable ROM window. A subarray avoids
     * copying while preventing accidental access assumptions beyond 0x7ff.
     */
    this.mcu.loadROM(romData.subarray(0, Namco50XX.ROM_SIZE));

    this.romLoaded = true;
  }

  /* =====================================================================
   * MAME synchronized O/answer latch
   *
   * O_w() -> scheduler.synchronize(O_w_sync, data)
   * O_w_sync() -> m_portO = data
   * ===================================================================== */

  oWrite(data) {
    const value = data & 0xff;

    const requestScheduler = this.scheduler;

    const requestTick =
    requestScheduler && Number.isFinite(requestScheduler.schedulerTick) ?
    requestScheduler.schedulerTick :
    null;

    if (!requestScheduler && this.breakOnMissingSchedulerTick) {
      console.warn(
      "[50XX O] missing scheduler while writing $" +
      value.toString(16).padStart(2, "0"));

      debugger;
    }

    this.synchronize(() => {
      const applyScheduler = this.scheduler;

      const applyTick =
      applyScheduler && Number.isFinite(applyScheduler.schedulerTick) ?
      applyScheduler.schedulerTick :
      null;

      const oldO = this.portO & 0xff;

      /*
       * Direct translation of MAME O_w_sync:
       *
       * m_portO = param;
       */
      this.portO = value;

      const event = {
        sequence: ++this.oTraceSequence,
        tick: applyTick,
        requestTick,
        applyTick,
        oldO,
        newO: value,
        cmd: this.cmd & 0xff,
        rw: this.rwLine & 0x01,
        reset: this.resetLine & 0x01,
        cs: this.irqState ? 1 : 0,
        executedPC:
        typeof this.mcu.getPC === "function" ?
        this.mcu.getPC() & 0x07ff :
        null };


      this.lastOEvent = event;
      this.oTraceHistory.push(event);

      if (this.oTraceHistory.length > Namco50XX.O_TRACE_LIMIT) {
        this.oTraceHistory.shift();
      }

      if (this.traceOChanges) {var _event$requestTick, _event$applyTick;
        const hex8 = (number) =>
        "$" + (number & 0xff).toString(16).padStart(2, "0");

        const pc =
        event.executedPC == null ?
        "???" :
        event.executedPC.toString(16).padStart(3, "0");

        console.log(
        "[50XX O] " +
        "seq=" +
        event.sequence +
        " " +
        "reqTick=" + ((_event$requestTick =
        event.requestTick) !== null && _event$requestTick !== void 0 ? _event$requestTick : "none") +
        " " +
        "applyTick=" + ((_event$applyTick =
        event.applyTick) !== null && _event$applyTick !== void 0 ? _event$applyTick : "none") +
        " " +
        "O=" +
        hex8(event.newO) +
        " " +
        "old=" +
        hex8(event.oldO) +
        " " +
        "cmd=" +
        hex8(event.cmd) +
        " " +
        "rw=" +
        event.rw +
        " " +
        "pc=$" +
        pc);

      }
    });
  }

  /* =====================================================================
   * MAME external active-low reset input
   * ===================================================================== */

  applyResetLineToMcu() {
    const asserted = this.resetLine === 0;

    /*
     * Preferred MB88xx API: persistent line state, matching MAME's
     * set_input_line(INPUT_LINE_RESET, ASSERT/CLEAR).
     */
    if (typeof this.mcu.setResetLine === "function") {
      this.mcu.setResetLine(asserted);
      return;
    }

    /*
     * Compatibility fallback for an MB8842 implementation that provides
     * only edge-triggered reset(). The wrapper and scheduler still keep
     * execution suppressed while resetLine is low.
     */
    if (asserted && typeof this.mcu.reset === "function") {
      this.mcu.reset();
    }
  }

  resetMcuOnly() {
    /*
     * This helper is for whole-machine reset routines that require a fresh
     * MCU core. It intentionally preserves cmd/rwLine/portO just as the
     * MAME 50XX external reset wrapper does.
     */
    if (typeof this.mcu.reset === "function") {
      this.mcu.reset();
    }

    this.pendingMasterTicks = 0;
    this.applyResetLineToMcu();
  }

  reset() {
    this.resetMcuOnly();
  }

  isReset() {
    return this.resetLine === 0;
  }

  setResetLine(level) {
    const next = level ? 1 : 0;

    if (next === this.resetLine) {
      return false;
    }

    this.resetLine = next;

    /*
     * MAME drives an active-low reset line directly into MB8842.
     * Do not alter cmd, rwLine, portO, or irqState here.
     */
    this.applyResetLineToMcu();

    if (next === 0) {
      this.pendingMasterTicks = 0;
    }

    return true;
  }

  /* =====================================================================
   * MAME 06XX interface
   * ===================================================================== */

  /*
   * MAME chip_select() drives MB88XX_IRQ_LINE immediately:
   *
   * m_cpu->set_input_line(
   *   MB88XX_IRQ_LINE,
   *   state ? ASSERT_LINE : CLEAR_LINE
   * );
   */
  chipSelect(state) {
    const next = !!state;

    this.irqState = next;

    if (typeof this.mcu.setIRQ === "function") {
      this.mcu.setIRQ(next);
    }

    return true;
  }

  /*
   * MAME rw() schedules rw_sync(), which assigns m_rw.
   */
  rw(state) {
    const value = state ? 1 : 0;

    this.synchronize(() => {
      this.rwLine = value;
    });

    return true;
  }

  /*
   * MAME write() schedules write_sync(), which assigns m_cmd.
   */
  write(data) {
    const value = data & 0xff;

    this.synchronize(() => {
      this.cmd = value;
    });

    return true;
  }

  /*
   * MAME read() returns m_portO immediately.
   */
  read() {
    const value = this.portO & 0xff;

    if (this.traceReads) {var _last$requestTick, _last$applyTick;
      const scheduler = this.scheduler;

      const tick =
      scheduler && Number.isFinite(scheduler.schedulerTick) ?
      scheduler.schedulerTick :
      "none";

      const pc =
      typeof this.mcu.getPC === "function" ? this.mcu.getPC() & 0x07ff : 0;

      const last = this.lastOEvent;

      console.log(
      "[50XX READ] " +
      "tick=" +
      tick +
      " " +
      "O=$" +
      value.toString(16).padStart(2, "0") +
      " " +
      "cmd=$" +
      (this.cmd & 0xff).toString(16).padStart(2, "0") +
      " " +
      "rw=" + (
      this.rwLine & 1) +
      " " +
      "reset=" +
      this.resetLine +
      " " +
      "cs=" + (
      this.irqState ? 1 : 0) +
      " " +
      "pc=$" +
      pc.toString(16).padStart(3, "0") +
      " " +
      "lastOSeq=" + (
      last ? last.sequence : "none") +
      " " +
      "lastOReq=" + (
      last ? (_last$requestTick = last.requestTick) !== null && _last$requestTick !== void 0 ? _last$requestTick : "none" : "none") +
      " " +
      "lastOApply=" + (
      last ? (_last$applyTick = last.applyTick) !== null && _last$applyTick !== void 0 ? _last$applyTick : "none" : "none"));

    }

    return value;
  }

  /* =====================================================================
   * Master-tick scheduler interface
   *
   * The revised BoscoTimingSequencer requires these methods and no longer
   * performs a generic master-ticks-to-Z80-cycles fallback.
   * ===================================================================== */

  /*
   * pendingMasterTicks means elapsed master time not yet sufficient to
   * create the next MB8842 execution-cycle credit. Therefore 0 means a
   * full 72 master ticks remain before the next clock credit is issued.
   */
  nextMasterTickBoundary() {
    const period = Namco50XX.MASTER_TICKS_PER_MCU_CYCLE;

    const elapsed = this.pendingMasterTicks % period;

    return elapsed === 0 ? period : period - elapsed;
  }

  advanceMasterTicks(masterTicks) {
    const delta = Math.floor(Number(masterTicks));

    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError(
      "Namco50XX.advanceMasterTicks() requires a non-negative integer");

    }

    if (!this.romLoaded || delta === 0) {
      return;
    }

    /*
     * An asserted external reset line receives no execution credit.
     * This prevents delayed catch-up when reset is later released.
     */
    if (this.resetLine === 0) {
      this.pendingMasterTicks = 0;
      return;
    }

    this.pendingMasterTicks += delta;

    const cycles = Math.floor(
    this.pendingMasterTicks / Namco50XX.MASTER_TICKS_PER_MCU_CYCLE);


    this.pendingMasterTicks -= cycles * Namco50XX.MASTER_TICKS_PER_MCU_CYCLE;

    if (cycles > 0) {
      this.executeMcuCycles(cycles);
    }
  }

  executeMcuCycles(cycles) {
    let remaining = cycles | 0;

    while (remaining > 0) {var _this$mcu$step, _this$mcu$step2, _this$mcu;
      if (this.resetLine === 0 || this.mcu.halted) {
        break;
      }

      const used = (_this$mcu$step = (_this$mcu$step2 = (_this$mcu = this.mcu).step) === null || _this$mcu$step2 === void 0 ? void 0 : _this$mcu$step2.call(_this$mcu)) !== null && _this$mcu$step !== void 0 ? _this$mcu$step : 0;

      if (!Number.isFinite(used) || used < 0) {
        throw new Error("Invalid MB8842 cycle result: " + String(used));
      }

      /*
       * A zero result is not allowed to livelock the device wrapper.
       * Treat it as one consumed scheduling credit pending a more explicit
       * MB88xx halt/wait state from the core.
       */
      remaining -= used > 0 ? used : 1;
    }
  }

  /*
   * Compatibility aliases for existing callers. New timing code should
   * use advanceMasterTicks() directly.
   */
  tickMasterTicks(masterTicks) {
    this.advanceMasterTicks(masterTicks);
  }

  tickHostCycles(hostCycles) {
    const cycles = Math.floor(Number(hostCycles));

    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError(
      "Namco50XX.tickHostCycles() requires a non-negative integer");

    }

    this.advanceMasterTicks(cycles * Namco50XX.MASTER_TICKS_PER_HOST_CYCLE);
  }

  tick(hostCycles) {
    this.tickHostCycles(hostCycles);
  }

  /* =====================================================================
   * Diagnostics
   * ===================================================================== */

  getTraceState() {var _this$lastOEvent$sequ, _this$lastOEvent, _this$lastOEvent$requ, _this$lastOEvent2, _this$lastOEvent$appl, _this$lastOEvent3;
    return {
      romLoaded: !!this.romLoaded,
      schedulerAttached: !!this.scheduler,

      resetLine: this.resetLine,
      resetAsserted: this.resetLine === 0,

      rw: this.rwLine & 0x01,
      irq: this.irqState ? 1 : 0,

      cmd: this.cmd & 0xff,
      portO: this.portO & 0xff,

      pendingMasterTicks: this.pendingMasterTicks,
      ticksToNextMcuCycle: this.nextMasterTickBoundary(),

      mcuHalted: !!this.mcu.halted,

      mcuPC:
      typeof this.mcu.getPC === "function" ? this.mcu.getPC() & 0x07ff : 0,

      lastOSequence: (_this$lastOEvent$sequ = (_this$lastOEvent = this.lastOEvent) === null || _this$lastOEvent === void 0 ? void 0 : _this$lastOEvent.sequence) !== null && _this$lastOEvent$sequ !== void 0 ? _this$lastOEvent$sequ : null,
      lastORequestTick: (_this$lastOEvent$requ = (_this$lastOEvent2 = this.lastOEvent) === null || _this$lastOEvent2 === void 0 ? void 0 : _this$lastOEvent2.requestTick) !== null && _this$lastOEvent$requ !== void 0 ? _this$lastOEvent$requ : null,
      lastOApplyTick: (_this$lastOEvent$appl = (_this$lastOEvent3 = this.lastOEvent) === null || _this$lastOEvent3 === void 0 ? void 0 : _this$lastOEvent3.applyTick) !== null && _this$lastOEvent$appl !== void 0 ? _this$lastOEvent$appl : null };

  }}_defineProperty(Namco50XX, "CLOCK", 1536000);_defineProperty(Namco50XX, "MASTER_TICKS_PER_DEVICE_TICK", 12);_defineProperty(Namco50XX, "MB88XX_CYCLE_DIVIDER", 6);_defineProperty(Namco50XX, "MASTER_TICKS_PER_MCU_CYCLE", 72);_defineProperty(Namco50XX, "MASTER_TICKS_PER_HOST_CYCLE", 6);_defineProperty(Namco50XX, "ROM_SIZE", 0x0800);_defineProperty(Namco50XX, "O_TRACE_LIMIT", 128);

class Namco51XX {
  /*
   * MAME 0.289 Namco 51XX:
   *
   * MB8843(config, m_cpu, DERIVED_CLOCK(1,1));
   *
   * The MB8843 runs at the 51XX parent clock and internally divides
   * its execution clock by six.
   *
   * Bosconian parent 51XX clock:
   *
   * MASTER_CLOCK / 6 / 2 = 1.536 MHz
   *
   * Effective MB8843 execution clock:
   *
   * 1.536 MHz / 6 = 256 kHz
   *
   * One effective MCU cycle:
   *
   * 18.432 MHz / 256 kHz = 72 master ticks.
   */











  constructor(
  dipSwitches = null,
  onOutput = null,
  onLockout = null,
  opts = {})
  {
    this.dipSwitches = dipSwitches;

    /*
     * MAME has separate m_out and m_lockout callbacks.
     *
     * Do not merge them automatically. Wire onLockout only where the
     * Bosconian machine configuration connects a distinct output bit/line.
     */
    this.onOutput = typeof onOutput === "function" ? onOutput : null;

    this.onLockout = typeof onLockout === "function" ? onLockout : null;

    this.mcu = new MB8843();
    this.romLoaded = false;
    this.scheduler = null;

    /*
     * MAME saved external wrapper state:
     *
     * m_portO
     * m_rw
     *
     * Cold-construction values match MAME constructor state.
     */
    this.portOValue = 0x00;
    this.rwState = 0x00;

    /*
     * External active-low reset line:
     *
     * 0 = reset asserted
     * 1 = reset released
     */
    this.resetLineState = 1;

    /*
     * Diagnostic copy of the MB88xx IRQ input level.
     * MAME forwards every 06XX chip-select transition directly to
     * MB88XX_IRQ_LINE.
     */
    this.irqStateValue = false;

    /*
     * TC input represents the 51XX vblank-connected timer input.
     *
     * MAME:
     *
     * vblank(state) {
     *   set_input_line(MB88XX_TC_LINE,
     *     state ? CLEAR_LINE : ASSERT_LINE);
     * }
     *
     * Therefore falling vblank => TC asserted.
     */
    this.tcStateValue = true;

    /*
     * Four independent MAME R-port callback values:
     *
     * m_in[0] -> R0
     * m_in[1] -> R1
     * m_in[2] -> R2
     * m_in[3] -> R3
     *
     * Defaults are zero because MAME initializes m_in(*this, 0).
     */
    this.inputs = new Uint8Array(4);

    /*
     * Master tick remainder:
     *
     * 0 <= pendingMasterTicks < 72
     */
    this.pendingMasterTicks = 0;

    /*
     * Optional trace data. Keep passive.
     */
    this.traceReads = false;
    this.traceWrites = false;

    this.installMcuCallbacks();
    this.applyResetLineToMcu();

    /*
     * Preserve constructor compatibility with a caller that supplies
     * initial port values in opts.
     */
    if (opts && typeof opts === "object") {
      if (opts.inputs) {
        for (let index = 0; index < 4; index++) {
          if (opts.inputs[index] != null) {
            this.inputs[index] = opts.inputs[index] & 0xff;
          }
        }
      }
    }
  }

  /* =====================================================================
   * Scheduler support
   * ===================================================================== */

  setScheduler(scheduler) {
    this.scheduler = scheduler || null;
  }

  synchronize(callback) {
    const scheduler = this.scheduler;

    if (scheduler && typeof scheduler.synchronize === "function") {
      return scheduler.synchronize(callback, this);
    }

    if (scheduler && typeof scheduler.at === "function") {
      return scheduler.at(scheduler.schedulerTick, callback, this);
    }

    /*
     * Setup-only fallback. Live emulation must attach the shared scheduler.
     */
    callback();
    return null;
  }

  /* =====================================================================
   * MB8843 MAME callback wiring
   * ===================================================================== */

  installMcuCallbacks() {
    /*
     * MAME:
     *
     * return (m_rw << 3) | (m_portO & 0x07);
     */
    this.mcu.readK = () =>
    (this.rwState & 0x01) << 3 | this.portOValue & 0x07;

    /*
     * MAME:
     *
     * read_r<0>() -> R_r<0>()
     * read_r<1>() -> R_r<1>()
     * read_r<2>() -> R_r<2>()
     * read_r<3>() -> R_r<3>()
     *
     * R_r<N>() returns m_in[N] directly.
     */
    for (let index = 0; index < 4; index++) {
      this.mcu.readR[index] = () => this.inputs[index] & 0xff;
    }

    /*
     * MAME:
     *
     * O_w(data) -> scheduler.synchronize(O_w_sync, data)
     * O_w_sync(data) -> m_portO = data
     */
    this.mcu.writeO = data => {
      this.writeOFromMcu(data & 0xff);
    };

    /*
     * MAME:
     *
     * P_w(data) -> m_out(data)
     *
     * Do not mask to a nibble. MAME forwards the full byte.
     */
    this.mcu.writeP = data => {var _this$onOutput;
      const value = data & 0xff;
      (_this$onOutput = this.onOutput) === null || _this$onOutput === void 0 ? void 0 : _this$onOutput.call(this, value);
    };
  }

  /* =====================================================================
   * ROM
   * ===================================================================== */

  loadROM(romData) {
    if (!(romData instanceof Uint8Array)) {
      throw new TypeError("Namco51XX.loadROM() requires a Uint8Array");
    }

    if (romData.length < Namco51XX.ROM_SIZE) {
      throw new RangeError(
      "Namco51XX.loadROM() requires at least 0x400 bytes; got 0x" +
      romData.length.toString(16));

    }

    this.mcu.loadROM(romData.subarray(0, Namco51XX.ROM_SIZE));

    this.romLoaded = true;
  }

  /* =====================================================================
   * Reset and line inputs
   * ===================================================================== */

  applyResetLineToMcu() {
    const asserted = this.resetLineState === 0;

    if (typeof this.mcu.setResetLine === "function") {
      this.mcu.setResetLine(asserted);
      return;
    }

    /*
     * Compatibility fallback. The wrapper still suppresses execution
     * while resetLineState is low.
     */
    if (asserted) {var _this$mcu$reset, _this$mcu2;
      (_this$mcu$reset = (_this$mcu2 = this.mcu).reset) === null || _this$mcu$reset === void 0 ? void 0 : _this$mcu$reset.call(_this$mcu2);
    }
  }

  reset() {var _this$mcu$reset2, _this$mcu3;
    /*
     * This represents a machine-level core reset. MAME's 51XX wrapper
     * itself saves m_portO/m_rw and only its reset(state) method drives
     * the MB8843 reset input. Keep externally visible latch state unless
     * your surrounding machine reset implementation explicitly resets it.
     */
    (_this$mcu$reset2 = (_this$mcu3 = this.mcu).reset) === null || _this$mcu$reset2 === void 0 ? void 0 : _this$mcu$reset2.call(_this$mcu3);

    this.pendingMasterTicks = 0;

    this.applyResetLineToMcu();

    if (typeof this.mcu.setIRQ === "function") {
      this.mcu.setIRQ(this.irqStateValue);
    }

    if (typeof this.mcu.setTC === "function") {
      this.mcu.setTC(this.tcStateValue);
    }
  }

  isReset() {
    return this.resetLineState === 0;
  }

  setResetLine(level) {
    const next = level ? 1 : 0;

    if (next === this.resetLineState) {
      return false;
    }

    this.resetLineState = next;

    /*
     * MAME namco_51xx_device::reset:
     *
     * state ? CLEAR_LINE : ASSERT_LINE
     */
    this.applyResetLineToMcu();

    if (next === 0) {
      this.pendingMasterTicks = 0;
    }

    return true;
  }

  /*
   * MAME:
   *
   * m_cpu->set_input_line(
   *   MB88XX_TC_LINE,
   *   state ? CLEAR_LINE : ASSERT_LINE
   * );
   */
  vblank(state) {
    const nextTcAsserted = !Boolean(state);

    if (nextTcAsserted === this.tcStateValue) {
      return false;
    }

    this.tcStateValue = nextTcAsserted;

    if (this.resetLineState !== 0) {var _this$mcu$setTC, _this$mcu4;
      (_this$mcu$setTC = (_this$mcu4 = this.mcu).setTC) === null || _this$mcu$setTC === void 0 ? void 0 : _this$mcu$setTC.call(_this$mcu4, nextTcAsserted);
    }

    return true;
  }

  /*
   * MAME:
   *
   * chip_select(state) ->
   *   set_input_line(MB88XX_IRQ_LINE,
   *     state ? ASSERT_LINE : CLEAR_LINE);
   *
   * This is immediate, not scheduler-synchronized.
   */
  chipSelect(state) {
    const next = !!state;

    this.irqStateValue = next;

    if (this.resetLineState !== 0) {var _this$mcu$setIRQ, _this$mcu5;
      (_this$mcu$setIRQ = (_this$mcu5 = this.mcu).setIRQ) === null || _this$mcu$setIRQ === void 0 ? void 0 : _this$mcu$setIRQ.call(_this$mcu5, next);
    }

    return true;
  }

  /* =====================================================================
   * 06XX data-bus interface
   * ===================================================================== */

  /*
   * MAME:
   *
   * rw(state) -> scheduler.synchronize(rw_sync, state)
   * rw_sync(state) -> m_rw = state
   */
  rw(state) {
    const value = state ? 1 : 0;

    this.synchronize(() => {
      this.rwState = value;
    });

    return true;
  }

  /*
   * MAME:
   *
   * write(data) -> scheduler.synchronize(write_sync, data)
   * write_sync(data) -> m_portO = data
   */
  write(data) {
    const value = data & 0xff;

    this.synchronize(() => {
      this.portOValue = value;
    });

    return true;
  }

  /*
   * MAME:
   *
   * read() -> return m_portO;
   */
  read() {
    const value = this.portOValue & 0xff;

    if (this.traceReads) {
      const tick =
      this.scheduler && Number.isFinite(this.scheduler.schedulerTick) ?
      this.scheduler.schedulerTick :
      "none";

      console.log(
      "[51XX READ] " +
      "tick=" +
      tick +
      " " +
      "O=$" +
      value.toString(16).padStart(2, "0") +
      " " +
      "rw=" + (
      this.rwState & 1) +
      " " +
      "irq=" + (
      this.irqStateValue ? 1 : 0) +
      " " +
      "tc=" + (
      this.tcStateValue ? 1 : 0));

    }

    return value;
  }

  /*
   * MAME:
   *
   * O_w(data) -> scheduler.synchronize(O_w_sync, data)
   * O_w_sync(data) -> m_portO = data
   */
  writeOFromMcu(data) {
    const value = data & 0xff;

    this.synchronize(() => {
      this.portOValue = value;

      if (this.traceWrites) {
        const tick =
        this.scheduler && Number.isFinite(this.scheduler.schedulerTick) ?
        this.scheduler.schedulerTick :
        "none";

        console.log(
        "[51XX O] " +
        "tick=" +
        tick +
        " " +
        "O=$" +
        value.toString(16).padStart(2, "0"));

      }
    });
  }

  /* =====================================================================
   * MAME R-port inputs
   * ===================================================================== */

  setInputPort(index, value) {
    if (!Number.isInteger(index) || index < 0 || index > 3) {
      throw new RangeError("Namco51XX: invalid input port " + String(index));
    }

    this.inputs[index] = value & 0xff;
  }

  /*
   * Compatibility helper for an older two-byte input integration.
   *
   * It maps:
   *
   * R0 = low nibble of in0
   * R1 = high nibble of in0
   * R2 = low nibble of in1
   * R3 = high nibble of in1
   *
   * Use only if this is verified against your Bosconian MAME machine
   * configuration wiring. New code should set R0-R3 explicitly.
   */
  setPorts(in0, in1) {
    const port0 = in0 & 0xff;
    const port1 = in1 & 0xff;

    this.inputs[0] = port0 & 0x0f;
    this.inputs[1] = port0 >>> 4 & 0x0f;
    this.inputs[2] = port1 & 0x0f;
    this.inputs[3] = port1 >>> 4 & 0x0f;
  }

  /* =====================================================================
   * Master-tick execution
   * ===================================================================== */

  nextMasterTickBoundary() {
    const period = Namco51XX.MASTER_TICKS_PER_MCU_CYCLE;
    const elapsed = this.pendingMasterTicks % period;

    return elapsed === 0 ? period : period - elapsed;
  }

  advanceMasterTicks(masterTicks) {
    const delta = Math.floor(Number(masterTicks));

    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError(
      "Namco51XX.advanceMasterTicks() requires a non-negative integer");

    }

    if (!this.romLoaded || delta === 0) {
      return;
    }

    if (this.resetLineState === 0) {
      this.pendingMasterTicks = 0;
      return;
    }

    this.pendingMasterTicks += delta;

    const cycles = Math.floor(
    this.pendingMasterTicks / Namco51XX.MASTER_TICKS_PER_MCU_CYCLE);


    this.pendingMasterTicks -= cycles * Namco51XX.MASTER_TICKS_PER_MCU_CYCLE;

    if (cycles > 0) {
      this.executeMcuCycles(cycles);
    }
  }

  executeMcuCycles(cycles) {
    let remaining = cycles | 0;

    while (remaining > 0) {var _this$mcu$step3, _this$mcu$step4, _this$mcu6;
      if (this.resetLineState === 0 || this.mcu.halted) {
        break;
      }

      const used = (_this$mcu$step3 = (_this$mcu$step4 = (_this$mcu6 = this.mcu).step) === null || _this$mcu$step4 === void 0 ? void 0 : _this$mcu$step4.call(_this$mcu6)) !== null && _this$mcu$step3 !== void 0 ? _this$mcu$step3 : 0;

      if (!Number.isFinite(used) || used < 0) {
        throw new Error("Invalid MB8843 cycle result: " + String(used));
      }

      remaining -= used > 0 ? used : 1;
    }
  }

  /*
   * Compatibility aliases. New scheduler code must use
   * advanceMasterTicks() directly.
   */
  tickMasterTicks(masterTicks) {
    this.advanceMasterTicks(masterTicks);
  }

  tickHostCycles(hostCycles) {
    const cycles = Math.floor(Number(hostCycles));

    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError(
      "Namco51XX.tickHostCycles() requires a non-negative integer");

    }

    this.advanceMasterTicks(cycles * Namco51XX.MASTER_TICKS_PER_HOST_CYCLE);
  }

  tick(hostCycles) {
    this.tickHostCycles(hostCycles);
  }

  getTraceState() {
    return {
      romLoaded: !!this.romLoaded,
      schedulerAttached: !!this.scheduler,

      resetLine: this.resetLineState ? 1 : 0,
      resetAsserted: this.resetLineState === 0,

      rw: this.rwState & 0x01,
      irq: this.irqStateValue ? 1 : 0,
      tc: this.tcStateValue ? 1 : 0,

      mcuHalted: !!this.mcu.halted,

      mcuPC:
      typeof this.mcu.getPC === "function" ? this.mcu.getPC() & 0x03ff : 0,

      portO: this.portOValue & 0xff,

      r0: this.inputs[0] & 0xff,
      r1: this.inputs[1] & 0xff,
      r2: this.inputs[2] & 0xff,
      r3: this.inputs[3] & 0xff,

      pendingMasterTicks: this.pendingMasterTicks,
      ticksToNextMcuCycle: this.nextMasterTickBoundary() };

  }

  resetCounter() {
    /*
     * Compatibility no-op.
     *
     * MAME namco_51xx_device does not expose a counter-reset API in the
     * provided 0.289 source.
     */
  }}_defineProperty(Namco51XX, "CLOCK", 1536000);_defineProperty(Namco51XX, "MASTER_TICKS_PER_DEVICE_TICK", 12);_defineProperty(Namco51XX, "MB88XX_CYCLE_DIVIDER", 6);_defineProperty(Namco51XX, "MASTER_TICKS_PER_MCU_CYCLE", Namco51XX.MASTER_TICKS_PER_DEVICE_TICK * Namco51XX.MB88XX_CYCLE_DIVIDER);_defineProperty(Namco51XX, "MASTER_TICKS_PER_HOST_CYCLE", 6);_defineProperty(Namco51XX, "ROM_SIZE", 0x0400);

class Namco52XX {








  constructor(voiceRom = null, opts = {}) {
    this.mcu = new MB8843();
    this.romLoaded = false;

    /*
     * The sample ROM is separate from 52xx.bin MCU program ROM.
     *
     * MAME obtains its sample bytes through m_romread(m_address).
     */
    this.voiceRom =
    voiceRom instanceof Uint8Array ? voiceRom : new Uint8Array(0);

    /*
     * MAME persistent device wrapper state:
     *
     * m_latched_cmd
     * m_address
     */
    this.latchedCmd = 0x00;
    this.address = 0x0000;

    /*
     * External active-low reset:
     *
     * 0 = reset asserted
     * 1 = reset released
     */
    this.resetLine = 1;

    /*
     * Current MB88xx IRQ line level from 06XX chip select.
     */
    this.irqState = false;

    /*
     * MAME default SI callback returns zero. For Bosco, SI is tied to
     * ground according to namco52.cpp, but allow explicit machine wiring.
     */
    this.readSI = typeof opts.readSI === "function" ? opts.readSI : () => 0;

    /*
     * MAME P_w() writes the lower nibble into a discrete-sound node.
     * The JS machine supplies the equivalent audio/DAC sink.
     */
    this.onDacWrite =
    typeof opts.onDacWrite === "function" ? opts.onDacWrite : null;

    /*
     * External TC pulses are used by some samples. MAME allocates an
     * external-clock timer only if m_extclock is nonzero.
     *
     * For Bosco, provide master ticks between TC pulses explicitly from
     * the machine configuration. Zero disables the pulse timer.
     */
    this.externalClockPeriodTicks =
    Number.isInteger(opts.externalClockPeriodTicks) &&
    opts.externalClockPeriodTicks > 0 ?
    opts.externalClockPeriodTicks :
    0;

    this.scheduler = null;
    this.externalClockTimerArmed = false;
    this.externalClockHandle = null;

    /*
     * Elapsed master time not yet converted into a full MB8843 execution
     * cycle. Its invariant is:
     *
     * 0 <= pendingMasterTicks < MASTER_TICKS_PER_MCU_CYCLE
     */
    this.pendingMasterTicks = 0;

    /*
     * Diagnostics only.
     */
    this.traceCommands = false;
    this.traceDacWrites = false;

    this.installMcuCallbacks();
    this.applyResetLineToMcu();
  }
  setScheduler(scheduler) {
    this.cancelExternalClock();
    this.scheduler = scheduler || null;
    this.armExternalClock();
  }
  synchronize(callback) {
    const scheduler = this.scheduler;

    if (scheduler && typeof scheduler.synchronize === "function") {
      return scheduler.synchronize(callback, this);
    }

    if (scheduler && typeof scheduler.at === "function") {
      return scheduler.at(scheduler.schedulerTick, callback, this);
    }

    /*
     * Setup-only fallback. A live 06XX-connected 52XX requires the
     * shared machine scheduler.
     */
    callback();
    return null;
  }
  installMcuCallbacks() {
    this.mcu.readK = () => this.latchedCmd & 0x0f;

    this.mcu.readSI = () => this.readSI() ? 1 : 0;

    this.mcu.readR[0] = () => this.readVoiceRom(this.address) & 0x0f;

    this.mcu.readR[1] = () => this.readVoiceRom(this.address) >>> 4 & 0x0f;

    this.mcu.writeP = data => {var _this$onDacWrite;
      const value = data & 0x0f;

      const masterTick =
      this.scheduler && Number.isFinite(this.scheduler.schedulerTick) ?
      this.scheduler.schedulerTick :
      null;

      if (this.traceDacWrites) {
        console.log(
        "[52XX P] tick=" + (
        masterTick !== null && masterTick !== void 0 ? masterTick : "none") +
        " data=$" +
        value.toString(16));

      }

      (_this$onDacWrite = this.onDacWrite) === null || _this$onDacWrite === void 0 ? void 0 : _this$onDacWrite.call(this, value, masterTick);
    };

    this.mcu.writeR[2] = data => {
      this.address = this.address & 0xfff0 | (data & 0x0f) << 0;
    };

    this.mcu.writeR[3] = data => {
      this.address = this.address & 0xff0f | (data & 0x0f) << 4;
    };

    this.mcu.writeO = data => {
      this.address = this.address & 0x00ff | (data & 0xff) << 8;
    };
  }
  loadROM(romData) {
    if (!(romData instanceof Uint8Array)) {
      throw new TypeError("Namco52XX.loadROM() requires a Uint8Array");
    }

    if (romData.length < Namco52XX.MCU_ROM_SIZE) {
      throw new RangeError(
      "Namco52XX.loadROM() requires at least 0x400 bytes; got 0x" +
      romData.length.toString(16));

    }

    this.mcu.loadROM(romData.subarray(0, Namco52XX.MCU_ROM_SIZE));

    this.romLoaded = true;
  }
  loadSamples(voiceRom) {
    if (!(voiceRom instanceof Uint8Array)) {
      throw new TypeError("Namco52XX.loadSamples() requires a Uint8Array");
    }

    this.voiceRom = voiceRom;
  }
  readVoiceRom(address) {
    address >>>= 0;

    let offset;

    if ((address & 0x1000) === 0) {
      offset = address & 0x0fff | 0x0000;
    } else if ((address & 0x2000) === 0) {
      offset = address & 0x0fff | 0x1000;
    } else if ((address & 0x4000) === 0) {
      offset = address & 0x0fff | 0x2000;
    } else if ((address & 0x8000) === 0) {
      offset = address & 0x0fff | 0x3000;
    } else {
      return 0xff;
    }

    return offset < this.voiceRom.length ? this.voiceRom[offset] & 0xff : 0xff;
  }
  applyResetLineToMcu() {
    const asserted = this.resetLine === 0;

    if (typeof this.mcu.setResetLine === "function") {
      this.mcu.setResetLine(asserted);
      return;
    }

    /*
     * Compatibility fallback. The wrapper continues suppressing execution
     * while resetLine is low.
     */
    if (asserted) {var _this$mcu$reset3, _this$mcu7;
      (_this$mcu$reset3 = (_this$mcu7 = this.mcu).reset) === null || _this$mcu$reset3 === void 0 ? void 0 : _this$mcu$reset3.call(_this$mcu7);
    }
  }
  resetMcuOnly() {var _this$mcu$reset4, _this$mcu8;
    /*
     * MAME namco_52xx_device::reset(state) drives the CPU reset input.
     * It does not explicitly clear m_latched_cmd or m_address.
     */
    (_this$mcu$reset4 = (_this$mcu8 = this.mcu).reset) === null || _this$mcu$reset4 === void 0 ? void 0 : _this$mcu$reset4.call(_this$mcu8);
    this.pendingMasterTicks = 0;
    this.applyResetLineToMcu();
  }
  reset() {
    this.resetMcuOnly();
  }
  isReset() {
    return this.resetLine === 0;
  }
  setResetLine(level) {
    const next = level ? 1 : 0;

    if (next === this.resetLine) {
      return false;
    }

    this.resetLine = next;
    this.applyResetLineToMcu();

    if (next === 0) {
      this.pendingMasterTicks = 0;
    }

    return true;
  }
  write(data) {
    const value = data & 0xff;

    this.synchronize(() => {
      this.latchedCmd = value;

      if (this.traceCommands) {
        const tick =
        this.scheduler && Number.isFinite(this.scheduler.schedulerTick) ?
        this.scheduler.schedulerTick :
        "none";

        console.log(
        "[52XX CMD] tick=" +
        tick +
        " cmd=$" +
        value.toString(16).padStart(2, "0"));

      }
    });

    return true;
  }
  chipSelect(state) {var _this$mcu$setIRQ2, _this$mcu9;
    const next = !!state;

    this.irqState = next;
    (_this$mcu$setIRQ2 = (_this$mcu9 = this.mcu).setIRQ) === null || _this$mcu$setIRQ2 === void 0 ? void 0 : _this$mcu$setIRQ2.call(_this$mcu9, next);

    return true;
  }
  read() {
    return 0xff;
  }
  rw(_state) {}
  setExternalClockPeriodTicks(periodTicks) {
    const next =
    Number.isInteger(periodTicks) && periodTicks > 0 ? periodTicks : 0;

    if (next === this.externalClockPeriodTicks) {
      return false;
    }

    this.cancelExternalClock();
    this.externalClockPeriodTicks = next;
    this.armExternalClock();

    return true;
  }
  cancelExternalClock() {var _this$externalClockHa, _this$externalClockHa2;
    this.externalClockTimerArmed = false;
    (_this$externalClockHa = this.externalClockHandle) === null || _this$externalClockHa === void 0 ? void 0 : (_this$externalClockHa2 = _this$externalClockHa.cancel) === null || _this$externalClockHa2 === void 0 ? void 0 : _this$externalClockHa2.call(_this$externalClockHa);
    this.externalClockHandle = null;
  }
  armExternalClock() {
    if (
    this.externalClockTimerArmed ||
    !this.scheduler ||
    this.externalClockPeriodTicks <= 0)
    {
      return;
    }

    this.externalClockTimerArmed = true;

    const deadline =
    this.scheduler.schedulerTick + this.externalClockPeriodTicks;

    this.scheduleExternalClockPulse(deadline);
  }
  scheduleExternalClockPulse(deadline) {
    if (
    !this.scheduler ||
    !this.externalClockTimerArmed ||
    this.externalClockPeriodTicks <= 0)
    {
      return;
    }

    this.externalClockHandle = this.scheduler.at(
    deadline,
    () => {
      if (
      !this.externalClockTimerArmed ||
      this.externalClockPeriodTicks <= 0)
      {
        return;
      }

      /*
       * MAME:
       *
       * m_cpu->pulse_input_line(MB88XX_TC_LINE, attotime::zero);
       */
      if (this.resetLine !== 0) {var _this$mcu$pulseTC, _this$mcu10;
        (_this$mcu$pulseTC = (_this$mcu10 = this.mcu).pulseTC) === null || _this$mcu$pulseTC === void 0 ? void 0 : _this$mcu$pulseTC.call(_this$mcu10);

        /*
         * Compatibility for MB8843 cores exposing only a level setter.
         * Replace with a core-level zero-time pulse when available.
         */
        if (typeof this.mcu.pulseTC !== "function") {var _this$mcu$setTC2, _this$mcu11, _this$mcu$setTC3, _this$mcu12;
          (_this$mcu$setTC2 = (_this$mcu11 = this.mcu).setTC) === null || _this$mcu$setTC2 === void 0 ? void 0 : _this$mcu$setTC2.call(_this$mcu11, true);
          (_this$mcu$setTC3 = (_this$mcu12 = this.mcu).setTC) === null || _this$mcu$setTC3 === void 0 ? void 0 : _this$mcu$setTC3.call(_this$mcu12, false);
        }
      }

      this.scheduleExternalClockPulse(
      deadline + this.externalClockPeriodTicks);

    },
    this);

  }
  nextMasterTickBoundary() {
    const period = Namco52XX.MASTER_TICKS_PER_MCU_CYCLE;
    const elapsed = this.pendingMasterTicks % period;

    return elapsed === 0 ? period : period - elapsed;
  }
  advanceMasterTicks(masterTicks) {
    const delta = Math.floor(Number(masterTicks));

    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError(
      "Namco52XX.advanceMasterTicks() requires a non-negative integer");

    }

    if (!this.romLoaded || delta === 0) {
      return;
    }

    if (this.resetLine === 0) {
      this.pendingMasterTicks = 0;
      return;
    }

    this.pendingMasterTicks += delta;

    const cycles = Math.floor(
    this.pendingMasterTicks / Namco52XX.MASTER_TICKS_PER_MCU_CYCLE);


    this.pendingMasterTicks -= cycles * Namco52XX.MASTER_TICKS_PER_MCU_CYCLE;

    if (cycles > 0) {
      this.executeMcuCycles(cycles);
    }
  }
  executeMcuCycles(cycles) {
    let remaining = cycles | 0;

    while (remaining > 0) {var _this$mcu$step5, _this$mcu$step6, _this$mcu13;
      if (this.resetLine === 0 || this.mcu.halted) {
        break;
      }

      const used = (_this$mcu$step5 = (_this$mcu$step6 = (_this$mcu13 = this.mcu).step) === null || _this$mcu$step6 === void 0 ? void 0 : _this$mcu$step6.call(_this$mcu13)) !== null && _this$mcu$step5 !== void 0 ? _this$mcu$step5 : 0;

      if (!Number.isFinite(used) || used < 0) {
        throw new Error("Invalid MB8843 cycle result: " + String(used));
      }

      remaining -= used > 0 ? used : 1;
    }
  }
  tickMasterTicks(masterTicks) {
    this.advanceMasterTicks(masterTicks);
  }
  tickHostCycles(hostCycles) {
    const cycles = Math.floor(Number(hostCycles));

    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError(
      "Namco52XX.tickHostCycles() requires a non-negative integer");

    }

    this.advanceMasterTicks(cycles * Namco52XX.MASTER_TICKS_PER_HOST_CYCLE);
  }
  tick(hostCycles) {
    this.tickHostCycles(hostCycles);
  }
  getTraceState() {
    return {
      romLoaded: !!this.romLoaded,
      schedulerAttached: !!this.scheduler,

      resetLine: this.resetLine ? 1 : 0,
      resetAsserted: this.resetLine === 0,

      irq: this.irqState ? 1 : 0,

      mcuHalted: !!this.mcu.halted,

      mcuPC:
      typeof this.mcu.getPC === "function" ? this.mcu.getPC() & 0x03ff : 0,

      latchedCmd: this.latchedCmd & 0xff,
      commandNibble: this.latchedCmd & 0x0f,

      address: this.address >>> 0,

      pendingMasterTicks: this.pendingMasterTicks,
      ticksToNextMcuCycle: this.nextMasterTickBoundary(),

      externalClockPeriodTicks: this.externalClockPeriodTicks,
      externalClockArmed: !!this.externalClockTimerArmed };

  }}_defineProperty(Namco52XX, "CLOCK", 1536000);_defineProperty(Namco52XX, "MASTER_TICKS_PER_DEVICE_TICK", 12);_defineProperty(Namco52XX, "MB88XX_CYCLE_DIVIDER", 6);_defineProperty(Namco52XX, "MASTER_TICKS_PER_MCU_CYCLE", Namco52XX.MASTER_TICKS_PER_DEVICE_TICK * Namco52XX.MB88XX_CYCLE_DIVIDER);_defineProperty(Namco52XX, "MASTER_TICKS_PER_HOST_CYCLE", 6);_defineProperty(Namco52XX, "MCU_ROM_SIZE", 0x0400);

class voice52xxDac {












  constructor() {
    this.audioCtx = null;

    this.source = null;
    this.highPass = null;
    this.lowPass = null;
    this.gainNode = null;

    this.lastNibble = 0x08;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  attach(audioCtx, destination) {
    if (this.audioCtx === audioCtx && this.source) {
      return;
    }

    this.detach();

    this.audioCtx = audioCtx;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    this.source = audioCtx.createConstantSource();
    this.source.offset.setValueAtTime(
    this.nibbleToDacLevel(this.lastNibble),
    audioCtx.currentTime);


    this.highPass = audioCtx.createBiquadFilter();
    this.highPass.type = "highpass";
    this.highPass.frequency.setValueAtTime(80, audioCtx.currentTime);
    this.highPass.Q.setValueAtTime(0.3, audioCtx.currentTime);

    this.lowPass = audioCtx.createBiquadFilter();
    this.lowPass.type = "lowpass";
    this.lowPass.frequency.setValueAtTime(2400, audioCtx.currentTime);
    this.lowPass.Q.setValueAtTime(0.9, audioCtx.currentTime);

    this.gainNode = audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);

    this.source.connect(this.highPass);
    this.highPass.connect(this.lowPass);
    this.lowPass.connect(this.gainNode);
    this.gainNode.connect(destination);

    this.source.start();
  }

  nibbleToDacLevel(nibble) {
    const value = nibble & 0x0f;
    const weights = voice52xxDac.BIT_WEIGHTS;

    let output = 0;

    if (value & 0x01) {
      output += weights[0];
    }

    if (value & 0x02) {
      output += weights[1];
    }

    if (value & 0x04) {
      output += weights[2];
    }

    if (value & 0x08) {
      output += weights[3];
    }

    return output;
  }

  mapMasterTickToAudioTime(masterTick) {
    const ctx = this.audioCtx;

    if (!ctx) {
      return null;
    }

    const now = ctx.currentTime;
    const minimumTime = now + voice52xxDac.AUDIO_LEAD_SECONDS;

    if (!Number.isFinite(masterTick)) {
      return Math.max(minimumTime, this.lastScheduledAudioTime);
    }

    if (this.masterTickBase == null) {
      this.masterTickBase = masterTick;
      this.audioTimeBase = minimumTime;
      this.lastScheduledAudioTime = minimumTime;

      return minimumTime;
    }

    let audioTime =
    this.audioTimeBase +
    (masterTick - this.masterTickBase) / voice52xxDac.MASTER_CLOCK;

    if (audioTime < minimumTime) {
      this.masterTickBase = masterTick;
      this.audioTimeBase = minimumTime;
      audioTime = minimumTime;
    }

    if (audioTime < this.lastScheduledAudioTime) {
      audioTime = this.lastScheduledAudioTime;
    }

    this.lastScheduledAudioTime = audioTime;

    return audioTime;
  }

  pushNibble(nibble, masterTick = null) {
    const value = nibble & 0x0f;

    this.lastNibble = value;

    if (!this.source || !this.audioCtx) {
      return;
    }

    const audioTime = this.mapMasterTickToAudioTime(masterTick);

    if (audioTime == null) {
      return;
    }

    this.source.offset.setValueAtTime(this.nibbleToDacLevel(value), audioTime);
  }

  reset() {
    this.lastNibble = 0x08;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    if (!this.source || !this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;

    this.source.offset.cancelScheduledValues(now);

    this.source.offset.setValueAtTime(
    this.nibbleToDacLevel(this.lastNibble),
    now);

  }

  detach() {var _this$source2, _this$highPass, _this$lowPass, _this$gainNode;
    try {var _this$source;
      (_this$source = this.source) === null || _this$source === void 0 ? void 0 : _this$source.stop();
    } catch (_) {}

    (_this$source2 = this.source) === null || _this$source2 === void 0 ? void 0 : _this$source2.disconnect();
    (_this$highPass = this.highPass) === null || _this$highPass === void 0 ? void 0 : _this$highPass.disconnect();
    (_this$lowPass = this.lowPass) === null || _this$lowPass === void 0 ? void 0 : _this$lowPass.disconnect();
    (_this$gainNode = this.gainNode) === null || _this$gainNode === void 0 ? void 0 : _this$gainNode.disconnect();

    this.source = null;
    this.highPass = null;
    this.lowPass = null;
    this.gainNode = null;
    this.audioCtx = null;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }}_defineProperty(voice52xxDac, "MASTER_CLOCK", 18432000);_defineProperty(voice52xxDac, "AUDIO_LEAD_SECONDS", 0.04);_defineProperty(voice52xxDac, "BIT_WEIGHTS", (() => {const conductance = [1 / 100000, 1 / 47000, 1 / 22000, 1 / 10000];const total = conductance[0] + conductance[1] + conductance[2] + conductance[3];return conductance.map(value => value / total);})());

class Namco54XX {








  constructor(opts = {}) {
    this.mcu = new MB8844();
    this.romLoaded = false;
    this.scheduler = null;
    this.latchedCmd = 0;
    this.resetLine = 1;
    this.irqState = false;
    this.pendingMasterTicks = 0;
    this.tickCount = 0;
    this.lastOutput = new Uint8Array(3);
    this.onChannelData =
    typeof opts.onChannelData === "function" ? opts.onChannelData : null;
    this.onReset = typeof opts.onReset === "function" ? opts.onReset : null;
    this.traceCommands = false;
    this.traceOutputs = false;
    this.installMcuCallbacks();
    this.applyResetLineToMcu();
  }

  setScheduler(scheduler) {
    this.scheduler = scheduler || null;
  }

  getMasterTick() {var _this$scheduler2;
    const tick = (_this$scheduler2 = this.scheduler) === null || _this$scheduler2 === void 0 ? void 0 : _this$scheduler2.schedulerTick;
    return Number.isFinite(tick) ? Math.floor(tick) : 0;
  }

  synchronize(callback) {var _this$scheduler3, _this$scheduler4;
    if (typeof ((_this$scheduler3 = this.scheduler) === null || _this$scheduler3 === void 0 ? void 0 : _this$scheduler3.synchronize) === "function") {
      return this.scheduler.synchronize(callback, this);
    }
    if (typeof ((_this$scheduler4 = this.scheduler) === null || _this$scheduler4 === void 0 ? void 0 : _this$scheduler4.at) === "function") {
      return this.scheduler.at(this.getMasterTick(), callback, this);
    }
    callback();
    return null;
  }

  installMcuCallbacks() {
    this.mcu.readK = () => this.latchedCmd >>> 4 & 0x0f;
    this.mcu.readR[0] = () => this.latchedCmd & 0x0f;
    this.mcu.writeO = (data, memMask) => this.handleWriteO(data, memMask);
    this.mcu.writeR[1] = data => this.handleWriteR1(data);
  }

  loadROM(romData) {
    if (!(romData instanceof Uint8Array)) {
      throw new TypeError("Namco54XX.loadROM() requires a Uint8Array");
    }
    if (romData.length < Namco54XX.MCU_ROM_SIZE) {
      throw new RangeError("Namco54XX.loadROM() requires at least 0x400 bytes");
    }
    this.mcu.loadROM(romData.subarray(0, Namco54XX.MCU_ROM_SIZE));
    this.romLoaded = true;
  }

  applyResetLineToMcu() {
    const asserted = this.resetLine === 0;
    if (typeof this.mcu.setResetLine === "function") {
      this.mcu.setResetLine(asserted);
    } else if (asserted) {var _this$mcu$reset5, _this$mcu14;
      (_this$mcu$reset5 = (_this$mcu14 = this.mcu).reset) === null || _this$mcu$reset5 === void 0 ? void 0 : _this$mcu$reset5.call(_this$mcu14);
    }
  }

  isReset() {
    return this.resetLine === 0;
  }

  reset(state = 0) {
    return this.setResetLine(state);
  }

  setResetLine(level) {var _this$onReset;
    const next = level ? 1 : 0;
    if (next === this.resetLine) return false;
    this.resetLine = next;
    this.applyResetLineToMcu();
    if (next === 0) this.pendingMasterTicks = 0;
    (_this$onReset = this.onReset) === null || _this$onReset === void 0 ? void 0 : _this$onReset.call(this, next, this.getMasterTick());
    return true;
  }

  write(data) {
    const value = data & 0xff;
    this.synchronize(() => {
      this.latchedCmd = value;
      if (this.traceCommands) {
        console.log("[54XX CMD]", this.getMasterTick(), value);
      }
    });
    return true;
  }

  chipSelect(state) {var _this$mcu$setIRQ3, _this$mcu15;
    this.irqState = !!state;
    (_this$mcu$setIRQ3 = (_this$mcu15 = this.mcu).setIRQ) === null || _this$mcu$setIRQ3 === void 0 ? void 0 : _this$mcu$setIRQ3.call(_this$mcu15, this.irqState);
    return true;
  }

  read() {
    return 0xff;
  }

  rw(_state) {}

  nextMasterTickBoundary() {
    const elapsed =
    this.pendingMasterTicks % Namco54XX.MASTER_TICKS_PER_MCU_CYCLE;
    return elapsed === 0 ?
    Namco54XX.MASTER_TICKS_PER_MCU_CYCLE :
    Namco54XX.MASTER_TICKS_PER_MCU_CYCLE - elapsed;
  }

  advanceMasterTicks(masterTicks) {
    const delta = Math.floor(Number(masterTicks));
    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError(
      "Namco54XX.advanceMasterTicks() requires a non-negative integer");

    }
    if (!this.romLoaded || delta === 0) return;
    if (this.resetLine === 0) {
      this.pendingMasterTicks = 0;
      return;
    }
    this.pendingMasterTicks += delta;
    const cycles = Math.floor(
    this.pendingMasterTicks / Namco54XX.MASTER_TICKS_PER_MCU_CYCLE);

    this.pendingMasterTicks -= cycles * Namco54XX.MASTER_TICKS_PER_MCU_CYCLE;
    if (cycles !== 0) this.executeMcuCycles(cycles);
  }

  executeMcuCycles(cycles) {
    let remaining = cycles | 0;
    while (remaining > 0 && this.resetLine !== 0 && !this.mcu.halted) {var _this$mcu$step7, _this$mcu$step8, _this$mcu16;
      const used = (_this$mcu$step7 = (_this$mcu$step8 = (_this$mcu16 = this.mcu).step) === null || _this$mcu$step8 === void 0 ? void 0 : _this$mcu$step8.call(_this$mcu16)) !== null && _this$mcu$step7 !== void 0 ? _this$mcu$step7 : 0;
      if (!Number.isFinite(used) || used < 0) {
        throw new Error("Invalid MB8844 cycle result: " + String(used));
      }
      const consumed = used > 0 ? used : 1;
      remaining -= consumed;
      this.tickCount += consumed;
    }
  }

  tickMasterTicks(masterTicks) {
    this.advanceMasterTicks(masterTicks);
  }

  tickHostCycles(hostCycles) {
    const cycles = Math.floor(Number(hostCycles));
    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError(
      "Namco54XX.tickHostCycles() requires a non-negative integer");

    }
    this.advanceMasterTicks(cycles * Namco54XX.MASTER_TICKS_PER_HOST_CYCLE);
  }

  tick(hostCycles) {
    this.tickHostCycles(hostCycles);
  }

  tickChip(chipCycles = 1) {
    const cycles = Math.floor(Number(chipCycles));
    if (!Number.isFinite(cycles) || cycles < 0) {
      throw new RangeError(
      "Namco54XX.tickChip() requires a non-negative integer");

    }
    if (this.resetLine !== 0) this.executeMcuCycles(cycles);
  }

  handleWriteO(data, memMask) {
    if (memMask == null) throw new Error("MB8844 writeO() omitted memMask");
    const value = data & 0xff;
    if ((memMask & 0xff) === 0x0f) {
      this.emitOutput(0, value & 0x0f);
    } else {
      this.emitOutput(1, value >>> 4 & 0x0f);
    }
  }

  handleWriteR1(data) {
    this.emitOutput(2, data & 0x0f);
  }

  emitOutput(channel, value, force = false) {var _this$onChannelData;
    if (!Number.isInteger(channel) || channel < 0 || channel >= 3) return false;
    const next = value & 0x0f;
    const tick = this.getMasterTick();
    this.lastOutput[channel] = next;
    (_this$onChannelData = this.onChannelData) === null || _this$onChannelData === void 0 ? void 0 : _this$onChannelData.call(this, channel, next, tick, !!force);
    if (this.traceOutputs) {
      console.log("[54XX OUT]", tick, channel, next, force ? 1 : 0);
    }
    return true;
  }

  syncOutputs() {
    for (let channel = 0; channel < 3; channel++) {
      this.emitOutput(channel, this.lastOutput[channel], true);
    }
  }

  getOutputState() {
    return {
      channel0: this.lastOutput[0] & 0x0f,
      channel1: this.lastOutput[1] & 0x0f,
      channel2: this.lastOutput[2] & 0x0f };

  }

  getTraceState() {
    return {
      romLoaded: !!this.romLoaded,
      schedulerAttached: !!this.scheduler,
      resetLine: this.resetLine,
      resetAsserted: this.resetLine === 0,
      irq: this.irqState ? 1 : 0,
      latchedCmd: this.latchedCmd & 0xff,
      pendingMasterTicks: this.pendingMasterTicks,
      ticksToNextMcuCycle: this.nextMasterTickBoundary(),
      mcuHalted: !!this.mcu.halted,
      mcuPC:
      typeof this.mcu.getPC === "function" ? this.mcu.getPC() & 0x03ff : 0,
      tickCount: this.tickCount,
      channel0: this.lastOutput[0] & 0x0f,
      channel1: this.lastOutput[1] & 0x0f,
      channel2: this.lastOutput[2] & 0x0f };

  }

  resetCounter() {}}_defineProperty(Namco54XX, "CLOCK", 1536000);_defineProperty(Namco54XX, "MASTER_TICKS_PER_DEVICE_TICK", 12);_defineProperty(Namco54XX, "MB88XX_CYCLE_DIVIDER", 6);_defineProperty(Namco54XX, "MASTER_TICKS_PER_MCU_CYCLE", 72);_defineProperty(Namco54XX, "MASTER_TICKS_PER_HOST_CYCLE", 6);_defineProperty(Namco54XX, "MCU_ROM_SIZE", 0x0400);_defineProperty(Namco54XX, "CHANNEL_COUNT", 3);

class Namco54xxDac {



  constructor() {
    this.audioCtx = null;
    this.destination = null;

    this.source = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.highPass = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.lowPass = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.channelGain = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);

    this.mixer = null;
    this.outputGain = null;

    this.channelData = new Uint8Array(Namco54xxDac.CHANNEL_COUNT);

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  attach(audioCtx, destination) {
    if (this.audioCtx === audioCtx && this.mixer) {
      return;
    }

    this.detach();

    this.audioCtx = audioCtx;
    this.destination = destination;
    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    const now = audioCtx.currentTime;

    this.mixer = audioCtx.createGain();
    this.mixer.gain.setValueAtTime(1, now);

    this.outputGain = audioCtx.createGain();
    this.outputGain.gain.setValueAtTime(0.16, now);

    this.mixer.connect(this.outputGain);
    this.outputGain.connect(destination);

    const config = [
    {
      channel: 2,
      highPass: 1500,
      lowPass: 750,
      gain: 1.0 },

    {
      channel: 1,
      highPass: 320,
      lowPass: 110,
      gain: 0.82 },

    {
      channel: 0,
      highPass: 1050,
      lowPass: 725,
      gain: 0.52 }];



    for (let path = 0; path < config.length; path++) {
      const spec = config[path];
      const channel = spec.channel;

      const source = audioCtx.createConstantSource();

      const highPass = audioCtx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.setValueAtTime(spec.highPass, now);
      highPass.Q.setValueAtTime(0.707, now);

      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.setValueAtTime(spec.lowPass, now);
      lowPass.Q.setValueAtTime(0.707, now);

      const channelGain = audioCtx.createGain();
      channelGain.gain.setValueAtTime(spec.gain, now);

      source.offset.setValueAtTime(
      this.nibbleToVoltage(this.channelData[channel]),
      now);


      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(channelGain);
      channelGain.connect(this.mixer);

      source.start(now);

      this.source[channel] = source;
      this.highPass[channel] = highPass;
      this.lowPass[channel] = lowPass;
      this.channelGain[channel] = channelGain;
    }
  }

  detach() {var _this$mixer, _this$outputGain;
    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {var _this$source$channel2, _this$highPass$channe, _this$lowPass$channel, _this$channelGain$cha;
      try {var _this$source$channel;
        (_this$source$channel = this.source[channel]) === null || _this$source$channel === void 0 ? void 0 : _this$source$channel.stop();
      } catch (_) {}

      (_this$source$channel2 = this.source[channel]) === null || _this$source$channel2 === void 0 ? void 0 : _this$source$channel2.disconnect();
      (_this$highPass$channe = this.highPass[channel]) === null || _this$highPass$channe === void 0 ? void 0 : _this$highPass$channe.disconnect();
      (_this$lowPass$channel = this.lowPass[channel]) === null || _this$lowPass$channel === void 0 ? void 0 : _this$lowPass$channel.disconnect();
      (_this$channelGain$cha = this.channelGain[channel]) === null || _this$channelGain$cha === void 0 ? void 0 : _this$channelGain$cha.disconnect();

      this.source[channel] = null;
      this.highPass[channel] = null;
      this.lowPass[channel] = null;
      this.channelGain[channel] = null;
    }

    (_this$mixer = this.mixer) === null || _this$mixer === void 0 ? void 0 : _this$mixer.disconnect();
    (_this$outputGain = this.outputGain) === null || _this$outputGain === void 0 ? void 0 : _this$outputGain.disconnect();

    this.mixer = null;
    this.outputGain = null;
    this.audioCtx = null;
    this.destination = null;
    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  reset() {var _this$audioCtx$curren, _this$audioCtx;
    this.channelData.fill(0);

    const now = (_this$audioCtx$curren = (_this$audioCtx = this.audioCtx) === null || _this$audioCtx === void 0 ? void 0 : _this$audioCtx.currentTime) !== null && _this$audioCtx$curren !== void 0 ? _this$audioCtx$curren : 0;

    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {var _this$source$channel3, _this$source$channel4;
      (_this$source$channel3 = this.source[channel]) === null || _this$source$channel3 === void 0 ? void 0 : _this$source$channel3.offset.cancelScheduledValues(now);
      (_this$source$channel4 = this.source[channel]) === null || _this$source$channel4 === void 0 ? void 0 : _this$source$channel4.offset.setValueAtTime(this.nibbleToVoltage(0), now);
    }
  }

  nibbleToVoltage(nibble) {
    const value = nibble & 0x0f;

    const r0 = 47000;
    const r1 = 22000;
    const r2 = 10000;
    const r3 = 4700;

    const g0 = 1 / r0;
    const g1 = 1 / r1;
    const g2 = 1 / r2;
    const g3 = 1 / r3;

    const totalConductance = g0 + g1 + g2 + g3;

    let enabledConductance = 0;

    if (value & 0x01) enabledConductance += g0;
    if (value & 0x02) enabledConductance += g1;
    if (value & 0x04) enabledConductance += g2;
    if (value & 0x08) enabledConductance += g3;

    return 4 * enabledConductance / totalConductance - 2;
  }

  masterTickToAudioTime(masterTick) {
    const ctx = this.audioCtx;

    if (!ctx) {
      return 0;
    }

    const tick = Math.max(0, Math.floor(Number(masterTick) || 0));

    if (this.masterTickBase === null) {
      this.masterTickBase = tick;
      this.audioTimeBase = ctx.currentTime + 0.015;
      this.lastScheduledAudioTime = this.audioTimeBase;
      return this.audioTimeBase;
    }

    const target =
    this.audioTimeBase +
    (tick - this.masterTickBase) / Namco54xxDac.MASTER_CLOCK;

    const minimum = ctx.currentTime + 0.001;
    const scheduled = Math.max(
    minimum,
    Math.min(target, this.lastScheduledAudioTime + 0.05));


    this.lastScheduledAudioTime = scheduled;

    return scheduled;
  }

  writeChannel(channel, value, masterTick = 0, force = false) {
    const index = channel | 0;

    if (index < 0 || index >= Namco54xxDac.CHANNEL_COUNT) {
      return false;
    }

    const next = value & 0x0f;

    if (!force && this.channelData[index] === next) {
      return false;
    }

    this.channelData[index] = next;

    const source = this.source[index];
    const ctx = this.audioCtx;

    if (!source || !ctx) {
      return true;
    }

    const when = this.masterTickToAudioTime(masterTick);
    const voltage = this.nibbleToVoltage(next);

    source.offset.cancelScheduledValues(when);
    source.offset.setValueAtTime(voltage, when);

    return true;
  }

  synchronizeState(masterTick = 0) {
    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {
      this.writeChannel(channel, this.channelData[channel], masterTick, true);
    }
  }

  getTraceState() {var _this$audioCtx$state, _this$audioCtx2;
    return {
      attached: !!this.mixer,
      contextState: (_this$audioCtx$state = (_this$audioCtx2 = this.audioCtx) === null || _this$audioCtx2 === void 0 ? void 0 : _this$audioCtx2.state) !== null && _this$audioCtx$state !== void 0 ? _this$audioCtx$state : null,
      channel0: this.channelData[0] & 0x0f,
      channel1: this.channelData[1] & 0x0f,
      channel2: this.channelData[2] & 0x0f,
      masterTickBase: this.masterTickBase,
      audioTimeBase: this.audioTimeBase,
      lastScheduledAudioTime: this.lastScheduledAudioTime };

  }}_defineProperty(Namco54xxDac, "MASTER_CLOCK", 18432000);_defineProperty(Namco54xxDac, "CHANNEL_COUNT", 3);

class NamcoWSG {













































  constructor(config) {var _config$audio;
    this.config = config;
    this.prom = new Uint8Array(256);
    this.regs = new Uint8Array(32);
    this.channels = [
    { freq: 0, wave: 0, vol: 0 },
    { freq: 0, wave: 0, vol: 0 },
    { freq: 0, wave: 0, vol: 0 }];

    this.audioCtx = null;
    this.gainNode = null;
    this.wsgNode = null;
    this.port = null;
    this.state = "idle";
    this.enabled = (config === null || config === void 0 ? void 0 : (_config$audio = config.audio) === null || _config$audio === void 0 ? void 0 : _config$audio.enabled) !== false;
    this.onAudioReady = null;
    this.gestureEvents = null;
    this.onGesture = null;
  }

  write(offset, data) {
    this.regs[offset & 0x1f] = data & 0x0f;
    this.decodeAndSend();
  }

  flushRegisters() {
    this.decodeAndSend();
  }

  notifyPromLoaded() {
    this.decodeAndSend();
  }

  reset() {var _this$port, _this$port2;
    this.regs.fill(0);
    for (const channel of this.channels) {
      channel.freq = 0;
      channel.wave = 0;
      channel.vol = 0;
    }
    (_this$port = this.port) === null || _this$port === void 0 ? void 0 : _this$port.postMessage({ type: "reset" });
    this.decodeAndSend();
    (_this$port2 = this.port) === null || _this$port2 === void 0 ? void 0 : _this$port2.postMessage({ type: "enabled", v: this.enabled });
  }

  initAudio() {
    if (this.onGesture) return;
    this.gestureEvents = ["touchend", "pointerup", "mousedown", "keydown"];
    this.onGesture = event => {
      if (event.isTrusted) this.unlockFromGesture();
    };
    for (const event of this.gestureEvents) {
      window.addEventListener(event, this.onGesture, {
        capture: true,
        passive: true });

    }
  }

  async setEnabled(enabled) {var _this$port3;
    this.enabled = !!enabled;
    if (this.state === "idle") await this.createAudioGraph();
    if (this.state === "ready") await this.resumeIfNeeded();
    (_this$port3 = this.port) === null || _this$port3 === void 0 ? void 0 : _this$port3.postMessage({ type: "enabled", v: this.enabled });
  }

  async unlockFromGesture() {
    if (this.state === "idle") await this.createAudioGraph();
    if (this.state === "ready") await this.resumeIfNeeded();
  }

  async resumeIfNeeded() {
    if (!this.audioCtx || this.audioCtx.state === "running") return;
    try {
      await this.audioCtx.resume();
    } catch (_) {}
  }

  async createAudioGraph() {
    if (this.state !== "idle") return;
    this.state = "pending";
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.state = "idle";
      return;
    }
    try {var _this$config$audio$ma, _this$config2, _this$config2$audio, _this$onAudioReady;
      this.audioCtx = new AudioContextClass();
      await this.resumeIfNeeded();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime((_this$config$audio$ma = (_this$config2 =
      this.config) === null || _this$config2 === void 0 ? void 0 : (_this$config2$audio = _this$config2.audio) === null || _this$config2$audio === void 0 ? void 0 : _this$config2$audio.masterVolume) !== null && _this$config$audio$ma !== void 0 ? _this$config$audio$ma : 0.5,
      this.audioCtx.currentTime);

      this.gainNode.connect(this.audioCtx.destination);
      const url = URL.createObjectURL(
      new Blob([NamcoWSG.WORKLET_SOURCE], { type: "application/javascript" }));

      try {
        await this.audioCtx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.wsgNode = new AudioWorkletNode(this.audioCtx, "namco-wsg", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          waveData: Array.from(this.prom, value => value & 15) } });


      this.wsgNode.connect(this.gainNode);
      this.port = this.wsgNode.port;
      this.state = "ready";
      this.decodeAndSend();
      this.port.postMessage({ type: "enabled", v: this.enabled });
      (_this$onAudioReady = this.onAudioReady) === null || _this$onAudioReady === void 0 ? void 0 : _this$onAudioReady.call(this, this.audioCtx, this.gainNode);
    } catch (error) {
      console.warn("[WSG] Audio init failed", error);
      this.teardownAudioGraph();
    }
  }

  teardownAudioGraph() {var _this$wsgNode, _this$gainNode2, _this$audioCtx3, _this$audioCtx3$close, _this$audioCtx3$close2, _this$audioCtx3$close3;
    (_this$wsgNode = this.wsgNode) === null || _this$wsgNode === void 0 ? void 0 : _this$wsgNode.disconnect();
    (_this$gainNode2 = this.gainNode) === null || _this$gainNode2 === void 0 ? void 0 : _this$gainNode2.disconnect();
    (_this$audioCtx3 = this.audioCtx) === null || _this$audioCtx3 === void 0 ? void 0 : (_this$audioCtx3$close = _this$audioCtx3.close) === null || _this$audioCtx3$close === void 0 ? void 0 : (_this$audioCtx3$close2 = (_this$audioCtx3$close3 = _this$audioCtx3$close.call(_this$audioCtx3)).catch) === null || _this$audioCtx3$close2 === void 0 ? void 0 : _this$audioCtx3$close2.call(_this$audioCtx3$close3, () => {});
    this.audioCtx = null;
    this.gainNode = null;
    this.wsgNode = null;
    this.port = null;
    this.state = "idle";
  }

  decodeAndSend() {var _this$port4;
    const r = this.regs;
    this.channels[0].freq =
    r[0x10] |
    r[0x11] << 4 |
    r[0x12] << 8 |
    r[0x13] << 12 |
    r[0x14] << 16;
    this.channels[0].wave = r[0x05] & 7;
    this.channels[0].vol = r[0x15] & 15;
    this.channels[1].freq =
    r[0x16] << 4 | r[0x17] << 8 | r[0x18] << 12 | r[0x19] << 16;
    this.channels[1].wave = r[0x0a] & 7;
    this.channels[1].vol = r[0x1a] & 15;
    this.channels[2].freq =
    r[0x1b] << 4 | r[0x1c] << 8 | r[0x1d] << 12 | r[0x1e] << 16;
    this.channels[2].wave = r[0x0f] & 7;
    this.channels[2].vol = r[0x1f] & 15;
    (_this$port4 = this.port) === null || _this$port4 === void 0 ? void 0 : _this$port4.postMessage({ type: "voices", v: this.channels });
  }}_defineProperty(NamcoWSG, "WORKLET_SOURCE", `
class NamcoWSGProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions: { waveData } }) {
    super();
    this.wave = new Uint8Array(waveData);
    this.accum = new Float64Array(3);
    this.voices = [
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 }
    ];
    this.enabled = true;
    this.step = 192000 / sampleRate;
    this.port.onmessage = ({ data }) => {
      if (data.type === "voices") this.voices = data.v;
      if (data.type === "enabled") this.enabled = !!data.v;
      if (data.type === "reset") this.accum.fill(0);
    };
  }
  process(inputs, outputs) {
    void inputs;
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.enabled) {
      out.fill(0);
      return true;
    }
    for (let i = 0; i < out.length; i++) {
      let mix = 0;
      for (let voiceIndex = 0; voiceIndex < 3; voiceIndex++) {
        const voice = this.voices[voiceIndex];
        if (!voice.freq || !voice.vol) continue;
        const position = ((this.accum[voiceIndex] | 0) >>> 16) & 31;
        const sample = (this.wave[((voice.wave & 7) << 5) + position] & 15) - 8;
        mix += sample * (voice.vol & 15);
        this.accum[voiceIndex] = (this.accum[voiceIndex] + voice.freq * this.step) % 0x200000;
      }
      out[i] = mix / 384;
    }
    return true;
  }
}
registerProcessor("namco-wsg", NamcoWSGProcessor);
`);class NamcoLS259Latch {constructor(name = "ls259") {this.name = name;this.state = 0x00;this.callbacks = new Array(8).fill(null);}setCallback(bit, fn) {this.callbacks[bit & 0x07] = fn;return this;}getBit(bit) {return this.state >>> (bit & 0x07) & 0x01;}write(addr, data) {var _window$JSBosco;const address = addr & 0xffff;const bit = address & 0x07;const next = data & 0x01;const trace = false;const e = (_window$JSBosco = window.JSBosco) === null || _window$JSBosco === void 0 ? void 0 : _window$JSBosco.emulator;if (trace) {var _e$timing$schedulerTi, _e$timing, _e$_activeCpuName, _this$getBit, _this$getBit2;console.log("[CPU BOARD LS259 WRITE]", { tick: (_e$timing$schedulerTi = e === null || e === void 0 ? void 0 : (_e$timing = e.timing) === null || _e$timing === void 0 ? void 0 : _e$timing.schedulerTick) !== null && _e$timing$schedulerTi !== void 0 ? _e$timing$schedulerTi : null, cpu: (_e$_activeCpuName = e === null || e === void 0 ? void 0 : e._activeCpuName) !== null && _e$_activeCpuName !== void 0 ? _e$_activeCpuName : null, addr: "0x" + address.toString(16), bit, data: "0x" + (data & 0xff).toString(16), d0: next, qBefore: (_this$getBit = (_this$getBit2 = this.getBit) === null || _this$getBit2 === void 0 ? void 0 : _this$getBit2.call(this, bit)) !== null && _this$getBit !== void 0 ? _this$getBit : null });}

    this.setBit(bit, next);

    if (trace) {var _e$timing$schedulerTi2, _e$timing2, _this$getBit3, _this$getBit4, _this$getBit5, _this$getBit6, _e$sub2NmiMask, _e$cpu3NmiEnabled, _ref, _e$cpuBoardResetAsser, _ref2, _e$sub2Cpu$inReset, _e$sub2Cpu, _e$sub2Cpu2, _e$sub2Cpu2$isReset, _ref3, _ref4, _e$sub2Cpu$getPC, _e$sub2Cpu3, _e$sub2Cpu3$getPC, _e$sub2Cpu4, _e$sub2Cpu5;
      console.log("[CPU BOARD LS259 RESULT]", {
        tick: (_e$timing$schedulerTi2 = e === null || e === void 0 ? void 0 : (_e$timing2 = e.timing) === null || _e$timing2 === void 0 ? void 0 : _e$timing2.schedulerTick) !== null && _e$timing$schedulerTi2 !== void 0 ? _e$timing$schedulerTi2 : null,

        q2: (_this$getBit3 = (_this$getBit4 = this.getBit) === null || _this$getBit4 === void 0 ? void 0 : _this$getBit4.call(this, 2)) !== null && _this$getBit3 !== void 0 ? _this$getBit3 : null,

        q3: (_this$getBit5 = (_this$getBit6 = this.getBit) === null || _this$getBit6 === void 0 ? void 0 : _this$getBit6.call(this, 3)) !== null && _this$getBit5 !== void 0 ? _this$getBit5 : null,

        sub2NmiMask: (_e$sub2NmiMask =
        e === null || e === void 0 ? void 0 : e.sub2NmiMask) !== null && _e$sub2NmiMask !== void 0 ? _e$sub2NmiMask :
        (e === null || e === void 0 ? void 0 : e.cpu3NmiEnabled) == null ? null : !e.cpu3NmiEnabled,

        soundNmiEnabled: (_e$cpu3NmiEnabled = e === null || e === void 0 ? void 0 : e.cpu3NmiEnabled) !== null && _e$cpu3NmiEnabled !== void 0 ? _e$cpu3NmiEnabled : null,

        cpuBoardResetAsserted: (_ref = (_e$cpuBoardResetAsser =
        e === null || e === void 0 ? void 0 : e.cpuBoardResetAsserted) !== null && _e$cpuBoardResetAsser !== void 0 ? _e$cpuBoardResetAsser : e === null || e === void 0 ? void 0 : e.subsystemsReset) !== null && _ref !== void 0 ? _ref : null,

        soundCpuInReset: (_ref2 = (_e$sub2Cpu$inReset = e === null || e === void 0 ? void 0 : (_e$sub2Cpu = e.sub2Cpu) === null || _e$sub2Cpu === void 0 ? void 0 : _e$sub2Cpu.inReset) !== null && _e$sub2Cpu$inReset !== void 0 ? _e$sub2Cpu$inReset : e === null || e === void 0 ? void 0 : (_e$sub2Cpu2 = e.sub2Cpu) === null || _e$sub2Cpu2 === void 0 ? void 0 : (_e$sub2Cpu2$isReset = _e$sub2Cpu2.isReset) === null || _e$sub2Cpu2$isReset === void 0 ? void 0 : _e$sub2Cpu2$isReset.call(_e$sub2Cpu2)) !== null && _ref2 !== void 0 ? _ref2 : null,

        soundPc: (_ref3 = (_ref4 = (_e$sub2Cpu$getPC =
        e === null || e === void 0 ? void 0 : (_e$sub2Cpu3 = e.sub2Cpu) === null || _e$sub2Cpu3 === void 0 ? void 0 : (_e$sub2Cpu3$getPC = _e$sub2Cpu3.getPC) === null || _e$sub2Cpu3$getPC === void 0 ? void 0 : _e$sub2Cpu3$getPC.call(_e$sub2Cpu3)) !== null && _e$sub2Cpu$getPC !== void 0 ? _e$sub2Cpu$getPC : e === null || e === void 0 ? void 0 : (_e$sub2Cpu4 = e.sub2Cpu) === null || _e$sub2Cpu4 === void 0 ? void 0 : _e$sub2Cpu4.PC) !== null && _ref4 !== void 0 ? _ref4 : e === null || e === void 0 ? void 0 : (_e$sub2Cpu5 = e.sub2Cpu) === null || _e$sub2Cpu5 === void 0 ? void 0 : _e$sub2Cpu5.pc) !== null && _ref3 !== void 0 ? _ref3 : null });

    }

    return true;
  }

  setBit(bit, value, force = false) {var _this$callbacks$index, _this$callbacks;
    const index = bit & 0x07;
    const next = value & 0x01;
    const previous = this.getBit(index);

    if (!force && previous === next) {
      return false;
    }

    this.state = this.state & ~(1 << index) | next << index;

    (_this$callbacks$index = (_this$callbacks = this.callbacks)[index]) === null || _this$callbacks$index === void 0 ? void 0 : _this$callbacks$index.call(_this$callbacks, next, this.state, index);

    return true;
  }

  clear(forceCallbacks = false) {
    const previousState = this.state;

    if (previousState === 0x00 && !forceCallbacks) {
      return;
    }

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = previousState >>> bit & 0x01;

      if (forceCallbacks || previous !== 0) {var _this$callbacks$bit, _this$callbacks2;
        (_this$callbacks$bit = (_this$callbacks2 = this.callbacks)[bit]) === null || _this$callbacks$bit === void 0 ? void 0 : _this$callbacks$bit.call(_this$callbacks2, 0, this.state, bit);
      }
    }
  }}

class NamcoVideoLatch extends NamcoLS259Latch {
  constructor(onScreenFlip = null, onChipReset = null) {
    super("video_latch");

    // bit0 -> flip_screen_set, INVERTED (bosco() config: .invert())
    this.setCallback(0, value => {
      onScreenFlip === null || onScreenFlip === void 0 ? void 0 : onScreenFlip(!value);
    });

    // bit7 -> reset 50xx_2 AND 52xx (video-board chips), no inversion.
    // namco_50xx_device::reset(state): state=1 -> CLEAR_LINE (running),
    // state=0 -> ASSERT_LINE (held in reset) — same polarity convention
    // as setResetLine() elsewhere in this codebase.
    this.setCallback(7, value => {
      onChipReset === null || onChipReset === void 0 ? void 0 : onChipReset(!!value);
    });
  }

  reset() {
    const previousState = this.state;
    if (previousState === 0x00) return;

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = previousState >>> bit & 0x01;
      if (previous) {var _this$callbacks$bit2, _this$callbacks3;
        (_this$callbacks$bit2 = (_this$callbacks3 = this.callbacks)[bit]) === null || _this$callbacks$bit2 === void 0 ? void 0 : _this$callbacks$bit2.call(_this$callbacks3, 0, this.state, bit);
      }
    }
  }}


class BoscoEmulator {
  // MAME: PERIOD_OF_555_ASTABLE_NSEC(RES_K(33), RES_K(10), CAP_U(0.0047)).
  // The integer master-tick scheduler uses the closest representable period.






  constructor(config) {var _this$soundChip, _this$inputController, _this$inputController2, _this$cpuBoard50xx$se, _this$cpuBoard50xx, _this$videoBoard50xx$, _this$videoBoard50xx, _this$voiceChip$setSc, _this$voiceChip, _this$namco54xx$setSc, _this$namco54xx;
    this.config = config;

    this.mainCpuRom = new Uint8Array(0x4000);
    this.subCpuRom = new Uint8Array(0x2000);
    this.sub2CpuRom = new Uint8Array(0x1000);
    this.charRom = new Uint8Array(0x1000);
    this.spriteRom = new Uint8Array(0x1000);
    this.spriteShapeRom = new Uint8Array(0x0100);
    this.voiceRom = new Uint8Array(0x3000);
    this.mcuRom50 = new Uint8Array(0x0800);
    this.mcuRom51 = new Uint8Array(0x0400);
    this.mcuRom52 = new Uint8Array(0x0400);
    this.mcuRom54 = new Uint8Array(0x0400);
    this.share1 = new Uint8Array(0x0800);
    this.videoram = new Uint8Array(0x1000);
    this.radarattr = new Uint8Array(0x10);
    this.starcontrol = new Uint8Array(1);

    this.starclr = 1;
    this._scrollX = 0;
    this._scrollY = 0;
    this.bgDirty = new Uint8Array(0x400).fill(1);
    this.fgDirty = new Uint8Array(0x400).fill(1);
    this.watchVramWrites = new Set();

    this.proms = new Uint8Array(0x0160);
    this.masterPaletteProm = this.proms.subarray(0x0000, 0x0020);
    this.lutProm = this.proms.subarray(0x0020, 0x0120);
    this.palette = [];
    this.tileCache8x8 = null;
    this.tileCache16x16 = null;
    this.tileCacheBullet = null;

    this.soundProms = new Uint8Array(0x0200);
    this.waveProm = this.soundProms.subarray(0x0000, 0x0100);
    this.soundTimingProm = this.soundProms.subarray(0x0100, 0x0200);

    this.mainIrqMask = false;
    this.subIrqMask = false;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;
    this.cpu3NmiLatchQ2 = 0;
    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;
    this.mainIrqEnabled = false;
    this.subIrqArmed = false;
    this.flipScreen = false;
    this.led0 = false;
    this.led1 = false;
    this.coinLocked = false;
    this.mod0 = false;
    this.mod1 = false;
    this.mod2 = false;
    this.in0 = 0xff;
    this.in1 = 0xff;
    this._in0 = 0xff;
    this._in1 = 0xff;

    this.dipSwitches = new BoscoDipSwitches();
    this._activeCpuName = null;
    this.frameCounter = 0;
    this.running = false;
    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.watchdogResetPending = false;
    this.watchdogResetCount = 0;
    this.watchdogKickSequence = 0;
    this.watchdogKickHistory = [];
    this.lastWatchdogExpiry = null;
    this.lastResetReason = "power-on";
    this.soundNmiCount = 0;

    this.mainCpu = new Z80(
    address => this.mainRead(address),
    (address, data) => this.mainWrite(address, data));

    this.subCpu = new Z80(
    address => this.subRead(address),
    (address, data) => this.subWrite(address, data));

    this.sub2Cpu = new Z80(
    address => this.sub2Read(address),
    (address, data) => this.sub2Write(address, data));


    this.inputController = new Namco51XX(
    this.dipSwitches,
    data => {
      this.led1 = !!(data & 0x01);
      this.led0 = !!(data & 0x02);
    },
    locked => {
      this.coinLocked = !!locked;
    });


    this.cpuBoard50xx = new Namco50XX();
    this.videoBoard50xx = new Namco50XX();

    this.voice52xxDac = new voice52xxDac();
    this.voiceChip = new Namco52XX(this.voiceRom, {
      externalClockPeriodTicks: BoscoEmulator.NAMCO52XX_TC_PERIOD_TICKS,
      onDacWrite: (data, masterTick) => {
        this.voice52xxDac.pushNibble(data & 0x0f, masterTick);
      } });


    this.namco54xxDac = new Namco54xxDac();
    this.namco54xx = new Namco54XX({
      onChannelData: (channel, nibble, masterTick, force) => {
        this.namco54xxDac.writeChannel(channel, nibble, masterTick, force);
      },

      onReset: (_resetLine, masterTick) => {
        this.namco54xxDac.synchronizeState(masterTick);
      } });


    this.starfield = new Namco05XX();
    this.starfield.setStarfieldConfig(0, 16, 224);
    this.movementMcu1 = this.cpuBoard50xx;
    this.movementMcu2 = this.videoBoard50xx;

    this.soundChip = new NamcoWSG(this.config);
    if (!(((_this$soundChip = this.soundChip) === null || _this$soundChip === void 0 ? void 0 : _this$soundChip.prom) instanceof Uint8Array)) {
      throw new Error("NamcoWSG did not expose a Uint8Array waveform PROM");
    }
    if (this.soundChip.prom.length !== this.waveProm.length) {
      throw new Error(
      "NamcoWSG PROM size mismatch: expected " +
      this.waveProm.length +
      ", got " +
      this.soundChip.prom.length);

    }
    this.soundChip.prom = this.waveProm;
    this.soundChip.onAudioReady = (audioCtx, gainNode) => {
      this.voice52xxDac.attach(audioCtx, gainNode);
      this.namco54xxDac.attach(audioCtx, gainNode);
    };

    this.timing = new BoscoTimingSequencer(this);
    this.timing.setCpu3NmiGateFromQ2(0);
    (_this$inputController = (_this$inputController2 = this.inputController).setScheduler) === null || _this$inputController === void 0 ? void 0 : _this$inputController.call(_this$inputController2, this.timing);
    (_this$cpuBoard50xx$se = (_this$cpuBoard50xx = this.cpuBoard50xx).setScheduler) === null || _this$cpuBoard50xx$se === void 0 ? void 0 : _this$cpuBoard50xx$se.call(_this$cpuBoard50xx, this.timing);
    (_this$videoBoard50xx$ = (_this$videoBoard50xx = this.videoBoard50xx).setScheduler) === null || _this$videoBoard50xx$ === void 0 ? void 0 : _this$videoBoard50xx$.call(_this$videoBoard50xx, this.timing);
    (_this$voiceChip$setSc = (_this$voiceChip = this.voiceChip).setScheduler) === null || _this$voiceChip$setSc === void 0 ? void 0 : _this$voiceChip$setSc.call(_this$voiceChip, this.timing);
    (_this$namco54xx$setSc = (_this$namco54xx = this.namco54xx).setScheduler) === null || _this$namco54xx$setSc === void 0 ? void 0 : _this$namco54xx$setSc.call(_this$namco54xx, this.timing);
    this.cpuBoard50xx.traceReads = false;
    this.cpuBoard50xx.traceOChanges = false;
    this.videoBoard50xx.traceReads = false;
    this.videoBoard50xx.traceOChanges = false;

    this.busInterface0 = new Namco06XX({
      z80CyclesPerDeviceClock: 64,
      hostCpu: () => this.mainCpu,
      onHostNmi: () => {var _this$mainCpu$nmi, _this$mainCpu;
        (_this$mainCpu$nmi = (_this$mainCpu = this.mainCpu).nmi) === null || _this$mainCpu$nmi === void 0 ? void 0 : _this$mainCpu$nmi.call(_this$mainCpu);
      },
      onHostNmiClear: () => {var _this$mainCpu$clearNm, _this$mainCpu2;
        (_this$mainCpu$clearNm = (_this$mainCpu2 = this.mainCpu).clearNmiLatch) === null || _this$mainCpu$clearNm === void 0 ? void 0 : _this$mainCpu$clearNm.call(_this$mainCpu2);
      } });

    this.busInterface1 = new Namco06XX({
      z80CyclesPerDeviceClock: 512,
      hostCpu: () => this.subCpu,
      onHostNmi: () => {var _this$subCpu$nmi, _this$subCpu;
        (_this$subCpu$nmi = (_this$subCpu = this.subCpu).nmi) === null || _this$subCpu$nmi === void 0 ? void 0 : _this$subCpu$nmi.call(_this$subCpu);
      },
      onHostNmiClear: () => {var _this$subCpu$clearNmi, _this$subCpu2;
        (_this$subCpu$clearNmi = (_this$subCpu2 = this.subCpu).clearNmiLatch) === null || _this$subCpu$clearNmi === void 0 ? void 0 : _this$subCpu$clearNmi.call(_this$subCpu2);
      } });

    this.busInterface0.setScheduler(this.timing);
    this.busInterface1.setScheduler(this.timing);
    this.busInterface0.attachDevice(0, this.inputController);
    this.busInterface0.attachDevice(2, this.cpuBoard50xx);
    this.busInterface0.attachDevice(3, this.namco54xx);
    this.busInterface1.attachDevice(0, this.videoBoard50xx);
    this.busInterface1.attachDevice(1, this.voiceChip);

    this.miscLatch = new NamcoLS259Latch("misclatch");
    this.miscLatch.setCallback(0, state => {var _this$mainCpu$clearIr, _this$mainCpu3;
      this.mainIrqMask = !!state;
      this.mainIrqEnabled = this.mainIrqMask;
      if (!this.mainIrqMask) (_this$mainCpu$clearIr = (_this$mainCpu3 = this.mainCpu).clearIrq) === null || _this$mainCpu$clearIr === void 0 ? void 0 : _this$mainCpu$clearIr.call(_this$mainCpu3);
    });
    this.miscLatch.setCallback(1, state => {var _this$subCpu$clearIrq, _this$subCpu3;
      this.subIrqMask = !!state;
      this.subIrqArmed = this.subIrqMask;
      if (!this.subIrqMask) (_this$subCpu$clearIrq = (_this$subCpu3 = this.subCpu).clearIrq) === null || _this$subCpu$clearIrq === void 0 ? void 0 : _this$subCpu$clearIrq.call(_this$subCpu3);
    });
    this.miscLatch.setCallback(2, state => {
      const q2 = state ? 1 : 0;
      const timerEnabled = !Boolean(q2);
      this.cpu3NmiLatchQ2 = q2;
      this.sub2NmiMask = timerEnabled;
      this.cpu3NmiEnabled = timerEnabled;
      this.timing.setCpu3NmiGateFromQ2(q2);
    });
    this.miscLatch.setCallback(3, state => {var _this$subCpu$setReset, _this$subCpu4, _this$sub2Cpu$setRese, _this$sub2Cpu, _this$inputController3, _this$inputController4, _this$cpuBoard50xx$se2, _this$cpuBoard50xx2, _this$namco54xx$setRe, _this$namco54xx2;
      const resetAsserted = !Boolean(state);

      this.cpuBoardResetAsserted = resetAsserted;
      this.subsystemsReset = resetAsserted;

      (_this$subCpu$setReset = (_this$subCpu4 = this.subCpu).setReset) === null || _this$subCpu$setReset === void 0 ? void 0 : _this$subCpu$setReset.call(_this$subCpu4, resetAsserted);
      (_this$sub2Cpu$setRese = (_this$sub2Cpu = this.sub2Cpu).setReset) === null || _this$sub2Cpu$setRese === void 0 ? void 0 : _this$sub2Cpu$setRese.call(_this$sub2Cpu, resetAsserted);

      const activeLowLevel = resetAsserted ? 0 : 1;
      (_this$inputController3 = (_this$inputController4 = this.inputController).setResetLine) === null || _this$inputController3 === void 0 ? void 0 : _this$inputController3.call(_this$inputController4, activeLowLevel);
      (_this$cpuBoard50xx$se2 = (_this$cpuBoard50xx2 = this.cpuBoard50xx).setResetLine) === null || _this$cpuBoard50xx$se2 === void 0 ? void 0 : _this$cpuBoard50xx$se2.call(_this$cpuBoard50xx2, activeLowLevel);
      (_this$namco54xx$setRe = (_this$namco54xx2 = this.namco54xx).setResetLine) === null || _this$namco54xx$setRe === void 0 ? void 0 : _this$namco54xx$setRe.call(_this$namco54xx2, activeLowLevel);
    });
    this.miscLatch.setCallback(4, () => {});
    this.miscLatch.setCallback(5, state => {
      this.mod0 = !!state;
    });
    this.miscLatch.setCallback(6, state => {
      this.mod1 = !!state;
    });
    this.miscLatch.setCallback(7, state => {
      this.mod2 = !!state;
    });

    this.videoLatch = new NamcoVideoLatch(
    flipped => {
      this.flipScreen = !!flipped;
    },
    running => {var _this$videoBoard50xx$2, _this$videoBoard50xx2, _this$voiceChip$setRe, _this$voiceChip2;
      const resetLine = running ? 1 : 0;
      (_this$videoBoard50xx$2 = (_this$videoBoard50xx2 = this.videoBoard50xx).setResetLine) === null || _this$videoBoard50xx$2 === void 0 ? void 0 : _this$videoBoard50xx$2.call(_this$videoBoard50xx2, resetLine);
      (_this$voiceChip$setRe = (_this$voiceChip2 = this.voiceChip).setResetLine) === null || _this$voiceChip$setRe === void 0 ? void 0 : _this$voiceChip$setRe.call(_this$voiceChip2, resetLine);
    });


    this.miscLatch.setBit(2, 0, true);
    this.miscLatch.setBit(3, 0, true);
    this.videoLatch.setBit(7, 0, true);

    this.dumpSoundInitState = () => {var _ref6, _ref7, _ref8, _soundCpu$nmiPending, _this$timing$now, _this$timing, _this$timing$eventCou, _this$timing2, _this$timing$nextDead, _this$timing3, _this$miscLatch$getBi, _this$miscLatch, _this$miscLatch$getBi2, _this$miscLatch$getBi3, _this$miscLatch2, _this$miscLatch2$getB, _this$timing$cpu3NmiT, _this$timing4, _this$mainCpu4, _this$subCpu5, _this$mainCpu5, _this$subCpu6, _this$busInterface0$c, _this$busInterface, _this$busInterface1$c, _this$busInterface2, _this$inputController5, _this$inputController6, _this$inputController7, _this$cpuBoard50xx$ge, _this$cpuBoard50xx3, _this$cpuBoard50xx3$g, _this$videoBoard50xx$3, _this$videoBoard50xx3, _this$videoBoard50xx4, _this$voiceChip$getTr, _this$voiceChip3, _this$voiceChip3$getT, _this$namco54xx$getTr, _this$namco54xx3, _this$namco54xx3$getT, _this$namco54xxDac$ge, _this$namco54xxDac, _this$namco54xxDac$ge2;
      const pcOf = cpu => {var _ref5, _cpu$PC;return (
          typeof (cpu === null || cpu === void 0 ? void 0 : cpu.getPC) === "function" ?
          cpu.getPC() & 0xffff :
          ((_ref5 = (_cpu$PC = cpu === null || cpu === void 0 ? void 0 : cpu.PC) !== null && _cpu$PC !== void 0 ? _cpu$PC : cpu === null || cpu === void 0 ? void 0 : cpu.pc) !== null && _ref5 !== void 0 ? _ref5 : 0) & 0xffff);};

      const soundCpu = this.sub2Cpu;
      const soundNmiPending = (_ref6 = (_ref7 = (_ref8 = (_soundCpu$nmiPending =
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiPending) !== null && _soundCpu$nmiPending !== void 0 ? _soundCpu$nmiPending :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiLatch) !== null && _ref8 !== void 0 ? _ref8 :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiRequested) !== null && _ref7 !== void 0 ? _ref7 :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.pendingNmi) !== null && _ref6 !== void 0 ? _ref6 :
      null;

      return {
        timingNow: (_this$timing$now = (_this$timing = this.timing) === null || _this$timing === void 0 ? void 0 : _this$timing.now) !== null && _this$timing$now !== void 0 ? _this$timing$now : null,
        timingEvents: (_this$timing$eventCou = (_this$timing2 = this.timing) === null || _this$timing2 === void 0 ? void 0 : _this$timing2.eventCount) !== null && _this$timing$eventCou !== void 0 ? _this$timing$eventCou : null,
        nextDeadline: (_this$timing$nextDead = (_this$timing3 = this.timing) === null || _this$timing3 === void 0 ? void 0 : _this$timing3.nextDeadline) !== null && _this$timing$nextDead !== void 0 ? _this$timing$nextDead : null,
        q2: (_this$miscLatch$getBi = (_this$miscLatch = this.miscLatch) === null || _this$miscLatch === void 0 ? void 0 : (_this$miscLatch$getBi2 = _this$miscLatch.getBit) === null || _this$miscLatch$getBi2 === void 0 ? void 0 : _this$miscLatch$getBi2.call(_this$miscLatch, 2)) !== null && _this$miscLatch$getBi !== void 0 ? _this$miscLatch$getBi : null,
        q3: (_this$miscLatch$getBi3 = (_this$miscLatch2 = this.miscLatch) === null || _this$miscLatch2 === void 0 ? void 0 : (_this$miscLatch2$getB = _this$miscLatch2.getBit) === null || _this$miscLatch2$getB === void 0 ? void 0 : _this$miscLatch2$getB.call(_this$miscLatch2, 3)) !== null && _this$miscLatch$getBi3 !== void 0 ? _this$miscLatch$getBi3 : null,
        mainIrqMask: this.mainIrqMask,
        subIrqMask: this.subIrqMask,
        sub2NmiMask: this.sub2NmiMask,
        cpu3NmiEnabled: this.cpu3NmiEnabled,
        cpu3NmiTimerEnabled: (_this$timing$cpu3NmiT = (_this$timing4 = this.timing) === null || _this$timing4 === void 0 ? void 0 : _this$timing4.cpu3NmiTimerEnabled) !== null && _this$timing$cpu3NmiT !== void 0 ? _this$timing$cpu3NmiT : null,
        cpuBoardResetAsserted: this.cpuBoardResetAsserted,
        mainPC: pcOf(this.mainCpu),
        subPC: pcOf(this.subCpu),
        soundPC: pcOf(soundCpu),
        mainReset: !!((_this$mainCpu4 = this.mainCpu) !== null && _this$mainCpu4 !== void 0 && _this$mainCpu4.inReset),
        subReset: !!((_this$subCpu5 = this.subCpu) !== null && _this$subCpu5 !== void 0 && _this$subCpu5.inReset),
        soundReset: !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.inReset),
        mainHalted: !!((_this$mainCpu5 = this.mainCpu) !== null && _this$mainCpu5 !== void 0 && _this$mainCpu5.halted),
        subHalted: !!((_this$subCpu6 = this.subCpu) !== null && _this$subCpu6 !== void 0 && _this$subCpu6.halted),
        soundHalted: !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.halted),
        soundNmiPending: soundNmiPending == null ? null : !!soundNmiPending,
        soundNmiCount: this.soundNmiCount,
        cpu06Control: (_this$busInterface0$c = (_this$busInterface = this.busInterface0) === null || _this$busInterface === void 0 ? void 0 : _this$busInterface.control) !== null && _this$busInterface0$c !== void 0 ? _this$busInterface0$c : null,
        video06Control: (_this$busInterface1$c = (_this$busInterface2 = this.busInterface1) === null || _this$busInterface2 === void 0 ? void 0 : _this$busInterface2.control) !== null && _this$busInterface1$c !== void 0 ? _this$busInterface1$c : null,
        soundRomAt0000: this.sub2CpuRom[0x0000],
        soundRomAt0066: this.sub2CpuRom[0x0066],
        input51xx: (_this$inputController5 = (_this$inputController6 = this.inputController) === null || _this$inputController6 === void 0 ? void 0 : (_this$inputController7 = _this$inputController6.getTraceState) === null || _this$inputController7 === void 0 ? void 0 : _this$inputController7.call(_this$inputController6)) !== null && _this$inputController5 !== void 0 ? _this$inputController5 : null,
        cpuBoard50xx: (_this$cpuBoard50xx$ge = (_this$cpuBoard50xx3 = this.cpuBoard50xx) === null || _this$cpuBoard50xx3 === void 0 ? void 0 : (_this$cpuBoard50xx3$g = _this$cpuBoard50xx3.getTraceState) === null || _this$cpuBoard50xx3$g === void 0 ? void 0 : _this$cpuBoard50xx3$g.call(_this$cpuBoard50xx3)) !== null && _this$cpuBoard50xx$ge !== void 0 ? _this$cpuBoard50xx$ge : null,
        videoBoard50xx: (_this$videoBoard50xx$3 = (_this$videoBoard50xx3 = this.videoBoard50xx) === null || _this$videoBoard50xx3 === void 0 ? void 0 : (_this$videoBoard50xx4 = _this$videoBoard50xx3.getTraceState) === null || _this$videoBoard50xx4 === void 0 ? void 0 : _this$videoBoard50xx4.call(_this$videoBoard50xx3)) !== null && _this$videoBoard50xx$3 !== void 0 ? _this$videoBoard50xx$3 : null,
        voice52xx: (_this$voiceChip$getTr = (_this$voiceChip3 = this.voiceChip) === null || _this$voiceChip3 === void 0 ? void 0 : (_this$voiceChip3$getT = _this$voiceChip3.getTraceState) === null || _this$voiceChip3$getT === void 0 ? void 0 : _this$voiceChip3$getT.call(_this$voiceChip3)) !== null && _this$voiceChip$getTr !== void 0 ? _this$voiceChip$getTr : null,
        sound54xx: (_this$namco54xx$getTr = (_this$namco54xx3 = this.namco54xx) === null || _this$namco54xx3 === void 0 ? void 0 : (_this$namco54xx3$getT = _this$namco54xx3.getTraceState) === null || _this$namco54xx3$getT === void 0 ? void 0 : _this$namco54xx3$getT.call(_this$namco54xx3)) !== null && _this$namco54xx$getTr !== void 0 ? _this$namco54xx$getTr : null,
        namco54xxDac: (_this$namco54xxDac$ge = (_this$namco54xxDac = this.namco54xxDac) === null || _this$namco54xxDac === void 0 ? void 0 : (_this$namco54xxDac$ge2 = _this$namco54xxDac.getTraceState) === null || _this$namco54xxDac$ge2 === void 0 ? void 0 : _this$namco54xxDac$ge2.call(_this$namco54xxDac)) !== null && _this$namco54xxDac$ge !== void 0 ? _this$namco54xxDac$ge : null };

    };

    this.reset({
      preserveRunning: false,
      fromWatchdog: false });

  }

  setDipSwitches(partialSettings = {}) {
    if (!this.dipSwitches) {
      console.error("[DIP] dipSwitches not initialized");
      return this;
    }

    Object.assign(this.dipSwitches.settings, partialSettings);
    this.dipSwitches._normalize();

    return this;
  }
  setDipSwitchBanks(dswa, dswb) {
    if (!this.dipSwitches) {
      console.error("[DIP] dipSwitches not initialized");
      return this;
    }

    this.dipSwitches.setFromBanks(dswa, dswb);

    return this;
  }
  getDipSwitchSummary() {var _this$dipSwitches$get, _this$dipSwitches, _this$dipSwitches$get2;
    return (_this$dipSwitches$get = (_this$dipSwitches = this.dipSwitches) === null || _this$dipSwitches === void 0 ? void 0 : (_this$dipSwitches$get2 = _this$dipSwitches.getSummary) === null || _this$dipSwitches$get2 === void 0 ? void 0 : _this$dipSwitches$get2.call(_this$dipSwitches)) !== null && _this$dipSwitches$get !== void 0 ? _this$dipSwitches$get : null;
  }

  canDeliverSoundNmi() {var _this$cpuBoardResetAs, _this$sub2Cpu2, _this$sub2Cpu3, _this$sub2Cpu3$isRese;
    const timerEnabled = !!this.cpu3NmiEnabled;

    const cpuBoardResetAsserted = !!((_this$cpuBoardResetAs =
    this.cpuBoardResetAsserted) !== null && _this$cpuBoardResetAs !== void 0 ? _this$cpuBoardResetAs : this.subsystemsReset);


    const soundCpuReset = !!(
    (_this$sub2Cpu2 = this.sub2Cpu) !== null && _this$sub2Cpu2 !== void 0 && _this$sub2Cpu2.inReset || (_this$sub2Cpu3 = this.sub2Cpu) !== null && _this$sub2Cpu3 !== void 0 && (_this$sub2Cpu3$isRese = _this$sub2Cpu3.isReset) !== null && _this$sub2Cpu3$isRese !== void 0 && _this$sub2Cpu3$isRese.call(_this$sub2Cpu3));


    return timerEnabled && !cpuBoardResetAsserted && !soundCpuReset;
  }

  readDSW(addr) {
    const offset = addr & 0x07;
    const dswa = this.dipSwitches.getBankA();
    const dswb = this.dipSwitches.getBankB();
    return dswb >> offset & 1 | (dswa >> offset & 1) << 1;
  }
  reset({ preserveRunning = false, fromWatchdog = false } = {}) {var _this$mainCpu$clearIr2, _this$mainCpu6, _this$subCpu$clearIrq2, _this$subCpu7, _this$sub2Cpu$clearIr, _this$sub2Cpu4, _this$mainCpu$clearNm2, _this$mainCpu7, _this$subCpu$clearNmi2, _this$subCpu8, _this$sub2Cpu$clearNm, _this$sub2Cpu5, _this$soundChip$reset, _this$soundChip2, _this$starfield$reset, _this$starfield, _this$movementMcu1$re, _this$movementMcu, _this$movementMcu2$re, _this$movementMcu2, _this$inputController8, _this$inputController9, _this$voiceChip$reset, _this$voiceChip4, _this$voiceChip$setSc2, _this$voiceChip5, _this$namco54xx$reset, _this$namco54xx4, _this$subCpu$setReset2, _this$subCpu9, _this$sub2Cpu$setRese2, _this$sub2Cpu6, _this$inputController10, _this$inputController11, _this$cpuBoard50xx$se3, _this$cpuBoard50xx4, _this$namco54xx$setRe2, _this$namco54xx5, _this$videoBoard50xx$4, _this$videoBoard50xx5, _this$voiceChip$setRe2, _this$voiceChip6, _this$inputController12, _this$inputController13, _this$inputController14, _this$inputController15;
    const wasRunning = !!this.running;

    this.running = preserveRunning ? wasRunning : false;
    this.frameCounter = 0;

    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.watchdogResetPending = false;

    this.soundNmiCount = 0;

    this.mainIrqMask = false;
    this.subIrqMask = false;

    this.mainIrqEnabled = false;
    this.subIrqArmed = false;

    this.cpu3NmiLatchQ2 = 0;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;

    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;

    this.flipScreen = false;

    this.timing.reset();

    this.timing.cpu3NmiTimerEnabled = true;

    this.share1.fill(0);
    this.videoram.fill(0);

    this.radarattr.fill(0);
    this.starcontrol.fill(0);

    this.starclr = 1;
    this._scrollX = 0;
    this._scrollY = 0;

    this.bgDirty.fill(1);
    this.fgDirty.fill(1);

    this.mainCpu.reset(this.mainRead.bind(this));
    this.subCpu.reset(this.subRead.bind(this));
    this.sub2Cpu.reset(this.sub2Read.bind(this));

    (_this$mainCpu$clearIr2 = (_this$mainCpu6 = this.mainCpu).clearIrq) === null || _this$mainCpu$clearIr2 === void 0 ? void 0 : _this$mainCpu$clearIr2.call(_this$mainCpu6);
    (_this$subCpu$clearIrq2 = (_this$subCpu7 = this.subCpu).clearIrq) === null || _this$subCpu$clearIrq2 === void 0 ? void 0 : _this$subCpu$clearIrq2.call(_this$subCpu7);
    (_this$sub2Cpu$clearIr = (_this$sub2Cpu4 = this.sub2Cpu).clearIrq) === null || _this$sub2Cpu$clearIr === void 0 ? void 0 : _this$sub2Cpu$clearIr.call(_this$sub2Cpu4);

    (_this$mainCpu$clearNm2 = (_this$mainCpu7 = this.mainCpu).clearNmiLatch) === null || _this$mainCpu$clearNm2 === void 0 ? void 0 : _this$mainCpu$clearNm2.call(_this$mainCpu7);
    (_this$subCpu$clearNmi2 = (_this$subCpu8 = this.subCpu).clearNmiLatch) === null || _this$subCpu$clearNmi2 === void 0 ? void 0 : _this$subCpu$clearNmi2.call(_this$subCpu8);
    (_this$sub2Cpu$clearNm = (_this$sub2Cpu5 = this.sub2Cpu).clearNmiLatch) === null || _this$sub2Cpu$clearNm === void 0 ? void 0 : _this$sub2Cpu$clearNm.call(_this$sub2Cpu5);

    (_this$soundChip$reset = (_this$soundChip2 = this.soundChip).reset) === null || _this$soundChip$reset === void 0 ? void 0 : _this$soundChip$reset.call(_this$soundChip2);
    (_this$starfield$reset = (_this$starfield = this.starfield).reset) === null || _this$starfield$reset === void 0 ? void 0 : _this$starfield$reset.call(_this$starfield);

    this.busInterface0.reset();
    this.busInterface0.setScheduler(this.timing);

    this.busInterface1.reset();
    this.busInterface1.setScheduler(this.timing);

    (_this$movementMcu1$re = (_this$movementMcu = this.movementMcu1).reset) === null || _this$movementMcu1$re === void 0 ? void 0 : _this$movementMcu1$re.call(_this$movementMcu);
    (_this$movementMcu2$re = (_this$movementMcu2 = this.movementMcu2).reset) === null || _this$movementMcu2$re === void 0 ? void 0 : _this$movementMcu2$re.call(_this$movementMcu2);

    (_this$inputController8 = (_this$inputController9 = this.inputController).reset) === null || _this$inputController8 === void 0 ? void 0 : _this$inputController8.call(_this$inputController9);
    (_this$voiceChip$reset = (_this$voiceChip4 = this.voiceChip).reset) === null || _this$voiceChip$reset === void 0 ? void 0 : _this$voiceChip$reset.call(_this$voiceChip4);
    (_this$voiceChip$setSc2 = (_this$voiceChip5 = this.voiceChip).setScheduler) === null || _this$voiceChip$setSc2 === void 0 ? void 0 : _this$voiceChip$setSc2.call(_this$voiceChip5, this.timing);
    (_this$namco54xx$reset = (_this$namco54xx4 = this.namco54xx).reset) === null || _this$namco54xx$reset === void 0 ? void 0 : _this$namco54xx$reset.call(_this$namco54xx4);

    (_this$subCpu$setReset2 = (_this$subCpu9 = this.subCpu).setReset) === null || _this$subCpu$setReset2 === void 0 ? void 0 : _this$subCpu$setReset2.call(_this$subCpu9, true);
    (_this$sub2Cpu$setRese2 = (_this$sub2Cpu6 = this.sub2Cpu).setReset) === null || _this$sub2Cpu$setRese2 === void 0 ? void 0 : _this$sub2Cpu$setRese2.call(_this$sub2Cpu6, true);

    (_this$inputController10 = (_this$inputController11 = this.inputController).setResetLine) === null || _this$inputController10 === void 0 ? void 0 : _this$inputController10.call(_this$inputController11, 0);
    (_this$cpuBoard50xx$se3 = (_this$cpuBoard50xx4 = this.cpuBoard50xx).setResetLine) === null || _this$cpuBoard50xx$se3 === void 0 ? void 0 : _this$cpuBoard50xx$se3.call(_this$cpuBoard50xx4, 0);
    (_this$namco54xx$setRe2 = (_this$namco54xx5 = this.namco54xx).setResetLine) === null || _this$namco54xx$setRe2 === void 0 ? void 0 : _this$namco54xx$setRe2.call(_this$namco54xx5, 0);

    (_this$videoBoard50xx$4 = (_this$videoBoard50xx5 = this.videoBoard50xx).setResetLine) === null || _this$videoBoard50xx$4 === void 0 ? void 0 : _this$videoBoard50xx$4.call(_this$videoBoard50xx5, 0);
    (_this$voiceChip$setRe2 = (_this$voiceChip6 = this.voiceChip).setResetLine) === null || _this$voiceChip$setRe2 === void 0 ? void 0 : _this$voiceChip$setRe2.call(_this$voiceChip6, 0);

    (_this$inputController12 = (_this$inputController13 = this.inputController).vblank) === null || _this$inputController12 === void 0 ? void 0 : _this$inputController12.call(_this$inputController13, false);
    (_this$inputController14 = (_this$inputController15 = this.inputController).setPorts) === null || _this$inputController14 === void 0 ? void 0 : _this$inputController14.call(_this$inputController15, this.in0, this.in1);

    this.miscLatch.clear();
    this.videoLatch.reset();

    this.miscLatch.setBit(2, 0, true);

    this.miscLatch.setBit(3, 0, true);

    this.videoLatch.setBit(7, 0, true);

    this.cpu3NmiLatchQ2 = 0;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;

    this.timing.setCpu3NmiGateFromQ2(0);

    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;

    this.lastResetReason = fromWatchdog ? "watchdog" : "manual";
  }
  connectInput(inputManager) {
    if (
    !this.inputController ||
    typeof this.inputController.setPorts !== "function")
    {
      console.error(
      "inputController is not initialized or missing setPorts",
      this.inputController);

      return;
    }

    const sync = ports => {
      this.in0 = ports.in0 & 0xff;
      this.in1 = ports.in1 & 0xff;

      this.inputController.setPorts(this.in0, this.in1);
    };

    sync(inputManager.getState());
    inputManager.setOnStateChange(sync);
  }
  get scrollX() {
    return this._scrollX;
  }
  set scrollX(v) {
    this._scrollX = v & 0xff;
  }
  get scrollY() {
    return this._scrollY;
  }
  set scrollY(v) {
    this._scrollY = v & 0xff;
  }

  sharedRead(addr) {
    addr &= 0xffff;

    if (addr >= 0x6800 && addr <= 0x6807) return this.readDSW(addr);
    if (addr >= 0x7000 && addr <= 0x70ff)
    return this.busInterface0.dataRead(addr - 0x7000);
    if (addr === 0x7100) return this.busInterface0.readControl();
    if (addr >= 0x7800 && addr <= 0x7fff) return this.share1[addr - 0x7800];
    if (addr >= 0x8000 && addr <= 0x8fff) return this.videoram[addr - 0x8000];
    if (addr >= 0x9000 && addr <= 0x90ff)
    return this.busInterface1.dataRead(addr - 0x9000);
    if (addr === 0x9100) return this.busInterface1.readControl();
    // 0x9800-0x9877 (radarattr/scroll/starcontrol/starclr/videolatch) is
    // writeonly() in bosco_map — open bus on read.
    return 0xff;
  }
  sharedWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr >= 0x6800 && addr <= 0x681f) {var _this$soundChip3;
      (_this$soundChip3 = this.soundChip) === null || _this$soundChip3 === void 0 ? void 0 : _this$soundChip3.write(addr & 0x1f, data);
      return true;
    }
    if (addr >= 0x6820 && addr <= 0x6827) {
      this.miscLatch.write(addr, data);
      return true;
    }
    if (addr === 0x6830) {
      this.kickWatchdog();
      return true;
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.busInterface0.dataWrite(addr - 0x7000, data);
      return true;
    }
    if (addr === 0x7100) {
      this.busInterface0.controlWrite(data);
      return true;
    }

    if (addr >= 0x7800 && addr <= 0x7fff) {
      this.share1[addr - 0x7800] = data;
      return true;
    }

    if (addr >= 0x8000 && addr <= 0x8fff) {
      // bosco_videoram_w: dirty-flag the correct tilemap by bit 0x400.
      const offset = addr - 0x8000;
      this.videoram[offset] = data;
      if (offset & 0x400) this.bgDirty[offset & 0x3ff] = 1;else
      this.fgDirty[offset & 0x3ff] = 1;
      return true;
    }

    if (addr >= 0x9000 && addr <= 0x90ff) {
      this.busInterface1.dataWrite(addr - 0x9000, data);
      return true;
    }
    if (addr === 0x9100) {
      this.busInterface1.controlWrite(data);
      return true;
    }

    if (addr >= 0x9800 && addr <= 0x980f) {
      this.radarattr[addr - 0x9800] = data;
      return true;
    }
    if (addr === 0x9810) {
      this.scrollX = data;
      return true;
    }
    if (addr === 0x9820) {
      this.scrollY = data;
      return true;
    }
    if (addr === 0x9830) {
      this.starcontrol[0] = data;
      return true;
    }
    if (addr === 0x9840) {
      this.starclr = 0;
      return true;
    } // any write arms it
    if (addr >= 0x9870 && addr <= 0x9877) {
      this.videoLatch.write(addr, data);
      return true;
    }

    return false;
  }
  mainRead(addr) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return this.mainCpuRom[addr];
    return this.sharedRead(addr);
  }
  mainWrite(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return; // ROM region: nopw(), writes discarded
    this.sharedWrite(addr, data);
  }
  subRead(addr) {var _this$subCpuRom$addr;
    addr &= 0xffff;
    if (addr <= 0x3fff) return (_this$subCpuRom$addr = this.subCpuRom[addr]) !== null && _this$subCpuRom$addr !== void 0 ? _this$subCpuRom$addr : 0xff; // 0x2000-0x3fff n.c.
    return this.sharedRead(addr);
  }
  subWrite(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return;
    this.sharedWrite(addr, data);
  }
  sub2Read(addr) {var _this$sub2CpuRom$addr;
    addr &= 0xffff;
    if (addr <= 0x0fff) return (_this$sub2CpuRom$addr = this.sub2CpuRom[addr]) !== null && _this$sub2CpuRom$addr !== void 0 ? _this$sub2CpuRom$addr : 0xff;
    if (addr <= 0x3fff) return 0xff; // n.c.
    return this.sharedRead(addr);
  }
  sub2Write(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return;
    this.sharedWrite(addr, data);
  }

  onVblankRising() {var _this$inputController16, _this$inputController17;
    this.watchdogKickCountThisFrame = 0;

    if (this.mainIrqEnabled) {var _this$mainCpu$irq, _this$mainCpu8;
      (_this$mainCpu$irq = (_this$mainCpu8 = this.mainCpu).irq) === null || _this$mainCpu$irq === void 0 ? void 0 : _this$mainCpu$irq.call(_this$mainCpu8);
    }

    if (!this.subsystemsReset && this.subIrqArmed) {var _this$subCpu$irq, _this$subCpu10;
      (_this$subCpu$irq = (_this$subCpu10 = this.subCpu).irq) === null || _this$subCpu$irq === void 0 ? void 0 : _this$subCpu$irq.call(_this$subCpu10);
    }

    (_this$inputController16 = this.inputController) === null || _this$inputController16 === void 0 ? void 0 : (_this$inputController17 = _this$inputController16.vblank) === null || _this$inputController17 === void 0 ? void 0 : _this$inputController17.call(_this$inputController16, true);

    this.watchdogTimer++;

    if (this.watchdogTimer >= 8) {
      this.watchdogResetPending = true;
    }
  }
  onVblankFalling() {var _this$inputController18, _this$inputController19;
    (_this$inputController18 = this.inputController) === null || _this$inputController18 === void 0 ? void 0 : (_this$inputController19 = _this$inputController18.vblank) === null || _this$inputController19 === void 0 ? void 0 : _this$inputController19.call(_this$inputController18, false);

    const control = this.starcontrol[0];
    const speedIndexX = control & 0x07;
    const speedIndexY = control >>> 3 & 0x07;

    this.starfield.setScrollSpeed(speedIndexX, speedIndexY);

    const q4 = this.videoLatch.getBit(4);
    const q5 = this.videoLatch.getBit(5);

    this.starfield.setActiveStarfieldSets(q4, q5 | 0x02);
    this.starfield.enableStarfield(!this.starclr);
  }

  kickWatchdog() {var _this$_activeCpuName, _cpu, _ref9, _cpu$PC2, _cpu2, _cpu3, _this$timing$schedule, _this$timing5, _this$watchdogKickSeq, _this$watchdogKickCou;
    const cpuName = (_this$_activeCpuName = this._activeCpuName) !== null && _this$_activeCpuName !== void 0 ? _this$_activeCpuName : "unknown";

    let cpu = null;

    switch (cpuName) {
      case "main":
        cpu = this.mainCpu;
        break;

      case "sub":
        cpu = this.subCpu;
        break;

      case "sub2":
        cpu = this.sub2Cpu;
        break;}


    const pc =
    typeof ((_cpu = cpu) === null || _cpu === void 0 ? void 0 : _cpu.getPC) === "function" ? cpu.getPC() : (_ref9 = (_cpu$PC2 = (_cpu2 = cpu) === null || _cpu2 === void 0 ? void 0 : _cpu2.PC) !== null && _cpu$PC2 !== void 0 ? _cpu$PC2 : (_cpu3 = cpu) === null || _cpu3 === void 0 ? void 0 : _cpu3.pc) !== null && _ref9 !== void 0 ? _ref9 : 0;

    const frame = this.frameCounter;
    const tick = (_this$timing$schedule = (_this$timing5 = this.timing) === null || _this$timing5 === void 0 ? void 0 : _this$timing5.schedulerTick) !== null && _this$timing$schedule !== void 0 ? _this$timing$schedule : null;

    this.watchdogKickSequence = ((_this$watchdogKickSeq = this.watchdogKickSequence) !== null && _this$watchdogKickSeq !== void 0 ? _this$watchdogKickSeq : 0) + 1;

    this.watchdogKickCountThisFrame =
    ((_this$watchdogKickCou = this.watchdogKickCountThisFrame) !== null && _this$watchdogKickCou !== void 0 ? _this$watchdogKickCou : 0) + 1;

    /*
     * Preserve one representative watchdog write per frame.
     *
     * This reveals the first frame where normal service stops without
     * allowing a tight $3e95 loop to overwrite the entire history.
     */
    if (this.watchdogLastRecordedFrame !== frame) {
      this.watchdogLastRecordedFrame = frame;

      this.watchdogKickHistory.push({
        sequence: this.watchdogKickSequence,
        frame,
        tick,
        cpu: cpuName,
        pc: pc & 0xffff,
        countBeforeKick: this.watchdogTimer,
        writesThisFrameAtRecord: this.watchdogKickCountThisFrame });


      if (this.watchdogKickHistory.length > 64) {
        this.watchdogKickHistory.shift();
      }
    }

    this.watchdogTimer = 0;
    this.watchdogEverKicked = true;
    this.watchdogResetPending = false;
  }
  onWatchdogFired() {var _this$watchdogResetCo;
    this.watchdogResetCount = ((_this$watchdogResetCo = this.watchdogResetCount) !== null && _this$watchdogResetCo !== void 0 ? _this$watchdogResetCo : 0) + 1;

    this.reset({
      preserveRunning: true,
      fromWatchdog: true });

  }

  step() {
    this.timing.runFrame();
    if (this.watchdogResetPending) {
      this.watchdogResetPending = false;
      this.onWatchdogFired();
      return;
    }
    this.frameCounter++;
  }


  buildTileCache() {
    // Pre-decode all immutable ROM graphics so the render hot path
    // never decodes the same tile twice.
    this.tileCache8x8 = new Array(0x200);
    for (let code = 0; code < 0x200; code++) {
      this.tileCache8x8[code] = this.decode8x8(this.charRom, code);
    }

    this.tileCache16x16 = new Array(0x80);
    for (let code = 0; code < 0x80; code++) {
      this.tileCache16x16[code] = this.decode16x16(code);
    }

    this.tileCacheBullet = new Array(0x08);
    for (let code = 0; code < 0x08; code++) {
      this.tileCacheBullet[code] = this.decodeBullet(code);
    }
  }
  decode8x8(rom, code) {
    const TILE = 8;
    const pixels = new Uint8Array(TILE * TILE);
    const base = (code & 0x1ff) * 16;

    for (let y = 0; y < TILE; y++) {var _rom, _rom2;
      const lo = (_rom = rom[base + y + 8]) !== null && _rom !== void 0 ? _rom : 0;
      const hi = (_rom2 = rom[base + y]) !== null && _rom2 !== void 0 ? _rom2 : 0;
      const row = y * TILE;

      for (let x = 0; x < 4; x++) {
        const bit = 3 - x;
        pixels[row + x] = lo >> bit & 1 | (lo >> bit + 4 & 1) << 1;
        pixels[row + x + 4] =
        hi >> bit & 1 | (hi >> bit + 4 & 1) << 1;
      }
    }
    return pixels;
  }
  decode16x16(code) {
    const pixels = new Uint8Array(16 * 16);
    const rom = this.spriteRom;
    const base = (code & 0x7f) * 64;

    // MAME spritelayout_bosco:
    //
    // x offsets:
    //   output x= 0.. 3 -> + 8 bytes
    //   output x= 4.. 7 -> +16 bytes
    //   output x= 8..11 -> +24 bytes
    //   output x=12..15 -> + 0 bytes
    //
    // y offsets:
    //   y=0..7  -> +0..7 bytes
    //   y=8..15 -> +32..39 bytes
    const GROUP_OFFSET = BoscoEmulator.SPRITE_GROUP_OFFSET;

    for (let y = 0; y < 16; y++) {
      const rowBase = base + (y < 8 ? y : y + 24);
      const row = y * 16;

      for (let group = 0; group < 4; group++) {var _rom3;
        const value = (_rom3 = rom[rowBase + GROUP_OFFSET[group]]) !== null && _rom3 !== void 0 ? _rom3 : 0;
        const dstX = group * 4;

        for (let bitIndex = 0; bitIndex < 4; bitIndex++) {
          const bit = 3 - bitIndex;

          // Plane 0: bit 0..3.
          // Plane 1: bit 4..7.
          pixels[row + dstX + bitIndex] =
          value >> bit & 1 | (value >> bit + 4 & 1) << 1;
        }
      }
    }

    return pixels;
  }
  blitPen(buf, W, H, rgb, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;

    const dst = y * W + x << 2;
    buf[dst] = rgb.r;
    buf[dst + 1] = rgb.g;
    buf[dst + 2] = rgb.b;
    buf[dst + 3] = 0xff;
    return true;
  }
  renderTiles(data, W, H) {var _this$lutProm;
    const TILE = 8;
    const flip = !!this.flipScreen;
    const lutValid = ((_this$lutProm = this.lutProm) === null || _this$lutProm === void 0 ? void 0 : _this$lutProm.length) >= 256;
    const buf = data;

    const getTileInfo = (tileIndex, ramOffs) => {
      const attr = this.videoram[ramOffs + tileIndex + 0x800];
      const code = this.videoram[ramOffs + tileIndex];
      const group = attr & 0x3f;
      const rawFlip = attr >> 6 & 0x03;
      const flipX = (rawFlip ^ 0x01) & 0x01;
      const flipY = rawFlip >> 1 & 0x01;
      return { code, color: group, flipX, flipY };
    };

    const plotTile = (
    info,
    drawX,
    drawY,
    clipMinX,
    clipMaxX,
    transparent = false) =>
    {
      const pixels = this.tileCache8x8 ?
      this.tileCache8x8[info.code & 0x1ff] :
      this.decode8x8(this.charRom, info.code);
      const screenFlip = !!this.flipScreen;
      const outX = screenFlip ? W - TILE - drawX : drawX;
      const outY = (screenFlip ? H - TILE - drawY : drawY) - 16;

      const effectiveFlipX = info.flipX ^ screenFlip;
      const effectiveFlipY = info.flipY ^ screenFlip;

      const lutBase = info.color << 2;
      const penRgb = [null, null, null, null];

      for (let pen = 0; pen < 4; pen++) {
        const palettePen = lutValid ?
        this.lutProm[lutBase | pen] & 0x0f :
        (lutBase | pen) & 0x0f;

        if (!transparent || palettePen !== 0x0f) {var _this$palette;
          penRgb[pen] = (_this$palette = this.palette[0x10 + palettePen]) !== null && _this$palette !== void 0 ? _this$palette : null;
        }
      }

      for (let py = 0; py < TILE; py++) {
        const y = outY + py;
        if (y < 0 || y >= H) continue;

        const srcRow = effectiveFlipY ? TILE - 1 - py : py;

        for (let px = 0; px < TILE; px++) {
          const x = outX + px;
          if (x < clipMinX || x > clipMaxX) continue;

          const srcCol = effectiveFlipX ? TILE - 1 - px : px;
          const rgb = penRgb[pixels[srcRow * TILE + srcCol]];
          if (rgb) this.blitPen(buf, W, H, rgb, x, y);
        }
      }
    };

    const bgMinX = flip ? 8 * TILE : 0;
    const bgMaxX = flip ? W - 1 : 28 * TILE - 1;
    const MAP_SIZE = 32 * TILE; // 256 pixels
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        // MAME TILEMAP_SCAN_ROWS: tx + (ty << 5)
        const info = getTileInfo(tx + (ty << 5), 0x400);

        // Normalize base position modulo 256 px so wrap is seamless
        const baseX =
        ((tx * TILE - this.scrollX) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;
        const baseY =
        ((ty * TILE - this.scrollY) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;

        // 2x2 wrapping quadrant offsets
        const wrapX = baseX >= 256 - 32 ? baseX - MAP_SIZE : baseX;
        const wrapY = baseY >= 256 - 32 ? baseY - MAP_SIZE : baseY;

        // Plot primary and all adjacent wrapping instances
        plotTile(info, baseX, baseY, bgMinX, bgMaxX, true);
        plotTile(info, wrapX, baseY, bgMinX, bgMaxX, true);
        plotTile(info, baseX, wrapY, bgMinX, bgMaxX, true);
        plotTile(info, wrapX, wrapY, bgMinX, bgMaxX, true);
      }
    }

    const fgMinX = flip ? 0 : 28 * TILE;
    const fgMaxX = flip ? 8 * TILE - 1 : W - 1;
    const FG_MAP_W = 8 * TILE; // 64 px

    for (let ty = 0; ty < 32; ty++) {
      for (let logicalCol = 0; logicalCol < 8; logicalCol++) {
        const tileIndex = logicalCol + (ty << 5);
        const info = getTileInfo(tileIndex, 0x000);

        // Equivalent to MAME's horizontally repeating 8x32 fg tilemap.
        for (let mapX = 0; mapX < W; mapX += FG_MAP_W) {
          plotTile(
          info,
          mapX + logicalCol * TILE,
          ty * TILE,
          fgMinX,
          fgMaxX,
          false);

        }
      }
    }
  }
  renderSprites(data, W, H) {var _this$spriteLutProm;
    const flipScreen = !!this.flipScreen;
    const lutValid = ((_this$spriteLutProm = this.spriteLutProm) === null || _this$spriteLutProm === void 0 ? void 0 : _this$spriteLutProm.length) >= 256;
    const buf = data;

    const spriteBase = 0x03d4;
    const spriteram = this.videoram.subarray(spriteBase, spriteBase + 0x0c);
    const spriteram2 = this.videoram.subarray(
    spriteBase + 0x0800,
    spriteBase + 0x0800 + 0x0c);


    for (let offs = 0; offs < 0x0c; offs += 2) {
      let sx = spriteram[offs + 1] - 2;
      const sy = 224 - spriteram2[offs];

      let flipX = spriteram[offs] & 1;
      let flipY = spriteram[offs] >>> 1 & 1;
      const color = spriteram2[offs + 1] & 0x3f;
      const code = (spriteram[offs] & 0xfc) >> 2;

      if (flipScreen) sx += 32 - 1;

      const pixels = this.tileCache16x16 ?
      this.tileCache16x16[code & 0x7f] :
      this.decode16x16(code);
      const lutBase = color << 2;
      const penRgb = [null, null, null, null];
      for (let pen = 0; pen < 4; pen++) {var _this$palette$palette;
        const palettePen = this.lutProm[lutBase | pen] & 0x0f;

        penRgb[pen] =
        palettePen === 0x0f ? null : (_this$palette$palette = this.palette[palettePen]) !== null && _this$palette$palette !== void 0 ? _this$palette$palette : null;
      }
      for (let py = 0; py < 16; py++) {
        const srcRow = flipY ? 15 - py : py;
        for (let px = 0; px < 16; px++) {
          const srcCol = flipX ? 15 - px : px;
          const rgb = penRgb[pixels[srcRow * 16 + srcCol]];
          if (!rgb) continue;
          this.blitPen(buf, W, H, rgb, sx + px, sy + py);
        }
      }
    }
  }
  decodeBullet(code) {
    const pixels = new Uint8Array(16);
    const base = (code & 0x07) * 16;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const pen = this.spriteShapeRom[base + row * 4 + col] & 0x07;

        // Exact visible behavior of MAME transmask(..., 0xf0):
        // pens 4, 5, 6, and 7 do not draw.
        pixels[row * 4 + col] = pen < 4 ? pen : 0xff;
      }
    }

    return pixels;
  }
  drawBullets(data, W, H) {
    const flip = !!this.flipScreen;
    const buffer = data;

    const radarBase = 0x03f0;
    const radarx = this.videoram.subarray(radarBase, radarBase + 0x10);
    const radary = this.videoram.subarray(
    radarBase + 0x0800,
    radarBase + 0x0800 + 0x10);


    // Exact MAME loop: offs = 4 through 15.
    // Despite the function name, these are the 12 dot/radar slots
    // drawn by the gfx3 dot generator.
    for (let offs = 4; offs < 0x10; offs++) {
      const attr = this.radarattr[offs];

      // Exact MAME coordinate equations.
      let x = radarx[offs] + ((~attr & 0x01) << 8) - 2;
      let y = 235 - radary[offs];

      if (flip) {
        x -= 1;
        y += 2;
      }

      // Exact MAME shape selection.
      const code = (attr & 0x0e) >> 1 ^ 0x07;
      const pixels = this.tileCacheBullet ?
      this.tileCacheBullet[code & 0x07] :
      this.decodeBullet(code);

      // Exact MAME transmask(..., !flip, !flip, ..., 0xf0).
      // transmask 0xf0 makes pens 4-7 transparent.
      for (let dstY = 0; dstY < 4; dstY++) {
        const srcY = flip ? dstY : 3 - dstY;

        for (let dstX = 0; dstX < 4; dstX++) {
          const srcX = flip ? dstX : 3 - dstX;
          const pen = pixels[srcY * 4 + srcX];

          // MAME transmask(..., 0xf0):
          // binary 11110000 => pen indices 4..7 transparent.
          if (pen >= 4) continue;

          // MAME bosco_palette:
          // dot pen 0 -> indirect color 31
          // dot pen 1 -> indirect color 30
          // dot pen 2 -> indirect color 29
          // dot pen 3 -> indirect color 28.
          const rgb = this.palette[31 - pen];

          // This must be the corrected six-argument call.
          this.blitPen(buffer, W, H, rgb, x + dstX, y + dstY);
        }
      }
    }
  }
  applyRadarShift(data, W, H) {
    const shift = 3;
    const flip = !!this.flipScreen;
    const buf = data;

    const copyPixel = (srcX, dstX, y) => {
      const src = (y * W + srcX) * 4;
      const dst = (y * W + dstX) * 4;

      buf[dst] = buf[src];
      buf[dst + 1] = buf[src + 1];
      buf[dst + 2] = buf[src + 2];
      buf[dst + 3] = 255;
    };

    const clearPixel = (x, y) => {
      const i = (y * W + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 255;
    };

    for (let y = 0; y < H; y++) {
      if (flip) {
        // Radar occupies 0..63; shift it right to 3..66.
        for (let x = 63; x >= 0; x--) {
          copyPixel(x, x + shift, y);
        }

        for (let x = 0; x < shift; x++) {
          clearPixel(x, y);
        }
      } else {
        // Radar occupies 224..287; shift it left to 221..284.
        for (let x = 224; x < W; x++) {
          copyPixel(x, x - shift, y);
        }

        for (let x = W - shift; x < W; x++) {
          clearPixel(x, y);
        }
      }
    }
  }
  render(ctx) {
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, 288, 224);
    this.starfield.render(ctx, { flip: !!this.flipScreen });

    // Single ImageData buffer for all pixel-level layers — avoids 4
    // separate getImageData/putImageData round-trips per frame.
    const W = 288,
    H = 224;
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    this.renderSprites(data, W, H);
    this.renderTiles(data, W, H);
    this.drawBullets(data, W, H);
    this.applyRadarShift(data, W, H);

    ctx.putImageData(imgData, 0, 0);
    this.soundChip.flushRegisters();
  }

  initPaletteFromProm() {
    const resistances = [1000, 470, 220];
    const computeWeights = (resList, pulldown = 0) => {
      const n = resList.length;
      const table = new Array(1 << n);
      for (let comb = 0; comb < table.length; comb++) {
        let gOn = 0,
        gTotal = 0;
        for (let j = 0; j < n; j++) {
          const g = 1 / resList[j];
          gTotal += g;
          if (comb >> j & 1) gOn += g;
        }
        if (pulldown > 0) gTotal += 1 / pulldown;
        table[comb] = 5.0 * gOn / gTotal;
      }
      return table;
    };
    const scaleTo255 = tables => {
      let maxv = 0;
      for (const t of tables) for (const v of t) if (v > maxv) maxv = v;
      const scale = maxv > 0 ? 255 / maxv : 0;
      return tables.map(t => t.map(v => Math.round(v * scale)));
    };

    const [rWeights, gWeights, bWeights] = scaleTo255([
    computeWeights(resistances),
    computeWeights(resistances),
    computeWeights(resistances.slice(1))]);


    for (let i = 0; i < 32; i++) {
      const byte = this.masterPaletteProm[i];
      const bit = n => byte >> n & 1;
      const rIdx = bit(0) | bit(1) << 1 | bit(2) << 2;
      const gIdx = bit(3) | bit(4) << 1 | bit(5) << 2;
      const bIdx = bit(6) | bit(7) << 1;
      this.palette[i] = {
        r: rWeights[rIdx],
        g: gWeights[gIdx],
        b: bWeights[bIdx] };

    }

    const [starR, starG, starB] = scaleTo255([
    computeWeights(resistances.slice(1), resistances[0]),
    computeWeights(resistances.slice(1), resistances[0]),
    computeWeights(resistances.slice(1))]);

    for (let i = 0; i < 64; i++) {
      this.palette[32 + i] = {
        r: starR[i & 0x03],
        g: starG[i >> 2 & 0x03],
        b: starB[i >> 4 & 0x03] };

    }
  }
  async loadRoms(progressCallback = null) {
    const { files: romFiles } = this.config.roms;

    if (!Array.isArray(romFiles)) {
      throw new Error("[ROM] config.roms.files must be an array");
    }

    let crc32Table = this.constructor._crc32Table;

    if (!crc32Table) {
      crc32Table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let bit = 0; bit < 8; bit++) {
          c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
        }
        crc32Table[i] = c >>> 0;
      }
      this.constructor._crc32Table = crc32Table;
    }

    const results = await Promise.all(
    romFiles.map(async (file, index) => {
      try {var _file$offset;
        const base = String(this.config.roms.baseUrl || "");
        const separator = base && !base.endsWith("/") ? "/" : "";
        const url = `${base}${separator}${file.name}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${file.name}`);
        }

        const data = new Uint8Array(await response.arrayBuffer());

        if (data.length !== file.size) {
          throw new Error(
          `${file.name}: size mismatch, expected ${file.size}, got ${data.length}`);

        }

        let actualCrc = null;

        if (file.crc32) {
          let crc = 0xffffffff;

          for (let i = 0; i < data.length; i++) {
            crc = crc32Table[(crc ^ data[i]) & 0xff] ^ crc >>> 8;
          }

          actualCrc = ((crc ^ 0xffffffff) >>> 0).
          toString(16).
          padStart(8, "0");

          const expectedCrc = String(file.crc32).toLowerCase();

          if (actualCrc !== expectedCrc) {
            throw new Error(
            `${file.name}: CRC mismatch, expected ${expectedCrc}, got ${actualCrc}`);

          }
        }

        const target = file.target ? this[file.target] : null;

        if (!(target instanceof Uint8Array)) {
          throw new Error(
          `${file.name}: no valid Uint8Array target "${file.target}"`);

        }

        const offset = (_file$offset = file.offset) !== null && _file$offset !== void 0 ? _file$offset : 0;

        if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset + data.length > target.length)
        {
          throw new Error(
          `${file.name}: ${file.target} overflow at 0x${offset.toString(
          16)
          }`);

        }

        // Raw byte-for-byte copy. Do not modify graphics ROMs here.
        target.set(data, offset);

        if (file.soundPromRole === "waveform") {var _this$soundChip4, _this$soundChip4$noti;
          (_this$soundChip4 = this.soundChip) === null || _this$soundChip4 === void 0 ? void 0 : (_this$soundChip4$noti = _this$soundChip4.notifyPromLoaded) === null || _this$soundChip4$noti === void 0 ? void 0 : _this$soundChip4$noti.call(_this$soundChip4);
        }

        progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback(index + 1, romFiles.length, file.name);

        return {
          success: true,
          file,
          error: null,
          actualCrc };

      } catch (error) {
        console.error(`[ROM FAIL] ${file.name}`, error);

        return {
          success: false,
          file,
          error,
          actualCrc: null };

      }
    }));


    const failed = results.filter(result => !result.success);
    const failedFiles = failed.map(result => result.file.name);
    const criticalMissing = failed.some(result => result.file.critical);
    const successCount = results.length - failed.length;

    // Runs only after every ROM fetch/copy attempt has completed.
    this.initPaletteFromProm();
    this.buildTileCache();
    if (failed.length > 0) {
      console.warn(
      `[ROM LOAD] ${failed.length}/${results.length} ROM file(s) failed:`,
      failed.map(result => {var _result$file$offset, _result$error$message, _result$error;return {
          name: result.file.name,
          target: result.file.target,
          offset: (_result$file$offset = result.file.offset) !== null && _result$file$offset !== void 0 ? _result$file$offset : 0,
          error: (_result$error$message = (_result$error = result.error) === null || _result$error === void 0 ? void 0 : _result$error.message) !== null && _result$error$message !== void 0 ? _result$error$message : "unknown error" };}));


    }
    if (criticalMissing) {
      console.error("[ROM LOAD] Critical ROM(s) missing:", failedFiles);
    }
    const rom50 = results.find(result => {var _result$file;return ((_result$file = result.file) === null || _result$file === void 0 ? void 0 : _result$file.name) === "50xx.bin";});
    if (rom50 !== null && rom50 !== void 0 && rom50.success) {
      this.movementMcu1.loadROM(this.mcuRom50);
      this.movementMcu2.loadROM(this.mcuRom50);
    } else {
      console.warn(
      "[50XX] 50xx.bin not found — movement MCUs use behavioral fallback");

    }
    const rom51 = results.find(result => {var _result$file2;return ((_result$file2 = result.file) === null || _result$file2 === void 0 ? void 0 : _result$file2.name) === "51xx.bin";});
    if (rom51 !== null && rom51 !== void 0 && rom51.success) {
      this.inputController.loadROM(this.mcuRom51);
    } else {
      console.warn(
      "[51XX] 51xx.bin not found — input controller uses behavioral fallback");

    }
    const rom52 = results.find(result => {var _result$file3;return ((_result$file3 = result.file) === null || _result$file3 === void 0 ? void 0 : _result$file3.name) === "52xx.bin";});
    if (rom52 !== null && rom52 !== void 0 && rom52.success) {
      this.voiceChip.loadROM(this.mcuRom52);
    } else {
      console.warn(
      "[52XX] 52xx.bin not found — voice playback uses behavioral fallback");

    }
    const voiceSamplesLoaded = ["bos1_9.5n", "bos1_10.5m", "bos1_11.5k"].every(
    name => {var _results$find;return (_results$find = results.find(result => {var _result$file4;return ((_result$file4 = result.file) === null || _result$file4 === void 0 ? void 0 : _result$file4.name) === name;})) === null || _results$find === void 0 ? void 0 : _results$find.success;});

    if (voiceSamplesLoaded) {var _this$voiceChip$loadS, _this$voiceChip7;
      (_this$voiceChip$loadS = (_this$voiceChip7 = this.voiceChip).loadSamples) === null || _this$voiceChip$loadS === void 0 ? void 0 : _this$voiceChip$loadS.call(_this$voiceChip7, this.voiceRom);
    } else {
      console.warn(
      "[52XX] Voice sample ROMs incomplete — speech will be silent/fallback");

    }
    const rom54 = results.find(result => {var _result$file5;return ((_result$file5 = result.file) === null || _result$file5 === void 0 ? void 0 : _result$file5.name) === "54xx.bin";});
    if (rom54 !== null && rom54 !== void 0 && rom54.success) {
      this.namco54xx.loadROM(this.mcuRom54);
    } else {
      console.warn("[54XX] 54xx.bin not found — using behavioral fallback");
    }
    return {
      successCount,
      failedFiles,
      criticalMissing };

  }}_defineProperty(BoscoEmulator, "NAMCO52XX_TC_PERIOD_TICKS", Math.round(0.6931471805599453 * (33000 + 2 * 10000) * 0.0047e-6 * BoscoTimingSequencer.MASTER_CLOCK));_defineProperty(BoscoEmulator, "SPRITE_GROUP_OFFSET", [8, 16, 24, 0]);

class BoscoApp {
  constructor() {
    this.config = new EmulatorConfig();
    this.ui = new UIManager(this.config);
    this.input = new InputManager(this.config);
    this.emulator = new BoscoEmulator(this.config);
    this.touchpads = null;
    this.animationId = null;
    this.lastFrameTime = 0;
    this.frameAccum = 0;
    this.fatalError = false;
    this.TARGET_MS = 1000 / this.config.performance.targetFPS;
    this.MAX_DELTA = 100;
    this.MAX_STEPS = 6;
    this.WATCHDOG_WARN = 6;
    this.gameLoop = this.gameLoop.bind(this);
  }
  static formatError(error) {
    if (error instanceof Error) {
      let text = `${error.name}: ${error.message || "(no message)"}`;

      if (error.cause) {
        text += `\nCause: ${BoscoApp.formatError(error.cause)}`;
      }

      return text;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error == null) {
      return "Unknown error";
    }

    try {
      const details = {};

      for (const key of Object.getOwnPropertyNames(error)) {
        details[key] = String(error[key]);
      }

      return JSON.stringify(details);
    } catch {
      return String(error);
    }
  }
  async init() {var _this$touchpads, _this$config$input$to;
    if (!this.ui.initCanvas("gameCanvas")) {
      throw new Error("Canvas element #gameCanvas not found");
    }
    const roms = await this.emulator.loadRoms();
    if (roms.criticalMissing) {
      throw new Error(`Critical ROMs missing: ${roms.failedFiles.join(", ")}`);
    }
    this.emulator.reset();
    this.emulator.connectInput(this.input);
    this.input.setupKeyboardControls();
    const container = document.getElementById("gameContainer");
    this.input.setupTouchControls(container);
    (_this$touchpads = this.touchpads) === null || _this$touchpads === void 0 ? void 0 : _this$touchpads.destroy();
    this.touchpads = new Touchpads(this.input, {
      deadzone: (_this$config$input$to = this.config.input.touchDeadzone) !== null && _this$config$input$to !== void 0 ? _this$config$input$to : 20,
      dpadRadius: 82,
      ringRadius: 18 });

    this.emulator.soundChip.initAudio();
    return true;
  }
  gameLoop() {
    if (!this.emulator.running || this.fatalError) {
      this.animationId = null;
      return;
    }
    const now = performance.now();
    const delta = Math.min(now - this.lastFrameTime, this.MAX_DELTA);
    this.lastFrameTime = now;
    this.frameAccum += delta;
    try {
      let stepsRun = 0;

      while (this.frameAccum >= this.TARGET_MS && stepsRun < this.MAX_STEPS) {
        this.frameAccum -= this.TARGET_MS;
        this.emulator.step();
        stepsRun++;
      }
      if (stepsRun > 0) {var _this$ui$updateStatus, _this$ui, _ref10, _this$emulator$mainCp, _this$emulator$mainCp2, _this$emulator$mainCp3, _this$emulator$mainCp4, _ref11, _this$emulator$subCpu, _this$emulator$subCpu2, _this$emulator$subCpu3, _this$emulator$subCpu4, _ref12, _this$emulator$sub2Cp, _this$emulator$sub2Cp2, _this$emulator$sub2Cp3, _this$emulator$sub2Cp4;
        const ctx = this.ui.getContext();
        if (!ctx) {
          throw new Error("Canvas context is not initialized");
        }
        this.ui.beginFrame();
        this.emulator.render(ctx);
        this.ui.endFrame();
        (_this$ui$updateStatus = (_this$ui = this.ui).updateStatusBar) === null || _this$ui$updateStatus === void 0 ? void 0 : _this$ui$updateStatus.call(_this$ui, this.emulator.frameCounter, {
          mainPC: (_ref10 = (_this$emulator$mainCp = (_this$emulator$mainCp2 =
          this.emulator.mainCpu) === null || _this$emulator$mainCp2 === void 0 ? void 0 : (_this$emulator$mainCp3 = _this$emulator$mainCp2.getPC) === null || _this$emulator$mainCp3 === void 0 ? void 0 : _this$emulator$mainCp3.call(_this$emulator$mainCp2)) !== null && _this$emulator$mainCp !== void 0 ? _this$emulator$mainCp : (_this$emulator$mainCp4 = this.emulator.mainCpu) === null || _this$emulator$mainCp4 === void 0 ? void 0 : _this$emulator$mainCp4.PC) !== null && _ref10 !== void 0 ? _ref10 : 0,

          subPC: (_ref11 = (_this$emulator$subCpu = (_this$emulator$subCpu2 =
          this.emulator.subCpu) === null || _this$emulator$subCpu2 === void 0 ? void 0 : (_this$emulator$subCpu3 = _this$emulator$subCpu2.getPC) === null || _this$emulator$subCpu3 === void 0 ? void 0 : _this$emulator$subCpu3.call(_this$emulator$subCpu2)) !== null && _this$emulator$subCpu !== void 0 ? _this$emulator$subCpu : (_this$emulator$subCpu4 = this.emulator.subCpu) === null || _this$emulator$subCpu4 === void 0 ? void 0 : _this$emulator$subCpu4.PC) !== null && _ref11 !== void 0 ? _ref11 : 0,

          soundPC: (_ref12 = (_this$emulator$sub2Cp = (_this$emulator$sub2Cp2 =
          this.emulator.sub2Cpu) === null || _this$emulator$sub2Cp2 === void 0 ? void 0 : (_this$emulator$sub2Cp3 = _this$emulator$sub2Cp2.getPC) === null || _this$emulator$sub2Cp3 === void 0 ? void 0 : _this$emulator$sub2Cp3.call(_this$emulator$sub2Cp2)) !== null && _this$emulator$sub2Cp !== void 0 ? _this$emulator$sub2Cp : (_this$emulator$sub2Cp4 = this.emulator.sub2Cpu) === null || _this$emulator$sub2Cp4 === void 0 ? void 0 : _this$emulator$sub2Cp4.PC) !== null && _ref12 !== void 0 ? _ref12 : 0 });

        if (this.emulator.watchdogTimer >= this.WATCHDOG_WARN) {var _this$ui$showWarning, _this$ui2;
          (_this$ui$showWarning = (_this$ui2 = this.ui).showWarning) === null || _this$ui$showWarning === void 0 ? void 0 : _this$ui$showWarning.call(_this$ui2,
          "Watchdog nearing timeout — CPU may be stalled");

        }
      }
    } catch (error) {
      this.abort(error);
      return;
    }
    this.animationId = requestAnimationFrame(this.gameLoop);
  }
  start() {
    if (this.emulator.running || this.fatalError) {
      return;
    }

    this.emulator.running = true;

    this.lastFrameTime = performance.now();
    this.frameAccum = 0;

    this.animationId = requestAnimationFrame(this.gameLoop);
  }
  stop() {
    this.emulator.running = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  reset({ restart = true } = {}) {
    this.stop();

    this.fatalError = false;
    this.frameAccum = 0;
    this.lastFrameTime = 0;

    this.emulator.reset();

    if (restart) {
      this.start();
    }
  }
  abort(error) {var _this$emulator$frameC, _this$emulator, _this$ui$showError, _this$ui3;
    if (this.fatalError) {
      return;
    }

    this.fatalError = true;
    this.stop();

    const message = BoscoApp.formatError(error);

    const frame = (_this$emulator$frameC = (_this$emulator = this.emulator) === null || _this$emulator === void 0 ? void 0 : _this$emulator.frameCounter) !== null && _this$emulator$frameC !== void 0 ? _this$emulator$frameC : 0;

    const displayText = `FATAL ERROR — frame ${frame}\n${message}`;

    console.error("[JSBosco] FATAL:", {
      frame,
      error,
      message,
      stack: error instanceof Error ? error.stack : null });


    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = displayText;
      statusBar.className = "error";
    }

    (_this$ui$showError = (_this$ui3 = this.ui).showError) === null || _this$ui$showError === void 0 ? void 0 : _this$ui$showError.call(_this$ui3, displayText);
  }}


let app = null;
window.JSBosco = {
  get app() {
    return app;
  },

  get emulator() {var _app$emulator, _app;
    return (_app$emulator = (_app = app) === null || _app === void 0 ? void 0 : _app.emulator) !== null && _app$emulator !== void 0 ? _app$emulator : null;
  },

  start() {var _app2;
    (_app2 = app) === null || _app2 === void 0 ? void 0 : _app2.start();
  },

  stop() {var _app3;
    (_app3 = app) === null || _app3 === void 0 ? void 0 : _app3.stop();
  },

  reset() {var _app4;
    (_app4 = app) === null || _app4 === void 0 ? void 0 : _app4.reset({ restart: true });
  },

  resetStopped() {var _app5;
    (_app5 = app) === null || _app5 === void 0 ? void 0 : _app5.reset({ restart: false });
  } };

async function initApp() {
  try {var _app6, _app7, _app7$touchpads, _app8, _app8$input, _app8$input$destroy;
    (_app6 = app) === null || _app6 === void 0 ? void 0 : _app6.stop();
    (_app7 = app) === null || _app7 === void 0 ? void 0 : (_app7$touchpads = _app7.touchpads) === null || _app7$touchpads === void 0 ? void 0 : _app7$touchpads.destroy();
    (_app8 = app) === null || _app8 === void 0 ? void 0 : (_app8$input = _app8.input) === null || _app8$input === void 0 ? void 0 : (_app8$input$destroy = _app8$input.destroy) === null || _app8$input$destroy === void 0 ? void 0 : _app8$input$destroy.call(_app8$input);

    app = new BoscoApp();

    const initialized = await app.init();

    if (initialized) {
      app.start();
    }
  } catch (error) {
    console.error("[JSBosco] Initialization failed:", error);

    if (app) {
      app.abort(error);
      return;
    }

    const text = BoscoApp.formatError(error);

    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = `FATAL ERROR: ${text}`;

      statusBar.className = "error";
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initApp(), {
    once: true });

} else {
  void initApp();
}