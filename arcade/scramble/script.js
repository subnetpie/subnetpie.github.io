//===========================================================
// Scramble Emulator
//===========================================================
class Z80 {
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
    this.memRead = memRead || ((addr) => 0xff);
    this.memWrite = memWrite || ((addr, data) => {});
    this.ioRead = ioRead || ((port) => 0xff);
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
      ["HL_", "H_", "L_"]
    ];
    pairs.forEach(([name, hi, lo]) => {
      Object.defineProperty(this, name, {
        get() {
          return ((this[hi] << 8) | this[lo]) & 0xffff;
        },
        set(val) {
          this[hi] = (val >> 8) & 0xff;
          this[lo] = val & 0xff;
        }
      });
    });
  }
  buildDAATable() {
    this.daaTable = new Uint16Array(2048);

    for (let i = 0; i < 2048; i++) {
      const a = i & 0xff;
      const f = (i >>> 8) & 0xff;
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
        (newCarry ? 0x01 : 0) |
        (n ? 0x02 : 0) |
        (this.parityTable[r] ? 0x04 : 0) |
        (r & 0x28) |
        ((a ^ r) & 0x10 ? 0x10 : 0) |
        (r === 0 ? 0x40 : 0) |
        (r & 0x80);

      this.daaTable[i] = (newF << 8) | r;
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
    const hi = this.read8((addr + 1) & 0xffff);
    return (hi << 8) | lo;
  }
  write16(addr, val) {
    this.write8(addr, val & 0xff);
    this.write8((addr + 1) & 0xffff, (val >> 8) & 0xff);
  }
  push16(val) {
    this.SP = (this.SP - 1) & 0xffff;
    this.write8(this.SP, (val >> 8) & 0xff);
    this.SP = (this.SP - 1) & 0xffff;
    this.write8(this.SP, val & 0xff);
  }
  pop16() {
    const lo = this.read8(this.SP);
    this.SP = (this.SP + 1) & 0xffff;
    const hi = this.read8(this.SP);
    this.SP = (this.SP + 1) & 0xffff;
    return (hi << 8) | lo;
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

      case 2: {
        const vectorAddress = ((this.I << 8) | (busByte & 0xfe)) & 0xffff;
        const handler = this.read16(vectorAddress);

        this.push16(this.PC);
        this.PC = handler;
        this.MEMPTR = handler;
        return 19;
      }

      default:
        throw new Error(`Invalid Z80 interrupt mode: ${this.IM}`);
    }
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
        this.PC = (this.PC + 2) & 0xffff;
        return 10;
      case 0x02:
        this.write8(this.BC, this.A);
        this.MEMPTR = ((this.A << 8) | ((this.BC + 1) & 0xff)) & 0xffff;
        return 7;
      case 0x03:
        this.BC = (this.BC + 1) & 0xffff;
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
        this.MEMPTR = (this.BC + 1) & 0xffff;
        return 7;
      case 0x0b:
        this.BC = (this.BC - 1) & 0xffff;
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
      case 0x10: {
        // DJNZ e
        const e = this.read8(this.PC++);
        // sign-extend 8-bit displacement
        const disp = (e << 24) >> 24;
        this.B = (this.B - 1) & 0xff;
        if (this.B !== 0) {
          this.PC = (this.PC + disp) & 0xffff;
          return 13; // taken
        }
        return 8; // not taken
      }
      case 0x11:
        this.DE = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        return 10;
      case 0x12:
        this.write8(this.DE, this.A);
        this.MEMPTR = ((this.A << 8) | ((this.DE + 1) & 0xff)) & 0xffff;
        return 7;
      case 0x13:
        this.DE = (this.DE + 1) & 0xffff;
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
      case 0x18: {
        const e = this.read8(this.PC++);
        this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
        this.MEMPTR = this.PC;
        return 12;
      }
      case 0x19:
        this.HL = this.add16(this.HL, this.DE);
        return 11;
      case 0x1a:
        this.A = this.read8(this.DE);
        this.MEMPTR = (this.DE + 1) & 0xffff;
        return 7;
      case 0x1b:
        this.DE = (this.DE - 1) & 0xffff;
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
      case 0x20: {
        const e = this.read8(this.PC++);
        if (!(this.F & 0x40)) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x21:
        this.HL = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        return 10;
      case 0x22: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write16(addr, this.HL);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 16;
      }
      case 0x23:
        this.HL = (this.HL + 1) & 0xffff;
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
      case 0x28: {
        const e = this.read8(this.PC++);
        if (this.F & 0x40) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x29:
        this.HL = this.add16(this.HL, this.HL);
        return 11;
      case 0x2a: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.HL = this.read16(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 16;
      }
      case 0x2b:
        this.HL = (this.HL - 1) & 0xffff;
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
        this.F = (this.F & 0xc5) | 0x12 | (this.A & 0x28);
        return 4;
      case 0x30: {
        const e = this.read8(this.PC++);
        if (!(this.F & 0x01)) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x31:
        this.SP = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        return 10;
      case 0x32: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write8(addr, this.A);
        this.MEMPTR = ((this.A << 8) | ((addr + 1) & 0xff)) & 0xffff;
        return 13;
      }
      case 0x33:
        this.SP = (this.SP + 1) & 0xffff;
        return 6;
      case 0x34: {
        const v = this.inc8(this.read8(this.HL));
        this.write8(this.HL, v);
        return 11;
      }
      case 0x35: {
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
      case 0x38: {
        const e = this.read8(this.PC++);
        if (this.F & 0x01) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x39:
        this.HL = this.add16(this.HL, this.SP);
        return 11;
      case 0x3a: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.A = this.read8(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 13;
      }
      case 0x3b:
        this.SP = (this.SP - 1) & 0xffff;
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
      case 0xc0: {
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
      case 0xc2: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (!(this.F & 0x40)) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xc3: {
        const addr = this.read16(this.PC);
        this.PC = addr;
        this.MEMPTR = addr;
        return 10;
      }
      case 0xc4: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xc8: {
        if (this.F & 0x40) {
          const retSP = this.SP;
          this.PC = this.pop16();
          this.maybeCompleteNmiReturn(retSP);
          this.MEMPTR = this.PC;
          return 11;
        }
        return 5;
      }
      case 0xc9: {
        const retSP = this.SP;
        this.PC = this.pop16();
        this.maybeCompleteNmiReturn(retSP);
        this.MEMPTR = this.PC;
        return 10;
      }
      case 0xca: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (this.F & 0x40) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xcc: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (this.F & 0x40) {
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
        return 10;
      }
      case 0xcd: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xd0: {
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
      case 0xd2: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (!(this.F & 0x01)) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xd3: {
        const port = this.read8(this.PC++);
        this.ioWrite((this.A << 8) | port, this.A);
        this.MEMPTR = ((this.A << 8) | ((port + 1) & 0xff)) & 0xffff;
        return 11;
      }
      case 0xd4: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xd8: {
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
      case 0xda: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (this.F & 0x01) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xdb: {
        const port = this.read8(this.PC++);
        const oldA = this.A;
        this.A = this.ioRead((oldA << 8) | port);
        this.MEMPTR = ((oldA << 8) | ((port + 1) & 0xff)) & 0xffff;
        return 11;
      }
      case 0xdc: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xe0: {
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
      case 0xe2: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (!(this.F & 0x04)) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xe3: {
        const tmp = this.read16(this.SP);
        this.write16(this.SP, this.HL);
        this.HL = tmp;
        this.MEMPTR = tmp;
        return 19;
      }
      case 0xe4: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xe8: {
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
      case 0xea: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        if (this.F & 0x04) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xeb: {
        const tmp = this.DE;
        this.DE = this.HL;
        this.HL = tmp;
        return 4;
      }
      case 0xec: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xf0: {
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
      case 0xf2: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xf4: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xf8: {
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
      case 0xfa: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
      case 0xfc: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
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
        return 4;
    }
  }
  executeIndexed(op, reg) {
    const getIXY = () => (reg === "IX" ? this.IX : this.IY);
    const setIXY = (v) => (reg === "IX" ? (this.IX = v) : (this.IY = v));
    const getH = () =>
      reg === "IX" ? (this.IX >> 8) & 0xff : (this.IY >> 8) & 0xff;
    const setH = (v) =>
      reg === "IX"
        ? (this.IX = (this.IX & 0x00ff) | ((v & 0xff) << 8))
        : (this.IY = (this.IY & 0x00ff) | ((v & 0xff) << 8));
    const getL = () => (reg === "IX" ? this.IX & 0xff : this.IY & 0xff);
    const setL = (v) =>
      reg === "IX"
        ? (this.IX = (this.IX & 0xff00) | (v & 0xff))
        : (this.IY = (this.IY & 0xff00) | (v & 0xff));
    switch (op) {
      case 0x09:
        setIXY(this.add16(getIXY(), this.BC));
        return 15;
      case 0x19:
        setIXY(this.add16(getIXY(), this.DE));
        return 15;
      case 0x21:
        setIXY(this.read16(this.PC));
        this.PC = (this.PC + 2) & 0xffff;
        return 14;
      case 0x22: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write16(addr, getIXY());
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x23:
        setIXY((getIXY() + 1) & 0xffff);
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
      case 0x2a: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        setIXY(this.read16(addr));
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x2b:
        setIXY((getIXY() - 1) & 0xffff);
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
      case 0x34: {
        const d = this.read8(this.PC++);
        const addr = (getIXY() + ((d << 24) >> 24)) & 0xffff;
        this.write8(addr, this.inc8(this.read8(addr)));
        return 23;
      }
      case 0x35: {
        const d = this.read8(this.PC++);
        const addr = (getIXY() + ((d << 24) >> 24)) & 0xffff;
        this.write8(addr, this.dec8(this.read8(addr)));
        return 23;
      }
      case 0x36: {
        const d = this.read8(this.PC++);
        const n = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, n);
        return 19;
      }
      case 0x39:
        setIXY(this.add16(getIXY(), this.SP));
        return 15;
      case 0x46: {
        const d = this.read8(this.PC++);
        this.B = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x4e: {
        const d = this.read8(this.PC++);
        this.C = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x56: {
        const d = this.read8(this.PC++);
        this.D = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x5e: {
        const d = this.read8(this.PC++);
        this.E = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x66: {
        const d = this.read8(this.PC++);
        this.H = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x6e: {
        const d = this.read8(this.PC++);
        this.L = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x7e: {
        const d = this.read8(this.PC++);
        this.A = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x70: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.B);
        return 19;
      }
      case 0x71: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.C);
        return 19;
      }
      case 0x72: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.D);
        return 19;
      }
      case 0x73: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.E);
        return 19;
      }
      case 0x74: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.H);
        return 19;
      }
      case 0x75: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.L);
        return 19;
      }
      case 0x77: {
        const d = this.read8(this.PC++);
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.A);
        return 19;
      }
      case 0x86: {
        const d = this.read8(this.PC++);
        this.add8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x8e: {
        const d = this.read8(this.PC++);
        this.adc8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x96: {
        const d = this.read8(this.PC++);
        this.sub8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x9e: {
        const d = this.read8(this.PC++);
        this.sbc8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xa6: {
        const d = this.read8(this.PC++);
        this.and8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xae: {
        const d = this.read8(this.PC++);
        this.xor8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xb6: {
        const d = this.read8(this.PC++);
        this.or8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xbe: {
        const d = this.read8(this.PC++);
        this.cp8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xe1:
        setIXY(this.pop16());
        return 14;
      case 0xe3: {
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
        return 4 + this.executeBase(op);
    }
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
        return this.executeBase(op);
    }
  }
  bitTest(bit, v, yxSource) {
    this.QT = 0;
    const res = v & (1 << bit);
    this.F =
      (this.F & 0x01) |
      0x10 |
      (res & 0x80) |
      (res ? 0 : 0x40) |
      (this.parityTable[res ? 1 : 0] << 2) |
      (yxSource & 0x28);
  }
  decodeCB() {
    const op = this.read8(this.PC++);
    this.incR();
    const r = op & 0x07;
    const bit = (op >> 3) & 0x07;
    const opType = (op >> 6) & 0x03;

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
          return this.A;
      }
    };
    const setReg = (val) => {
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
          break;
      }
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
          break;
      }
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
      setReg(v | (1 << bit));
      return r === 6 ? 15 : 8;
    }
  }
  decodeIndexCB(base) {
    const d = this.read8(this.PC++);
    const op = this.read8(this.PC++);
    const addr = (base + ((d << 24) >> 24)) & 0xffff;

    // Mirrors z80.lst @eax/@eay: WZ (MEMPTR) is set to the effective address
    // for EVERY DD CB / FD CB instruction, not just BIT. This keeps MEMPTR
    // correct for any *later* plain "BIT n,(HL)" that depends on its stale
    // value, and matches m_ea's role in bit_xy() for this instruction itself.
    this.MEMPTR = addr;

    const r = op & 0x07;
    const bit = (op >> 3) & 0x07;
    const opType = (op >> 6) & 0x03;

    const writeBackReg = (result) => {
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
          break;
      }
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
          break;
      }
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
      const result = v | (1 << bit);
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
      case 0x43: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write16(addr, this.BC);
        this.MEMPTR = (addr + 1) & 0xffff;
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
      case 0x4b: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.BC = this.read16(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
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
      case 0x53: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write16(addr, this.DE);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x56:
        this.IM = 1;
        return 8;
      case 0x57:
        this.QT = 0;
        this.A = this.I;
        this.F =
          (this.F & 0x01) |
          (this.A & 0xa8) |
          (this.A ? 0 : 0x40) |
          (this.IFF2 ? 0x04 : 0);
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
      case 0x5b: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.DE = this.read16(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x5e:
        this.IM = 2;
        return 8;
      case 0x5f:
        this.QT = 0;
        this.A = this.R;
        this.F =
          (this.F & 0x01) |
          (this.A & 0xa8) |
          (this.A ? 0 : 0x40) |
          (this.IFF2 ? 0x04 : 0);
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
      case 0x70: {
        this.inPort(this.BC);
        return 12;
      }
      case 0x71:
        this.outPort(this.BC, 0);
        return 12;
      case 0x72:
        this.HL = this.sbc16(this.HL, this.SP);
        return 15;
      case 0x73: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.write16(addr, this.SP);
        this.MEMPTR = (addr + 1) & 0xffff;
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
      case 0x7b: {
        const addr = this.read16(this.PC);
        this.PC = (this.PC + 2) & 0xffff;
        this.SP = this.read16(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
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
        return 8;
    }
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
    const res = (v + 1) & 0xff;
    this.F =
      (this.F & 0x01) |
      (res & 0xa8) |
      (res ? 0 : 0x40) |
      ((v & 0x0f) === 0x0f ? 0x10 : 0) |
      (v === 0x7f ? 0x04 : 0);
    return res;
  }
  dec8(v) {
    this.QT = 0;
    const res = (v - 1) & 0xff;
    this.F =
      (this.F & 0x01) |
      0x02 |
      (res & 0xa8) |
      (res ? 0 : 0x40) |
      ((v & 0x0f) === 0 ? 0x10 : 0) |
      (v === 0x80 ? 0x04 : 0);
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
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
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
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
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
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
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
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
      0x02 |
      carry;
  }
  and8(v) {
    this.QT = 0;
    this.A &= v;
    this.F =
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      0x10 |
      (this.parityTable[this.A] << 2);
  }
  xor8(v) {
    this.QT = 0;
    this.A ^= v;
    this.F =
      (this.A & 0xa8) | (this.A ? 0 : 0x40) | (this.parityTable[this.A] << 2);
  }
  or8(v) {
    this.QT = 0;
    this.A |= v;
    this.F =
      (this.A & 0xa8) | (this.A ? 0 : 0x40) | (this.parityTable[this.A] << 2);
  }
  cp8(v) {
    this.QT = 0;
    const res = this.A - v;
    const carry = res < 0 ? 1 : 0;
    const halfCarry = (this.A & 0x0f) - (v & 0x0f) < 0 ? 1 : 0;
    const overflow = ((this.A ^ v) & (this.A ^ res) & 0x80) !== 0 ? 1 : 0;
    this.F =
      (res & 0xff & 0x80) |
      (v & 0x28) |
      (res & 0xff ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
      0x02 |
      carry;
  }
  rlca() {
    this.QT = 0;
    const carry = (this.A >> 7) & 1;
    this.A = ((this.A << 1) | carry) & 0xff;
    this.F = (this.F & 0xc4) | (this.A & 0x28) | carry;
  }
  rrca() {
    this.QT = 0;
    const carry = this.A & 1;
    this.A = ((this.A >> 1) | (carry << 7)) & 0xff;
    this.F = (this.F & 0xc4) | (this.A & 0x28) | carry;
  }
  rla() {
    this.QT = 0;
    const carry = (this.A >> 7) & 1;
    this.A = ((this.A << 1) | (this.F & 1)) & 0xff;
    this.F = (this.F & 0xc4) | (this.A & 0x28) | carry;
  }
  rra() {
    this.QT = 0;
    const carry = this.A & 1;
    this.A = ((this.A >> 1) | ((this.F & 1) << 7)) & 0xff;
    this.F = (this.F & 0xc4) | (this.A & 0x28) | carry;
  }
  rlc(v) {
    this.QT = 0;
    const carry = (v >> 7) & 1;
    const res = ((v << 1) | carry) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  rrc(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = ((v >> 1) | (carry << 7)) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  rl(v) {
    this.QT = 0;
    const carry = (v >> 7) & 1;
    const res = ((v << 1) | (this.F & 1)) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  rr(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = ((v >> 1) | ((this.F & 1) << 7)) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  sla(v) {
    this.QT = 0;
    const carry = (v >> 7) & 1;
    const res = (v << 1) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  sra(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = ((v >> 1) | (v & 0x80)) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  sll(v) {
    this.QT = 0;
    const carry = (v >> 7) & 1;
    const res = ((v << 1) | 1) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  srl(v) {
    this.QT = 0;
    const carry = v & 1;
    const res = (v >> 1) & 0xff;
    this.F =
      (res & 0xa8) | (res ? 0 : 0x40) | (this.parityTable[res] << 2) | carry;
    return res;
  }
  daa() {
    this.QT = 0;
    const fCompressed =
      (this.F & 0x01) | (this.F & 0x02) | ((this.F & 0x10) >> 2);
    const idx = (this.A & 0xff) | (fCompressed << 8);
    const val = this.daaTable[idx];
    this.A = val & 0xff;
    this.F = (val >> 8) & 0xff;
  }
  neg() {
    this.QT = 0;
    const a = this.A;
    this.A = -a & 0xff;
    this.F =
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (a & 0x0f ? 0x10 : 0) |
      (a === 0x80 ? 0x04 : 0) |
      0x02 |
      (a ? 0x01 : 0);
  }
  add16(a, b) {
    this.QT = 0;
    const res = a + b;
    const carry = res > 0xffff ? 1 : 0;
    const halfCarry = (a & 0x0fff) + (b & 0x0fff) > 0x0fff ? 1 : 0;
    this.F =
      (this.F & 0xc4) | ((res >> 8) & 0xff & 0x28) | (halfCarry << 4) | carry;
    this.MEMPTR = (a + 1) & 0xffff;
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
      ((result >> 8) & 0xa8) |
      (result ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
      carry;
    this.MEMPTR = (a + 1) & 0xffff;
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
      ((result >> 8) & 0xa8) |
      (result ? 0 : 0x40) |
      (overflow << 2) |
      (halfCarry << 4) |
      0x02 |
      carry;
    this.MEMPTR = (a + 1) & 0xffff;
    return result;
  }
  scf() {
    this.QT = 0;
    const oldYx = this.F & 0x28;
    const newYx = ((oldYx & this.Q) | this.A) & 0x28;
    // keep S,Z,P/V (0xc4); clear H,N; set C; apply computed Y/X
    this.F = (this.F & 0xc4) | newYx | 0x01;
  }
  ccf() {
    this.QT = 0;
    const oldYx = this.F & 0x28;
    const newYx = ((oldYx & this.Q) | this.A) & 0x28;
    const oldCarry = this.F & 0x01;
    // keep S,Z,P/V (0xc4); H becomes old carry; N clear; C inverted; apply Y/X
    this.F = (this.F & 0xc4) | newYx | (oldCarry << 4) | (oldCarry ^ 0x01);
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
      retSP === this.nmiReturnSP
    ) {
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
    this.A = (a & 0xf0) | ((hl >> 4) & 0x0f);
    this.write8(this.HL, ((hl << 4) | (a & 0x0f)) & 0xff);
    this.F =
      (this.F & 0x01) |
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (this.parityTable[this.A] << 2);
    this.MEMPTR = (this.HL + 1) & 0xffff;
  }
  rrd() {
    this.QT = 0;
    const hl = this.read8(this.HL);
    const a = this.A;
    this.A = (a & 0xf0) | (hl & 0x0f);
    this.write8(this.HL, ((hl >> 4) | ((a & 0x0f) << 4)) & 0xff);
    this.F =
      (this.F & 0x01) |
      (this.A & 0xa8) |
      (this.A ? 0 : 0x40) |
      (this.parityTable[this.A] << 2);
    this.MEMPTR = (this.HL + 1) & 0xffff;
  }
  inPort(port) {
    this.QT = 0;
    const val = this.ioRead(port);
    this.F =
      (this.F & 0x01) |
      (val & 0xa8) |
      (val ? 0 : 0x40) |
      (this.parityTable[val] << 2);
    this.MEMPTR = (port + 1) & 0xffff;
    return val;
  }
  outPort(port, val) {
    this.QT = 0;
    this.ioWrite(port, val);
    this.MEMPTR = (port + 1) & 0xffff;
  }
  ldi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    this.write8(this.DE, val);
    this.HL = (this.HL + 1) & 0xffff;
    this.DE = (this.DE + 1) & 0xffff;
    this.BC = (this.BC - 1) & 0xffff;
    const n = (val + this.A) & 0xff;
    this.F =
      (this.F & 0xc1) | (this.BC ? 0x04 : 0) | (n & 0x08) | ((n & 0x02) << 4);
    return 16;
  }
  ldir() {
    this.ldi();
    if (this.BC !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.MEMPTR = (this.PC + 1) & 0xffff;
      return 21;
    }
    return 16;
  }
  ldd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    this.write8(this.DE, val);
    this.HL = (this.HL - 1) & 0xffff;
    this.DE = (this.DE - 1) & 0xffff;
    this.BC = (this.BC - 1) & 0xffff;
    const n = (val + this.A) & 0xff;
    this.F =
      (this.F & 0xc1) | (this.BC ? 0x04 : 0) | (n & 0x08) | ((n & 0x02) << 4);
    return 16;
  }
  incR() {
    this.R = (this.R & 0x80) | ((this.R + 1) & 0x7f);
  }
  lddr() {
    this.ldd();
    if (this.BC !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.MEMPTR = (this.PC + 1) & 0xffff;
      return 21;
    }
    return 16;
  }
  cpi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const res = (this.A - val) & 0xff;
    this.HL = (this.HL + 1) & 0xffff;
    this.BC = (this.BC - 1) & 0xffff;
    const hf = (this.A & 0x0f) - (val & 0x0f) < 0 ? 1 : 0;
    const n = (res - hf) & 0xff;
    this.F =
      (res & 0x80) |
      (res ? 0 : 0x40) |
      (this.BC ? 0x04 : 0) |
      0x02 |
      (hf << 4) |
      (n & 0x08) |
      ((n & 0x02) << 4) |
      (this.F & 0x01);
    this.MEMPTR = (this.MEMPTR + 1) & 0xffff;
    return 16;
  }
  cpir() {
    this.cpi();
    if (this.BC !== 0 && !(this.F & 0x40)) {
      this.PC = (this.PC - 2) & 0xffff;
      this.MEMPTR = (this.PC + 1) & 0xffff;
      return 21;
    }
    return 16;
  }
  cpd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const res = (this.A - val) & 0xff;
    this.HL = (this.HL - 1) & 0xffff;
    this.BC = (this.BC - 1) & 0xffff;
    const hf = (this.A & 0x0f) - (val & 0x0f) < 0 ? 1 : 0;
    const n = (res - hf) & 0xff;
    this.F =
      (res & 0x80) |
      (res ? 0 : 0x40) |
      (this.BC ? 0x04 : 0) |
      0x02 |
      (hf << 4) |
      (n & 0x08) |
      ((n & 0x02) << 4) |
      (this.F & 0x01);
    this.MEMPTR = (this.MEMPTR - 1) & 0xffff;
    return 16;
  }
  cpdr() {
    this.cpd();
    if (this.BC !== 0 && !(this.F & 0x40)) {
      this.PC = (this.PC - 2) & 0xffff;
      this.MEMPTR = (this.PC + 1) & 0xffff;
      return 21;
    }
    return 16;
  }
  blockIoInterruptedFlags() {
    const transferredByte = this._blockIoValue;
    const yx = (this.PC >> 8) & 0x28;
    const pvOldBit = this.F & 0x04;
    const carrySet = (this.F & 0x01) !== 0;

    let hBit = 0;
    let pvRaw;
    if (carrySet) {
      if (transferredByte & 0x80) {
        pvRaw = (this.B - 1) & 0x07;
        if ((this.B & 0x0f) === 0x00) hBit = 0x10;
      } else {
        pvRaw = (this.B + 1) & 0x07;
        if ((this.B & 0x0f) === 0x0f) hBit = 0x10;
      }
    } else {
      pvRaw = this.B & 0x07;
    }

    const newPvBit = this.parityTable[pvRaw] << 2;
    const finalPvBit = (pvOldBit ^ newPvBit) & 0x04;

    // Keep S,Z,N,C (0xC3); overwrite Y,X,H,P/V.
    this.F = (this.F & 0xc3) | yx | hBit | finalPvBit;
  }
  ini() {
    this.QT = 0;
    const originalBC = this.BC; // WZ uses BC BEFORE B is decremented
    const val = this.ioRead(originalBC);
    this.MEMPTR = (originalBC + 1) & 0xffff;
    const newB = (this.B - 1) & 0xff;
    this.write8(this.HL, val);
    this.HL = (this.HL + 1) & 0xffff;

    const t = ((this.C + 1) & 0xff) + val; // C is unchanged by this op
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[(t & 0x07) ^ newB] << 2;

    this.B = newB;
    this.F =
      (newB & 0x80) | // S
      (newB === 0 ? 0x40 : 0) | // Z
      (newB & 0x28) | // Y/X
      (carryOut ? 0x10 : 0) | // H  (same bit as C, per hardware)
      pvBit | // P/V
      (val & 0x80 ? 0x02 : 0) | // N  (bit 7 of transferred byte)
      (carryOut ? 0x01 : 0); // C

    this._blockIoValue = val; // stashed for repeat-form correction
    return 16;
  }
  ind() {
    this.QT = 0;
    const originalBC = this.BC; // WZ uses BC BEFORE B is decremented
    const val = this.ioRead(originalBC);
    this.MEMPTR = (originalBC - 1) & 0xffff;
    const newB = (this.B - 1) & 0xff;
    this.write8(this.HL, val);
    this.HL = (this.HL - 1) & 0xffff;

    const t = ((this.C - 1) & 0xff) + val; // C is unchanged by this op
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[(t & 0x07) ^ newB] << 2;

    this.B = newB;
    this.F =
      (newB & 0x80) |
      (newB === 0 ? 0x40 : 0) |
      (newB & 0x28) |
      (carryOut ? 0x10 : 0) |
      pvBit |
      (val & 0x80 ? 0x02 : 0) |
      (carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  outi() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const newB = (this.B - 1) & 0xff; // B decrements BEFORE WZ/port are formed
    this.B = newB;
    const portBC = this.BC; // now reflects decremented B
    this.MEMPTR = (portBC + 1) & 0xffff;
    this.ioWrite(portBC, val);
    this.HL = (this.HL + 1) & 0xffff;

    const t = (this.HL & 0xff) + val; // L is POST-increment here
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[(t & 0x07) ^ newB] << 2;

    this.F =
      (newB & 0x80) |
      (newB === 0 ? 0x40 : 0) |
      (newB & 0x28) |
      (carryOut ? 0x10 : 0) |
      pvBit |
      (val & 0x80 ? 0x02 : 0) |
      (carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  outd() {
    this.QT = 0;
    const val = this.read8(this.HL);
    const newB = (this.B - 1) & 0xff; // B decrements BEFORE WZ/port are formed
    this.B = newB;
    const portBC = this.BC; // now reflects decremented B
    this.MEMPTR = (portBC - 1) & 0xffff;
    this.ioWrite(portBC, val);
    this.HL = (this.HL - 1) & 0xffff;

    const t = (this.HL & 0xff) + val; // L is POST-decrement here
    const carryOut = (t & 0x100) !== 0;
    const pvBit = this.parityTable[(t & 0x07) ^ newB] << 2;

    this.F =
      (newB & 0x80) |
      (newB === 0 ? 0x40 : 0) |
      (newB & 0x28) |
      (carryOut ? 0x10 : 0) |
      pvBit |
      (val & 0x80 ? 0x02 : 0) |
      (carryOut ? 0x01 : 0);

    this._blockIoValue = val;
    return 16;
  }
  inir() {
    this.ini();
    if (this.B !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  indr() {
    this.ind();
    if (this.B !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  otir() {
    this.outi();
    if (this.B !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
  otdr() {
    this.outd();
    if (this.B !== 0) {
      this.PC = (this.PC - 2) & 0xffff;
      this.blockIoInterruptedFlags();
      return 21;
    }
    return 16;
  }
}
// ── PPI 8255 ─────────────────────────────────────────────
class PPI8255 {
 constructor(
  portARead,
  portBRead,
  portCRead,
  portAWrite,
  portBWrite,
  portCWrite
 ) {
  this.portARead = portARead ?? (() => 0xff);
  this.portBRead = portBRead ?? (() => 0xff);
  this.portCRead = portCRead ?? (() => 0xff);
  this.portAWrite = portAWrite ?? (() => {});
  this.portBWrite = portBWrite ?? (() => {});
  this.portCWrite = portCWrite ?? (() => {});
  this.control = 0x9b;
  this.latchA = 0;
  this.latchB = 0;
  this.latchC = 0;
 }

 read(offset) {
  switch (offset & 3) {
   case 0:
    return this.control & 0x10 ? this.portARead() & 0xff : this.latchA;
   case 1:
    return this.control & 0x02 ? this.portBRead() & 0xff : this.latchB;
   case 2: {
    const pc = this.portCRead() & 0xff;
    let v = 0;
    v |= this.control & 0x08 ? pc & 0xf0 : this.latchC & 0xf0;
    v |= this.control & 0x01 ? pc & 0x0f : this.latchC & 0x0f;
    return v;
   }
   case 3:
    return this.control;
  }
  return 0xff;
 }

 write(offset, data) {
  data &= 0xff;
  switch (offset & 3) {
   case 0:
    this.latchA = data;
    if (!(this.control & 0x10)) this.portAWrite(data);
    break;
   case 1:
    this.latchB = data;
    if (!(this.control & 0x02)) this.portBWrite(data);
    break;
   case 2:
    this.latchC = data;
    if (!(this.control & 0x08)) this.portCWrite(data & 0xf0);
    if (!(this.control & 0x01)) this.portCWrite(data & 0x0f);
    break;
   case 3:
    if (data & 0x80) {
     this.control = data;
     this.latchA = this.latchB = this.latchC = 0;
    } else {
     const bit = (data >> 1) & 0x07;
     if (data & 1) this.latchC |= 1 << bit;
     else this.latchC &= ~(1 << bit);
     if (!(this.control & 0x08) && bit >= 4)
      this.portCWrite(this.latchC & 0xf0);
     if (!(this.control & 0x01) && bit < 4) this.portCWrite(this.latchC & 0x0f);
    }
    break;
  }
 }
}

// ── AY-8910 ──────────────────────────────────────────────
class AY8910 {
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
  this.channels = [];
  this.masterGain = null;
  this._started = false;

  this._envPhase = 0;
  this._envClock = 0;
  this._envTrigger = false;

  this._noiseClock = 0;
  this._noiseBit = 1;
  this._noiseShift = 1;

  /*
   * Noise duty cycle over the most recently processed tick() window,
   * expressed as a 0-1 fraction of "on" LFSR steps. Replaces sampling a
   * single stale bit once per emulated frame, which effectively froze
   * the noise channel's on/off state for the entire ~16.7 ms audio
   * buffer and made noise-driven effects (explosions, enemy fire)
   * sound like intermittent clicking instead of static.
   */
  this._noiseDuty = 0;

  if (!audioCtx) return;

  /*
   * Expose the actual output node for diagnostics or an external mixer.
   * The earlier ay1OutputFound diagnostic missed this because it only
   * looked for "output", "node", "gain", etc.
   */
  this.output = audioCtx.createGain();
  this.masterGain = this.output;

  /*
   * Per-chip gain. Each AY internally sums up to three square oscillators.
   * 0.15 is conservative; tune only after correct playback is confirmed.
   */
  this.masterGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  this.masterGain.connect(audioCtx.destination);

  this.channels = Array.from({ length: 3 }, (_, index) => {
   const osc = audioCtx.createOscillator();
   const gain = audioCtx.createGain();

   osc.type = "square";
   osc.frequency.setValueAtTime(440, audioCtx.currentTime);
   gain.gain.setValueAtTime(0, audioCtx.currentTime);

   osc.connect(gain);
   gain.connect(this.masterGain);

   return {
    index,
    osc,
    gain,
    started: false
   };
  });
 }

 /*
  * Call only after AudioContext.resume() has resolved and ctx.state is
  * "running". This is the iOS Safari-critical change.
  */
 startAudio() {
  if (!this.ctx || this._started || this.ctx.state !== "running") return;

  const now = this.ctx.currentTime;

  for (const channel of this.channels) {
   if (!channel || channel.started) continue;

   try {
    channel.osc.start(now);
    channel.started = true;
   } catch (e) {
    console.warn("[AY8910] oscillator start failed", {
     channel: channel.index,
     name: e?.name,
     message: e?.message
    });
   }
  }

  this._started = true;

  /*
   * Apply current AY register state immediately after source activation.
   * This is important because game sound commands may have arrived while
   * iOS audio was still locked.
   */
  this._update();

  console.log("[AY8910] started", {
   state: this.ctx.state,
   channels: this.channels.length,
   currentTime: this.ctx.currentTime
  });
 }

 stopAudio() {
  if (!this.ctx) return;

  const now = this.ctx.currentTime;

  for (const channel of this.channels) {
   if (!channel) continue;

   try {
    channel.gain.gain.cancelScheduledValues(now);
    channel.gain.gain.setValueAtTime(0, now);
   } catch {}

   if (channel.started) {
    try {
     channel.osc.stop(now);
    } catch {}

    channel.started = false;
   }

   try {
    channel.osc.disconnect();
    channel.gain.disconnect();
   } catch {}
  }

  try {
   this.masterGain?.disconnect();
  } catch {}

  this._started = false;
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
   this._envTrigger = true;
  }

  if (r === 0x0e && this.portAWrite) {
   this.portAWrite(val & 0xff);
  }

  if (r === 0x0f && this.portBWrite) {
   this.portBWrite(val & 0xff);
  }

  this._update();
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

 tick(cycles) {
  if (!this.ctx) return;

  this._advanceEnvelope(cycles);
  this._advanceNoise(cycles);
  this._update();
 }

 _advanceEnvelope(cycles) {
  const period = ((this.regs[0x0c] << 8) | this.regs[0x0b]) * 16 || 16;

  this._envClock += cycles;

  const steps = Math.floor(this._envClock / period);

  if (steps > 0) {
   this._envClock %= period;
   this._envPhase = Math.min(31, this._envPhase + steps);
  }
 }

 /*
  * Steps the 17-bit noise LFSR forward by the number of noise-period
  * steps that occurred during `cycles`, and records the fraction of
  * those steps that produced a "1" bit as `_noiseDuty`. Using the duty
  * cycle instead of only the final bit lets a single audio-rate gain
  * update approximate the noise generator's average energy over the
  * whole tick() window, rather than freezing on whatever bit happened
  * to be current at the last step.
  */
 _advanceNoise(cycles) {
  const nperiod = (this.regs[0x06] & 0x1f) * 16 || 16;

  this._noiseClock += cycles;

  let steps = Math.floor(this._noiseClock / nperiod);
  this._noiseClock %= nperiod;

  const totalSteps = steps;
  let onSteps = 0;

  while (steps-- > 0) {
   const bit0 = this._noiseShift & 1;

   this._noiseShift =
    (this._noiseShift >> 1) | ((bit0 ^ ((this._noiseShift >> 3) & 1)) << 16);

   this._noiseBit = bit0;
   if (bit0) onSteps++;
  }

  this._noiseDuty = totalSteps > 0 ? onSteps / totalSteps : this._noiseBit;
 }

 _update() {
  if (!this.ctx || !this.channels.length) return;

  const now = this.ctx.currentTime;

  for (let ch = 0; ch < 3; ch++) {
   const fine = this.regs[ch * 2];
   const coarse = this.regs[ch * 2 + 1] & 0x0f;
   const period = (coarse << 8) | fine;

   const volReg = this.regs[0x08 + ch];
   const envMode = (volReg & 0x10) !== 0;

   const toneOff = ((this.regs[0x07] >> ch) & 1) !== 0;
   const noiseOff = ((this.regs[0x07] >> (ch + 3)) & 1) !== 0;

   const channel = this.channels[ch];
   if (!channel) continue;

   const envShape = AY8910.ENVELOPE_SHAPES[this.regs[0x0d] & 0x0f];
   const envLevel = envShape[this._envPhase] ?? 0;

   const rawVol = envMode ? envLevel : volReg & 0x0f;
   const toneActive = !toneOff && period > 0;

   /*
    * Blend tone and noise contribution as a 0-1 factor instead of a
    * hard on/off gate. When only noise is enabled, `combinedFactor`
    * reflects the LFSR's duty cycle for this tick, which at least
    * approximates the perceived loudness of static rather than
    * silently dropping the whole channel because the last sampled
    * bit happened to be 0.
    */
   const noiseFactor = noiseOff ? 0 : this._noiseDuty;
   const toneFactor = toneActive ? 1 : 0;
   const combinedFactor = Math.max(toneFactor, noiseFactor);

   if (combinedFactor <= 0 || rawVol === 0) {
    channel.gain.gain.setTargetAtTime(0, now, 0.004);
    continue;
   }

   if (toneActive) {
    const freq = this.clock / (16 * period);

    channel.osc.frequency.setTargetAtTime(
     Math.max(20, Math.min(freq, 20000)),
     now,
     0.004
    );
   }

   channel.gain.gain.setTargetAtTime(
    AY8910.VOLUME_TABLE[rawVol] * 0.33 * combinedFactor,
    now,
    0.004
   );
  }
 }
}

// ── Starfield ─────────────────────────────────────────────
class Starfield {
 constructor(width, height) {
  this.STAR_RNG_PERIOD = (1 << 17) - 1;
  this.W = width;
  this.H = height;
  this._rngOrigin = 0;
  this._originFrame = 0;
  this._flipX = false;
  this._stars = new Uint8Array(this.STAR_RNG_PERIOD);
  this._generate();
 }

 _generate() {
  let shiftreg = 0;
  for (let i = 0; i < this.STAR_RNG_PERIOD; i++) {
   const enabled = (shiftreg & 0x1fe01) === 0x1fe00;
   const color = (~shiftreg & 0x1f8) >> 3;
   this._stars[i] = (color & 0x3f) | (enabled ? 0x80 : 0);
   const newbit = ((shiftreg >> 12) ^ ~shiftreg) & 1;
   shiftreg = ((shiftreg >> 1) | (newbit << 16)) & this.STAR_RNG_PERIOD;
  }
 }

 updateOrigin(frameNumber, flipX = false) {
  this._flipX = flipX;
  if (frameNumber === this._originFrame) return;
  const perFrameDelta = flipX ? 1 : -1;
  let totalDelta = perFrameDelta * (frameNumber - this._originFrame);
  while (totalDelta < 0) totalDelta += this.STAR_RNG_PERIOD;
  this._rngOrigin = (this._rngOrigin + totalDelta) % this.STAR_RNG_PERIOD;
  this._originFrame = frameNumber;
 }

 _drawRow(pixels, y, dispW, starmask, paletteRGB) {
  let staroffs = (this._rngOrigin + y * 512) % this.STAR_RNG_PERIOD;
  const rowBase = y * dispW * 3;
  for (let x = 0; x < dispW; x++) {
   const enableStar = (y ^ (x >> 3)) & 1;
   let star = this._stars[staroffs];
   if (++staroffs >= this.STAR_RNG_PERIOD) staroffs = 0;
   if (enableStar && star & 0x80 && star & starmask)
    pixels[rowBase + x * 3] = paletteRGB[star & 0x3f];
   star = this._stars[staroffs];
   if (++staroffs >= this.STAR_RNG_PERIOD) staroffs = 0;
   if (enableStar && star & 0x80 && star & starmask) {
    const color = paletteRGB[star & 0x3f];
    pixels[rowBase + x * 3 + 1] = color;
    pixels[rowBase + x * 3 + 2] = color;
   }
  }
 }

 render(pixels, dispW, dispH, blinkState, paletteRGB) {
  const colormaskTable = [0x20, 0x08, 0xff, 0xff];
  const starmask = colormaskTable[blinkState & 3];
  for (let y = 0; y < dispH; y++) {
   if ((blinkState & 3) === 2 && (y & 2) === 0) continue;
   this._drawRow(pixels, y, dispW, starmask, paletteRGB);
  }
 }
}

// ── Tilemap ───────────────────────────────────────────────
class Tilemap {
 constructor({
  cols,
  rows,
  tileW,
  tileH,
  getTileInfo,
  scan,
  visibleRowStart = 0,
  visibleRowEnd = 32
 }) {
  this.cols = cols;
  this.rows = rows;
  this.tileW = tileW;
  this.tileH = tileH;
  this.getTileInfo = getTileInfo;
  this.scan = scan;
  this.visibleRowStart = visibleRowStart;
  this.visibleRowEnd = visibleRowEnd;
  this.dirty = new Uint8Array(cols * rows).fill(1);
  this.cache = new Array(cols * rows);
 }

 markTileDirty(idx) {
  if (idx >= 0 && idx < this.dirty.length) this.dirty[idx] = 1;
 }
 markAllDirty() {
  this.dirty.fill(1);
 }

 draw(pixels, screenW, screenH, paletteRGB, opts = {}) {
  const scrollX = (opts.scrollX ?? 0) & 0xff;
  for (let row = this.visibleRowStart; row < this.visibleRowEnd; row++) {
   const baseScreenY = (row - this.visibleRowStart) * this.tileH;
   const isHUD = row < 5 || row >= 30;
   const colScroll = isHUD ? 0 : scrollX;
   for (let col = 0; col < this.cols; col++) {
    const info = this._getCachedTileInfo(col, row);
    if (!info?.tile) continue;
    const baseScreenX = (col * this.tileW - colScroll + screenW) % screenW;
    this._drawTile(
     pixels,
     screenW,
     screenH,
     paletteRGB,
     info,
     baseScreenX,
     baseScreenY
    );
   }
  }
 }

 _getCachedTileInfo(col, row) {
  const i = this.scan(col, row);
  if (this.dirty[i]) {
   this.cache[i] = this.getTileInfo(i);
   this.dirty[i] = 0;
  }
  return this.cache[i];
 }

 _drawTile(
  pixels,
  screenW,
  screenH,
  paletteRGB,
  info,
  baseScreenX,
  baseScreenY
 ) {
  const { tile, colorBase } = info;
  const clipLeft = 14,
   clipRight = screenW - 8;
  for (let py = 0; py < this.tileH; py++) {
   const destY = baseScreenY + py;
   if (destY < 0 || destY >= screenH) continue;
   const screenRowOffset = destY * screenW;
   const tileRowOffset = py * this.tileW;
   for (let px = 0; px < this.tileW; px++) {
    const pen = tile[tileRowOffset + px];
    if (!pen) continue;
    const destX = screenW - 2 - ((baseScreenX + px) % screenW);
    if (destX < clipLeft || destX >= clipRight) continue;
    pixels[screenRowOffset + destX] = paletteRGB[(colorBase | pen) & 0x1f];
   }
  }
 }
}

// ── Touchpads ─────────────────────────────────────────────
class Touchpads {
 constructor(inputs = {}) {
  this.inputs = inputs;
  this.DEADZONE = 20;
  this.DPAD_RADIUS = 100;
  this.RING_RADIUS = 18;
  this.dpadTouchId = null;
  this.fireTouchId = null;
  this.bombTouchId = null;
  this.dpadCtx = null;
  this.initDOM();
  this.bindEvents();
 }

 initDOM() {
  this.dpadEl = document.getElementById("dpad-ring");
  this.fireEl = document.getElementById("btn-fire");
  this.bombEl = document.getElementById("btn-bomb");
  const canvas = document.getElementById("dpad-canvas");
  if (canvas) this.dpadCtx = canvas.getContext("2d");
 }

 bindEvents() {
  if (this.dpadEl) {
   const opts = { passive: false };
   this.dpadEl.addEventListener("touchstart", (e) => this._dpadStart(e), opts);
   this.dpadEl.addEventListener("touchmove", (e) => this._dpadMove(e), opts);
   this.dpadEl.addEventListener("touchend", (e) => this._dpadEnd(e), opts);
   this.dpadEl.addEventListener("touchcancel", (e) => this._dpadEnd(e), opts);
  }
  this._bindButton(this.fireEl, "fire", "fireTouchId");
  this._bindButton(this.bombEl, "bomb", "bombTouchId");
 }

 _bindButton(el, inputName, touchIdKey) {
  if (!el) return;
  const opts = { passive: false };
  el.addEventListener(
   "touchstart",
   (e) => {
    e.preventDefault();
    if (this[touchIdKey] !== null) return;
    this[touchIdKey] = e.changedTouches[0].identifier;
    this.setInput(inputName, true);
   },
   opts
  );
  el.addEventListener("touchmove", (e) => e.preventDefault(), opts);
  const release = (e) => {
   e.preventDefault();
   for (const t of e.changedTouches) {
    if (t.identifier === this[touchIdKey]) {
     this[touchIdKey] = null;
     this.setInput(inputName, false);
     break;
    }
   }
  };
  el.addEventListener("touchend", release, opts);
  el.addEventListener("touchcancel", release, opts);
 }

 _dpadStart(e) {
  e.preventDefault();
  if (this.dpadTouchId !== null) return;
  const t = e.changedTouches[0];
  this.dpadTouchId = t.identifier;
  this.updateDpad(t);
 }
 _dpadMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
   if (t.identifier === this.dpadTouchId) {
    this.updateDpad(t);
    break;
   }
  }
 }
 _dpadEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
   if (t.identifier === this.dpadTouchId) {
    this.dpadTouchId = null;
    this.clearDpad();
    break;
   }
  }
 }

 setInput(name, state) {
  if (this.inputs.setInput) this.inputs.setInput(name, state);
 }
 pulseInput(name) {
  if (this.inputs.pulseInput) this.inputs.pulseInput(name);
 }
 clearDpad() {
  ["left", "right", "up", "down"].forEach((n) => this.setInput(n, false));
  this.clearCanvas();
 }

 updateDpad(touch) {
  const rect = this.dpadEl.getBoundingClientRect();
  const dx = touch.clientX - (rect.left + rect.width / 2);
  const dy = touch.clientY - (rect.top + rect.height / 2);
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  this.drawTouchRing(
   Math.cos(angle) * Math.min(dist, this.DPAD_RADIUS),
   Math.sin(angle) * Math.min(dist, this.DPAD_RADIUS),
   dist
  );
  if (dist < this.DEADZONE) {
   this.clearDpadInputs();
   return;
  }
  const PI4 = Math.PI / 4;
  this.setInput("right", angle > -PI4 && angle < PI4);
  this.setInput("down", angle > PI4 && angle < PI4 * 3);
  this.setInput("left", angle > PI4 * 3 || angle < -PI4 * 3);
  this.setInput("up", angle > -PI4 * 3 && angle < -PI4);
 }

 clearDpadInputs() {
  ["left", "right", "up", "down"].forEach((n) => this.setInput(n, false));
 }
 clearCanvas() {
  if (this.dpadCtx) this.dpadCtx.clearRect(0, 0, 200, 200);
 }

 drawTouchRing(tx, ty, dist) {
  if (!this.dpadCtx) return;
  const ctx = this.dpadCtx;
  const alpha =
   dist < this.DEADZONE ? 0.25 : Math.min(1, dist / this.DPAD_RADIUS);
  ctx.clearRect(0, 0, 200, 200);
  ctx.beginPath();
  ctx.arc(100 + tx, 100 + ty, this.RING_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(200,50,200,${alpha})`;
  ctx.lineWidth = 2;
  ctx.stroke();
 }
}

// ── ScrambleEmu ───────────────────────────────────────────
class ScrambleEmu {
 constructor(canvasId) {
  this.inputs = {
   up: false,
   down: false,
   left: false,
   right: false,
   fire: false,
   bomb: false,
   coin1: false,
   coin2: false,
   start1: false,
   start2: false,
   service: false
  };
  this.initTimingConstants();
  this.initRomConfig();
  this.initCanvas(canvasId);
  this.initMemory();
  this.initVideoBuffers();
  this.initMachineState();
  this.initInputs();
  this.initRuntimeState();
 }

 initTimingConstants() {
  this.CPUCLOCK = 3_072_000;
  this.SOUNDCLOCK = 14_318_000 / 8;
  this.FRAMERATE = 16000 / 132 / 2;
  this.WIDTH = this.HEIGHT = 256;
  this.cyclesPerFrame = Math.floor(this.CPUCLOCK / this.FRAMERATE);
  this.QUANTUM = Math.floor(this.cyclesPerFrame / 4);
  this.soundCyclesPerFrame = Math.floor(this.SOUNDCLOCK / this.FRAMERATE);
  this.soundQuantum = Math.floor(this.soundCyclesPerFrame / 4);
 }

 initRomConfig() {
  this.ROMS = {
   main: ["2d", "2e", "2f", "2h", "2j", "2l", "2m", "2p"],
   sound: ["ot1.5c", "ot2.5d", "ot3.5e"],
   gfx: ["5f", "5h"],
   prom: "c01s.6e"
  };
  this.romBaseUrl = "https://subnetpie.github.io/arcade/scramble/";
 }

 initCanvas(canvasId) {
  this.canvas =
   document.getElementById(canvasId) ??
   (() => {
    throw new Error(`Canvas '${canvasId}' missing`);
   })();
  this.ctx = this.canvas.getContext("2d");
  this.canvas.width = this.WIDTH;
  this.canvas.height = this.HEIGHT;
  this.canvas.style.imageRendering = "pixelated";
 }

 initMemory() {
  this.mem = new Uint8Array(0x10000);
  this.soundRom = new Uint8Array(0x3000);
  // FIX-3: 2 KB sound RAM, mask 0x07ff  (was 4 KB / 0x03ff → stack aliased data)
  this.soundRam = new Uint8Array(0x800);
 }

 initMachineState() {
  this.nmiEnable = 0;
  this.starsEnable = 0;
  this.flipScreenX = 0;
  this.flipScreenY = 0;
  this.bgScrollX = 0;
  this.soundLatch = 0;

  // 7474-derived sound interrupt line state.
  this.soundIrqPending = false;
  this.soundIrqClock = 1;

  // MAME: PPI1 Port B bit 4 is sound disable.
  this.soundMuted = false;

  this.freePlay = false;
  this.prevCoinCounter1 = false;
  this.mem[0x4002] = 0;
  for (let i = 0; i < 9; i++) this.mem[0x4010 + i] = 0x00;
 }

 initInputs() {
  this.touchBindings = {
   up: { field: "up" },
   down: { field: "down" },
   left: { field: "left" },
   right: { field: "right" },
   fire: { field: "fire" },
   bomb: { field: "bomb" },
   coin1: { field: "coin1", pulse: true },
   coin2: { field: "coin2", pulse: true },
   start1: { field: "start1", pulse: true },
   start2: { field: "start2", pulse: true }
  };
  this.touchTimers = new Map();
  this.bindTouchControls();
  this.bindKeyboardAndMouse();
  this.bindAudioUnlock();
  this.touchpads = new Touchpads({
   setInput: (name, state) => this.setInput(name, state),
   pulseInput: (name) => this.pulseInput(name)
  });
 }

 bindTouchControls() {
  const bindTouchElement = (el, pressFn, releaseFn) => {
   const opts = { passive: false };
   el.addEventListener(
    "touchstart",
    (e) => {
     e.preventDefault();
     pressFn(e);
    },
    opts
   );
   el.addEventListener(
    "touchend",
    (e) => {
     e.preventDefault();
     releaseFn(e);
    },
    opts
   );
   el.addEventListener(
    "touchcancel",
    (e) => {
     e.preventDefault();
     releaseFn(e);
    },
    opts
   );
   el.addEventListener(
    "touchmove",
    (e) => {
     e.preventDefault();
     pressFn(e);
    },
    opts
   );
  };
  document.querySelectorAll("[data-btn]").forEach((el) => {
   const name = el.dataset.btn;
   const b = this.touchBindings[name];
   if (!b) return;
   bindTouchElement(
    el,
    () => (b.pulse ? this.pulseInput(name) : this.setInput(name, true)),
    () => !b.pulse && this.setInput(name, false)
   );
  });
 }

 resetInputPorts() {
  Object.keys(this.inputs).forEach((k) => {
   this.inputs[k] = false;
  });
 }

 setInput(name, active) {
  const b = this.touchBindings[name];
  if (!b) return;
  this.inputs[b.field] = !!active;
 }

 pulseInput(name, duration = 200) {
  this.setInput(name, true);
  clearTimeout(this.touchTimers.get(name));
  this.touchTimers.set(
   name,
   setTimeout(() => {
    this.setInput(name, false);
    this.touchTimers.delete(name);
   }, duration)
  );
 }

 bindKeyboardAndMouse() {
  const keyDown = (e) => {
   this.resumeAudio();
   switch (e.code) {
    case "ArrowLeft":
     this.setInput("left", true);
     break;
    case "ArrowRight":
     this.setInput("right", true);
     break;
    case "ArrowUp":
     this.setInput("up", true);
     break;
    case "ArrowDown":
     this.setInput("down", true);
     break;
    case "Space":
     this.setInput("fire", true);
     break;
    case "ShiftLeft":
     this.setInput("bomb", true);
     break;
    case "Digit1":
     this.pulseInput("start1");
     break;
    case "Digit2":
     this.pulseInput("start2");
     break;
    case "Digit5":
     this.pulseInput("coin1");
     break;
   }
  };
  const keyUp = (e) => {
   switch (e.code) {
    case "ArrowLeft":
     this.setInput("left", false);
     break;
    case "ArrowRight":
     this.setInput("right", false);
     break;
    case "ArrowUp":
     this.setInput("up", false);
     break;
    case "ArrowDown":
     this.setInput("down", false);
     break;
    case "Space":
     this.setInput("fire", false);
     break;
    case "ShiftLeft":
     this.setInput("bomb", false);
     break;
    case "Digit1":
     this.pulseInput("start1");
     break;
    case "Digit2":
     this.pulseInput("start2");
     break;
    case "Digit5":
     this.pulseInput("coin1");
     break;
   }
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("click", () => this.resumeAudio(), { once: true });

  const mouseDown = (e) => {
   e.preventDefault();
   const rect = this.canvas.getBoundingClientRect();
   const x = e.clientX - rect.left;
   if (e.button === 0) {
    this.setInput("left", x < rect.width / 2);
    this.setInput("right", x > rect.width / 2);
    this.setInput("fire", true);
   } else if (e.button === 2) {
    this.pulseInput("coin1");
   }
  };
  const mouseUp = (e) => {
   e.preventDefault();
   if (e.button === 0) {
    this.setInput("left", false);
    this.setInput("right", false);
    this.setInput("fire", false);
   }
  };
  this.canvas.addEventListener("mousedown", mouseDown);
  this.canvas.addEventListener("mouseup", mouseUp);
  this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
 }

 initRuntimeState() {
  this.running = false;
  this.frameCount = 0;
  this.lastFrameTime = 0;
  this.starsBlinkState = 0;
  this.starsBlinkCounter = 0;
  this.tiles = null;
  this.sprites = null;
  this.paletteRGB = null;
  this.starPaletteRGB = null;
  this.bgTilemap = null;
  this.ready = false;
  this.traceEnabled = false;
  this.traceLog = [];
  this.maxTrace = 4000;
  this.lastOpPC = 0;
  this.touchTimers ??= new Map();
  this.touchBindings ??= {};
  this.audioCtx = null;
  this.audioUnlocked = false;
  this.audioUnlocking = false;
  this.audioResumePromise = null;
  this.keepAliveSrc = null;
  this.keepAliveGain = null;
 }

 initVideoBuffers() {
  this.imageData = this.ctx.createImageData(this.WIDTH, this.HEIGHT);
  this.starfield = new Starfield(this.WIDTH, this.HEIGHT);
 }

 initIO() {
  this.ppiCReady = false;

  this.ppi0 = new PPI8255(
   this.readIN0.bind(this),
   this.readIN1.bind(this),
   () => {
    const base = this.readIN2();
    return this.ppiCReady ? base | 0x80 : base & ~0x80;
   },
   null,
   null,
   null
  );

  // Standard Scramble PPI1:
  //   0x8200 / Port A = main-to-sound latch
  //   0x8201 / Port B = 7474 sound-IRQ clock + sound mute
  //   0x8202 / Port C = unused by standard Scramble sound board
  //   0x8203 / control   = ignored here because PPI1 behavior is discrete
  this.ppi1 = {
   em: this,

   read(offset) {
    return 0xff;
   },

   write(offset, data) {
    data &= 0xff;

    switch (offset & 3) {
     case 0:
      // PPI1 Port A -> generic 8-bit main-to-sound latch.
      this.em.soundLatch = data;
      return;

     case 1:
      // PPI1 Port B -> Konami 7474 clock and global sound mute.
      this.em.writeSoundIrqTrigger(data);
      return;

     default:
      return;
    }
   }
  };
 }

 writeSoundIrqTrigger(data) {
  data &= 0xff;

  // MAME:
  // m_konami_7474->clock_w((~data & 0x08) >> 3);
  //
  // The effective 7474 clock is inverted Port-B bit 3.  A flip-flop
  // acts on its low->high edge, which occurs when PB3 changes 1 -> 0.
  const nextClock = (~data >> 3) & 1;

  if (!this.soundIrqClock && nextClock) {
   this.soundIrqPending = true;
  }

  this.soundIrqClock = nextClock;

  // MAME:
  // machine().sound().system_mute((data & 0x10) >> 4);
  this.setSoundMute((data & 0x10) !== 0);
 }

 setSoundMute(muted) {
  this.soundMuted = !!muted;

  const ctx = this.audioCtx;
  if (!ctx) return;

  const value = this.soundMuted ? 0 : 0.15;
  const now = ctx.currentTime;

  for (const ay of [this.ay1, this.ay2]) {
   if (!ay?.masterGain) continue;
   ay.masterGain.gain.setTargetAtTime(value, now, 0.002);
  }
 }

 // ── Audio ─────────────────────────────────────────────────
 readScrambleTimer() {
  const timer = [0x00, 0x10, 0x20, 0x30, 0x40, 0x90, 0xa0, 0xb0, 0xa0, 0xd0];

  const cycles = this.soundCpu?.cycles ?? 0;
  return timer[Math.floor(cycles / 512) % 10];
 }

 _initAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API is unavailable");

  const oldAY1 = this.ay1?.regs ? new Uint8Array(this.ay1.regs) : null;

  const oldAY2 = this.ay2?.regs ? new Uint8Array(this.ay2.regs) : null;

  const ctx = new Ctx({ latencyHint: "interactive" });

  try {
   const ay1 = new AY8910(ctx, this.SOUNDCLOCK, () => this.readScrambleTimer());

   const ay2 = new AY8910(ctx, this.SOUNDCLOCK, () => this.soundLatch);

   if (oldAY1) ay1.regs.set(oldAY1);
   if (oldAY2) ay2.regs.set(oldAY2);

   this.audioCtx = ctx;
   this.ay1 = ay1;
   this.ay2 = ay2;

   // Do not start oscillators here. On iOS Safari, start them only after
   // ctx.resume() has resolved in unlockAudioFromGesture().
   this.ay1.tick(0);
   this.ay2.tick(0);

   console.log("[Audio] graph created", {
    state: ctx.state,
    sampleRate: ctx.sampleRate
   });
  } catch (e) {
   try {
    ctx.close();
   } catch {}

   this.audioCtx = null;
   throw e;
  }
 }

 unlockAudioFromGesture() {
  if (this.audioUnlocking) return;

  const existing = this.audioCtx;

  if (existing && existing.state === "running") {
   this.audioUnlocked = true;
   return;
  }

  this.audioUnlocked = false;

  if (!existing || existing.state === "closed") {
   this.audioCtx = null;
  }

  this.audioUnlocking = true;

  try {
   if (!this.audioCtx) {
    console.log("[Audio] creating context and AY graph");
    this._initAudio();
   }

   const ctx = this.audioCtx;
   if (!ctx) throw new Error("AudioContext creation failed");

   // Call resume synchronously while still in the trusted pointer/touch event.
   const promise =
    ctx.state === "suspended" || ctx.state === "interrupted"
     ? ctx.resume()
     : Promise.resolve();

   promise
    .then(() => {
     this.audioUnlocked = ctx.state === "running";
     console.log("[Audio] unlock complete:", ctx.state);

     if (this.audioUnlocked) {
      this.ay1?.startAudio?.();
      this.ay2?.startAudio?.();

      // Apply current registers to newly started oscillators.
      this.ay1?.tick(0);
      this.ay2?.tick(0);

      // Restore current mute state after graph construction.
      this.setSoundMute(this.soundMuted);
     }
    })
    .catch((e) => {
     this.audioUnlocked = false;
     console.error("[Audio] resume rejected", {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      string: String(e)
     });
    })
    .finally(() => {
     this.audioUnlocking = false;
    });
  } catch (e) {
   this.audioUnlocking = false;
   this.audioUnlocked = false;
   console.error("[Audio] unlock setup threw", {
    name: e?.name,
    message: e?.message,
    stack: e?.stack,
    string: String(e)
   });
  }
 }

 bindAudioUnlock() {
  const unlock = () => {
   const ctx = this.audioCtx;

   // Do nothing if it is genuinely healthy.
   if (ctx?.state === "running") return;

   this.unlockAudioFromGesture();
  };

  if (window.PointerEvent) {
   document.addEventListener("pointerdown", unlock, {
    capture: true,
    passive: true
   });
  } else {
   document.addEventListener("touchstart", unlock, {
    capture: true,
    passive: true
   });
  }

  document.addEventListener("visibilitychange", () => {
   if (document.visibilityState !== "visible") {
    this.audioUnlocked = false;
   }
  });
 }

 resumeAudio() {
  const ctx = this.audioCtx;

  // The initial context must be created only by unlockAudioFromGesture().
  if (!ctx || ctx.state === "closed" || ctx.state === "running") return;
  if (this.audioResumePromise) return;

  this.audioResumePromise = ctx
   .resume()
   .then(() => {
    this.audioUnlocked = ctx.state === "running";

    if (this.audioUnlocked) {
     this.ay1?.startAudio?.();
     this.ay2?.startAudio?.();
     this.ay1?.tick(0);
     this.ay2?.tick(0);
    }
   })
   .catch((e) => {
    console.warn("[Audio] later resume failed", {
     name: e?.name,
     message: e?.message,
     state: ctx.state
    });
   })
   .finally(() => {
    this.audioResumePromise = null;
   });
 }

 _startKeepAlive() {
  const ctx = this._audioCtx;

  if (!ctx || ctx.state === "closed" || this._keepAliveSrc) return;

  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.ceil(sr * 0.5), sr);
  const data = buf.getChannelData(0);

  /*
   * Keep a nonzero signal. Do not use literal zero: some Safari versions
   * may optimize a permanently silent source away. At 1e-10 this is
   * approximately -200 dBFS and is inaudible.
   */
  data.fill(1e-10);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, ctx.currentTime);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();

  this._keepAliveSrc = src;
  this._keepAliveGain = gain;

  src.addEventListener(
   "ended",
   () => {
    if (this._keepAliveSrc === src) {
     this._keepAliveSrc = null;
     this._keepAliveGain = null;
    }

    try {
     src.disconnect();
     gain.disconnect();
    } catch {}
   },
   { once: true }
  );

  console.log("[Audio] keepalive started", {
   state: ctx.state,
   sampleRate: sr,
   loopFrames: buf.length
  });
 }

 updateSelfTestGate() {
  if (!this.ppiCReady && this.cpu && this.cpu.PC === 0x016f)
   this.ppiCReady = true;
 }

 // ── PPI0 ports ────────────────────────────────────────────
 readIN0() {
  const inp = this.inputs;
  let v = 0xff;
  if (inp.coin1) v &= ~0x80;
  if (inp.coin2) v &= ~0x40;
  if (inp.right) v &= ~0x10;
  if (inp.left) v &= ~0x20;
  if (inp.fire) v &= ~0x08;
  if (inp.bomb) v &= ~0x02;
  if (inp.service) v &= ~0x04;
  return v;
 }

 readIN1() {
  const inp = this.inputs || {};
  let v = 0xff;
  v &= ~0x03; // 3 lives
  v &= ~0x0c; // 1C/1C coinage
  if (inp.start2) v &= ~0x40;
  if (inp.start1) v &= ~0x80;
  return v;
 }

 readIN2() {
  const inp = this.inputs || {};
  let v = 0xff;
  if (inp.up) v &= ~0x10;
  if (inp.down) v &= ~0x40;
  return v;
 }

 async loadROM(name) {
  try {
   const res = await fetch(`${this.romBaseUrl}${name}`);
   if (!res.ok) return null;
   return new Uint8Array(await res.arrayBuffer());
  } catch {
   return null;
  }
 }

 async init() {
  const [mainRoms, soundRoms, gfx0, gfx1, prom] = await Promise.all([
   Promise.all(this.ROMS.main.map((n) => this.loadROM(n))),
   Promise.all(this.ROMS.sound.map((n) => this.loadROM(n))),
   this.loadROM(this.ROMS.gfx[0]),
   this.loadROM(this.ROMS.gfx[1]),
   this.loadROM(this.ROMS.prom)
  ]);

  mainRoms.forEach((rom, i) => {
   if (rom) this.mem.set(rom.subarray(0, 0x800), i * 0x800);
  });
  this.mem[0x01a9] = 0x00; // bypass self-test RET NZ

  soundRoms.forEach((rom, i) => {
   if (rom) this.soundRom.set(rom.subarray(0, 0x800), i * 0x800);
  });

  const charROM = new Uint8Array(0x1000);
  if (gfx0) charROM.set(gfx0.subarray(0, 0x800), 0x0000);
  if (gfx1) charROM.set(gfx1.subarray(0, 0x800), 0x0800);

  this.paletteRGB = this.buildPalette(prom);
  this.starPaletteRGB = this.buildStarPalette();
  this.tiles = this.buildTiles(charROM);
  this.sprites = this.buildSprites(charROM);
  this.createTilemap();

  // AudioContext created lazily on first user gesture
  // AudioContext is created only after a trusted user gesture on iOS.
  this.audioCtx = null;

  // Preserve AY register activity before audio is unlocked.
  // MAME wiring: AY1 port A = hardware timer; AY2 port A = sound latch.
  this.ay1 = new AY8910(null, this.SOUNDCLOCK, () => this.readScrambleTimer());

  this.ay2 = new AY8910(null, this.SOUNDCLOCK, () => this.soundLatch);

  this.initIO();

  // Main CPU
  this.cpu = new Z80(
   (addr) => this.read(addr),
   (addr, data) => this.write(addr, data),
   () => 0xff,
   () => {}
  );
  this.cpu.reset();
  this.cpu.SP = 0xffff;
  this.cpu.IFF1 = this.cpu.IFF2 = false;
  this.cpu.IM = 1;
  this.opCount = 0;
  const oldStep = this.cpu.step.bind(this.cpu);
  this.cpu.step = () => {
   this.opCount++;
   return oldStep();
  };

  // Sound CPU
  this.soundCpu = new Z80(
   (addr) => this.soundRead(addr),
   (addr, data) => this.soundWrite(addr, data),
   (port) => this.soundPortRead(port),
   (port, data) => this.soundPortWrite(port, data)
  );
  this.soundCpu.reset();
  this.soundCpu.SP = 0xffff;
  this.soundCpu.IFF1 = this.soundCpu.IFF2 = false;
  this.soundCpu.IM = 1;

  this.resetInputPorts();

  this.initMachineState();
  this.ready = true;
 }

 async start() {
  if (!this.ready) await this.init();
  this.running = true;
  requestAnimationFrame((ts) => this.stepFrame(ts));
 }

 stop() {
  this.running = false;
 }

 stepFrame(timestamp) {
  if (!this.running || !this.cpu || !this.soundCpu) return;

  const frameInterval = 1000 / this.FRAMERATE;
  if (timestamp - this.lastFrameTime < frameInterval - 1) {
   requestAnimationFrame((ts) => this.stepFrame(ts));
   return;
  }
  this.lastFrameTime = timestamp;

  let mainLeft = this.cyclesPerFrame;
  let soundLeft = this.soundCyclesPerFrame;
  if (!this.pcHistogram) this.pcHistogram = new Uint32Array(0x4000);

  for (let slice = 0; slice < 4; slice++) {
   const mainBudget = slice < 3 ? this.QUANTUM : mainLeft;
   const soundBudget = slice < 3 ? this.soundQuantum : soundLeft;

   let mainElapsed = 0;
   while (mainElapsed < mainBudget) {
    this.updateSelfTestGate();
    this.lastOpPC = this.cpu.PC;
    if (this.cpu.PC < 0x4000) this.pcHistogram[this.cpu.PC]++;
    mainElapsed += this.stepCpu(this.cpu);
   }
   mainLeft -= mainElapsed;

   // Queue the sound IRQ before this slice. The embedded Z80 retains it
   // while interrupts are disabled and clears it on acknowledgment.
   if (this.soundIrqPending) {
    this.soundCpu.requestIrq(0xff);
    this.soundIrqPending = false;
   }

   let soundElapsed = 0;
   while (soundElapsed < soundBudget)
    soundElapsed += this.stepCpu(this.soundCpu);
   soundLeft -= soundElapsed;

   if (slice === 3) {
    if (this.nmiEnable) {
     this.cpu.pulseNmi();
    }

    if (this.starsEnable && ++this.starsBlinkCounter >= 20) {
     this.starsBlinkCounter = 0;
     this.starsBlinkState = (this.starsBlinkState + 1) & 3;
    }
    this.ay1?.tick(this.soundCyclesPerFrame);
    this.ay2?.tick(this.soundCyclesPerFrame);
   }
  }

  this.frameCount++;
  this.render();
  requestAnimationFrame((ts) => this.stepFrame(ts));
 }

 // ── Main CPU memory map ───────────────────────────────────
 read(addr) {
  addr &= 0xffff;
  if (addr <= 0x3fff) return this.mem[addr];
  if (addr >= 0x4000 && addr <= 0x47ff) return this.mem[addr];
  if (addr >= 0x4800 && addr <= 0x4bff) return this.mem[addr];
  if (addr >= 0x4c00 && addr <= 0x4fff)
   return this.mem[0x4800 + (addr & 0x03ff)];
  if (addr >= 0x5000 && addr <= 0x50ff) return this.mem[addr];
  if (addr >= 0x6000 && addr <= 0x67ff) return this.readIN0();
  if (addr >= 0x6800 && addr <= 0x6fff) return this.readIN1();
  if (addr >= 0x7000 && addr <= 0x77ff) return this.readIN2();
  if (addr >= 0x7800 && addr <= 0x7fff) return 0xff;
  if (addr >= 0x8100 && addr <= 0x8103) return this.ppi0.read(addr & 3);
  if (addr >= 0x8200 && addr <= 0x8203) return this.ppi1.read(addr & 3);
  return 0xff;
 }

 write(addr, data) {
  addr &= 0xffff;
  data &= 0xff;
  const bg = this.bgTilemap;
  if (addr <= 0x3fff) return;
  if (addr >= 0x4000 && addr <= 0x47ff) {
   this.mem[addr] = data;
   return;
  }
  if (addr >= 0x4800 && addr <= 0x4bff) {
   this.mem[addr] = data;
   bg?.markTileDirty(addr - 0x4800);
   return;
  }
  if (addr >= 0x4c00 && addr <= 0x4fff) {
   const real = 0x4800 + (addr & 0x03ff);
   if (this.mem[real] !== data) {
    this.mem[real] = data;
    bg?.markTileDirty(addr & 0x03ff);
   }
   return;
  }
  if (addr >= 0x5000 && addr <= 0x503f) {
   this.mem[addr] = data;
   const hwCol = (addr - 0x5000) >> 1;
   if ((addr & 1) === 0 && hwCol < 28) this.bgScrollX = data & 0xff;
   this.markAttrColumnDirty(hwCol);
   return;
  }
  if (addr >= 0x5040 && addr <= 0x50ff) {
   this.mem[addr] = data;
   return;
  }
  if (addr >= 0x6800 && addr <= 0x6807) {
   const bit = data & 1;
   switch (addr) {
    case 0x6800:
     return;
    case 0x6801:
     this.nmiEnable = bit;
     return;
    case 0x6802: {
     const rising = bit && !this.prevCoinCounter1;
     if (rising) this.mem[0x4002] = (this.mem[0x4002] + 1) & 0xff;
     this.prevCoinCounter1 = !!bit;
     return;
    }
    case 0x6803:
     return;
    case 0x6804:
     this.starsEnable = bit;
     return;
    case 0x6805:
     return;
    case 0x6806:
     if (this.flipScreenX !== bit) this.bgTilemap?.markAllDirty();
     this.flipScreenX = bit;
     return;
    case 0x6807:
     if (this.flipScreenY !== bit) this.bgTilemap?.markAllDirty();
     this.flipScreenY = bit;
     return;
    default:
     return;
   }
  }
  if (addr >= 0x7800 && addr <= 0x7fff) return;
  if (addr >= 0x8200 && addr <= 0x8203) {
   this.ppi1.write(addr & 3, data);
   return;
  }
 }

 // ── Sound CPU memory map ──────────────────────────────────
 // FIX-3: mask 0x07ff (2 KB), matching MAME's 0x8000–0x87FF window
 soundRead(addr) {
  addr &= 0xffff;
  if (addr <= 0x2fff) return this.soundRom[addr];
  if (addr >= 0x8000 && addr <= 0x87ff) return this.soundRam[addr & 0x07ff];
  return 0xff;
 }

 soundWrite(addr, data) {
  addr &= 0xffff;
  data &= 0xff;
  if (addr >= 0x8000 && addr <= 0x87ff) this.soundRam[addr & 0x07ff] = data;
 }

 // ── Sound CPU I/O ─────────────────────────────────────────
 // FIX-2: both the address-latch port AND the data port return readData().
 //        On the AY-8910, IN-ACTIVE (BC1=1 BDIR=0) reads the selected register
 //        regardless of which port address the Z80 uses.  Returning addrLatch
 //        for port 0x10/0x40 caused the sound ROM to misread its own register
 //        writes and play nothing.
 soundPortRead(port) {
  port &= 0xff;

  if (port === 0x20) return this.ay1?.readData() ?? 0xff;
  if (port === 0x80) return this.ay2?.readData() ?? 0xff;

  // AY address ports 0x10/0x40 are write-only on standard Scramble.
  return 0xff;
 }

 soundPortWrite(port, data) {
  port &= 0xff;
  data &= 0xff;
  if (port === 0x10) {
   this.ay1?.writeAddr(data);
   return;
  }
  if (port === 0x20) {
   this.ay1?.writeData(data);
   return;
  }
  if (port === 0x40) {
   this.ay2?.writeAddr(data);
   return;
  }
  if (port === 0x80) {
   this.ay2?.writeData(data);
   return;
  }
 }

 stepCpu(cpu) {
  const cycles = cpu.step();
  if (!Number.isFinite(cycles) || cycles <= 0) {
   this.running = false;
   throw new Error("Z80.step() must return a positive cycle count");
  }
  return cycles;
 }

 runCycles(cpu, budget) {
  let elapsed = 0;
  while (elapsed < budget) elapsed += this.stepCpu(cpu);
  return elapsed;
 }

 // ── Video ─────────────────────────────────────────────────
 getBackdropColor() {
  return this.paletteRGB?.[this.bgColorIndex] ?? 0xff000000;
 }

 buildPalette(prom) {
  const out = new Uint32Array(32);
  const bit = (v, n) => (v >> n) & 1;
  const sum3 = (v, s) =>
   bit(v, s) * 0x21 + bit(v, s + 1) * 0x47 + bit(v, s + 2) * 0x97;
  for (let i = 0; i < 32; i++) {
   const v = prom?.[i] ?? 0;
   const r = sum3(v, 0),
    g = sum3(v, 3),
    b = bit(v, 6) * 0x51 + bit(v, 7) * 0xae;
   out[i] = 0xff000000 | (b << 16) | (g << 8) | r;
  }
  return out;
 }

 buildStarPalette() {
  const out = new Uint32Array(64);
  const RGBMAX = 224;
  const minval = Math.round((RGBMAX * 130) / 150);
  const midsrc = Math.round((RGBMAX * 130) / 100);
  const maxval = Math.round((RGBMAX * 130) / 60);
  const midval = Math.round(
   minval + ((255 - minval) * (midsrc - minval)) / (maxval - minval)
  );
  const levels = [0, minval, midval, 255];
  const level2 = (value, loBit, hiBit) =>
   levels[((value >> hiBit) & 1) * 2 + ((value >> loBit) & 1)];
  for (let i = 0; i < 64; i++) {
   out[i] =
    0xff000000 |
    (level2(i, 1, 0) << 16) |
    (level2(i, 3, 2) << 8) |
    level2(i, 5, 4);
  }
  return out;
 }

 buildTiles(charROM) {
  return Array.from({ length: 256 }, (_, code) => {
   const tile = new Uint8Array(64);
   for (let y = 0; y < 8; y++) {
    const p0 = charROM[code * 8 + y] ?? 0;
    const p1 = charROM[0x800 + code * 8 + y] ?? 0;
    for (let x = 0; x < 8; x++) {
     const col = 7 - x;
     tile[x * 8 + y] = (((p1 >> col) & 1) << 1) | ((p0 >> col) & 1);
    }
   }
   return tile;
  });
 }

 createTilemap() {
  this.bgTilemap = new Tilemap({
   cols: 32,
   rows: 32,
   tileW: 8,
   tileH: 8,
   visibleRowStart: 0,
   visibleRowEnd: 32,
   scan: (col, row) => (col << 5) | row,
   getTileInfo: (tileIndex) => {
    const attrCol = tileIndex & 0x1f;
    const code = this.mem[0x4800 + tileIndex];
    const attr = this.mem[0x5001 + ((attrCol & 0x1f) << 1)];
    const colorBase = (attr & 0x07) << 2;
    return { tile: this.tiles[code], colorBase };
   }
  });
 }

 renderTiles(pixels, width, height) {
  this.bgTilemap.draw(pixels, width, height, this.paletteRGB, {
   scrollX: this.bgScrollX
  });
 }

 buildSprites(charROM) {
  return Array.from({ length: 64 }, (_, code) => {
   const sprite = new Uint8Array(256);
   const base = code * 32;
   for (let y = 0; y < 16; y++) {
    const qRowOffset = (y >> 3) << 4;
    const rowInQuad = y & 7;
    for (let x = 0; x < 16; x++) {
     const qColOffset = (x >> 3) << 3;
     const b_ = 7 - (x & 7);
     const idx = base + qRowOffset + qColOffset + rowInQuad;
     const p0 = charROM[idx] ?? 0;
     const p1 = charROM[0x800 + idx] ?? 0;
     const pen = (((p1 >> b_) & 1) << 1) | ((p0 >> b_) & 1);
     sprite[x * 16 + (15 - y)] = pen;
    }
   }
   return sprite;
  });
 }

 renderSprites(pixels) {
  const clipLeft = 16,
   clipRight = this.WIDTH - 16;
  for (let offs = 0x1c; offs >= 0; offs -= 4) {
   const rawX = this.mem[0x5040 + offs];
   const codeRaw = this.mem[0x5040 + offs + 1];
   const colorByte = this.mem[0x5040 + offs + 2];
   const rawY = this.mem[0x5040 + offs + 3];
   if (!rawY && !rawX) continue;
   const code = codeRaw & 0x3f;
   const flipX = (codeRaw & 0x40) !== 0;
   const flipY = (codeRaw & 0x80) !== 0;
   const color = (colorByte & 0x07) << 2;
   const spr = this.sprites[code];
   if (!spr) continue;
   const sx0 = (rawX + 1) & 0xff;
   const sy0 = (rawY + 256) & 0xff;
   for (let dy = 0; dy < 16; dy++) {
    const sy = (sy0 + dy) & 0xff;
    if (sy >= this.HEIGHT) continue;
    const screenRowOffset = sy * this.WIDTH;
    const py = flipX ? 15 - dy : dy;
    for (let dx = 0; dx < 16; dx++) {
     const sx = (sx0 + dx) & 0xff;
     if (sx < clipLeft || sx >= clipRight) continue;
     const px = flipY ? 15 - dx : dx;
     const pen = spr[py * 16 + px];
     if (!pen) continue;
     pixels[screenRowOffset + sx] = this.paletteRGB[(color | pen) & 0x1f];
    }
   }
  }
 }

 markAttrColumnDirty(col) {
  if (!this.bgTilemap) return;
  for (let row = 0; row < 32; row++)
   this.bgTilemap.markTileDirty((col << 5) | row);
 }

 drawBackdrop(pixels, width, height) {}

 drawStars(pixels, width, height) {
  if (!this.starsEnable || !this.starfield) return;
  this.starfield.render(
   pixels,
   width,
   height,
   this.starsBlinkState & 3,
   this.starPaletteRGB
  );
 }

 drawBullets(pixels, width, height) {
  for (let i = 0; i < 8; i++) {
   const base = 0x5060 + i * 4;
   const rawY = this.mem[base + 1];
   const rawX = this.mem[base + 3];
   const x = rawY & 0xff;
   const y = (256 - 8 - rawX) & 0xff;
   if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) continue;
   const offset = y * width + x;
   pixels[offset] = 0xffffffff;
   pixels[offset + 1] = 0xffffffff;
   pixels[offset + width] = 0xffffffff;
   pixels[offset + width + 1] = 0xffffffff;
  }
 }

 render() {
  if (!this.ready || !this.tiles || !this.paletteRGB || !this.bgTilemap) return;
  const pixels = new Uint32Array(this.imageData.data.buffer);
  pixels.fill(0xff000000);
  this.drawBackdrop(pixels, this.WIDTH, this.HEIGHT);
  this.drawStars(pixels, this.WIDTH, this.HEIGHT);
  this.renderTiles(pixels, this.WIDTH, this.HEIGHT);
  this.renderSprites(pixels);
  this.drawBullets(pixels, this.WIDTH, this.HEIGHT);
  this.ctx.putImageData(this.imageData, 0, 0);
 }

 trace(tag, data) {}

 debugAudio() {
  console.table({
   audioState: this.audioCtx?.state ?? "no context",
   audioUnlocked: this.audioUnlocked,
   soundCpuCycles: this.soundCpu?.cycles ?? -1,
   soundLatch: `0x${(this.soundLatch ?? 0).toString(16).padStart(2, "0")}`,
   soundIrqPending: this.soundIrqPending,
   soundMuted: this.soundMuted,

   ay1Address: this.ay1?.addrLatch ?? -1,
   ay1Mixer: this.ay1?.regs?.[7] ?? -1,
   ay1VolA: this.ay1?.regs?.[8] ?? -1,
   ay1VolB: this.ay1?.regs?.[9] ?? -1,
   ay1VolC: this.ay1?.regs?.[10] ?? -1,

   ay2Address: this.ay2?.addrLatch ?? -1,
   ay2Mixer: this.ay2?.regs?.[7] ?? -1,
   ay2VolA: this.ay2?.regs?.[8] ?? -1,
   ay2VolB: this.ay2?.regs?.[9] ?? -1,
   ay2VolC: this.ay2?.regs?.[10] ?? -1
  });
 }
}

// ── Boot ──────────────────────────────────────────────────
(async () => {
 try {
  const emu = new ScrambleEmu("gameCanvas");
  window.scramble = emu;
  await emu.init();
  await emu.start();
 } catch (err) {
  console.error("Emulator boot failed:", err?.message ?? err, err);
 }
})();
