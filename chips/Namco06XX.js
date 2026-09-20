function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }\nclass Namco06XX {
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


\nexport { Namco06XX };\n