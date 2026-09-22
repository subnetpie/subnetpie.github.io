import { MB8844 } from "./MB88xx.js";
function _defineProperty(obj, key, value) { Object.defineProperty(obj, key, {value, enumerable:true, configurable:true, writable:true}); return obj; }
class Namco54XX {








  constructor(opts = {}) {
    this.mcu = new MB8844();
    this.romLoaded = false;
    this.scheduler = null;
    this.latchedCmd = 0;
    this.resetLine = 1;
    this.irqState = false;
    this.pendingMasterTicks = 0;
    // Signed MCU-cycle budget. A MB88xx instruction/interrupt may consume
    // more cycles than the current scheduler quantum supplies; MAME carries
    // that negative icount into the following execution slice rather than
    // executing the next instruction early.
    this.mcuCycleBudget = 0;
    this.tickCount = 0;
    this.lastOutput = new Uint8Array(3);
    this.onChannelData =
    typeof opts.onChannelData === "function" ? opts.onChannelData : null;
    this.onReset = typeof opts.onReset === "function" ? opts.onReset : null;
    this.onCommand =
    typeof opts.onCommand === "function" ? opts.onCommand : null;
    this.traceCommands = false;
    this.traceOutputs = false;
    // Small rolling machine-side trace. This records the real 54XX boundary:
    // host commands and MB8844 O/R1 DAC writes with master-tick timestamps.
    this.traceLog = [];
    this.traceLimit = 512;
    this.mcuTraceRemaining = 0;
    this.installMcuCallbacks();
    this.mcu.onInstruction = state => {
      if (this.mcuTraceRemaining <= 0) return;
      this.recordTrace("mcu", state);
      this.mcuTraceRemaining--;
    };
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
    if (next === 0) {
      this.pendingMasterTicks = 0;
      this.mcuCycleBudget = 0;
    }
    (_this$onReset = this.onReset) === null || _this$onReset === void 0 ? void 0 : _this$onReset.call(this, next, this.getMasterTick());
    return true;
  }

  write(data) {
    const value = data & 0xff;
    this.synchronize(() => {
      this.latchedCmd = value;
      this.recordTrace("cmd", { value });
      this.onCommand?.(value, this.getMasterTick());
      // Capture the firmware path after effect commands without permanently
      // tracing the hot instruction loop.
      if (value === 0x10 || value === 0x20)
        this.mcuTraceRemaining = 96;
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
    const supplied = Math.floor(Number(cycles));
    if (!Number.isFinite(supplied) || supplied < 0) {
      throw new RangeError(
      "Namco54XX.executeMcuCycles() requires a non-negative integer");
    }

    /*
     * MAME's execute_run() owns a signed m_icount. An instruction is allowed
     * to take it below zero; the scheduler compensates on the next slice.
     * Preserve that debt here. Without it, a two-cycle interrupt/instruction
     * started in a one-cycle quantum makes the MB8844 run one cycle early.
     */
    this.mcuCycleBudget += supplied;

    while (
    this.mcuCycleBudget > 0 &&
    this.resetLine !== 0 &&
    !this.mcu.halted)
    {var _this$mcu$step7, _this$mcu$step8, _this$mcu16;
      const used = (_this$mcu$step7 = (_this$mcu$step8 = (_this$mcu16 = this.mcu).step) === null || _this$mcu$step8 === void 0 ? void 0 : _this$mcu$step8.call(_this$mcu16)) !== null && _this$mcu$step7 !== void 0 ? _this$mcu$step7 : 0;
      if (!Number.isFinite(used) || used < 0) {
        throw new Error("Invalid MB8844 cycle result: " + String(used));
      }

      const consumed = used > 0 ? Math.floor(used) : 1;
      this.mcuCycleBudget -= consumed;
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
    const changed = this.lastOutput[channel] !== next;
    this.lastOutput[channel] = next;
    // Idle 54XX firmware repeatedly writes the same zero values. Recording
    // every identical write evicts the command that caused the interesting
    // output on a phone-sized rolling trace. Keep state changes (and forced
    // synchronizations) while the DAC callback still receives every write.
    if (changed || force)
      this.recordTrace("out", { channel, value: next, force: !!force });
    (_this$onChannelData = this.onChannelData) === null || _this$onChannelData === void 0 ? void 0 : _this$onChannelData.call(this, channel, next, tick, !!force);
    if (this.traceOutputs) {
      console.log("[54XX OUT]", tick, channel, next, force ? 1 : 0);
    }
    return true;
  }

  recordTrace(type, fields = {}) {
    const entry = { tick: this.getMasterTick(), type, ...fields };
    this.traceLog.push(entry);
    if (this.traceLog.length > this.traceLimit)
      this.traceLog.splice(0, this.traceLog.length - this.traceLimit);
    return entry;
  }

  clearTrace() { this.traceLog.length = 0; }

  getTraceLog() { return this.traceLog.map(entry => ({ ...entry })); }

  dumpTrace() {
    return this.traceLog.map(entry =>
      entry.type === "cmd"
        ? `${entry.tick} CMD ${entry.value.toString(16).padStart(2, "0")}`
        : entry.type === "mcu"
          ? `${entry.tick} MCU pc=${entry.pc.toString(16).padStart(3, "0")} op=${entry.opcode.toString(16).padStart(2, "0")} A=${entry.A.toString(16)} X=${entry.X.toString(16)} Y=${entry.Y.toString(16)} st=${entry.st} zf=${entry.zf} cf=${entry.cf} pio=${entry.pio.toString(16)}`
          : `${entry.tick} OUT ch${entry.channel}=${entry.value.toString(16)}${entry.force ? " force" : ""}`
    ).join("\n");
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
      mcuCycleBudget: this.mcuCycleBudget,
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



export { Namco54XX };
