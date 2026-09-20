// Shared implementations extracted unchanged from arcade/bosco/script.js.
// Board clocks, callbacks and analog circuits remain machine-specific.
function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }
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


export { Namco06XX, MB88xx, MB8841, MB8842, MB8843, MB8844, Namco51XX, Namco52XX, Namco54XX };
