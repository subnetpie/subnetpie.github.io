// Shared instruction-level Z80 core. See README.md for the MAME 0.289
// reference, API contract, validation scope, and timing limitations.
export class Z80 {
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
    this.irqPending = false;
    this.nmiPending = false;
    this.nmiLine = false;
    this.vectorLatch = 0xff;
    this.memRead = memRead || ((addr) => 0xff);
    this.memWrite = memWrite || ((addr, data) => {});
    this.ioRead = ioRead || ((port) => 0xff);
    this.ioWrite = ioWrite || ((port, data) => {});
    this.opcodeRead = null;
    this.operandRead = null;
    this.onIrqAcknowledge = null;
    this.onReti = null;
    this.afterLdAIR = false;
    this.Q = this.QT = 0;
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
    this.initializeState();
  }
  addStall(cycles) {
    this.stallCycles += Math.max(0, Math.trunc(cycles));
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
  setInstructionReaders(opcodeRead = null, operandRead = null) {
    this.opcodeRead = opcodeRead;
    this.operandRead = operandRead;
  }
  fetchOpcode() {
    const opcode = this.opcodeRead
      ? this.opcodeRead(this.PC & 0xffff) & 0xff : this.read8(this.PC);

    this.PC = (this.PC + 1) & 0xffff;
    this.incR();

    return opcode;
  }
  fetchByte() {
    const value = this.operandRead
      ? this.operandRead(this.PC & 0xffff) & 0xff : this.read8(this.PC);

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
    this.performCoreReset();
  }
  performCoreReset() {
    // MAME device_reset preserves IM, general registers and external IRQ lines.
    this.PC = 0x0000;
    this.MEMPTR = this.PC;
    this.I = 0x00;
    this.R = 0x00;
    this.IFF1 = false;
    this.IFF2 = false;

    this.halted = false;
    this.eiPending = false;
    this.nmiPending = false;
    this.eiIssuedThisInstruction = false;
    this.afterLdAIR = false;
    this.stallCycles = 0;
  }
  setReset(assert) {
    const next = !!assert;
    if (next === this.inReset) return;
    this.inReset = next;
    if (next) this.reset();
  }
  step() {
    // Return idle time so callers can budget reset-held CPUs without spinning.
    if (this.inReset) { this.cycles += 4; return 4; }
    if (this.stallCycles > 0) {
      const elapsed = this.stallCycles;
      this.stallCycles = 0;
      this.cycles += elapsed;
      return elapsed;
    }

    // EI inhibits only maskable IRQ acceptance for the protected instruction.
    // NMI handling must remain independent of this argument.
    const intCycles = this.handleInterrupts(!!this.eiPending);
    if (intCycles) {
      this.cycles += intCycles;
      return intCycles;
    }

    this.afterLdAIR = false;
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
      this.halted = false;
      if (this.afterLdAIR) this.F &= ~0x04;
      this.afterLdAIR = false;
      // MAME 0.289 take_nmi clears IFF1 and leaves IFF2 unchanged.
      this.IFF1 = false;
      this.incR();
      this.push16(this.PC);
      this.PC = this.MEMPTR = 0x0066;
      return 11;
    }
    if (!(this.irqLine || this.irqPending) || !this.IFF1 || suppressIrq) return 0;
    this.halted = false;
    if (this.afterLdAIR) this.F &= ~0x04;
    this.afterLdAIR = false;
    this.IFF1 = this.IFF2 = false;
    this.incR();
    this.irqPending = false; // HOLD request ends at acknowledge; IRQ line stays asserted.
    const vector = this.onIrqAcknowledge?.(this) ?? this.vectorLatch;
    if (this.IM === 0) return this.executeInterruptOpcode(vector);
    this.push16(this.PC);
    if (this.IM === 1) {
      this.PC = this.MEMPTR = 0x0038;
      return 13;
    }
    if (this.IM === 2) {
      this.PC = this.read16((this.I << 8) | (vector & 0xff));
      this.MEMPTR = this.PC;
      return 19;
    }
    throw new Error("Invalid Z80 interrupt mode: " + this.IM);
  }
  executeInterruptOpcode(vector) {
    // MAME 0.289's IM0 board-vector convention: NOP, packed CALL/JP, RST, EI.
    // IRQ fetch contributes two T states, then the selected response timing.
    vector >>>= 0;
    if (vector === 0) { this.MEMPTR = this.PC; return 2; }
    if ((vector & 0xff0000) === 0xcd0000) {
      this.push16(this.PC);
      this.PC = this.MEMPTR = vector & 0xffff;
      return 19;
    }
    if ((vector & 0xff0000) === 0xc30000) {
      this.PC = this.MEMPTR = vector & 0xffff;
      return 12;
    }
    if ((vector & 0xc7) === 0xc7) {
      this.push16(this.PC);
      this.PC = this.MEMPTR = vector & 0x38;
      return 13;
    }
    if (vector === 0xfb) {
      this.executeBase(0xfb);
      this.MEMPTR = this.PC;
      return 6;
    }
    throw new Error("Unsupported MAME-style IM0 vector: 0x" + vector.toString(16));
  }
  setIrqLine(asserted, vector = this.vectorLatch) {
    this.irqLine = !!asserted;
    if (asserted) this.vectorLatch = vector >>> 0;
  }
  requestIrq(vector = this.vectorLatch) {
    this.vectorLatch = vector >>> 0;
    this.irqPending = true;
  }
  clearIrq() { this.irqLine = this.irqPending = false; }
  irq(vector = this.vectorLatch) { this.requestIrq(vector); }
  interrupt(isNMI, vector = this.vectorLatch) {
    if (isNMI) this.requestNmi(); else this.requestIrq(vector);
  }
  clearInterrupt(nonMaskable) {
    if (nonMaskable) this.clearNmi(); else this.clearIrq();
  }
  setNmiLine(asserted) {
    if (asserted && !this.nmiLine && !this.inReset) this.nmiPending = true;
    this.nmiLine = !!asserted;
  }
  requestNmi() { this.setNmiLine(true); }
  nmi() { this.requestNmi(); }
  clearNmiLatch() { this.setNmiLine(false); }
  clearNmi() { this.nmiLine = this.nmiPending = false; }
  pulseNmi() { this.setNmiLine(true); this.setNmiLine(false); }
  executeBase(op) {
    switch (op) {
      case 0x00:
        return 4;
      case 0x01:
        this.BC = this.fetchWord();
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
        this.C = this.fetchByte();
        return 7;
      case 0x0f:
        this.rrca();
        return 4;
      case 0x10: {
        // DJNZ e
        const e = this.fetchByte();
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
        this.DE = this.fetchWord();
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
        this.D = this.fetchByte();
        return 7;
      case 0x17:
        this.rla();
        return 4;
      case 0x18: {
        const e = this.fetchByte();
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
        this.E = this.fetchByte();
        return 7;
      case 0x1f:
        this.rra();
        return 4;
      case 0x20: {
        const e = this.fetchByte();
        if (!(this.F & 0x40)) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x21:
        this.HL = this.fetchWord();
        return 10;
      case 0x22: {
        const addr = this.fetchWord();
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
        this.H = this.fetchByte();
        return 7;
      case 0x27:
        this.daa();
        return 4;
      case 0x28: {
        const e = this.fetchByte();
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
        const addr = this.fetchWord();
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
        this.L = this.fetchByte();
        return 7;
      case 0x2f:
        this.A ^= 0xff;
        this.F = (this.F & 0xc5) | 0x12 | (this.A & 0x28);
        return 4;
      case 0x30: {
        const e = this.fetchByte();
        if (!(this.F & 0x01)) {
          this.PC = (this.PC + ((e << 24) >> 24)) & 0xffff;
          this.MEMPTR = this.PC;
          return 12;
        }
        return 7;
      }
      case 0x31:
        this.SP = this.fetchWord();
        return 10;
      case 0x32: {
        const addr = this.fetchWord();
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
        this.write8(this.HL, this.fetchByte());
        return 10;
      case 0x37:
        this.scf();
        return 4;
      case 0x38: {
        const e = this.fetchByte();
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
        const addr = this.fetchWord();
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
        this.A = this.fetchByte();
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
        const addr = this.fetchWord();
        if (!(this.F & 0x40)) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xc3: {
        const addr = this.fetchWord();
        this.PC = addr;
        this.MEMPTR = addr;
        return 10;
      }
      case 0xc4: {
        const addr = this.fetchWord();
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
        this.add8(this.fetchByte());
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
        const addr = this.fetchWord();
        if (this.F & 0x40) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xcc: {
        const addr = this.fetchWord();
        if (this.F & 0x40) {
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
        return 10;
      }
      case 0xcd: {
        const addr = this.fetchWord();
        this.push16(this.PC);
        this.PC = addr;
        this.MEMPTR = addr;
        return 17;
      }
      case 0xce:
        this.adc8(this.fetchByte());
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
        const addr = this.fetchWord();
        if (!(this.F & 0x01)) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xd3: {
        const port = this.fetchByte();
        this.ioWrite((this.A << 8) | port, this.A);
        this.MEMPTR = ((this.A << 8) | ((port + 1) & 0xff)) & 0xffff;
        return 11;
      }
      case 0xd4: {
        const addr = this.fetchWord();
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
        this.sub8(this.fetchByte());
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
        const addr = this.fetchWord();
        if (this.F & 0x01) {
          this.PC = addr;
          this.MEMPTR = addr;
        }
        return 10;
      }
      case 0xdb: {
        const port = this.fetchByte();
        const oldA = this.A;
        this.A = this.ioRead((oldA << 8) | port);
        this.MEMPTR = ((oldA << 8) | ((port + 1) & 0xff)) & 0xffff;
        return 11;
      }
      case 0xdc: {
        const addr = this.fetchWord();
        if (this.F & 0x01) {
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
        return 10;
      }
      case 0xde:
        this.sbc8(this.fetchByte());
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
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
        this.and8(this.fetchByte());
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
        if (this.F & 0x04) {
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
        return 10;
      }
      case 0xee:
        this.xor8(this.fetchByte());
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
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
        this.or8(this.fetchByte());
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
        if (this.F & 0x80) {
          this.push16(this.PC);
          this.PC = addr;
          this.MEMPTR = addr;
          return 17;
        }
        return 10;
      }
      case 0xfe:
        this.cp8(this.fetchByte());
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
        setIXY(this.fetchWord());
        return 14;
      case 0x22: {
        const addr = this.fetchWord();
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
        setH(this.fetchByte());
        return 11;
      case 0x29:
        setIXY(this.add16(getIXY(), getIXY()));
        return 15;
      case 0x2a: {
        const addr = this.fetchWord();
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
        setL(this.fetchByte());
        return 11;
      case 0x34: {
        const d = this.fetchByte();
        const addr = (getIXY() + ((d << 24) >> 24)) & 0xffff;
        this.write8(addr, this.inc8(this.read8(addr)));
        return 23;
      }
      case 0x35: {
        const d = this.fetchByte();
        const addr = (getIXY() + ((d << 24) >> 24)) & 0xffff;
        this.write8(addr, this.dec8(this.read8(addr)));
        return 23;
      }
      case 0x36: {
        const d = this.fetchByte();
        const n = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, n);
        return 19;
      }
      case 0x39:
        setIXY(this.add16(getIXY(), this.SP));
        return 15;
      case 0x46: {
        const d = this.fetchByte();
        this.B = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x4e: {
        const d = this.fetchByte();
        this.C = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x56: {
        const d = this.fetchByte();
        this.D = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x5e: {
        const d = this.fetchByte();
        this.E = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x66: {
        const d = this.fetchByte();
        this.H = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x6e: {
        const d = this.fetchByte();
        this.L = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x7e: {
        const d = this.fetchByte();
        this.A = this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff);
        return 19;
      }
      case 0x70: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.B);
        return 19;
      }
      case 0x71: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.C);
        return 19;
      }
      case 0x72: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.D);
        return 19;
      }
      case 0x73: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.E);
        return 19;
      }
      case 0x74: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.H);
        return 19;
      }
      case 0x75: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.L);
        return 19;
      }
      case 0x77: {
        const d = this.fetchByte();
        this.write8((getIXY() + ((d << 24) >> 24)) & 0xffff, this.A);
        return 19;
      }
      case 0x86: {
        const d = this.fetchByte();
        this.add8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x8e: {
        const d = this.fetchByte();
        this.adc8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x96: {
        const d = this.fetchByte();
        this.sub8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0x9e: {
        const d = this.fetchByte();
        this.sbc8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xa6: {
        const d = this.fetchByte();
        this.and8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xae: {
        const d = this.fetchByte();
        this.xor8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xb6: {
        const d = this.fetchByte();
        this.or8(this.read8((getIXY() + ((d << 24) >> 24)) & 0xffff));
        return 19;
      }
      case 0xbe: {
        const d = this.fetchByte();
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
        this.write16(addr, this.DE);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x56:
        this.IM = 1;
        return 8;
      case 0x57:
        this.afterLdAIR = true;
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
        const addr = this.fetchWord();
        this.DE = this.read16(addr);
        this.MEMPTR = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x5e:
        this.IM = 2;
        return 8;
      case 0x5f:
        this.afterLdAIR = true;
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
        const addr = this.fetchWord();
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
        const addr = this.fetchWord();
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
  decodeDD() { return this.decodeIndex("IX"); }
  decodeFD() { return this.decodeIndex("IY"); }
  decodeIndex(reg) {
    let extra = 0;
    for (;;) {
      const op = this.fetchOpcode();
      if (op === 0xdd || op === 0xfd) {
        reg = op === 0xdd ? "IX" : "IY";
        extra += 4;
        continue;
      }
      if (op === 0xed) return extra + 4 + this.decodeED();
      if (op === 0xcb) return extra + this.decodeIndexCB(this[reg]);
      return extra + this.executeIndexed(op, reg);
    }
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
    this.onReti?.(this);
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
