import { MB8843 } from "./MB88xx.js";\nfunction _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }\nclass Namco52XX {








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


\nexport { Namco52XX };\n