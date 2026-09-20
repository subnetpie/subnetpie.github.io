import { MB8842 } from "./MB88xx.js";

function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true }); return obj; }

export class Namco50XX {
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
