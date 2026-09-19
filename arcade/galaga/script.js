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
    this.irqLine = false;
    this.nmiPending = false;
    this.nmiLine = false;
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
  fetchOpcode() {
    const opcode = this.read8(this.PC);

    this.PC = (this.PC + 1) & 0xffff;
    this.incR();

    return opcode;
  }
  fetchByte() {
    const value = this.read8(this.PC);

    this.PC = (this.PC + 1) & 0xffff;

    return value;
  }
  fetchWord() {
    const lo = this.fetchByte();
    const hi = this.fetchByte();

    return lo | (hi << 8);
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
  reset() {
    this.PC = 0x0000;
    this.MEMPTR = this.PC;
    this.I = 0x00;
    this.R = 0x00;
    this.IFF1 = false;
    this.IFF2 = false;

    this.halted = false;
    this.eiPending = false;
    this.nmiPending = false;
  }
  setReset(assert) {
    const next = !!assert;
    if (next === this.inReset) return;
    this.inReset = next;
    if (next) this.reset();
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
    if (this.nmiPending) {
      this.nmiPending = false;

      if (this.halted) {
        this.halted = false;
      }
      this.IFF2 = this.IFF1;
      this.IFF1 = false;

      this.push16(this.PC);
      this.PC = 0x0066;
      this.MEMPTR = 0x0066;

      return 11;
    }
    if (!this.irqLine || !this.IFF1 || suppressIrq) {
      return 0;
    }
    if (this.halted) {
      this.halted = false;
    }
    const busByte = this.vectorLatch & 0xff;
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
        this.push16(this.PC);
        this.PC = this.read16(vectorAddress);
        this.MEMPTR = this.PC;
        return 19;
      }
      default:
        throw new Error("Invalid Z80 interrupt mode: " + this.IM);
    }
  }
  clearInterrupt(nonMaskable) {
    if (nonMaskable) {
      this.clearNmi();
    } else {
      this.clearIrq();
    }
  }
  setIrqLine(asserted, vector = 0xff) {
    this.irqLine = !!asserted;
    if (this.irqLine) {
      this.vectorLatch = vector & 0xff;
    }
  }
  requestIrq(vector = 0xff) {
    this.setIrqLine(true, vector);
  }
  clearIrq() {
    this.setIrqLine(false);
  }
  irq(vector = 0xff) {
    this.setIrqLine(true, vector);
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
  pulseNmi() {
    this.requestNmi();
    this.nmiLine = false;
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
        this.B = this.fetchByte();
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
      case 0xc0:
        if (!(this.F & 0x40)) {
          this.PC = this.pop16();
          this.MEMPTR = this.PC;
          return 11;
        }
        return 5;
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
      case 0xc8:
        if (this.F & 0x40) {
          const retSP = this.SP;
          this.PC = this.pop16();
          this.MEMPTR = this.PC;
          return 11;
        }
        return 5;
      case 0xc9:
        this.PC = this.pop16();
        this.MEMPTR = this.PC;
        return 10;
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
    const op = this.fetchOpcode();
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
    const op = this.fetchOpcode();
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
    const displacement = this.fetchByte();
    const op = this.fetchByte();
    const signedDisplacement = (displacement << 24) >> 24;
    const addr = (base + signedDisplacement) & 0xffff;
    this.MEMPTR = addr;
    const r = op & 0x07;
    const bit = (op >>> 3) & 0x07;
    const opType = op >>> 6;
    const writeBackRegister = (value) => {
      switch (r) {
        case 0:
          this.B = value & 0xff;
          break;
        case 1:
          this.C = value & 0xff;
          break;
        case 2:
          this.D = value & 0xff;
          break;
        case 3:
          this.E = value & 0xff;
          break;
        case 4:
          this.H = value & 0xff;
          break;
        case 5:
          this.L = value & 0xff;
          break;
        case 6:
          break;
        case 7:
          this.A = value & 0xff;
          break;
      }
    };
    const value = this.read8(addr);
    switch (opType) {
      case 0: {
        let result;

        switch (bit) {
          case 0:
            result = this.rlc(value);
            break;
          case 1:
            result = this.rrc(value);
            break;
          case 2:
            result = this.rl(value);
            break;
          case 3:
            result = this.rr(value);
            break;
          case 4:
            result = this.sla(value);
            break;
          case 5:
            result = this.sra(value);
            break;
          case 6:
            result = this.sll(value);
            break;
          case 7:
            result = this.srl(value);
            break;
        }
        this.write8(addr, result);
        writeBackRegister(result);
        return 23;
      }
      case 1:
        this.bitTest(bit, value, addr >>> 8);
        return 20;
      case 2: {
        const result = value & ~(1 << bit);
        this.write8(addr, result);
        writeBackRegister(result);
        return 23;
      }
      case 3: {
        const result = value | (1 << bit);
        this.write8(addr, result);
        writeBackRegister(result);
        return 23;
      }
      default:
        throw new Error("Invalid DD/FD CB operation type: " + String(opType));
    }
  }
  decodeED() {
    const op = this.fetchOpcode();
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
    const op = this.fetchOpcode();
    if (op === 0xcb) return this.decodeIndexCB(this.IX);
    return this.executeIndexed(op, "IX");
  }
  decodeFD() {
    const op = this.fetchOpcode();
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
  retn() {
    this.PC = this.pop16();
    this.IFF1 = this.IFF2;
    this.MEMPTR = this.PC;
  }
  reti() {
    this.PC = this.pop16();
    this.IFF1 = this.IFF2;
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

class EmulatorConfig {
  static MASTER_CLOCK = 18_432_000;
  static TARGET_FPS = 60.6060606061;
  constructor(overrides = {}) {
    this.display = {
      orientation: "portrait",
      width: 288,
      height: 224,
      scale: 2,
      pixelated: true
    };
    this.performance = {
      targetFPS: EmulatorConfig.TARGET_FPS,
      enableFrameSkip: false,
      maxFrameDeltaMs: 250
    };
    this.audio = {
      enabled: true,
      masterVolume: 0.5,
      bufferSize: 4096,
      sampleRate: 48_000
    };
    this.input = {
      touchDeadzone: 10,
      doubleTapTimeout: 300,
      preventScroll: true,

      // Long enough for the 51XX scan/game polling path to observe a
      // coin/start request without browser key-repeat duplicating it.
      pulseDurationMs: 100,
      touchPulseDurationMs: 250
    };
    this.roms = {
      baseUrl: "https://subnetpie.github.io/arcade/galaga/",
      files: [
        {
          name: "gg1_1b.3p",
          size: 0x1000,
          target: "mainCpuRom",
          offset: 0x0000,
          critical: true,
          crc32: "ab036c9f"
        },
        {
          name: "gg1_2b.3m",
          size: 0x1000,
          target: "mainCpuRom",
          offset: 0x1000,
          critical: true,
          crc32: "d9232240"
        },
        {
          name: "gg1_3.2m",
          size: 0x1000,
          target: "mainCpuRom",
          offset: 0x2000,
          critical: true,
          crc32: "753ce503"
        },
        {
          name: "gg1_4b.2l",
          size: 0x1000,
          target: "mainCpuRom",
          offset: 0x3000,
          critical: true,
          crc32: "499fcc76"
        },

        {
          name: "gg1_5b.3f",
          size: 0x1000,
          target: "subCpuRom",
          offset: 0x0000,
          critical: true,
          crc32: "bb5caae3"
        },
        {
          name: "gg1_7b.2c",
          size: 0x1000,
          target: "sub2CpuRom",
          offset: 0x0000,
          critical: true,
          crc32: "d016686b"
        },

        {
          name: "gg1_9.4l",
          size: 0x1000,
          target: "charRom",
          offset: 0x0000,
          critical: true,
          crc32: "58b2f47c"
        },
        {
          name: "gg1_11.4d",
          size: 0x1000,
          target: "spriteRom",
          offset: 0x0000,
          critical: true,
          crc32: "ad447c80"
        },
        {
          name: "gg1_10.4f",
          size: 0x1000,
          target: "spriteRom",
          offset: 0x1000,
          critical: true,
          crc32: "dd6f1afc"
        },

        {
          name: "51xx.bin",
          size: 0x0400,
          target: "mcuRom51",
          offset: 0x0000,
          critical: true,
          crc32: "c2f57ef8"
        },
        {
          name: "54xx.bin",
          size: 0x0400,
          target: "mcuRom54",
          offset: 0x0000,
          critical: true,
          crc32: "ee7357e0"
        },

        {
          name: "prom-5.5n",
          size: 0x0020,
          target: "proms",
          offset: 0x0000,
          critical: true,
          crc32: "54603c6b"
        },
        {
          name: "prom-4.2n",
          size: 0x0100,
          target: "proms",
          offset: 0x0020,
          critical: true,
          crc32: "59b6edab"
        },
        {
          name: "prom-3.1c",
          size: 0x0100,
          target: "proms",
          offset: 0x0120,
          critical: true,
          crc32: "4a04bb6b"
        },

        {
          name: "prom-1.1d",
          size: 0x0100,
          target: "soundProms",
          offset: 0x0000,
          soundPromRole: "waveform",
          critical: true,
          crc32: "7a2815b4"
        },
        {
          name: "prom-2.5c",
          size: 0x0100,
          target: "soundProms",
          offset: 0x0100,
          soundPromRole: "timing",
          emulationRequired: false,
          critical: false
        }
      ]
    };
    this.applyOverrides(overrides);
  }
  applyOverrides(overrides = {}) {
    if (!overrides || typeof overrides !== "object") return this;

    for (const section of [
      "display",
      "performance",
      "audio",
      "input",
      "roms"
    ]) {
      const values = overrides[section];

      if (!values || typeof values !== "object") continue;

      this[section] = {
        ...this[section],
        ...values
      };
    }

    this._validate();
    return this;
  }
  _validate() {
    const { display, performance, audio, input } = this;

    display.orientation =
      display.orientation === "landscape" ? "landscape" : "portrait";

    display.width = Math.max(1, display.width | 0);
    display.height = Math.max(1, display.height | 0);
    display.scale = Math.max(1, Number(display.scale) || 1);
    display.pixelated = !!display.pixelated;

    performance.targetFPS = Math.max(
      1,
      Number(performance.targetFPS) || EmulatorConfig.TARGET_FPS
    );
    performance.enableFrameSkip = !!performance.enableFrameSkip;
    performance.maxFrameDeltaMs = Math.max(
      1,
      Number(performance.maxFrameDeltaMs) || 250
    );

    audio.enabled = !!audio.enabled;
    audio.masterVolume = Math.max(
      0,
      Math.min(1, Number(audio.masterVolume) || 0)
    );
    audio.bufferSize = Math.max(256, audio.bufferSize | 0);
    audio.sampleRate = Math.max(8_000, audio.sampleRate | 0);

    input.touchDeadzone = Math.max(0, Number(input.touchDeadzone) || 0);
    input.doubleTapTimeout = Math.max(0, Number(input.doubleTapTimeout) || 0);
    input.preventScroll = !!input.preventScroll;
    input.pulseDurationMs = Math.max(1, Number(input.pulseDurationMs) || 100);
    input.touchPulseDurationMs = Math.max(
      1,
      Number(input.touchPulseDurationMs) || 250
    );
  }
  getCanvasSize() {
    return {
      width: this.display.width,
      height: this.display.height
    };
  }
  getScaledCanvasSize() {
    return {
      width: Math.round(this.display.width * this.display.scale),
      height: Math.round(this.display.height * this.display.scale)
    };
  }
  getFrameDurationMs() {
    return 1000 / this.performance.targetFPS;
  }
  isPortrait() {
    return this.display.orientation === "portrait";
  }
}
class GalagaDipSwitches {
  static DIFFICULTY_BITS = [0x03, 0x00, 0x01, 0x02];

  static DIFFICULTY_TEXT = ["Easy", "Medium", "Hard", "Hardest"];

  // CONFIRMED against galaga.cpp's actual Bonus_Life PORT_CONDITION
  // comments ("Began with 2, 3 or 4 fighters" / "Began with 5 fighters"):
  // Galaga's Lives dip genuinely offers 2/3/4/5 fighters as its four
  // options -- unlike Bosconian's 1/2/3/5 -- so this array's *labels* are
  // architecturally correct.
  //
  // UNVERIFIED: the exact hex-to-label mapping for 0x00 and 0x40 could not
  // be confirmed this session (that specific PORT_DIPNAME(0xc0,...,Lives)
  // block for galaga fell outside the retrieved source excerpts). 0x80=3
  // and 0xc0=5 are held with high confidence: 0x80 is self-consistent with
  // this class's own documented DSWB=0x97 factory default (3 fighters,
  // matching the well-known real-hardware default), and 0xc0=5 matches
  // Bosconian's identical convention plus the "EQUALS 0xc0" =
  // "5 fighters" comment above. Do not change 0x00/0x40 without pulling
  // the actual PORT_DIPNAME(0xc0, ..., DEF_STR(Lives)) block for galaga
  // and confirming the PORT_DIPSETTING order directly.
  static LIVES_BITS = [
    0x00, // 2 fighters -- UNVERIFIED, see note above
    0x80, // 3 fighters -- confirmed via factory-default consistency
    0x40, // 4 fighters -- UNVERIFIED, see note above
    0xc0 // 5 fighters -- confirmed via Bosconian-convention + comment match
  ];

  static LIVES_LABELS = [2, 3, 4, 5];

  // CONFIRMED byte-for-byte against galaga.cpp's DSWB Coinage block.
  static COINAGE_TEXT = {
    0x04: "4 Coins / 1 Credit",
    0x02: "3 Coins / 1 Credit",
    0x06: "2 Coins / 1 Credit",
    0x07: "1 Coin / 1 Credit",
    0x01: "2 Coins / 3 Credits",
    0x03: "1 Coin / 2 Credits",
    0x05: "1 Coin / 3 Credits",
    0x00: "Free Play"
  };

  // CONFIRMED against galaga.cpp's Bonus_Life block, both branches.
  static BONUS_BITS = [0x20, 0x18, 0x10, 0x30, 0x38, 0x08, 0x28, 0x00];

  static BONUS_TEXT_NORMAL = [
    "20K, 60K, Every 60K",
    "20K and 60K Only",
    "20K, 70K, Every 70K",
    "20K, 80K, Every 80K",
    "30K and 80K Only",
    "30K, 100K, Every 100K",
    "30K, 120K, Every 120K",
    "None"
  ];

  // First 6 entries confirmed against source; final two (0x28, 0x00)
  // inferred from pattern consistency (every other bonus-table branch in
  // this driver ends in a "...Only" style entry followed by "None") but
  // not independently re-verified byte-for-byte this session.
  static BONUS_TEXT_5_LIVES = [
    "30K, 100K, Every 100K",
    "30K and 150K Only",
    "30K, 120K, Every 120K",
    "30K, 150K, Every 150K",
    "30K Only",
    "30K and 100K Only",
    "30K and 120K Only",
    "None"
  ];

  constructor(initialSettings = {}) {
    // MAME-compatible defaults for Galaga:
    // DSWA = 0xb8: Medium, demo sound on, freeze/rack test off, upright.
    // DSWB = 0x97: 1C/1C, 20K/70K every 70K, 3 fighters.
    this.settings = {
      difficulty: 2,
      demoSounds: true,
      freeze: false,
      rackTest: false,
      cabinet: "upright",
      coinage: 0x07,
      bonusLife: 2,
      lives: 1,
      ...initialSettings
    };
    this._normalize();
  }

  _normalize() {
    const s = this.settings;

    s.difficulty = Number(s.difficulty) & 0x03;
    s.demoSounds = !!s.demoSounds;
    s.freeze = !!s.freeze;
    s.rackTest = !!s.rackTest;

    if (typeof s.cabinet === "number") {
      s.cabinet = s.cabinet ? "cocktail" : "upright";
    } else {
      s.cabinet = s.cabinet === "cocktail" ? "cocktail" : "upright";
    }

    s.coinage = Number(s.coinage) & 0x07;
    s.bonusLife = Number(s.bonusLife) & 0x07;
    s.lives = Number(s.lives) & 0x03;
  }

  getBankA() {
    const s = this.settings;
    let value = 0xff;

    value = (value & ~0x03) | GalagaDipSwitches.DIFFICULTY_BITS[s.difficulty];

    // Demo sound is active-low: clear means enabled.
    value = s.demoSounds ? value & ~0x08 : value | 0x08;

    // Freeze and rack test are active-low: clear means enabled.
    value = s.freeze ? value & ~0x10 : value | 0x10;
    value = s.rackTest ? value & ~0x20 : value | 0x20;

    // Bit 6 is unused and remains high.
    value = s.cabinet === "cocktail" ? value & ~0x80 : value | 0x80;

    return value & 0xff;
  }

  getBankB() {
    const s = this.settings;
    let value = 0xff;

    value = (value & ~0x07) | s.coinage;
    value =
      (value & ~0x38) | (GalagaDipSwitches.BONUS_BITS[s.bonusLife] & 0x38);
    value = (value & ~0xc0) | GalagaDipSwitches.LIVES_BITS[s.lives];

    return value & 0xff;
  }

  // FIX: matches MAME's bosco_dsw_r() exactly --
  //   uint8_t galaga_state::bosco_dsw_r(offs_t offset) {
  //       int bit0,bit1;
  //       bit0 = (ioport("DSWB")->read() >> offset) & 1;
  //       bit1 = (ioport("DSWA")->read() >> offset) & 1;
  //       return bit0 | (bit1 << 1);
  //   }
  // Real hardware returns a clean [0,3] value with every other bit zero.
  // The previous "0xfc |" forced the upper 6 bits high, corrupting every
  // DIP read to 0xFC-0xFF instead of 0x00-0x03 -- the same bug class as
  // GalagaEmulator's standalone readDSW() method.
  readHardware(offset) {
    const bit = offset & 0x07;
    const bankA = this.getBankA();
    const bankB = this.getBankB();

    return ((bankB >>> bit) & 0x01) | (((bankA >>> bit) & 0x01) << 1);
  }

  setFromBanks(dswa, dswb) {
    const bankA = dswa & 0xff;
    const bankB = dswb & 0xff;

    const difficultyBits = bankA & 0x03;
    const difficulty = GalagaDipSwitches.DIFFICULTY_BITS.indexOf(
      difficultyBits
    );

    const bonusBits = bankB & 0x38;
    const bonusLife = GalagaDipSwitches.BONUS_BITS.indexOf(bonusBits);

    const livesBits = bankB & 0xc0;
    const lives = GalagaDipSwitches.LIVES_BITS.indexOf(livesBits);

    this.settings.difficulty = difficulty >= 0 ? difficulty : 1;
    this.settings.demoSounds = (bankA & 0x08) === 0;
    this.settings.freeze = (bankA & 0x10) === 0;
    this.settings.rackTest = (bankA & 0x20) === 0;
    this.settings.cabinet = (bankA & 0x80) === 0 ? "cocktail" : "upright";

    this.settings.coinage = bankB & 0x07;
    this.settings.bonusLife = bonusLife >= 0 ? bonusLife : 2;
    this.settings.lives = lives >= 0 ? lives : 1;

    return this;
  }

  getDifficultyText() {
    return GalagaDipSwitches.DIFFICULTY_TEXT[this.settings.difficulty];
  }

  getLivesText() {
    return `${GalagaDipSwitches.LIVES_LABELS[this.settings.lives]} fighters`;
  }

  getBonusLifeText() {
    const table =
      this.settings.lives === 3
        ? GalagaDipSwitches.BONUS_TEXT_5_LIVES
        : GalagaDipSwitches.BONUS_TEXT_NORMAL;

    return table[this.settings.bonusLife];
  }

  getCoinSettingText() {
    return GalagaDipSwitches.COINAGE_TEXT[this.settings.coinage] ?? "Unknown";
  }

  getCabinetText() {
    return this.settings.cabinet === "cocktail" ? "Cocktail" : "Upright";
  }

  getSummary() {
    return {
      dswa: this.getBankA(),
      dswb: this.getBankB(),
      difficulty: this.getDifficultyText(),
      coinage: this.getCoinSettingText(),
      bonusLife: this.getBonusLifeText(),
      lives: this.getLivesText(),
      cabinet: this.getCabinetText(),
      demoSounds: this.settings.demoSounds ? "On" : "Off",
      freeze: this.settings.freeze ? "On" : "Off",
      rackTest: this.settings.rackTest ? "On" : "Off"
    };
  }
}
class TimingSequencer {
  static MASTER_CLOCK = 18_432_000;
  static Z80_TICKS = 6;
  static PIXEL_TICKS = 3;
  static HTOTAL = 384;
  static VTOTAL = 264;
  static VISIBLE_Y_START = 0;
  static VISIBLE_Y_END_EXCLUSIVE = 224;
  static VBLANK_START = 224;
  static VBLANK_END = 0;
  static SCANLINE_TICKS = TimingSequencer.HTOTAL * TimingSequencer.PIXEL_TICKS;
  static FRAME_TICKS = TimingSequencer.SCANLINE_TICKS * TimingSequencer.VTOTAL;
  static CPU3_NMI_INITIAL_SCANLINE = 64;
  static CPU3_NMI_SCANLINE_STEP = 128;
  static CPU3_NMI_WRAP = 272;
  static MAX_EVENTS_AT_ONE_TICK = 100_000;
  constructor(machine) {
    this.machine = machine;

    this.now = 0;

    this.sequence = 0;
    this.events = [];
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;
    this.deferredCpuSynchronizations = [];

    this.rasterTimersArmed = false;
    this.cpu3NmiTimerArmed = false;
    this.cpu3NmiGateOpen = true;
    this.cpuSlots = [
      {
        kind: "cpu",
        name: "main",
        local: 0,
        cpu: () => this.machine.mainCpu
      },
      {
        kind: "cpu",
        name: "sub",
        local: 0,
        cpu: () => this.machine.subCpu
      },
      {
        kind: "cpu",
        name: "sub2",
        local: 0,
        cpu: () => this.machine.sub2Cpu
      }
    ];
    this.mcuSlots = [
      {
        kind: "mcu",
        name: "51xx",
        local: 0,
        device: () => this.machine.inputController
      },
      {
        kind: "mcu",
        name: "50xx-cpu-board",
        local: 0,
        device: () => this.machine.cpuBoard50xx ?? this.machine.movementMcu1
      },
      {
        kind: "mcu",
        name: "50xx-video-board",
        local: 0,
        device: () => this.machine.videoBoard50xx ?? this.machine.movementMcu2
      },
      {
        kind: "mcu",
        name: "52xx",
        local: 0,
        device: () => this.machine.voiceChip
      },
      {
        kind: "mcu",
        name: "54xx",
        local: 0,
        device: () => this.machine.namco54xx
      }
    ];
  }
  get schedulerTick() {
    return this.activeTick ?? this.now;
  }
  get eventCount() {
    return this.events.length - this.eventHead;
  }
  get nextDeadline() {
    this.discardCancelledHead();

    return this.eventHead < this.events.length
      ? this.events[this.eventHead].deadline
      : Infinity;
  }
  reset() {
    this.now = 0;

    this.sequence = 0;
    this.events.length = 0;
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;
    this.deferredCpuSynchronizations.length = 0;

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
        "Invalid timing-event deadline: " + String(deadline)
      );
    }

    const event = {
      deadline: Math.max(this.schedulerTick, requestedDeadline),
      sequence: ++this.sequence,
      callback,
      owner,
      cancelled: false
    };

    let low = this.eventHead;
    let high = this.events.length;

    while (low < high) {
      const middle = (low + high) >> 1;
      const other = this.events[middle];

      const insertAfter =
        other.deadline < event.deadline ||
        (other.deadline === event.deadline && other.sequence <= event.sequence);

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
      }
    };
  }
  synchronize(callback, owner = null) {
    if (typeof callback !== "function") {
      throw new TypeError("Timing synchronization callback must be a function");
    }

    /*
     * Z80.step() is instruction-atomic. A memory-mapped device write can ask
     * for scheduler synchronization while that instruction is still running,
     * but activeTick is necessarily the instruction's start tick. Queuing the
     * callback there creates an event in the past as soon as the instruction
     * retires. Hold these callbacks until the instruction's cycle count is
     * known, then queue them at its retirement tick.
     */
    if (this.activeSlot?.kind === "cpu") {
      const deferred = {
        callback,
        owner,
        cancelled: false
      };

      this.deferredCpuSynchronizations.push(deferred);

      return {
        cancel: () => {
          deferred.cancelled = true;
        }
      };
    }

    return this.at(this.schedulerTick, callback, owner);
  }
  flushCpuSynchronizations(deadline) {
    const pending = this.deferredCpuSynchronizations;
    this.deferredCpuSynchronizations = [];

    for (const deferred of pending) {
      if (!deferred.cancelled) {
        this.at(deadline, deferred.callback, deferred.owner);
      }
    }
  }
  cancelOwner(owner) {
    for (const deferred of this.deferredCpuSynchronizations) {
      if (deferred.owner === owner) {
        deferred.cancelled = true;
      }
    }

    for (let index = this.eventHead; index < this.events.length; index++) {
      if (this.events[index].owner === owner) {
        this.events[index].cancelled = true;
      }
    }
  }
  discardCancelledHead() {
    while (
      this.eventHead < this.events.length &&
      this.events[this.eventHead].cancelled
    ) {
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
  ownerName(owner) {
    if (owner == null) {
      return "anonymous";
    }

    if (typeof owner === "string") {
      return owner;
    }

    return owner.constructor?.name ?? String(owner);
  }
  dispatchCurrentTime() {
    let dispatched = 0;

    for (;;) {
      this.discardCancelledHead();

      if (this.eventHead >= this.events.length) {
        return dispatched;
      }

      const event = this.events[this.eventHead];

      // The event queue is deadline-sorted. Nothing else is due yet.
      if (event.deadline > this.now) {
        return dispatched;
      }

      /*
       * A deadline earlier than `now` means a clocked device ran past a
       * scheduler barrier. Do not silently execute the callback late: that
       * would shift vblank, IRQ, NMI, synchronized 06XX writes, or MCU
       * latch changes relative to the emulated hardware timeline.
       */
      if (event.deadline < this.now) {
        throw new Error(
          "Late timing event: deadline " +
            event.deadline +
            " < now " +
            this.now +
            " owner " +
            this.ownerName(event.owner)
        );
      }

      // Advance before invoking the callback. A callback may schedule another
      // event at this same tick; `at()` will insert it after existing same-tick
      // events because its sequence number is newer.
      this.eventHead++;

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
            message
        );

        error.cause = cause;
        throw error;
      }

      dispatched++;

      if (dispatched > this.constructor.MAX_EVENTS_AT_ONE_TICK) {
        throw new Error(
          "Timing event-loop overflow at tick " +
            this.now +
            " after " +
            dispatched +
            " callbacks; last owner " +
            this.ownerName(event.owner)
        );
      }
    }
  }
  cpuIsHeld(slot) {
    const cpu = slot.cpu?.();
    if (!cpu || cpu.inReset) {
      return true;
    }
    if (typeof cpu.isReset === "function" && cpu.isReset()) {
      return true;
    }
    if (slot.name !== "main") {
      return !!(
        this.machine.cpuBoardResetAsserted ?? this.machine.subsystemsReset
      );
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

    for (const slot of this.mcuSlots) {
      const device = slot.device?.();

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

    const consider = (slot) => {
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
  syncNow(barrier = Infinity) {
    let earliest = Infinity;

    for (const slot of this.liveCpuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    for (const slot of this.liveMcuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    if (Number.isFinite(earliest)) {
      /*
       * A complete Z80 instruction may cross an event boundary. Its local
       * clock records the retirement time, but global scheduler time must stop
       * at the boundary so the event is dispatched at its exact deadline.
       */
      // Device execution may have queued an earlier synchronization event.
      this.now = Math.min(earliest, barrier, this.nextDeadline);
    }
  }
  runOneCpuInstruction(slot, barrier) {
    const cpu = slot.cpu?.();

    if (!cpu || this.cpuIsHeld(slot)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    this.activeTick = slot.local;
    this.activeSlot = slot;
    this.machine._activeCpuName = slot.name;
    this.deferredCpuSynchronizations = [];

    let completed = false;

    try {
      const cycles = cpu.step?.() ?? 0;

      if (!Number.isFinite(cycles) || cycles < 0) {
        throw new Error(
          "Invalid Z80 cycle result for " + slot.name + ": " + String(cycles)
        );
      }

      if (cycles === 0) {
        slot.local = Math.max(slot.local, barrier);
        completed = true;
        return;
      }

      slot.local += cycles * this.constructor.Z80_TICKS;
      completed = true;
    } finally {
      if (completed) {
        this.flushCpuSynchronizations(slot.local);
      } else {
        this.deferredCpuSynchronizations.length = 0;
      }

      this.activeTick = null;
      this.activeSlot = null;
      this.machine._activeCpuName = null;
    }
  }
  deviceQuantumTicks(device, name) {
    const quantum =
      typeof device.nextMasterTickBoundary === "function"
        ? device.nextMasterTickBoundary()
        : device.constructor?.MASTER_TICKS_PER_MCU_CYCLE;

    if (!Number.isFinite(quantum) || quantum <= 0) {
      throw new Error(
        "Timing device " +
          name +
          " must expose nextMasterTickBoundary() or " +
          "MASTER_TICKS_PER_MCU_CYCLE"
      );
    }

    return Math.floor(quantum);
  }
  runOneMcuQuantum(slot, barrier) {
    const device = slot.device?.();

    if (!device || this.deviceIsHeld(slot, device)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    if (typeof device.advanceMasterTicks !== "function") {
      throw new Error(
        "Timing device " +
          slot.name +
          " must implement advanceMasterTicks(deltaMasterTicks)"
      );
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
          "Timing deadline moved backward: " + barrier + " < " + this.now
        );
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

      this.syncNow(barrier);
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
        "Cannot run scheduler backward: " + target + " < " + this.now
      );
    }

    this.advanceTo(target);
  }
  frameOrigin() {
    return (
      Math.floor(this.now / this.constructor.FRAME_TICKS) *
      this.constructor.FRAME_TICKS
    );
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
      () => {
        this.machine.onVblankFalling?.();

        this.scheduleVblankFalling(deadline + this.constructor.FRAME_TICKS);
      },
      "vblank-falling"
    );
  }
  scheduleVblankRising(deadline) {
    this.at(
      deadline,
      () => {
        this.machine.onVblankRising?.();

        this.scheduleVblankRising(deadline + this.constructor.FRAME_TICKS);
      },
      "vblank-rising"
    );
  }
  setCpu3NmiGateFromQ2(q2State) {
    this.cpu3NmiGateOpen = !Boolean(q2State);

    return this.cpu3NmiGateOpen;
  }
  latchCpu3NmiFromTimer() {
    const machine = this.machine;
    const soundCpu = machine.sub2Cpu;

    const cpuBoardResetAsserted = !!(
      machine.cpuBoardResetAsserted ?? machine.subsystemsReset
    );

    const soundCpuReset = !!(soundCpu?.inReset || soundCpu?.isReset?.());

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
    machine.soundNmiCount = (machine.soundNmiCount ?? 0) + 1;

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
      "cpu3-nmi-timer"
    );
  }
  runFrame() {
    this.armRasterTimers();
    this.armCpu3NmiTimer();

    const frameEnd = this.frameOrigin() + this.constructor.FRAME_TICKS;

    this.runUntil(Math.max(frameEnd, this.now + 1));
  }
}
class Namco05XX {
  static VISIBLE_LINES = 224;
  static STARFIELD_PIXEL_WIDTH = 256;

  static LFSR_HIT_MASK = 0xfa14;
  static LFSR_HIT_VALUE = 0x7800;
  static LFSR_SEED = 0x7fff;

  /*
   * MAME starfield speed timing.
   *
   * The 05XX does not scroll stars by adding a pixel-coordinate offset.
   * Motion comes from advancing the LFSR a different number of times
   * during horizontal blanking before/after visible pixels.
   */
  static SPEED_X_CYCLE_COUNT_OFFSET = [0, 1, 2, 3, -4, -3, -2, -1];

  static PRE_VIS_CYCLE_COUNT_VALUES = [
    22 * 256,
    23 * 256,
    22 * 256,
    23 * 256,
    19 * 256,
    20 * 256,
    20 * 256,
    22 * 256
  ];

  static POST_VIS_CYCLE_COUNT_VALUES = [
    10 * 256,
    10 * 256,
    12 * 256,
    12 * 256,
    9 * 256,
    9 * 256,
    10 * 256,
    9 * 256
  ];

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
  static STAR_R = new Uint8Array([0, 71, 151, 222]);
  static STAR_G = new Uint8Array([0, 71, 151, 222]);
  static STAR_B = new Uint8Array([0, 81, 174, 255]);

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
  static STAR_CSS = Namco05XX.buildStarCssPalette();

  constructor(opts = {}) {
    /*
     * The physical 05XX produces a 256-pixel star window. Bosconian's
     * visible landscape presentation places that in a 288-pixel-wide area.
     */
    this.offsetX = opts.offsetX ?? 0;
    this.offsetY = opts.offsetY ?? 0;
    this.limitX = opts.limitX ?? Namco05XX.STARFIELD_PIXEL_WIDTH;

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

    this.scrollXIndex = opts.scrollXIndex ?? 7;
    this.scrollYIndex = opts.scrollYIndex ?? 0;

    this.sf0 = opts.sf0 ?? 0;
    this.sf1 = opts.sf1 ?? 0;

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
      const g = Namco05XX.STAR_G[(color >>> 2) & 0x03];
      const b = Namco05XX.STAR_B[(color >>> 4) & 0x03];

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

    switch ((this.sf1 << 1) | this.sf0) {
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
        break;
    }
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
      Math.min(Namco05XX.STARFIELD_PIXEL_WIDTH, limX | 0)
    );
  }

  /*
   * Bosconian's six one-bit starfield-control latches.
   */
  applyBoscoControl(offset, data) {
    const ofs = offset & 0x07;
    const bit = data & 0x01;

    if (ofs > 5) {
      return false;
    }

    this.boscoLatch[ofs] = bit;

    if (ofs <= 2) {
      const speedIndex =
        (this.boscoLatch[0] << 0) |
        (this.boscoLatch[1] << 1) |
        (this.boscoLatch[2] << 2);

      /*
       * Bosconian uses its three control bits for the X speed selection.
       * Do not turn this into a draw-coordinate scroll value; the altered
       * LFSR cycle count is what creates hardware-accurate motion.
       */
      this.setScrollSpeed(speedIndex, this.scrollYIndex);
      this.scrollX = 0;

      return true;
    }

    if (ofs === 3 || ofs === 4) {
      this.setActiveSetLines(this.boscoLatch[3], this.boscoLatch[4]);

      return true;
    }

    this.enableStarfield(bit !== 0);
    return true;
  }

  static getNextLfsrState(lfsr) {
    const bit = ((lfsr >> 0) ^ (lfsr >> 3) ^ (lfsr >> 5) ^ (lfsr >> 10)) & 0x01;

    return ((lfsr >> 1) | (bit << 15)) & 0xffff;
  }

  static isHit(lfsr) {
    return (lfsr & Namco05XX.LFSR_HIT_MASK) === Namco05XX.LFSR_HIT_VALUE;
  }

  static getStarSet(lfsr) {
    return (((lfsr >> 10) & 0x01) << 1) | ((lfsr >> 8) & 0x01);
  }

  static decodeColor6(lfsr) {
    let color = (lfsr >> 5) & 0x07;
    color |= (lfsr << 3) & 0x18;
    color |= (lfsr << 2) & 0x20;

    return ~color & 0x3f;
  }

  static color6ToRgb(color6) {
    const color = color6 & 0x3f;

    return {
      r: Namco05XX.STAR_R[color & 0x03],
      g: Namco05XX.STAR_G[(color >>> 2) & 0x03],
      b: Namco05XX.STAR_B[(color >>> 4) & 0x03]
    };
  }

  render(ctx, opts = {}) {
    if (!this.enabled) {
      return;
    }

    const flip = opts.flip ?? this.flip;
    const pixelSize = Math.max(1, opts.pixelSize ?? 1);

    const width = opts.width ?? 288;
    const height = opts.height ?? Namco05XX.VISIBLE_LINES;

    const clipX0 = opts.clipX0 ?? 0;
    const clipY0 = opts.clipY0 ?? 0;
    const clipX1 = opts.clipX1 ?? width;
    const clipY1 = opts.clipY1 ?? height;

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
            sourceX < visibleWindowEnd &&
            (starSet === this.setA || starSet === this.setB)
          ) {
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
              drawY < clipY1
            ) {
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
  }
}
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
  static DEFAULT_Z80_CYCLES_PER_DEVICE_CLOCK = 64;
  static DEFAULT_MASTER_TICKS_PER_Z80_CYCLE = 6;

  constructor(opts = {}) {
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
    this.masterTicksPerZ80Cycle =
      opts.masterTicksPerZ80Cycle ??
      Namco06XX.DEFAULT_MASTER_TICKS_PER_Z80_CYCLE;

    if (
      !Number.isInteger(this.masterTicksPerZ80Cycle) ||
      this.masterTicksPerZ80Cycle <= 0
    ) {
      throw new RangeError(
        "Namco06XX: masterTicksPerZ80Cycle must be a positive integer"
      );
    }

    /*
     * Prefer the direct hardware interval when supplied. This avoids
     * tying the class unnecessarily to Z80-specific terminology while
     * still allowing the MAME Bosconian clocks to be expressed naturally.
     */
    const explicitDeviceEdge = opts.masterTicksPerDeviceEdge;

    if (explicitDeviceEdge != null) {
      this.masterTicksPerDeviceEdge = Math.floor(Number(explicitDeviceEdge));

      if (
        !Number.isFinite(this.masterTicksPerDeviceEdge) ||
        this.masterTicksPerDeviceEdge <= 0
      ) {
        throw new RangeError(
          "Namco06XX: masterTicksPerDeviceEdge must be a positive integer"
        );
      }

      this.z80CyclesPerDeviceClock =
        this.masterTicksPerDeviceEdge / this.masterTicksPerZ80Cycle;
    } else {
      this.z80CyclesPerDeviceClock =
        opts.z80CyclesPerDeviceClock ??
        Namco06XX.DEFAULT_Z80_CYCLES_PER_DEVICE_CLOCK;

      if (
        !Number.isInteger(this.z80CyclesPerDeviceClock) ||
        this.z80CyclesPerDeviceClock <= 0
      ) {
        throw new RangeError(
          "Namco06XX: z80CyclesPerDeviceClock must be a positive integer"
        );
      }

      this.masterTicksPerDeviceEdge =
        this.masterTicksPerZ80Cycle * this.z80CyclesPerDeviceClock;
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
      throw new RangeError("Namco06XX: masterTicksPerDeviceEdge must be even");
    }

    /*
     * Optional host CPU resolver.
     *
     * MAME suppresses a 06XX NMI line write if its configured controlling
     * CPU is suspended for HALT/reset/disable reasons. Do not confuse a
     * normal Z80 HALT instruction with that machine-level suspension:
     * NMI must wake a halted Z80.
     */
    this.hostCpu = typeof opts.hostCpu === "function" ? opts.hostCpu : null;

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
      typeof opts.onHostNmiClear === "function" ? opts.onHostNmiClear : null;

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
    return (this.control >>> 5) & 0x07;
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

    return (this.masterTicksPerDeviceEdge / 2) * this.divider;
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

  cancelTimer() {
    this.timerGeneration++;

    this.timerHandle?.cancel?.();
    this.timerHandle = null;
    this.nextDeadline = null;
  }

  synchronize(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Namco06XX: synchronize callback must be a function");
    }

    if (this.scheduler?.synchronize) {
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

    this.armAt(this.scheduler.now + this.callbackPeriodTicks, () => {
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
        `Namco06XX: invalid timer deadline ${String(deadline)}`
      );
    }

    this.nextDeadline = target;

    this.timerHandle = this.scheduler.at(
      target,
      () => {
        this.timerHandle = null;
        this.nextDeadline = null;

        if (generation !== this.timerGeneration || this.divider === 0) {
          return;
        }

        callback();
      },
      this
    );
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

    for (let slot = 0; slot < 4; slot++) {
      this.devices[slot]?.rw?.(level);
    }
  }

  applyAllChipSelects() {
    for (let slot = 0; slot < 4; slot++) {
      this.applyChipSelectToSlot(slot);
    }
  }

  applyLinesToSlot(slot) {
    const device = this.devices[slot];

    if (!device) {
      return;
    }

    /*
     * Construction-time propagation. Runtime MAME R/W updates happen only
     * during timerState=true; this establishes the currently driven state
     * for an object attached after construction.
     */
    device.rw?.(this.isReadMode ? 1 : 0);
    this.applyChipSelectToSlot(slot);
  }

  applyChipSelectToSlot(slot) {
    const selected = (this.selectedMask & (1 << slot)) !== 0;
    const level = this.timerState && selected;

    this.devices[slot]?.chipSelect?.(level ? 1 : 0);
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
  hostCanObserveNmi() {
    const hostCpu = this.hostCpu?.();

    if (!hostCpu) {
      return true;
    }

    return !(
      hostCpu.inReset ||
      hostCpu.disabled ||
      hostCpu.suspended ||
      hostCpu.isReset?.() ||
      hostCpu.isDisabled?.()
    );
  }

  /*
   * Level-sensitive NMI interface.
   */
  setHostNmi(level) {
    if (!this.hostCanObserveNmi()) {
      return;
    }

    if (level) {
      this.onHostNmi?.();
    } else {
      this.onHostNmiClear?.();
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
      if ((this.selectedMask & (1 << slot)) !== 0) {
        this.devices[slot]?.write?.(value);
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
      if ((this.selectedMask & (1 << slot)) === 0) {
        continue;
      }

      const device = this.devices[slot];

      const value =
        device && typeof device.read === "function" ? device.read() : 0xff;

      if (!Number.isInteger(value)) {
        throw new Error(
          `Namco06XX: slot ${slot} returned invalid read value ` + String(value)
        );
      }

      result &= value & 0xff;
    }

    return result & 0xff;
  }

  readControl() {
    return this.control & 0xff;
  }
}
class MB88xx {
  static INT_CAUSE_SERIAL = 0x01;
  static INT_CAUSE_TIMER = 0x02;
  static INT_CAUSE_EXTERNAL = 0x04;
  static TIMER_PRESCALE = 32;

  constructor({ programWidth = 10, dataWidth = 6 } = {}) {
    this.programWidth = programWidth;
    this.dataWidth = dataWidth;

    this.pageMask = (1 << (programWidth - 6)) - 1;
    this.romMask = (1 << programWidth) - 1;
    this.dataMask = (1 << dataWidth) - 1;

    this.rom = new Uint8Array(1 << programWidth);
    this.data = new Uint8Array(1 << dataWidth);

    this.readK = () => 0;
    this.readR = [() => 0, () => 0, () => 0, () => 0];
    this.writeR = [() => {}, () => {}, () => {}, () => {}];
    this.writeO = (_data, _mask) => {};
    this.writeP = (_data) => {};
    this.readSI = () => 0;
    this.writeSO = (_bit) => {};

    this.romLoaded = false;

    this.ifLine = 0;
    this.ctr = 0;
    this.oOutput = 0;
    this.serialEnabled = false;
    this.halted = false;
    this.resetAsserted = false;
    this.data.fill(0);

    this.reset();
  }

  loadROM(romData) {
    this.rom.fill(0);
    const src =
      romData instanceof Uint8Array ? romData : new Uint8Array(romData);
    this.rom.set(src.subarray(0, Math.min(src.length, this.rom.length)));
    this.romLoaded = true;
  }

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

    this.pio = 0;
    this.TH = 0;
    this.TL = 0;
    this.TP = 0;

    this.SB = 0;
    this.SBcount = 0;

    this.pendingIrq = 0;
    this.inIrq = false;
  }

  setHalt(state) {
    this.halted = !!state;
  }

  setResetLine(asserted) {
    const next = !!asserted;

    if (next === this.resetAsserted) {
      return false;
    }

    this.resetAsserted = next;

    if (next) {
      this.reset();
    }

    return true;
  }

  getPC() {
    return (this.PA << 6) + this.PC;
  }

  incPC() {
    this.PC++;
    if (this.PC >= 0x40) {
      this.PC = 0;
      this.PA = (this.PA + 1) & this.pageMask;
    }
  }

  getEA() {
    return ((this.X << 4) + this.Y) & this.dataMask;
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
    const before = this.oOutput;

    this.oOutput = (this.oOutput & ~mask) | ((index << shift) & mask);

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
    this.TL = (this.TL + 1) & 0x0f;
    if (this.TL === 0) {
      this.TH = (this.TH + 1) & 0x0f;
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
      let cause = "unknown";
      let vector = null;

      if (activePending & C.INT_CAUSE_EXTERNAL) {
        cause = "external";
        vector = 0x02;
      } else if (activePending & C.INT_CAUSE_TIMER) {
        cause = "timer";
        vector = 0x04;
      } else if (activePending & C.INT_CAUSE_SERIAL) {
        cause = "serial";
        vector = 0x06;
      }

      this.inIrq = true;

      this.SP[this.SI] =
        intpc |
        ((this.cf & 1) << 15) |
        ((this.zf & 1) << 14) |
        ((this.st & 1) << 13);

      this.SI = (this.SI + 1) & 3;
      this.PC = vector;
      this.PA = 0x00;
      this.st = 1;
      this.pendingIrq = 0;

      // The reference core charges three cycles for interrupt entry.
      this.burnCycles(3);
    }
  }

  step() {
    if (this.halted || this.resetAsserted) return 0;

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
        this.writePla(((this.cf & 1) << 4) | this.A);
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
        this.A = (this.A << 1) | (this.cf & 1);
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

        // Test old bit 0, expressed at bit 4 after the shift.
        this.st = (this.A << 4) & 0x10 ? 0 : 1;
        this.cf = this.st ^ 1;

        this.A = (this.A >>> 1) & 0x0f;
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
        this.writeR[this.Y >> 2](arg | (1 << (this.Y & 3)));
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
        this.st = arg & (1 << (this.Y & 3)) ? 0 : 1;
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
        this.SI = (this.SI - 1) & 3;
        this.PC = this.SP[this.SI] & 0x3f;
        this.PA = (this.SP[this.SI] >> 6) & this.pageMask;
        this.st = 1;
        break;
      case 0x2d:
        this.A = (~this.A + 1) & 0x0f;
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
        this.writeMem(this.getEA(), arg | (1 << (opcode & 3)));
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
        this.st = arg & (1 << (opcode & 3)) ? 0 : 1;
        break;
      case 0x3c:
        this.inIrq = false;
        this.SI = (this.SI - 1) & 3;
        this.PC = this.SP[this.SI] & 0x3f;
        this.PA = (this.SP[this.SI] >> 6) & this.pageMask;
        this.st = (this.SP[this.SI] >> 13) & 1;
        this.zf = (this.SP[this.SI] >> 14) & 1;
        this.cf = (this.SP[this.SI] >> 15) & 1;
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
        this.st = arg & (1 << (opcode & 3)) ? 0 : 1;
        break;
      case 0x4c:
      case 0x4d:
      case 0x4e:
      case 0x4f:
        this.st = this.A & (1 << (opcode & 3)) ? 0 : 1;
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
          this.SI = (this.SI + 1) & 3;
          this.PC = arg & 0x3f;
          this.PA = ((opcode & 7) << 2) | (arg >> 6);
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
          this.PA = ((opcode & 7) << 2) | (arg >> 6);
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
        break;
    }

    this.burnCycles(oc);
    return oc;
  }
}
class MB8843 extends MB88xx {
  constructor() {
    super({ programWidth: 10, dataWidth: 6 });
  }
}
class MB8844 extends MB88xx {
  constructor() {
    super({ programWidth: 10, dataWidth: 6 });
  }
}
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
  static CLOCK = 1_536_000;

  static MASTER_TICKS_PER_DEVICE_TICK = 12;
  static MB88XX_CYCLE_DIVIDER = 6;

  static MASTER_TICKS_PER_MCU_CYCLE =
    Namco51XX.MASTER_TICKS_PER_DEVICE_TICK * Namco51XX.MB88XX_CYCLE_DIVIDER;

  static MASTER_TICKS_PER_HOST_CYCLE = 6;
  static ROM_SIZE = 0x0400;

  constructor(
    dipSwitches = null,
    onOutput = null,
    onLockout = null,
    opts = {}
  ) {
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
      ((this.rwState & 0x01) << 3) | (this.portOValue & 0x07);

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
    this.mcu.writeO = (data) => {
      this.writeOFromMcu(data & 0xff);
    };

    /*
     * MAME:
     *
     * P_w(data) -> m_out(data)
     *
     * Do not mask to a nibble. MAME forwards the full byte.
     */
    this.mcu.writeP = (data) => {
      const value = data & 0xff;
      this.onOutput?.(value);
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
          romData.length.toString(16)
      );
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
    if (asserted) {
      this.mcu.reset?.();
    }
  }

  reset() {
    /*
     * This represents a machine-level core reset. MAME's 51XX wrapper
     * itself saves m_portO/m_rw and only its reset(state) method drives
     * the MB8843 reset input. Keep externally visible latch state unless
     * your surrounding machine reset implementation explicitly resets it.
     */
    this.mcu.reset?.();

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

    if (this.resetLineState !== 0) {
      this.mcu.setTC?.(nextTcAsserted);
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

    if (this.resetLineState !== 0) {
      this.mcu.setIRQ?.(next);
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
        this.scheduler && Number.isFinite(this.scheduler.schedulerTick)
          ? this.scheduler.schedulerTick
          : "none";

      console.log(
        "[51XX READ] " +
          "tick=" +
          tick +
          " " +
          "O=$" +
          value.toString(16).padStart(2, "0") +
          " " +
          "rw=" +
          (this.rwState & 1) +
          " " +
          "irq=" +
          (this.irqStateValue ? 1 : 0) +
          " " +
          "tc=" +
          (this.tcStateValue ? 1 : 0)
      );
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
          this.scheduler && Number.isFinite(this.scheduler.schedulerTick)
            ? this.scheduler.schedulerTick
            : "none";

        console.log(
          "[51XX O] " +
            "tick=" +
            tick +
            " " +
            "O=$" +
            value.toString(16).padStart(2, "0")
        );
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
    this.inputs[1] = (port0 >>> 4) & 0x0f;
    this.inputs[2] = port1 & 0x0f;
    this.inputs[3] = (port1 >>> 4) & 0x0f;
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
        "Namco51XX.advanceMasterTicks() requires a non-negative integer"
      );
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
      this.pendingMasterTicks / Namco51XX.MASTER_TICKS_PER_MCU_CYCLE
    );

    this.pendingMasterTicks -= cycles * Namco51XX.MASTER_TICKS_PER_MCU_CYCLE;

    if (cycles > 0) {
      this.executeMcuCycles(cycles);
    }
  }

  executeMcuCycles(cycles) {
    let remaining = cycles | 0;

    while (remaining > 0) {
      if (this.resetLineState === 0 || this.mcu.halted) {
        break;
      }

      const used = this.mcu.step?.() ?? 0;

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
        "Namco51XX.tickHostCycles() requires a non-negative integer"
      );
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
      ticksToNextMcuCycle: this.nextMasterTickBoundary()
    };
  }
  resetCounter() {
    /*
     * Compatibility no-op.
     *
     * MAME namco_51xx_device does not expose a counter-reset API in the
     * provided 0.289 source.
     */
  }
}
class Namco54XX {
  static CLOCK = 1_536_000;
  static MASTER_TICKS_PER_DEVICE_TICK = 12;
  static MB88XX_CYCLE_DIVIDER = 6;
  static MASTER_TICKS_PER_MCU_CYCLE = 72;
  static MASTER_TICKS_PER_HOST_CYCLE = 6;
  static MCU_ROM_SIZE = 0x0400;
  static CHANNEL_COUNT = 3;

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

  getMasterTick() {
    const tick = this.scheduler?.schedulerTick;
    return Number.isFinite(tick) ? Math.floor(tick) : 0;
  }

  synchronize(callback) {
    if (typeof this.scheduler?.synchronize === "function") {
      return this.scheduler.synchronize(callback, this);
    }

    if (typeof this.scheduler?.at === "function") {
      return this.scheduler.at(this.getMasterTick(), callback, this);
    }

    callback();
    return null;
  }

  installMcuCallbacks() {
    // MAME namco54.cpp:
    //
    // K  <- command bits 7..4
    // R0 <- command bits 3..0
    // O  -> discrete NODE_01 / NODE_02
    // R1 -> discrete NODE_03

    this.mcu.readK = () => (this.latchedCmd >>> 4) & 0x0f;

    this.mcu.readR[0] = () => this.latchedCmd & 0x0f;

    this.mcu.writeO = (data, memMask) => this.handleWriteO(data, memMask);

    this.mcu.writeR[1] = (data) => this.handleWriteR1(data);
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
    } else if (asserted) {
      this.mcu.reset?.();
    }
  }

  isReset() {
    return this.resetLine === 0;
  }

  reset(state = 0) {
    return this.setResetLine(state);
  }

  setResetLine(level) {
    const next = level ? 1 : 0;

    if (next === this.resetLine) return false;

    this.resetLine = next;
    this.applyResetLineToMcu();

    if (next === 0) this.pendingMasterTicks = 0;

    this.onReset?.(next, this.getMasterTick());

    return true;
  }

  write(data) {
    const value = data & 0xff;

    // MAME namco54_device::write() synchronizes the
    // command latch through the machine scheduler.
    this.synchronize(() => {
      this.latchedCmd = value;

      if (this.traceCommands) {
        console.log("[54XX CMD]", this.getMasterTick(), value);
      }
    });

    return true;
  }

  chipSelect(state) {
    this.irqState = !!state;

    this.mcu.setIRQ?.(this.irqState);

    return true;
  }

  read() {
    return 0xff;
  }

  rw(_state) {}

  nextMasterTickBoundary() {
    const elapsed =
      this.pendingMasterTicks % Namco54XX.MASTER_TICKS_PER_MCU_CYCLE;

    return elapsed === 0
      ? Namco54XX.MASTER_TICKS_PER_MCU_CYCLE
      : Namco54XX.MASTER_TICKS_PER_MCU_CYCLE - elapsed;
  }

  advanceMasterTicks(masterTicks) {
    const delta = Math.floor(Number(masterTicks));

    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError(
        "Namco54XX.advanceMasterTicks() requires a non-negative integer"
      );
    }

    if (!this.romLoaded || delta === 0) return;

    if (this.resetLine === 0) {
      this.pendingMasterTicks = 0;
      return;
    }

    this.pendingMasterTicks += delta;

    const cycles = Math.floor(
      this.pendingMasterTicks / Namco54XX.MASTER_TICKS_PER_MCU_CYCLE
    );

    this.pendingMasterTicks -= cycles * Namco54XX.MASTER_TICKS_PER_MCU_CYCLE;

    if (cycles !== 0) this.executeMcuCycles(cycles);
  }

  executeMcuCycles(cycles) {
    let remaining = cycles | 0;

    while (remaining > 0 && this.resetLine !== 0 && !this.mcu.halted) {
      const used = this.mcu.step?.() ?? 0;

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
        "Namco54XX.tickHostCycles() requires a non-negative integer"
      );
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
        "Namco54XX.tickChip() requires a non-negative integer"
      );
    }

    if (this.resetLine !== 0) this.executeMcuCycles(cycles);
  }

  handleWriteO(data, memMask) {
    if (memMask == null) {
      throw new Error("MB8844 writeO() omitted memMask");
    }

    const value = data & 0xff;

    if ((memMask & 0xff) === 0x0f) {
      // O low nibble -> NODE_01
      this.emitOutput(0, value & 0x0f);
    } else {
      // O high nibble -> NODE_02
      this.emitOutput(1, (value >>> 4) & 0x0f);
    }
  }

  handleWriteR1(data) {
    // R1 -> NODE_03
    this.emitOutput(2, data & 0x0f);
  }

  emitOutput(channel, value, force = false) {
    if (!Number.isInteger(channel) || channel < 0 || channel >= 3) {
      return false;
    }

    const next = value & 0x0f;

    const tick = this.getMasterTick();

    this.lastOutput[channel] = next;

    this.onChannelData?.(channel, next, tick, !!force);

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

      channel2: this.lastOutput[2] & 0x0f
    };
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

      channel2: this.lastOutput[2] & 0x0f
    };
  }

  resetCounter() {}
}
class Namco54xxDac {
  static MASTER_CLOCK = 18_432_000;
  static CHANNEL_COUNT = 3;

