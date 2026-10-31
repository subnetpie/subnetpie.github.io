import { MB8843 } from "./MB88xx.js";
function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }
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


export { Namco51XX };
