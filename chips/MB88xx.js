function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }
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

    // device_start() owns these external pin/timer states. MAME's
    // device_reset() deliberately does not clear m_if, m_ctr, or cancel an
    // already-running serial timer.
    this.ifLine = 0;
    this.ctr = 0;
    this.serialEnabled = false;
    this.serialCycleAccumulator = 0;
    this.resetAsserted = false;

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

    this.pio = 0;
    this.TH = 0;
    this.TL = 0;
    this.TP = 0;

    this.SB = 0;
    this.SBcount = 0;

    this.pendingIrq = 0;
    this.inIrq = false;

    this.halted = false;
  }

  setHalt(state) {
    this.halted = !!state;
  }

  // CPU-framework RESET input. The Namco wrappers pass an asserted boolean.
  // MAME calls device_reset() when reset is asserted and suspends execution
  // until release; wrapper execution loops already enforce that suspension.
  setResetLine(asserted) {
    const next = !!asserted;
    if (next === this.resetAsserted) return false;
    this.resetAsserted = next;
    if (next) this.reset();
    return true;
  }

  getPC() {
    return (this.PA << 6) + this.PC;
  }

  incPC() {
    this.PC++;
    if (this.PC >= 0x40) {
      this.PC = 0;
      // MAME keeps PA as the MB88xx's 5-bit page register even on parts
      // with a narrower external program address bus (e.g. MB8844). The
      // program space masks the address; PA itself must not be truncated to
      // programWidth-6 bits because calls/returns preserve PA bit 4.
      this.PA = (this.PA + 1) & 0xff;
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
    newpio &= 0xff;
    if ((this.pio ^ newpio) & 0x30) {
      const serialBits = newpio & 0x30;
      if (serialBits === 0x00) {
        this.serialEnabled = false;
        this.serialCycleAccumulator = 0;
      } else if (serialBits === 0x20) {
        // MAME arms serial_timer at clock()/SERIAL_PRESCALE. MB88xx
        // execute cycles are already clock()/6, so this is one MCU cycle.
        this.serialEnabled = true;
        this.serialCycleAccumulator = 0;
      } else {
        throw new Error(
          "mb88xx: pio_enable set serial enable to unsupported value " +
          serialBits.toString(16).padStart(2, "0"));
      }
    }
    this.pio = newpio;
  }

  serialTimerTick() {
    const C = this.constructor;
    this.SBcount++;

    if (this.SBcount >= C.SERIAL_DISABLE_THRESH)
      this.serialEnabled = false;

    // Match MAME: don't overwrite SB while the serial-full flag is set.
    if (!this.sf) {
      this.SB = (this.SB >>> 1) | (this.readSI() ? 8 : 0);
      this.SB &= 0x0f;

      if (this.SBcount >= 4) {
        this.sf = 1;
        this.pendingIrq |= C.INT_CAUSE_SERIAL;
      }
    }
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
    let consumed = cycles;

    // serial_timer is a scheduler timer in MAME. Its period is clock()/6,
    // exactly one MB88xx execution cycle. Advance it before IRQ arbitration
    // so a serial completion can become pending at the same cycle boundary.
    if (this.serialEnabled) {
      this.serialCycleAccumulator += cycles;
      while (this.serialEnabled && this.serialCycleAccumulator >= 1) {
        this.serialCycleAccumulator -= 1;
        this.serialTimerTick();
      }
    }

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

      consumed += this.burnCycles(3);
    }
    return consumed;
  }

  step() {
    if (this.halted) return 0;

    const executedPC = this.getPC();
    const opcode = this.readOp(executedPC);
    this.incPC();

    this.executedPC = executedPC;
    this.onInstruction?.({
      pc: executedPC,
      opcode,
      A: this.A, X: this.X, Y: this.Y,
      st: this.st, zf: this.zf, cf: this.cf,
      pio: this.pio
    });

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
        if (this.sf) {
          // MAME restarts the serial timer here if it had disabled itself
          // after too many unserviced serial callbacks.
          if (this.SBcount >= this.constructor.SERIAL_DISABLE_THRESH) {
            this.serialEnabled = true;
            this.serialCycleAccumulator = 0;
          }
          this.SBcount = 0;
        }
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
        this.PA = this.SP[this.SI] >> 6 & 0x1f;
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
        this.PA = this.SP[this.SI] >> 6 & 0x1f;
        this.st = this.SP[this.SI] >> 13 & 1;
        this.zf = this.SP[this.SI] >> 14 & 1;
        this.cf = this.SP[this.SI] >> 15 & 1;
        break;
      case 0x3d:
        this.PA = this.readOp(this.getPC()) & 0x1f;
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


    // MAME's burn_cycles(3) on interrupt entry consumes scheduler time in
    // addition to the instruction. Return the full amount so Namco custom
    // device schedulers do not run the MB88xx too fast around IRQs.
    return this.burnCycles(oc);
  }}_defineProperty(MB88xx, "INT_CAUSE_SERIAL", 0x01);_defineProperty(MB88xx, "INT_CAUSE_TIMER", 0x02);_defineProperty(MB88xx, "INT_CAUSE_EXTERNAL", 0x04);_defineProperty(MB88xx, "TIMER_PRESCALE", 32);_defineProperty(MB88xx, "SERIAL_DISABLE_THRESH", 1000);

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



export { MB88xx, MB8841, MB8842, MB8843, MB8844 };