  static SCHEDULE_AHEAD = 0.05;
  static MAX_SCHEDULE_AHEAD = 0.3;

  constructor() {
    this.audioCtx = null;
    this.destination = null;

    this.source = new Array(3).fill(null);
    this.bandPass = new Array(3).fill(null);
    this.channelGain = new Array(3).fill(null);

    this.mixer = null;
    this.outputGain = null;

    this.channelData = new Uint8Array(3);

    this.masterTickBase = null;
    this.lastMasterTick = null;
    this.audioTimeBase = 0;
  }

  attach(audioCtx, destination) {
    if (this.audioCtx === audioCtx && this.mixer) {
      return;
    }

    this.detach();

    this.audioCtx = audioCtx;
    this.destination = destination;

    const now = audioCtx.currentTime;

    this.mixer = audioCtx.createGain();

    this.outputGain = audioCtx.createGain();

    this.mixer.gain.setValueAtTime(1, now);

    this.outputGain.gain.setValueAtTime(0.16, now);

    this.mixer.connect(this.outputGain);

    this.outputGain.connect(destination);

    /*
     * MAME 0.289 galaga_a.cpp:
     *
     * OUT2 -> channel 1
     * OUT1 -> channel 2
     * OUT0 -> channel 3
     *
     * Filter values derived from:
     *
     *   galaga_chanl1_filt
     *   galaga_chanl2_filt
     *   galaga_chanl3_filt
     *
     * and MAME 0.289
     * DISC_OP_AMP_FILTER_IS_BAND_PASS_1M.
     *
     * Mixer weighting includes the
     * 33k / 33k / 10k final Galaga mixer.
     */
    const config = [
      {
        channel: 2,
        frequency: 2520.9816921671772,
        q: 1.7423774640682894,
        gain: 0.1505
      },
      {
        channel: 1,
        frequency: 450.43388318211043,
        q: 2.1226196674992623,
        gain: 0.2234
      },
      {
        channel: 0,
        frequency: 167.41656583794713,
        q: 2.4719868706309156,
        gain: 1.0
      }
    ];

    for (const spec of config) {
      const source = audioCtx.createConstantSource();

      const filter = audioCtx.createBiquadFilter();

      const gain = audioCtx.createGain();

      filter.type = "bandpass";

      filter.frequency.setValueAtTime(spec.frequency, now);

      filter.Q.setValueAtTime(spec.q, now);

      gain.gain.setValueAtTime(spec.gain, now);

      source.offset.setValueAtTime(
        this.nibbleToVoltage(this.channelData[spec.channel]),
        now
      );

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.mixer);

      source.start(now);

      this.source[spec.channel] = source;

      this.bandPass[spec.channel] = filter;

      this.channelGain[spec.channel] = gain;
    }
  }

  detach() {
    for (let ch = 0; ch < 3; ch++) {
      try {
        this.source[ch]?.stop();
      } catch (_) {}

      this.source[ch]?.disconnect();
      this.bandPass[ch]?.disconnect();
      this.channelGain[ch]?.disconnect();

      this.source[ch] = null;
      this.bandPass[ch] = null;
      this.channelGain[ch] = null;
    }

    this.mixer?.disconnect();
    this.outputGain?.disconnect();

    this.mixer = null;
    this.outputGain = null;
    this.audioCtx = null;
    this.destination = null;

    this.masterTickBase = null;
    this.lastMasterTick = null;
    this.audioTimeBase = 0;
  }

  reset() {
    this.channelData.fill(0);

    this.masterTickBase = null;
    this.lastMasterTick = null;
    this.audioTimeBase = 0;

    const now = this.audioCtx?.currentTime ?? 0;

    for (let ch = 0; ch < 3; ch++) {
      const param = this.source[ch]?.offset;

      param?.cancelScheduledValues(now);

      param?.setValueAtTime(this.nibbleToVoltage(0), now);
    }
  }

  /*
   * MAME DISCRETE_DAC_R1:
   *
   * 4V source
   *
   * bit 0 = 47k
   * bit 1 = 22k
   * bit 2 = 10k
   * bit 3 = 4.7k
   */
  nibbleToVoltage(nibble) {
    const value = nibble & 0x0f;

    const resistors = [47000, 22000, 10000, 4700];

    let totalConductance = 0;

    for (const r of resistors) {
      totalConductance += 1 / r;
    }

    let enabledConductance = 0;

    for (let bit = 0; bit < 4; bit++) {
      if (value & (1 << bit)) {
        enabledConductance += 1 / resistors[bit];
      }
    }

    return (4 * enabledConductance) / totalConductance;
  }

  masterTickToAudioTime(masterTick) {
    const ctx = this.audioCtx;

    if (!ctx) return 0;

    const tick = Math.max(0, Math.floor(Number(masterTick) || 0));

    const now = ctx.currentTime;

    let target =
      this.masterTickBase === null
        ? NaN
        : this.audioTimeBase +
          (tick - this.masterTickBase) / Namco54xxDac.MASTER_CLOCK;

    /*
     * Rebase after an underrun, reset,
     * suspended AudioContext or large
     * emulation/audio clock discontinuity.
     */
    if (
      !Number.isFinite(target) ||
      (this.lastMasterTick !== null && tick < this.lastMasterTick) ||
      target < now + 0.002 ||
      target > now + Namco54xxDac.MAX_SCHEDULE_AHEAD
    ) {
      this.masterTickBase = tick;

      this.audioTimeBase = now + Namco54xxDac.SCHEDULE_AHEAD;

      target = this.audioTimeBase;

      for (let ch = 0; ch < 3; ch++) {
        const param = this.source[ch]?.offset;

        param?.cancelScheduledValues(now);

        param?.setValueAtTime(this.nibbleToVoltage(this.channelData[ch]), now);
      }
    }

    this.lastMasterTick = tick;

    return target;
  }

  writeChannel(channel, value, masterTick = 0, force = false) {
    const ch = channel | 0;

    if (ch < 0 || ch >= 3) {
      return false;
    }

    const next = value & 0x0f;

    if (!force && this.channelData[ch] === next) {
      return false;
    }

    const source = this.source[ch];

    const ctx = this.audioCtx;

    if (!source || !ctx || ctx.state !== "running") {
      this.channelData[ch] = next;

      if (ctx?.state !== "running") {
        this.masterTickBase = null;
        this.lastMasterTick = null;
      }

      return true;
    }

    const when = this.masterTickToAudioTime(masterTick);

    this.channelData[ch] = next;

    /*
     * Critical:
     *
     * Do not cancel later ROM-generated
     * transitions.
     *
     * The real 54XX waveform is the
     * complete sequence of O/R1 writes
     * generated by 54xx.bin.
     */
    source.offset.setValueAtTime(this.nibbleToVoltage(next), when);

    return true;
  }

  synchronizeState(masterTick = 0) {
    for (let ch = 0; ch < 3; ch++) {
      this.writeChannel(ch, this.channelData[ch], masterTick, true);
    }
  }

  getTraceState() {
    return {
      attached: !!this.mixer,

      contextState: this.audioCtx?.state ?? null,

      channel0: this.channelData[0] & 15,

      channel1: this.channelData[1] & 15,

      channel2: this.channelData[2] & 15,

      masterTickBase: this.masterTickBase,

      audioTimeBase: this.audioTimeBase
    };
  }
}
class NamcoWSG {
  static #WORKLET_SRC = `
class NamcoWSGProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions: { waveData } }) {
    super();
    this.wave = new Uint8Array(waveData);
    this.accum = new Float64Array(3);
    this.voices = [
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 },
    ];
    this.enabled = false;
    this.step = 96000 / sampleRate;
    this.port.onmessage = ({ data }) => {
      if (data.type === "voices") this.voices = data.v;
      if (data.type === "enabled") this.enabled = data.v;
    };
  }

  process(inputs, outputs) {
    void inputs;
    const ch = outputs[0][0];
    if (!ch) return true;
    if (!this.enabled) {
      ch.fill(0);
      return true;
    }

    const { wave, accum, voices, step } = this;
    const WRAP = 0x100000;

    for (let i = 0; i < ch.length; i++) {
      let s = 0;
      for (let v = 0; v < 3; v++) {
        const { freq, wave: w, vol } = voices[v];
        if (!vol || !freq) continue;
        accum[v] = (accum[v] + freq * step) % WRAP;
        const pos = ((accum[v] | 0) >> 15) & 0x1f;
        s += (wave[w * 32 + pos] - 8) * vol;
      }
      ch[i] = s / 315;
    }
    return true;
  }
}
registerProcessor("namco-wsg", NamcoWSGProcessor);
`;

  constructor(config) {
    this.config = config;

    this.prom = new Uint8Array(256);
    this.regs = new Uint8Array(32);
    this.channels = [
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 }
    ];

    this.audioCtx = null;
    this.gainNode = null;
    this.wsgNode = null;
    this.port = null;
    this.fxChain = null;

    this.state = "idle"; // 'idle' | 'pending' | 'ready'
    this.enabled = false;

    this.gestureEvents = null;
    this.onGesture = null;

    this.onAudioReady = null;
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

  async setEnabled(en) {
    this.enabled = en;
    if (this.state === "idle") {
      await this.createAudioGraph();
    } else if (this.state === "ready") {
      await this.resumeIfNeeded();
    }
    this.port?.postMessage({ type: "enabled", v: en });
  }

  initAudio() {
    const gestureEvents = ["touchend", "pointerup", "mousedown", "keydown"];

    const onGesture = (e) => {
      if (!e.isTrusted) return;
      this.unlockFromGesture();
    };

    for (const ev of gestureEvents) {
      window.addEventListener(ev, onGesture, { capture: true, passive: true });
    }

    this.gestureEvents = gestureEvents;
    this.onGesture = onGesture;

    const reattempt = () => {
      if (this.enabled) this.resumeIfNeeded();
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reattempt();
    });
    window.addEventListener("focus", reattempt);
    window.addEventListener("pageshow", reattempt);
  }

  unlockFromGesture() {
    if (this.state === "idle") {
      this.createAudioGraph();
    } else if (this.state === "ready") {
      this.resumeIfNeeded();
    }

    if (this.audioCtx) this.playSilentUnlockBuffer(this.audioCtx);
  }

  playSilentUnlockBuffer(ctx) {
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
  }

  async resumeIfNeeded() {
    const ctx = this.audioCtx;
    if (!ctx) return;
    if (ctx.state === "running") return;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ctx.resume();
      } catch (_) {}
      if (ctx.state === "running") return;
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  unregisterGestureListeners() {
    if (!this.onGesture || !this.gestureEvents) return;
    for (const ev of this.gestureEvents) {
      window.removeEventListener(ev, this.onGesture, { capture: true });
    }
    this.onGesture = null;
    this.gestureEvents = null;
  }

  reset() {
    this.regs.fill(0);

    for (const ch of this.channels) {
      ch.freq = 0;
      ch.wave = 0;
      ch.vol = 0;
    }

    // MAME starts the Namco WSG enabled. A machine reset clears the
    // registers, which silences the voices naturally because volume=0;
    // it must not permanently disable the WSG audio device itself.
    this.enabled = this.config.audio.enabled !== false;

    if (this.port) {
      this.port.postMessage({
        type: "voices",
        v: this.channels
      });

      this.port.postMessage({
        type: "enabled",
        v: this.enabled
      });
    }
  }
  reset_old() {
    this.regs.fill(0);
    for (const ch of this.channels) {
      ch.freq = 0;
      ch.wave = 0;
      ch.vol = 0;
    }
    if (this.port) {
      this.port.postMessage({ type: "voices", v: this.channels });
      this.port.postMessage({ type: "enabled", v: false });
    }
    this.enabled = false;
  }

  async createAudioGraph() {
    if (this.state !== "idle") return;
    this.state = "pending";

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this.state = "idle";
      return;
    }

    try {
      this.audioCtx = new AC();

      this.audioCtx.addEventListener("statechange", () => {
        if (this.enabled && this.audioCtx?.state !== "running") {
          this.resumeIfNeeded();
        }
      });

      await this.resumeIfNeeded();
      this.playSilentUnlockBuffer(this.audioCtx);

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.config.audio.masterVolume;
      this.gainNode.connect(this.audioCtx.destination);

      const blob = new Blob([NamcoWSG.#WORKLET_SRC], {
        type: "application/javascript"
      });
      const blobUrl = URL.createObjectURL(blob);
      await this.audioCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const waveData = Array.from(this.prom).map((b) => b & 0x0f);
      this.wsgNode = new AudioWorkletNode(this.audioCtx, "namco-wsg", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { waveData }
      });

      this.attachFxChain();
      this.port = this.wsgNode.port;
      this.state = "ready";

      this.decodeAndSend();
      this.port.postMessage({ type: "enabled", v: this.enabled });

      this.onAudioReady?.(this.audioCtx, this.gainNode);
    } catch (err) {
      console.warn("[WSG] Audio init failed:", err);
      this.teardownAudioGraph();
    }
  }

  attachFxChain() {
    const { audioCtx: ctx, wsgNode: node, gainNode: gain } = this;
    if (!ctx || !node || !gain) return;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 80;
    hp.Q.value = 0.5;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5500;
    lp.Q.value = 0.6;

    node.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    this.fxChain = { hp, lp };
  }

  teardownAudioGraph() {
    this.state = "idle";
    this.port = null;
    this.wsgNode = null;
    this.fxChain = null;
    this.gainNode = null;

    try {
      this.audioCtx?.close();
    } catch (_) {}

    this.audioCtx = null;
  }

  decodeAndSend() {
    const r = this.regs;

    this.channels[0].freq =
      r[0x10] |
      (r[0x11] << 4) |
      (r[0x12] << 8) |
      (r[0x13] << 12) |
      (r[0x14] << 16);
    this.channels[0].wave = r[0x05] & 0x07;
    this.channels[0].vol = r[0x15] & 0x0f;

    this.channels[1].freq =
      (r[0x16] << 4) | (r[0x17] << 8) | (r[0x18] << 12) | (r[0x19] << 16);
    this.channels[1].wave = r[0x0a] & 0x07;
    this.channels[1].vol = r[0x1a] & 0x0f;

    this.channels[2].freq =
      (r[0x1b] << 4) | (r[0x1c] << 8) | (r[0x1d] << 12) | (r[0x1e] << 16);
    this.channels[2].wave = r[0x0f] & 0x07;
    this.channels[2].vol = r[0x1f] & 0x0f;

    if (this.state === "ready" && this.port) {
      this.port.postMessage({ type: "voices", v: this.channels });
    }
  }
}
class NamcoLS259Latch {
  constructor(name = "ls259") {
    this.name = name;
    this.state = 0x00;
    this.callbacks = new Array(8).fill(null);
  }

  setCallback(bit, fn) {
    this.callbacks[bit & 0x07] = fn;
    return this;
  }

  getBit(bit) {
    return (this.state >>> (bit & 0x07)) & 0x01;
  }

  write(addr, data) {
    this.setBit(addr & 0x07, data & 0x01);
  }

  setBit(bit, value, force = false) {
    const index = bit & 0x07;
    const next = value & 0x01;
    const previous = this.getBit(index);

    if (!force && previous === next) {
      return false;
    }

    this.state = (this.state & ~(1 << index)) | (next << index);

    this.callbacks[index]?.(next, this.state, index);

    return true;
  }

  clear(forceCallbacks = false) {
    const previousState = this.state;

    if (previousState === 0x00 && !forceCallbacks) {
      return;
    }

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = (previousState >>> bit) & 0x01;

      if (forceCallbacks || previous !== 0) {
        this.callbacks[bit]?.(0, this.state, bit);
      }
    }
  }
}
class NamcoVideoLatch extends NamcoLS259Latch {
  constructor(onStarfieldControl = null, onScreenFlip = null) {
    super("video_latch");
    for (let bit = 0; bit <= 5; bit++) {
      this.setCallback(bit, (value, state, b) => {
        onStarfieldControl?.(b, value, state);
      });
    }
    this.setCallback(7, (value, state, bit) => {
      onScreenFlip?.(!!value, state, bit);
    });
  }
  reset() {
    const previousState = this.state;
    if (previousState === 0x00) return;

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = (previousState >>> bit) & 0x01;
      if (previous) {
        this.callbacks[bit]?.(0, this.state, bit);
      }
    }
  }
}

class GalagaEmulator {
  constructor(config) {
    this.config = config;

    this.mainCpuRom = new Uint8Array(0x4000);
    this.subCpuRom = new Uint8Array(0x1000);
    this.sub2CpuRom = new Uint8Array(0x1000);

    this.charRom = new Uint8Array(0x1000);
    this.spriteRom = new Uint8Array(0x2000);

    this.mcuRom51 = new Uint8Array(0x0400);
    this.mcuRom54 = new Uint8Array(0x0400);

    this.vram = new Uint8Array(0x0800);
    this.ram1 = new Uint8Array(0x0400);
    this.ram2 = new Uint8Array(0x0400);
    this.ram3 = new Uint8Array(0x0400);

    this.proms = new Uint8Array(0x0220);
    this.masterPaletteProm = this.proms.subarray(0x0000, 0x0020);
    this.tileLutProm = this.proms.subarray(0x0020, 0x0120);
    this.spriteLutProm = this.proms.subarray(0x0120, 0x0220);
    this.palette = [];

    this.soundProms = new Uint8Array(0x0200);
    this.waveProm = this.soundProms.subarray(0x0000, 0x0100);
    this.soundTimingProm = this.soundProms.subarray(0x0100, 0x0200);

    this.mainIrqEnabled = false;
    this.subIrqArmed = false;
    this.cpu3NmiEnabled = false;
    this.cpu3NmiLatchQ2 = 0;
    this.subsystemsReset = true;

    this.flipScreen = false;
    this.mod0 = false;
    this.mod1 = false;
    this.mod2 = false;

    this.led0 = false;
    this.led1 = false;
    this.coinLocked = false;

    this.dipSwitches = new GalagaDipSwitches();
    this.in0 = 0xff;
    this.in1 = 0xff;

    this.mainCpu = new Z80(
      (address) => this.mainRead(address),
      (address, data) => this.mainWrite(address, data)
    );

    this.subCpu = new Z80(
      (address) => this.subRead(address),
      (address, data) => this.subWrite(address, data)
    );

    this.sub2Cpu = new Z80(
      (address) => this.soundRead(address),
      (address, data) => this.soundWrite(address, data)
    );

    this.inputController = new Namco51XX(
      this.dipSwitches,
      (data) => {
        this.led1 = !!(data & 0x01);
        this.led0 = !!(data & 0x02);
      },
      (locked) => {
        this.coinLocked = !!locked;
      }
    );
    this.starfield = new Namco05XX();

    this.soundChip = new NamcoWSG(this.config);
    if (!(this.soundChip.prom instanceof Uint8Array)) {
      throw new Error("[Galaga] NamcoWSG must expose a writable waveform PROM");
    }
    if (this.soundChip.prom.length !== this.waveProm.length) {
      throw new Error(
        `[Galaga] NamcoWSG PROM size mismatch: expected ${this.waveProm.length}, ` +
          `got ${this.soundChip.prom.length}`
      );
    }
    this.soundChip.prom = this.waveProm;
    this.namco54xxDac = new Namco54xxDac();
    this.namco54xx = new Namco54XX({
      /*
       * Each MB8844 O/R1 output change carries the current emulated
       * master-clock tick. Namco54xxDac converts that tick to WebAudio
       * time so the firmware-generated waveform retains its timing.
       */
      onChannelData: (channel, value, masterTick, force) => {
        this.namco54xxDac.writeChannel(channel, value, masterTick, force);
      },

      /*
       * Reset the analog/DAC state when the 54XX is reset.
       */
      onReset: () => {
        this.namco54xxDac.reset();
      }
    });
    this.soundChip.onAudioReady = (audioCtx, gainNode) => {
      if (!audioCtx || !gainNode || audioCtx.state === "closed") {
        return;
      }

      this.namco54xxDac.attach(audioCtx, gainNode);

      /*
       * syncOutputs() obtains the current TimingSequencer tick through
       * Namco54XX.getMasterTick(), so these writes are timestamped on
       * the same master-clock timeline as normal firmware output.
       */
      this.namco54xx.syncOutputs();
    };

    this.timing = new TimingSequencer(this);
    this.namco54xx.setScheduler(this.timing);
    this.inputController.setScheduler(this.timing);

    this.busInterface = new Namco06XX({
      onHostNmi: () => {
        this.mainCpu.nmi?.();
      },

      onHostNmiClear: () => {
        this.mainCpu.clearNmiLatch?.();
      }
    });
    this.busInterface.attachDevice(0, this.inputController);
    this.busInterface.attachDevice(3, this.namco54xx);
    this.busInterface.setScheduler(this.timing);

    this.miscLatch = new NamcoLS259Latch("misclatch");
    this.miscLatch.setCallback(0, (state) => {
      this.mainIrqEnabled = !!state;

      if (!this.mainIrqEnabled) {
        this.mainCpu.clearIrq?.();
      }
    });
    this.miscLatch.setCallback(1, (state) => {
      this.subIrqArmed = !!state;

      if (!this.subIrqArmed) {
        this.subCpu.clearIrq?.();
      }
    });
    this.miscLatch.setCallback(2, (state) => {
      this.cpu3NmiLatchQ2 = state ? 1 : 0;
      this.cpu3NmiEnabled = !state;

      if (!this.cpu3NmiEnabled) {
        this.sub2Cpu.clearNmiLatch?.();
      }
    });
    this.miscLatch.setCallback(3, (state) => {
      const inReset = !state;

      if (inReset === this.subsystemsReset) {
        return;
      }

      this.subsystemsReset = inReset;
      this.subIrqArmed = false;

      this.subCpu.setReset?.(inReset);
      this.sub2Cpu.setReset?.(inReset);

      if (inReset) {
        this.subCpu.clearIrq?.();
        this.sub2Cpu.clearIrq?.();
        this.sub2Cpu.clearNmiLatch?.();
      }

      this.inputController.setResetLine?.(inReset ? 0 : 1);
      this.namco54xx.setResetLine?.(inReset ? 0 : 1);
    });
    this.miscLatch.setCallback(4, () => {});
    this.miscLatch.setCallback(5, (state) => {
      this.mod0 = !!state;
    });
    this.miscLatch.setCallback(6, (state) => {
      this.mod1 = !!state;
    });
    this.miscLatch.setCallback(7, (state) => {
      this.mod2 = !!state;
    });
    this.videoLatch = new NamcoVideoLatch(
      // Q0-Q5 are sampled by screen_vblank_galaga() on the falling
      // VBLANK edge.  Do not update the 05XX immediately on latch writes.
      () => {},
      (flipped) => {
        this.flipScreen = !!flipped;
      }
    );

    this.frameCounter = 0;
    this.running = false;
    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.soundNmiCount = 0;

    this.subCpu.setReset?.(true);
    this.sub2Cpu.setReset?.(true);
    this.inputController.setResetLine?.(0);
    this.namco54xx.setResetLine?.(0);

    this.reset();
  }

  // MAME 0.289 galaga_state::vblank_irq(int state): IRQ0 is asserted
  // for CPUs 1 and 2 on the rising VBLANK edge when their masks are set.
  // The 51XX also receives both VBLANK edges.
  onVblankRising() {
    if (this.mainIrqEnabled) {
      this.mainCpu.setIrqLine?.(true);
    }

    if (this.subIrqArmed) {
      this.subCpu.setIrqLine?.(true);
    }

    this.inputController.vblank?.(true);
  }

  // MAME 0.289 galaga_state::screen_vblank_galaga(int state): the 05XX
  // starfield controls are sampled from video-latch Q0-Q5 on falling VBLANK.
  onVblankFalling() {
    this.inputController.vblank?.(false);

    const state = this.videoLatch.state & 0xff;
    const speedIndexX = state & 0x07;
    const set0 = (state >>> 3) & 0x01;
    const set1 = ((state >>> 4) & 0x01) | 0x02;

    this.starfield.setScrollSpeed(speedIndexX, 0);
    this.starfield.setActiveStarfieldSets(set0, set1);
    this.starfield.enableStarfield(!!((state >>> 5) & 0x01));
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
  getDipSwitchSummary() {
    return this.dipSwitches?.getSummary?.() ?? null;
  }
  readDSW(addr) {
    const offset = addr & 0x07;
    const dswa = this.dipSwitches.getBankA();
    const dswb = this.dipSwitches.getBankB();
    return ((dswb >> offset) & 1) | (((dswa >> offset) & 1) << 1);
  }
  canDeliverSoundNmi() {
    return !!(this.cpu3NmiEnabled && !this.subsystemsReset);
  }

  connectInput(inputManager) {
    if (
      !this.inputController ||
      typeof this.inputController.setPorts !== "function"
    ) {
      console.error(
        "inputController is not initialized or missing setPorts",
        this.inputController
      );
      return;
    }

    const sync = (ports) => {
      this.in0 = ports.in0 & 0xff;
      this.in1 = ports.in1 & 0xff;

      this.inputController.setPorts(this.in0, this.in1);
    };

    sync(inputManager.getState());
    inputManager.setOnStateChange(sync);
  }

  ramRead(addr) {
    addr &= 0xffff;

    if (addr >= 0x8000 && addr <= 0x87ff) {
      return this.vram[addr - 0x8000];
    }

    if (addr >= 0x8800 && addr <= 0x8bff) {
      return this.ram1[addr - 0x8800];
    }

    if (addr >= 0x9000 && addr <= 0x93ff) {
      return this.ram2[addr - 0x9000];
    }

    if (addr >= 0x9800 && addr <= 0x9bff) {
      return this.ram3[addr - 0x9800];
    }

    return 0xff;
  }
  ramWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr >= 0x8000 && addr <= 0x87ff) {
      this.vram[addr - 0x8000] = data;
      return;
    }

    if (addr >= 0x8800 && addr <= 0x8bff) {
      this.ram1[addr - 0x8800] = data;
      return;
    }

    if (addr >= 0x9000 && addr <= 0x93ff) {
      this.ram2[addr - 0x9000] = data;
      return;
    }

    if (addr >= 0x9800 && addr <= 0x9bff) {
      this.ram3[addr - 0x9800] = data;
      return;
    }
  }

  mainRead(addr) {
    addr &= 0xffff;

    if (addr < 0x4000) return this.mainCpuRom[addr];
    if (addr < 0x6800) return 0xff;
    if (addr <= 0x6807) return this.readDSW(addr);
    if (addr < 0x7000) return 0xff;

    if (addr < 0x7100) {
      return this.busInterface.dataRead(addr & 0xff);
    }

    if (addr === 0x7100) {
      return this.busInterface.readControl();
    }

    if (addr < 0x8000) return 0xff;

    if (addr < 0xa000) {
      return this.ramRead(addr);
    }

    return 0xff;
  }
  mainWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr >= 0x6800 && addr <= 0x681f) {
      this.soundChip?.write(addr & 0x1f, data);
      return;
    }

    if (addr >= 0x6820 && addr <= 0x6827) {
      this.miscLatch.write(addr, data);
      return;
    }

    if (addr === 0x6830) {
      this.kickWatchdog();
      return;
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.busInterface.dataWrite(addr & 0xff, data);
      return;
    }

    if (addr === 0x7100) {
      this.busInterface.controlWrite(data);
      return;
    }

    if (addr >= 0x8000 && addr <= 0x9fff) {
      this.ramWrite(addr, data);
      return;
    }

    if (addr >= 0xa000 && addr <= 0xa007) {
      this.videoLatch.write(addr & 0x07, data);
      return;
    }
  }

  subRead(addr) {
    addr &= 0xffff;

    if (addr <= 0x0fff) return this.subCpuRom[addr];
    if (addr <= 0x67ff) return 0xff;

    if (addr <= 0x6807) return this.readDSW(addr);
    if (addr <= 0x6fff) return 0xff;

    if (addr <= 0x70ff) {
      return this.busInterface.dataRead(addr & 0xff);
    }

    if (addr === 0x7100) {
      return this.busInterface.readControl();
    }

    if (addr <= 0x7fff) return 0xff;

    if (addr <= 0x9fff) {
      return this.ramRead(addr);
    }

    return 0xff;
  }
  subWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr >= 0x8000 && addr <= 0x9fff) {
      this.ramWrite(addr, data);
      return;
    }

    if (addr >= 0x6800 && addr <= 0x681f) {
      this.soundChip?.write(addr & 0x1f, data);
      return;
    }

    if (addr >= 0x6820 && addr <= 0x6827) {
      this.miscLatch.write(addr, data);
      return;
    }

    if (addr === 0x6830) {
      this.kickWatchdog();
      return;
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.busInterface.dataWrite(addr & 0xff, data);
      return;
    }

    if (addr === 0x7100) {
      this.busInterface.controlWrite(data);
      return;
    }

    if (addr >= 0xa000 && addr <= 0xa007) {
      this.videoLatch.write(addr & 0x07, data);
      return;
    }
  }

  soundRead(addr) {
    addr &= 0xffff;

    if (addr <= 0x0fff) return this.sub2CpuRom[addr];

    if (addr >= 0x6800 && addr <= 0x6807) {
      return this.readDSW(addr);
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      return this.busInterface.dataRead(addr & 0xff);
    }

    if (addr === 0x7100) {
      return this.busInterface.readControl();
    }

    if (addr >= 0x8000 && addr <= 0x9fff) {
      return this.ramRead(addr);
    }

    return 0xff;
  }
  soundWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr <= 0x0fff) return;

    if (addr >= 0x8000 && addr <= 0x9fff) {
      this.ramWrite(addr, data);
      return;
    }

    if (addr >= 0x6800 && addr <= 0x681f) {
      this.soundChip?.write(addr & 0x1f, data);
      return;
    }

    if (addr >= 0x6820 && addr <= 0x6827) {
      this.miscLatch.write(addr, data);
      return;
    }

    if (addr === 0x6830) {
      this.kickWatchdog();
      return;
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.busInterface.dataWrite(addr & 0xff, data);
      return;
    }

    if (addr === 0x7100) {
      this.busInterface.controlWrite(data);
      return;
    }

    if (addr >= 0xa000 && addr <= 0xa007) {
      this.videoLatch.write(addr & 0x07, data);
      return;
    }
  }

  onWatchdogFired() {
    this._wdogCount = (this._wdogCount || 8) + 1;
  }
  kickWatchdog() {
    this.watchdogTimer = 0;
    this.watchdogEverKicked = true;
  }

  step() {
    this.timing.runFrame();
    this.frameCounter++;
    this.watchdogTimer++;
    if (this.watchdogTimer >= 8) {
      this.onWatchdogFired();
    }
  }
  reset() {
    this.spriteTrace?.previous?.clear();

    this.running = false;
    this.frameCounter = 0;
    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.soundNmiCount = 0;

    this.mainIrqEnabled = false;
    this.subIrqArmed = false;
    this.cpu3NmiEnabled = false;

    this.flipScreen = false;
    this.mod0 = false;
    this.mod1 = false;
    this.mod2 = false;
    this.led0 = false;
    this.led1 = false;
    this.coinLocked = false;

    this.in0 = 0xff;
    this.in1 = 0xff;
    this._in0 = 0xff;
    this._in1 = 0xff;

    this.timing.reset();

    this.vram.fill(0);
    this.ram1.fill(0);
    this.ram2.fill(0);
    this.ram3.fill(0);

    this.mainCpu.reset(this.mainRead.bind(this));
    this.subCpu.reset(this.subRead.bind(this));
    this.sub2Cpu.reset(this.soundRead.bind(this));

    this.mainCpu.clearIrq?.();
    this.subCpu.clearIrq?.();
    this.sub2Cpu.clearIrq?.();

    this.mainCpu.clearNmiLatch?.();
    this.subCpu.clearNmiLatch?.();
    this.sub2Cpu.clearNmiLatch?.();

    this.soundChip.reset?.();
    this.starfield.reset?.();

    this.busInterface.reset();
    this.busInterface.setScheduler(this.timing);

    this.inputController.reset?.();
    this.namco54xx.reset?.();

    this.subsystemsReset = true;
    this.subCpu.setReset?.(true);
    this.sub2Cpu.setReset?.(true);
    this.inputController.setResetLine?.(0);
    this.namco54xx.setResetLine?.(0);

    this.inputController.vblank?.(false);
    this.inputController.setPorts?.(this.in0, this.in1);

    this.miscLatch.clear();
    this.videoLatch.reset();
  }

  getStatusInfo() {
    return {
      frame: this.frameCounter,
      mainPC: this.mainCpu.PC.toString(16).padStart(4, "0").toUpperCase(),
      subPC: this.subCpu.PC.toString(16).padStart(4, "0").toUpperCase(),
      soundPC: this.sub2Cpu.PC.toString(16).padStart(4, "0").toUpperCase()
    };
  }

  decode8x8(rom, code) {
    const TILE = 8;
    const pixels = new Uint8Array(TILE * TILE);
    const base = (code & 0x1ff) * 16;

    for (let y = 0; y < TILE; y++) {
      const lo = rom[base + y + 8] ?? 0;
      const hi = rom[base + y] ?? 0;
      const row = y * TILE;

      for (let x = 0; x < 4; x++) {
        const bit = 3 - x;
        pixels[row + x] = ((lo >> bit) & 1) | (((lo >> (bit + 4)) & 1) << 1);
        pixels[row + x + 4] =
          ((hi >> bit) & 1) | (((hi >> (bit + 4)) & 1) << 1);
      }
    }
    return pixels;
  }
  decodeSprite16(code) {
    const pixels = new Uint8Array(16 * 16);
    const rom = this.spriteRom;
    const base = (code & 0x7f) * 64;

    for (let y = 0; y < 16; y++) {
      const rowByte = base + (y < 8 ? y : y + 24);
      const row = y * 16;
      for (let g = 0; g < 4; g++) {
        // 4 pixel-columns, left->right
        const b = rom[rowByte + g * 8] ?? 0;
        const x = row + g * 4;
        for (let i = 0; i < 4; i++) {
          pixels[x + i] = ((b >> (3 - i)) & 1) | (((b >> (7 - i)) & 1) << 1);
        }
      }
    }
    return pixels;
  }
  blitPen(buf, W, H, rgb, flipScreen, drawX, drawY, px, py) {
    const x = flipScreen ? W - 1 - (drawX + px) : drawX + px;
    const y = flipScreen ? H - 1 - (drawY + py) : drawY + py;
    if (x < 0 || x >= W || y < 0 || y >= H) return false;

    const dst = (y * W + x) << 2;
    buf[dst] = rgb.r;
    buf[dst + 1] = rgb.g;
    buf[dst + 2] = rgb.b;
    buf[dst + 3] = 0xff;
    return true;
  }
  decodeTiles(code) {
    return this.decode8x8(this.charRom, code);
  }
  renderTiles(ctx) {
    const W = 288;
    const H = 224;
    const TILE = 8;

    const VRAM_BASE = 0x0000;
    const ATTR_BASE = 0x0400;

    const lutValid = this.tileLutProm?.length >= 256;
    const flipScreen = !!this.flipScreen;

    const imgData = ctx.getImageData(0, 0, W, H);
    const buf = imgData.data;

    for (let off = 0; off < 0x400; off++) {
      const ramRow = off & 0x1f;
      const ramCol = off >> 5;

      let tileX, tileY;
      if (ramCol >= 30) {
        tileX = ramCol - 30;
        tileY = ramRow - 2;
      } else if (ramCol >= 2) {
        tileX = ramRow + 2;
        tileY = ramCol - 2;
      } else {
        tileX = ramCol + 34;
        tileY = ramRow - 2;
      }

      const drawX = tileX * TILE;
      const drawY = tileY * TILE;

      const code = this.vram[VRAM_BASE + off];
      const color = this.vram[ATTR_BASE + off] & 0x3f;
      const pixels = this.decodeTiles(code);

      const lutBase = color << 2;
      const penRgb = [null, null, null, null];

      for (let pen = 0; pen < 4; pen++) {
        const palettePen = lutValid
          ? this.tileLutProm[lutBase | pen] & 0x0f
          : (lutBase | pen) & 0x0f;

        if (palettePen !== 0x0f) {
          penRgb[pen] = this.palette[0x10 + palettePen] ?? null;
        }
      }

      for (let py = 0; py < TILE; py++) {
        const srcRow = py * TILE;

        for (let px = 0; px < TILE; px++) {
          const rgb = penRgb[pixels[srcRow + px]];
          if (!rgb) continue;

          this.blitPen(buf, W, H, rgb, flipScreen, drawX, drawY, px, py);
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  decodeSprites(subTileIndex) {
    return this.decode8x8(this.spriteRom, subTileIndex);
  }
  renderSprites_old(ctx) {
    const W = 288;
    const H = 224;
    const BASE = 0x380;

    // MAME galaga_v.cpp draw_sprites: static const int gfx_offs[2][2]
    const GFX_OFFS = [
      [0, 1],
      [2, 3]
    ];

    const flipScreen = !!this.flipScreen;
    const lutValid = this.spriteLutProm?.length >= 256;

    const imgData = ctx.getImageData(0, 0, W, H);
    const buf = imgData.data;

    for (let offs = 0; offs < 0x80; offs += 2) {
      const code = this.ram1[BASE + offs] & 0x7f;
      const color = this.ram1[BASE + offs + 1] & 0x3f;
      const syRaw = this.ram2[BASE + offs];
      const sxRaw = this.ram2[BASE + offs + 1];
      const flags = this.ram3[BASE + offs];
      const sxHi = this.ram3[BASE + offs + 1];

      // MAME: flipx/flipy from ram3 bits 0-1, XORed under flip_screen
      let flipX = flags & 0x01;
      let flipY = (flags >>> 1) & 0x01;
      if (flipScreen) {
        flipX ^= 1;
        flipY ^= 1;
      }

      // MAME: sizex/sizey from ram3 bits 2-3 (32x32 sprite support)
      const sizeX = (flags >>> 2) & 0x01;
      const sizeY = (flags >>> 3) & 0x01;

      // MAME: sx = ram2[offs+1] - 40 + 0x100*(ram3[offs+1] & 3)
      const spriteX = sxRaw - 40 + 0x100 * (sxHi & 0x03);

      // MAME: sy = 256 - ram2[offs] + 1; sy -= 16*sizey; sy = (sy & 0xff) - 32
      // Your existing constant 257-32 already folds in +1-32; apply -16*sizeY
      // before the wrap fix, matching MAME's ordering.
      const spriteY = 257 - 32 - syRaw - 16 * sizeY;

      // Color lookup (sprite LUT, pen 0x0f transparent = transpen_mask)
      const lutBase = color << 2;
      const penRgb = [null, null, null, null];
      for (let pen = 0; pen < 4; pen++) {
        const p = lutValid
          ? this.spriteLutProm[lutBase + pen] & 0x0f
          : (lutBase + pen) & 0x0f;
        if (p !== 0x0f) penRgb[pen] = this.palette[p] ?? null;
      }

      // Draw each 16x16 sub-tile; >16px sprites compose from consecutive codes
      for (let y = 0; y <= sizeY; y++) {
        for (let x = 0; x <= sizeX; x++) {
          const tileCode =
            code + GFX_OFFS[y ^ (sizeY * flipY)][x ^ (sizeX * flipX)];
          const pixels = this.decodeSprite16(tileCode);

          const blockX = spriteX + 16 * x;
          const blockY = spriteY + 16 * y;

          for (let py = 0; py < 16; py++) {
            const srcRow = (flipY ? 15 - py : py) * 16;
            for (let px = 0; px < 16; px++) {
              const rgb = penRgb[pixels[srcRow + (flipX ? 15 - px : px)]];
              if (!rgb) continue;
              this.blitPen(buf, W, H, rgb, flipScreen, blockX, blockY, px, py);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
  renderSprites__old(ctx) {
    const W = 288;
    const H = 224;
    const BASE = 0x380;

    // MAME galaga_v.cpp:
    // static const int gfx_offs[2][2] = { { 0, 1 }, { 2, 3 } };
    const GFX_OFFS = [
      [0, 1],
      [2, 3]
    ];

    const flipScreen = !!this.flipScreen;
    const lutValid = this.spriteLutProm?.length >= 256;

    const imgData = ctx.getImageData(0, 0, W, H);
    const buf = imgData.data;

    for (let offs = 0; offs < 0x80; offs += 2) {
      const code = this.ram1[BASE + offs] & 0x7f;
      const color = this.ram1[BASE + offs + 1] & 0x3f;

      const syRaw = this.ram2[BASE + offs];
      const sxRaw = this.ram2[BASE + offs + 1];

      const flags = this.ram3[BASE + offs];
      const sxHi = this.ram3[BASE + offs + 1];

      // MAME: int flipx = flags & 0x01; int flipy = (flags & 0x02) >> 1;
      // MAME: if (flip_screen()) { flipx ^= 1; flipy ^= 1; }
      let flipX = flags & 0x01;
      let flipY = (flags >>> 1) & 0x01;

      if (flipScreen) {
        flipX ^= 1;
        flipY ^= 1;
      }

      // MAME: sizex = (flags & 0x04) >> 2; sizey = (flags & 0x08) >> 3.
      const sizeX = (flags >>> 2) & 0x01;
      const sizeY = (flags >>> 3) & 0x01;

      // MAME:
      // sx = spriteram_2[offs + 1] - 40
      //    + 0x100 * (spriteram_3[offs + 1] & 3);
      const spriteX = sxRaw - 40 + 0x100 * (sxHi & 0x03);

      // MAME:
      // sy = 256 - spriteram_2[offs] + 1;
      // sy -= 16 * sizey;
      // sy = (sy & 0xff) - 32;
      //
      // The 8-bit wrap is required. Without it, sprites near the upper
      // hardware Y range can be displaced by 256 pixels.
      const spriteY = ((257 - syRaw - 16 * sizeY) & 0xff) - 32;

      const lutBase = color << 2;
      const penRgb = [null, null, null, null];

      for (let pen = 0; pen < 4; pen++) {
        const palettePen = lutValid
          ? this.spriteLutProm[lutBase + pen] & 0x0f
          : (lutBase + pen) & 0x0f;

        // MAME transpen_mask treats LUT pen 0x0f as transparent.
        if (palettePen !== 0x0f) {
          penRgb[pen] = this.palette[palettePen] ?? null;
        }
      }

      // MAME loops y <= sizey and x <= sizex, selecting one of four
      // consecutive 16x16 graphics blocks for a 32x32 sprite.
      for (let y = 0; y <= sizeY; y++) {
        for (let x = 0; x <= sizeX; x++) {
          const tileCode =
            code + GFX_OFFS[y ^ (sizeY * flipY)][x ^ (sizeX * flipX)];

          const pixels = this.decodeSprite16(tileCode);
          const blockX = spriteX + 16 * x;
          const blockY = spriteY + 16 * y;

          for (let py = 0; py < 16; py++) {
            const srcY = flipY ? 15 - py : py;
            const srcRow = srcY * 16;

            for (let px = 0; px < 16; px++) {
              const srcX = flipX ? 15 - px : px;
              const rgb = penRgb[pixels[srcRow + srcX]];

              if (!rgb) continue;

              // blitPen applies the overall cocktail screen-position mirror.
              // flipX/flipY above apply the MAME per-sprite pixel-pattern XOR.
              this.blitPen(buf, W, H, rgb, flipScreen, blockX, blockY, px, py);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
  renderSprites(ctx) {
    const W = 288;
    const H = 224;
    const BASE = 0x380;

    // MAME galaga_v.cpp:
    // static const int gfx_offs[2][2] = { { 0, 1 }, { 2, 3 } };
    const GFX_OFFS = [
      [0, 1],
      [2, 3]
    ];

    const flipScreen = !!this.flipScreen;
    const lutValid = this.spriteLutProm?.length >= 256;

    const imgData = ctx.getImageData(0, 0, W, H);
    const buf = imgData.data;

    for (let offs = 0; offs < 0x80; offs += 2) {
      const code = this.ram1[BASE + offs] & 0x7f;
      const color = this.ram1[BASE + offs + 1] & 0x3f;

      const syRaw = this.ram2[BASE + offs];
      const sxRaw = this.ram2[BASE + offs + 1];

      const flags = this.ram3[BASE + offs];
      const sxHi = this.ram3[BASE + offs + 1];

      // MAME: int flipx = flags & 0x01; int flipy = (flags & 0x02) >> 1;
      // MAME: if (flip_screen()) { flipx ^= 1; flipy ^= 1; }
      let flipX = flags & 0x01;
      let flipY = (flags >>> 1) & 0x01;

      if (flipScreen) {
        flipX ^= 1;
        flipY ^= 1;
      }

      // MAME: sizex = (flags & 0x04) >> 2; sizey = (flags & 0x08) >> 3.
      const sizeX = (flags >>> 2) & 0x01;
      const sizeY = (flags >>> 3) & 0x01;

      // MAME:
      // sx = spriteram_2[offs + 1] - 40
      //    + 0x100 * (spriteram_3[offs + 1] & 3);
      const spriteX = sxRaw - 40 + 0x100 * (sxHi & 0x03);

      // MAME:
      // sy = 256 - spriteram_2[offs] + 1;
      // sy -= 16 * sizey;
      // sy = (sy & 0xff) - 32;
      //
      // The 8-bit wrap is required. Without it, sprites near the upper
      // hardware Y range can be displaced by 256 pixels.
      const spriteY = ((257 - syRaw - 16 * sizeY) & 0xff) - 32;

      const lutBase = color << 2;
      const penRgb = [null, null, null, null];

      for (let pen = 0; pen < 4; pen++) {
        const palettePen = lutValid
          ? this.spriteLutProm[lutBase + pen] & 0x0f
          : (lutBase + pen) & 0x0f;

        // MAME transpen_mask treats LUT pen 0x0f as transparent.
        if (palettePen !== 0x0f) {
          penRgb[pen] = this.palette[palettePen] ?? null;
        }
      }

      // MAME loops y <= sizey and x <= sizex, selecting one of four
      // consecutive 16x16 graphics blocks for a 32x32 sprite.
      for (let y = 0; y <= sizeY; y++) {
        for (let x = 0; x <= sizeX; x++) {
          const tileCode =
            code + GFX_OFFS[y ^ (sizeY * flipY)][x ^ (sizeX * flipX)];

          const pixels = this.decodeSprite16(tileCode);
          const blockX = spriteX + 16 * x;
          const blockY = spriteY + 16 * y;

          for (let py = 0; py < 16; py++) {
            const srcY = flipY ? 15 - py : py;
            const srcRow = srcY * 16;

            for (let px = 0; px < 16; px++) {
              const srcX = flipX ? 15 - px : px;
              const rgb = penRgb[pixels[srcRow + srcX]];

              if (!rgb) continue;

              // blitPen applies the overall cocktail screen-position mirror.
              // flipX/flipY above apply the MAME per-sprite pixel-pattern XOR.
              this.blitPen(buf, W, H, rgb, flipScreen, blockX, blockY, px, py);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  showDecodedSpriteViewer(codes = []) {
    const list = [...new Set(codes.map((code) => code & 0x7f))];

    if (!list.length) {
      console.warn("[SpriteDecode] no codes requested");
      return null;
    }

    document.getElementById("spriteDecodeViewer")?.remove();

    const CELL_W = 32;
    const CELL_H = 36;
    const COLS = 8;
    const ROWS = Math.ceil(list.length / COLS);

    const canvas = document.createElement("canvas");
    canvas.id = "spriteDecodeViewer";
    canvas.width = COLS * CELL_W;
    canvas.height = ROWS * CELL_H;

    canvas.style.cssText = `
    position: fixed;
    top: 8px;
    right: 8px;
    z-index: 999999;
    width: ${canvas.width * 2}px;
    height: ${canvas.height * 2}px;
    background: #000;
    border: 2px solid #0f0;
    image-rendering: pixelated;
  `;

    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const buf = img.data;

    // Diagnostic colors only: this shows decoded pixel shape and order,
    // independent of the color lookup PROM.
    const colors = [
      null,
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 255, g: 255, b: 255 }
    ];

    for (let index = 0; index < list.length; index++) {
      const code = list[index];
      const cellX = (index % COLS) * CELL_W;
      const cellY = Math.floor(index / COLS) * CELL_H;
      const pixels = this.decodeSprite16(code);

      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
          const rgb = colors[pixels[py * 16 + px]];
          if (!rgb) continue;

          const dst = ((cellY + 14 + py) * canvas.width + cellX + 8 + px) << 2;
          buf[dst] = rgb.r;
          buf[dst + 1] = rgb.g;
          buf[dst + 2] = rgb.b;
          buf[dst + 3] = 0xff;
        }
      }
    }

    ctx.putImageData(img, 0, 0);

    ctx.fillStyle = "#0f0";
    ctx.font = "8px monospace";
    ctx.textBaseline = "top";

    for (let index = 0; index < list.length; index++) {
      const code = list[index];
      const cellX = (index % COLS) * CELL_W;
      const cellY = Math.floor(index / COLS) * CELL_H;

      ctx.fillText(
        code.toString(16).padStart(2, "0").toUpperCase(),
        cellX + 2,
        cellY + 2
      );
    }

    document.body.appendChild(canvas);

    console.log("[SpriteDecode] direct decoder viewer:", list);
    return canvas;
  }

  render(ctx) {
    this.starfield.render(ctx);
    this.renderSprites(ctx);
    this.renderTiles(ctx);
    this.soundChip.flushRegisters();
  }

  initPaletteFromProm() {
    // Character palette: 32 entries from prom-5.5n
    for (let i = 0; i < 32; i++) {
      const byte = this.masterPaletteProm[i];
      const r0 = (byte >> 0) & 1;
      const r1 = (byte >> 1) & 1;
      const r2 = (byte >> 2) & 1;
      const g0 = (byte >> 3) & 1;
      const g1 = (byte >> 4) & 1;
      const g2 = (byte >> 5) & 1;
      const b0 = (byte >> 6) & 1;
      const b1 = (byte >> 7) & 1;

      this.palette[i] = {
        r: 0x21 * r0 + 0x47 * r1 + 0x97 * r2,
        g: 0x21 * g0 + 0x47 * g1 + 0x97 * g2,
        b: 0x47 * b0 + 0x97 * b1
      };
    }
  }

  async loadRoms(progressCallback = null) {
    const { files: romFiles } = this.config.roms;
    let crc32Table = this.constructor._crc32Table;
    if (!crc32Table) {
      crc32Table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crc32Table[i] = c >>> 0;
      }
      this.constructor._crc32Table = crc32Table;
    }

    const results = await Promise.all(
      romFiles.map(async (file, index) => {
        try {
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
              `${file.name}: size mismatch, expected ${file.size}, got ${data.length}`
            );
          }

          if (file.crc32) {
            let crc = 0xffffffff;
            for (let i = 0; i < data.length; i++) {
              crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
            }
            const actualCrc = ((crc ^ 0xffffffff) >>> 0)
              .toString(16)
              .padStart(8, "0");
            const expectedCrc = file.crc32.toLowerCase();

            if (actualCrc !== expectedCrc) {
              throw new Error(
                `${file.name}: CRC mismatch, expected ${expectedCrc}, got ${actualCrc}`
              );
            }
          }

          const target = file.target ? this[file.target] : null;

          if (!(target instanceof Uint8Array)) {
            throw new Error(
              `${file.name}: no valid Uint8Array target "${file.target}"`
            );
          }

          const offset = file.offset ?? 0;

          if (
            !Number.isInteger(offset) ||
            offset < 0 ||
            offset + data.length > target.length
          ) {
            throw new Error(
              `${file.name}: ${file.target} overflow at 0x${offset.toString(
                16
              )}`
            );
          }

          target.set(data, offset);

          if (file.soundPromRole === "waveform") {
            this.soundChip?.notifyPromLoaded?.();
          }

          progressCallback?.(index + 1, romFiles.length, file.name);

          return { success: true, file, error: null };
        } catch (error) {
          console.error(`[ROM FAIL] ${file.name}`, error);
          return { success: false, file, error };
        }
      })
    );

    const failed = results.filter((r) => !r.success);
    const failedFiles = failed.map((r) => r.file.name);
    const criticalMissing = failed.some((r) => r.file.critical);
    const successCount = results.length - failed.length;

    this.initPaletteFromProm();

    const rom51 = results.find((r) => r.file?.name === "51xx.bin");
    if (rom51?.success) {
      this.inputController.loadROM(this.mcuRom51);
    } else {
      console.warn(
        "[51XX] 51xx.bin not found — using corrected behavioral fallback"
      );
    }

    const rom54 = results.find((r) => r.file?.name === "54xx.bin");
    if (rom54?.success) {
      this.namco54xx.loadROM(this.mcuRom54);
    } else {
      console.warn("[54XX] 54xx.bin not found — using behavioral fallback");
    }

    return {
      successCount,
      failedFiles,
      criticalMissing
    };
  }
}
class GalagaApp {
  constructor() {
    this.config = new EmulatorConfig();
    this.ui = new UIManager(this.config);
    this.input = new InputManager(this.config);
    this.emulator = new GalagaEmulator(this.config);

    this.swipeController = null;

    this.animationId = null;
    this.lastFrameTime = 0;
    this.frameAccum = 0;
    this.fatalError = false;

    this.renderFrames = 0;
    this.renderFps = 0;
    this.fpsSampleStart = performance.now();

    this.TARGET_MS = 1000 / this.config.performance.targetFPS;
    this.MAX_DELTA = 100;
    this.MAX_STEPS = 4;

    this.gameLoop = this.gameLoop.bind(this);
  }

  static formatError(error) {
    if (error instanceof Error) {
      let text = `${error.name}: ${error.message || "(no message)"}`;

      if (error.cause) {
        text += `\nCause: ${GalagaApp.formatError(error.cause)}`;
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
      const properties = Object.getOwnPropertyNames(error);
      const details = {};

      for (const key of properties) {
        details[key] = String(error[key]);
      }

      return JSON.stringify(details);
    } catch {
      return String(error);
    }
  }

  async init() {
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

    if (container) {
      this.input.setupTouchControls(container);
    }
    this.swipeController?.dispose?.();
    this.swipeController = new SwipeController(this.input, window);

    /*
     * The emulator constructor owns onAudioReady. Do not overwrite it here.
     */
    this.emulator.soundChip.initAudio();

    return true;
  }

  updateRenderFps(now) {
    this.renderFrames++;

    const elapsed = now - this.fpsSampleStart;

    if (elapsed < 500) {
      return;
    }

    this.renderFps = (this.renderFrames * 1000) / elapsed;
    this.renderFrames = 0;
    this.fpsSampleStart = now;

    const fpsElement = document.getElementById("renderFps");

    if (fpsElement) {
      fpsElement.textContent = `Render: ${this.renderFps.toFixed(1)} FPS`;
    }
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

      if (stepsRun > 0) {
        const ctx = this.ui.getContext();

        if (!ctx) {
          throw new Error("Canvas context is not initialized");
        }

        this.ui.beginFrame();
        this.emulator.render(ctx);
        this.ui.endFrame();

        this.updateRenderFps(now);

        if (
          this.WATCHDOG_WARN != null &&
          this.emulator.watchdogTimer > this.WATCHDOG_WARN
        ) {
          this.ui.showWarning?.("Watchdog timeout — CPU may be halted");
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

    this.emulator.soundChip.resumeIfNeeded?.();

    this.emulator.running = true;
    this.lastFrameTime = performance.now();
    this.frameAccum = 0;

    this.animationId = requestAnimationFrame(this.gameLoop);
  }

  stop() {
    this.emulator.running = false;

    this.swipeController?._setDirection?.(null);
    this.input.releaseAll?.();

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  reset() {
    this.stop();

    this.fatalError = false;
    this.frameAccum = 0;
    this.lastFrameTime = 0;
    this.renderFrames = 0;
    this.fpsSampleStart = performance.now();

    this.emulator.reset();
  }

  abort(error) {
    if (this.fatalError) {
      return;
    }

    this.fatalError = true;
    this.stop();

    const message = GalagaApp.formatError(error);
    const frame = this.emulator?.frameCounter ?? 0;
    const stack = error instanceof Error ? error.stack : null;
    const cause = error instanceof Error ? error.cause : null;

    console.groupCollapsed(`[JSGalaga] FATAL — frame ${frame}`);
    console.error("Raw error:", error);
    console.error("Formatted:", message);

    if (stack) {
      console.error("Stack:", stack);
    }

    if (cause) {
      console.error("Cause:", cause);
    }

    console.groupEnd();

    const displayText = `FATAL ERROR — frame ${frame}\n${message}`;

    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = displayText;
      statusBar.className = "error";
    }

    this.ui.showError?.(displayText);
  }
}
class InputManager {
  static PULSE_MS = 100;

  constructor(config) {
    this.config = config;

    // Active-low ports. All controls are released at power-on.
    this.ports = {
      in0: 0xff,
      in1: 0xff
    };

    // Galaga input wiring.
    this.buttons = Object.freeze({
      RIGHT: { port: "in0", mask: 0x02, pulse: false },
      LEFT: { port: "in0", mask: 0x08, pulse: false },

      FIRE: { port: "in1", mask: 0x01, pulse: false },
      START1: { port: "in1", mask: 0x04, pulse: true },
      START2: { port: "in1", mask: 0x08, pulse: true },
      COIN1: { port: "in1", mask: 0x10, pulse: true },
      COIN2: { port: "in1", mask: 0x20, pulse: true },
      SERVICE: { port: "in1", mask: 0x40, pulse: true }
    });

    this.onStateChange = null;

    // Prevent repeated keydown/pointer events from producing duplicate
    // press notifications or overlapping release timers.
    this.heldButtons = new Set();
    this.pulseTimers = new Map();

    this._keyboardBound = false;
    this._blurBound = false;
  }

  getState() {
    return {
      in0: this.ports.in0 & 0xff,
      in1: this.ports.in1 & 0xff
    };
  }

  setOnStateChange(fn, notifyImmediately = true) {
    this.onStateChange = typeof fn === "function" ? fn : null;

    // Important: the 51XX must receive the idle state before its first
    // instruction executes, not only after the first user input.
    if (this.onStateChange && notifyImmediately) {
      this._notifyStateChange(true);
    }
  }

  pressButton(button) {
    const b = this.buttons[button];
    if (!b) return false;

    // Ignore auto-repeat and duplicate pointerdown events.
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

    // A repeat while the virtual switch is already closed must not extend
    // or retrigger the pulse. This is especially important for browser
    // keyboard auto-repeat on Coin and Start.
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
      this._lastNotifiedIn1 === state.in1
    ) {
      return;
    }

    this._lastNotifiedIn0 = state.in0;
    this._lastNotifiedIn1 = state.in1;

    this.onStateChange(state);
  }

  setupTouchControls(containerElement) {
    const buttons = {
      left: document.getElementById("btnLeft"),
      right: document.getElementById("btnRight"),
      fire: document.getElementById("btnFire"),
      coin: document.getElementById("btnCoin"),
      start: document.getElementById("btnStart")
    };

    if (Object.values(buttons).some((element) => !element)) {
      return false;
    }

    if (this.config?.input?.preventScroll && containerElement) {
      containerElement.addEventListener(
        "touchmove",
        (event) => event.preventDefault(),
        { passive: false }
      );
    }

    this._setupButton(buttons.left, "LEFT", false);
    this._setupButton(buttons.right, "RIGHT", false);
    this._setupButton(buttons.fire, "FIRE", false);
    this._setupButton(buttons.coin, "COIN1", true);
    this._setupButton(buttons.start, "START1", true);

    return true;
  }

  _setupButton(element, button, isPulse) {
    if (!element || element.dataset.inputBound === "true") return;

    element.dataset.inputBound = "true";
    element.style.touchAction = "none";

    const press = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (isPulse) {
        this.pulseButton(button, 250);
        this._visualFeedback(element, 250);
      } else {
        this.pressButton(button);
        this._visualFeedback(element);
      }

      if (event.pointerId != null) {
        element.setPointerCapture?.(event.pointerId);
      }
    };

    const release = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isPulse) {
        this.releaseButton(button);
      }

      this._clearVisualFeedback(element);
    };

    element.addEventListener("pointerdown", press, { passive: false });
    element.addEventListener("pointerup", release, { passive: false });
    element.addEventListener("pointercancel", release, { passive: false });
    element.addEventListener("lostpointercapture", release, {
      passive: false
    });

    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
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

  setupKeyboardControls() {
    if (this._keyboardBound) return;

    this._keyboardBound = true;

    const keyMap = {
      arrowleft: { button: "LEFT", pulse: false },
      a: { button: "LEFT", pulse: false },

      arrowright: { button: "RIGHT", pulse: false },
      d: { button: "RIGHT", pulse: false },

      " ": { button: "FIRE", pulse: false },
      z: { button: "FIRE", pulse: false },
      x: { button: "FIRE", pulse: false },

      5: { button: "COIN1", pulse: true },
      6: { button: "COIN2", pulse: true },

      1: { button: "START1", pulse: true },
      2: { button: "START2", pulse: true },

      9: { button: "SERVICE", pulse: true }
    };

    document.addEventListener("keydown", (event) => {
      const mapped = keyMap[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (mapped.pulse) {
        // `event.repeat` prevents keyboard auto-repeat from issuing several
        // coin/start pulses while the key is held.
        if (!event.repeat) {
          this.pulseButton(mapped.button);
        }
      } else {
        this.pressButton(mapped.button);
      }
    });

    document.addEventListener("keyup", (event) => {
      const mapped = keyMap[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (!mapped.pulse) {
        this.releaseButton(mapped.button);
      }
    });

    if (!this._blurBound) {
      this._blurBound = true;
      window.addEventListener("blur", () => this.releaseAll());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.releaseAll();
      });
    }
  }
}
class SwipeController {
  static DEFAULT_EXCLUDED_SELECTOR = [
    "button",
    "input",
    "select",
    "textarea",
    "a",
    "[data-no-swipe]",
    "[data-game-control]",
    "[data-touch-control]",
    ".touch-control",
    ".fire-button"
  ].join(", ");

  constructor(inputManager, element = window, options = {}) {
    if (!inputManager) {
      throw new Error("SwipeController requires an InputManager");
    }

    if (!element?.addEventListener || !element?.removeEventListener) {
      throw new TypeError("SwipeController requires an EventTarget element");
    }

    this.input = inputManager;
    this.element = element;
    this.endElement = document;

    this.minSwipeDist = Math.max(0, options.minSwipeDist ?? 10);
    this.horizontalBias = Math.max(0.01, options.horizontalBias ?? 1.35);
    this.excludedSelector =
      options.excludedSelector ?? SwipeController.DEFAULT_EXCLUDED_SELECTOR;

    this.touchStart = null;
    this.currentDir = null;
    this.enabled = true;

    this.onTouchStart = (event) => this._start(event);
    this.onTouchMove = (event) => this._move(event);
    this.onTouchEnd = (event) => this._end(event);
    this.onTouchCancel = (event) => this._cancel(event);
    this.onWindowBlur = () => this.release();
    this.onVisibilityChange = () => {
      if (document.hidden) this.release();
    };

    const optionsPassiveFalse = { passive: false };

    /*
     * Start/move are window-wide when element is window. End/cancel stay on
     * document so the tracked contact is released after crossing a canvas,
     * viewport, or DOM-boundary edge.
     */
    this.element.addEventListener(
      "touchstart",
      this.onTouchStart,
      optionsPassiveFalse
    );
    this.element.addEventListener(
      "touchmove",
      this.onTouchMove,
      optionsPassiveFalse
    );
    this.endElement.addEventListener(
      "touchend",
      this.onTouchEnd,
      optionsPassiveFalse
    );
    this.endElement.addEventListener(
      "touchcancel",
      this.onTouchCancel,
      optionsPassiveFalse
    );

    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  setEnabled(enabled) {
    const next = !!enabled;
    if (next === this.enabled) return;

    this.enabled = next;
    if (!next) this.release();
  }

  release() {
    this._setDirection(null);
    this.touchStart = null;
  }

  _start(event) {
    if (
      !this.enabled ||
      this.touchStart ||
      this._isExcludedControlEvent(event)
    ) {
      return;
    }

    const touch = event.changedTouches?.[0];
    if (!touch) return;

    event.preventDefault();

    this.touchStart = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY
    };
  }

  _move(event) {
    if (!this.enabled || !this.touchStart) return;

    const changedTouch = this._getTrackedTouch(event.changedTouches);

    /* A different touch moved; it must not affect the held direction. */
    if (!changedTouch) {
      if (!this._getTrackedTouch(event.touches)) {
        this.release();
      }
      return;
    }

    event.preventDefault();

    const dx = changedTouch.clientX - this.touchStart.x;
    const dy = changedTouch.clientY - this.touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    /* Returning through centre releases a previously held direction. */
    if (absX < this.minSwipeDist && absY < this.minSwipeDist) {
      this._setDirection(null);
      return;
    }

    /* Galaga is two-way: a vertical-dominant gesture releases movement. */
    const direction =
      absX >= absY / this.horizontalBias ? (dx >= 0 ? "RIGHT" : "LEFT") : null;

    this._setDirection(direction);
  }

  _end(event) {
    if (!this.touchStart) return;

    /* Only the touch that owns the swipe may release LEFT/RIGHT. */
    if (!this._getTrackedTouch(event.changedTouches)) return;

    event.preventDefault();
    this.release();
  }

  _cancel(event) {
    if (!this.touchStart) return;

    /*
     * A discrete FIRE touch can be cancelled independently. Release movement
     * only if the tracked swipe touch was cancelled, or is no longer live.
     */
    if (this._getTrackedTouch(event.changedTouches)) {
      event.preventDefault();
      this.release();
      return;
    }

    if (!this._getTrackedTouch(event.touches)) {
      event.preventDefault();
      this.release();
    }
  }

  _isExcludedControlEvent(event) {
    const path = event.composedPath?.() ?? [event.target];

    for (const node of path) {
      if (node?.matches?.(this.excludedSelector)) return true;
    }

    return false;
  }

  _getTrackedTouch(touches) {
    if (!touches || !this.touchStart) return null;

    for (let index = 0; index < touches.length; index++) {
      const touch = touches[index];
      if (touch.identifier === this.touchStart.id) return touch;
    }

    return null;
  }

  _setDirection(direction) {
    if (direction === this.currentDir) return;

    /* Release first: opposite directions never overlap due to a swipe. */
    if (this.currentDir) {
      this.input.releaseButton(this.currentDir);
    }

    this.currentDir = direction;

    if (direction) {
      this.input.pressButton(direction);
    }
  }

  dispose() {
    this.release();
    this.enabled = false;

    this.element.removeEventListener("touchstart", this.onTouchStart);
    this.element.removeEventListener("touchmove", this.onTouchMove);
    this.endElement.removeEventListener("touchend", this.onTouchEnd);
    this.endElement.removeEventListener("touchcancel", this.onTouchCancel);

    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
}

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

    // Landscape: 288 wide × 224 high
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
  getContext() {
    return this.ctx;
  }
}
let app = null;
window.JSGalaga = {
  get app() {
    return app;
  },

  get emulator() {
    return app?.emulator ?? null;
  },

  dumpSpriteCacheCode(code) {
    return this.app?.emulator?.dumpSpriteCacheCode?.(code) ?? null;
  },

  dumpSpriteDescriptors() {
    return this.app?.emulator?.dumpSpriteDescriptors?.() ?? null;
  },

  dumpSpriteFlags() {
    return this.app?.emulator?.dumpSpriteFlags?.() ?? null;
  },

  showDecodedSpriteViewer(codes) {
    return this.app?.emulator?.showDecodedSpriteViewer?.(codes) ?? null;
  },

  setSpriteTrace(enabled = true, slots = null, changedOnly = true) {
    return this.app?.emulator?.setSpriteTrace?.(enabled, slots, changedOnly);
  },

  start() {
    app?.start();
  },

  stop() {
    app?.stop();
  },

  reset() {
    app?.reset();
  }
};
async function initApp() {
  try {
    app = new GalagaApp();
    const ok = await app.init();
    if (ok) app.start();
  } catch (error) {
    console.error("[JSGalaga] Initialization failed:", error);
    console.error("[JSGalaga] Stack:", error?.stack); // ← add this
    if (app) app.abort(error);

    if (app) {
      app.abort(error);
      return;
    }

    const text = GalagaApp.formatError(error);
    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = `FATAL ERROR: ${text}`;
      statusBar.className = "error";
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initApp(), {
    once: true
  });
} else {
  void initApp();
}