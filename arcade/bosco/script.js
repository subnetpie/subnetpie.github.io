import { Namco06XX } from "../../chips/Namco06XX.js";\nimport { MB88xx, MB8841, MB8842, MB8843, MB8844 } from "../../chips/MB88xx.js";\nimport { Namco51XX } from "../../chips/Namco51XX.js";\nimport { Namco52XX } from "../../chips/Namco52XX.js";\nimport { Namco54XX } from "../../chips/Namco54XX.js";
import { Z80 } from "../../cpu/z80.js";

function _defineProperty(obj, key, value) {if (key in obj) {Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true });} else {obj[key] = value;}return obj;}class EmulatorConfig {
  constructor() {
    this.display = {
      orientation: "landscape",
      width: 288,
      height: 224,
      scale: 1,
      pixelated: true };

    this.performance = {
      targetFPS: 60.606,
      cyclesPerFrame: 50688,
      interleaveQuantum: 64,
      enableFrameSkip: false };

    this.audio = {
      enabled: true,
      masterVolume: 0.5,
      bufferSize: 4096,
      sampleRate: 48000 };

    this.input = {
      touchDeadzone: 10,
      doubleTapTimeout: 300,
      preventScroll: true };

    this.debug = {
      showOverlay: false,
      logLevel: "info",
      showFPS: true,
      showCPUState: true };

    this.roms = {
      baseUrl: "https://subnetpie.github.io/arcade/bosco/",
      files: [
      {
        name: "bos5_1.3p",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "b1482ad1" },

      {
        name: "bos5_2.3m",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x1000,
        critical: true,
        crc32: "e0828ef8" },

      {
        name: "bos5_3.2m",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x2000,
        critical: true,
        crc32: "229edd51" },

      {
        name: "bos5_4.2l",
        size: 0x1000,
        target: "mainCpuRom",
        offset: 0x3000,
        critical: true,
        crc32: "928a39a0" },

      {
        name: "bos5_5.3f",
        size: 0x1000,
        target: "subCpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "84f7c1ea" },

      {
        name: "bos5_6.3j",
        size: 0x1000,
        target: "subCpuRom",
        offset: 0x1000,
        critical: true,
        crc32: "7fa34d5e" },

      {
        name: "bos1_7.2c",
        size: 0x1000,
        target: "sub2CpuRom",
        offset: 0x0000,
        critical: true,
        crc32: "d45a4911" },

      {
        name: "bos1_14.5d",
        size: 0x1000,
        target: "charRom",
        offset: 0x0000,
        critical: true,
        crc32: "a956d3c5" },

      {
        name: "bos1_13.5e",
        size: 0x1000,
        target: "spriteRom",
        offset: 0x0000,
        critical: true,
        crc32: "e869219c" },

      {
        name: "bos1-4.2r",
        size: 0x0100,
        target: "spriteShapeRom",
        offset: 0x0000,
        critical: true,
        crc32: "9b69b543" },

      {
        name: "bos1-6.6b",
        size: 0x0020,
        target: "proms",
        offset: 0x0000,
        critical: true,
        crc32: "d2b96fb0" },

      {
        name: "bos1-5.4m",
        size: 0x0100,
        target: "proms",
        offset: 0x0020,
        critical: true,
        crc32: "4e15d59c" },

      {
        name: "bos1-3.2d",
        size: 0x0020,
        target: "proms",
        offset: 0x0120,
        critical: true,
        crc32: "b88d5ba9" },

      {
        name: "bos1-7.7h",
        size: 0x0020,
        target: "proms",
        offset: 0x0140,
        critical: true,
        crc32: "87d61353" },

      {
        name: "bos1-1.1d",
        size: 0x0100,
        target: "soundProms",
        offset: 0x0000,
        soundPromRole: "waveform",
        critical: true,
        crc32: "de2316c6" },

      {
        name: "bos1-2.5c",
        size: 0x0100,
        target: "soundProms",
        offset: 0x0100,
        soundPromRole: "timing",
        emulationRequired: false,
        critical: false,
        crc32: "77245b66" },

      {
        name: "bos1_9.5n",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x0000,
        critical: true,
        crc32: "09acc978" },

      {
        name: "bos1_10.5m",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x1000,
        critical: true,
        crc32: "e571e959" },

      {
        name: "bos1_11.5k",
        size: 0x1000,
        target: "voiceRom",
        offset: 0x2000,
        critical: true,
        crc32: "17ac9511" },

      {
        name: "50xx.bin",
        size: 0x0800,
        target: "mcuRom50",
        offset: 0x0000,
        critical: true,
        crc32: "a0acbaf7" },

      {
        name: "51xx.bin",
        size: 0x0400,
        target: "mcuRom51",
        offset: 0x0000,
        critical: true,
        crc32: "c2f57ef8" },

      {
        name: "52xx.bin",
        size: 0x0400,
        target: "mcuRom52",
        offset: 0x0000,
        critical: true,
        crc32: "3257d11e" },

      {
        name: "54xx.bin",
        size: 0x0400,
        target: "mcuRom54",
        offset: 0x0000,
        critical: true,
        crc32: "ee7357e0" }] };



  }
  getCanvasSize() {
    return { width: this.display.width, height: this.display.height };
  }
  isPortrait() {
    return this.display.orientation === "portrait";
  }}

class BoscoDipSwitches {
  constructor() {
    this.settings = {
      difficulty: 0x03, // raw 2-bit hw code: 0x01=Easy 0x03=Medium 0x02=Hardest 0x00=Auto
      allowContinue: 1, // 0 = No, 1 = Yes   (bit 0x04, default Yes)
      demoSounds: 1, // 0 = Off, 1 = On   (bit 0x08, active-low: 0x08=Off)
      freeze: 0, // 0 = Off, 1 = On   (bit 0x10, active-low: 0x10=Off)
      cabinet: 0, // 0 = Upright, 1 = Cocktail (bit 0x80, 0x80=Upright)
      coinage: 0x07, // raw 3-bit hw code, default 0x07 = 1 Coin/1 Credit
      bonusFighter: 0x20, // raw 3-bit hw code (bits 0x38), meaning depends on `lives`
      lives: 3 // 1, 2, 3, or 5
    };
  }

  // DSWA
  getBankA() {
    const s = this.settings;
    let val = 0xff;
    val = val & ~0x03 | s.difficulty & 0x03;
    val = val & ~0x04 | (s.allowContinue ? 0x04 : 0x00);
    val = val & ~0x08 | (s.demoSounds ? 0x00 : 0x08); // active-low
    val = val & ~0x10 | (s.freeze ? 0x00 : 0x10); // active-low
    val = val & ~0x80 | (s.cabinet === 1 ? 0x00 : 0x80);
    return val & 0xff;
  }

  // DSWB
  getBankB() {var _livesMap$s$lives;
    const s = this.settings;
    let val = 0xff;
    val = val & ~0x07 | s.coinage & 0x07;
    val = val & ~0x38 | s.bonusFighter & 0x38;
    const livesMap = { 1: 0x00, 2: 0x40, 3: 0x80, 5: 0xc0 };
    val = val & ~0xc0 | ((_livesMap$s$lives = livesMap[s.lives]) !== null && _livesMap$s$lives !== void 0 ? _livesMap$s$lives : 0x80);
    return val & 0xff;
  }

  readHardware(offset) {
    offset &= 0x07;
    const bit0 = this.getBankB() >> offset & 1;
    const bit1 = this.getBankA() >> offset & 1;
    return bit0 | bit1 << 1;
  }

  getDifficultyText() {
    const map = { 0x00: "Auto", 0x01: "Easy", 0x03: "Medium", 0x02: "Hardest" };
    return map[this.settings.difficulty & 0x03];
  }

  getLivesText() {
    return this.settings.lives + " ships";
  }

  getCabinetText() {
    return this.settings.cabinet === 0 ? "Upright" : "Cocktail";
  }}

class InputManager {
  // keyboard pulse duration (coin/start/service)
  // touch pulse duration (longer: finger dwell/debounce)

  // Canonical hardware buttons, each optionally carrying lowercase aliases
  // used by virtual/analog controls (e.g. Touchpads). Keeping aliases here
  // means there is exactly one table to update when adding an input.














  constructor(config) {
    this.config = config;

    this.ports = {
      in0: 0xff,
      in1: 0xff };


    this.buttons = InputManager.BUTTONS;

    // Reverse lookup: lowercase alias -> uppercase button key. Built once
    // from BUTTONS so aliases can never drift out of sync with the
    // canonical table.
    this._aliasToButton = {};
    for (const [key, def] of Object.entries(this.buttons)) {
      if (def.alias) this._aliasToButton[def.alias] = key;
    }
    // Bosconian's real cabinet has no second action button. "bomb" is
    // accepted as a known-but-inert alias so virtual controls that offer
    // it don't spam console warnings; it resolves to null, and
    // pressButton(null)/releaseButton(null) are safe no-ops.
    this._aliasToButton.bomb = null;

    this.onStateChange = null;
    this._lastNotifiedIn0 = undefined;
    this._lastNotifiedIn1 = undefined;

    this.heldButtons = new Set();
    this.pulseTimers = new Map();

    this._keyboardBound = false;
    this._blurBound = false;

    // Bound handler references, populated by setupKeyboardControls() /
    // _setupButton(), needed so destroy() can actually remove them.
    this._onKeydown = null;
    this._onKeyup = null;
    this._onBlur = null;
    this._onVisibility = null;
    this._boundElements = new Map(); // element -> { press, release, contextmenu }
  }

  getState() {
    return {
      in0: this.ports.in0 & 0xff,
      in1: this.ports.in1 & 0xff };

  }

  setOnStateChange(fn, notifyImmediately = true) {
    this.onStateChange = typeof fn === "function" ? fn : null;

    if (this.onStateChange && notifyImmediately) {
      this._notifyStateChange(true);
    }
  }

  pressButton(button) {
    const b = this.buttons[button];
    if (!b) return false;

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
    this._lastNotifiedIn1 === state.in1)
    {
      return;
    }

    this._lastNotifiedIn0 = state.in0;
    this._lastNotifiedIn1 = state.in1;

    this.onStateChange(state);
  }

  /* ---------------- virtual/analog control bridge ---------------- */

  setInput(name, state) {
    const button = this._resolveAlias(name);
    if (button === undefined) return; // unmapped name, already warned
    if (state) {
      this.pressButton(button);
    } else {
      this.releaseButton(button);
    }
  }

  pulseInput(name, duration = InputManager.PULSE_MS) {
    const button = this._resolveAlias(name);
    if (button === undefined) return;
    this.pulseButton(button, duration);
  }

  _resolveAlias(name) {
    if (!(name in this._aliasToButton)) {
      console.warn(`[InputManager] Unknown touch input "${name}"`);
      return undefined;
    }
    return this._aliasToButton[name]; // may be null (known, intentionally inert)
  }

  /* ---------------- discrete on-screen buttons ---------------- */

  setupTouchControls(containerElement) {var _this$config, _this$config$input;
    const coin = document.getElementById("btnCoin");
    const start = document.getElementById("btnStart");

    if (!coin && !start) return false;

    if ((_this$config = this.config) !== null && _this$config !== void 0 && (_this$config$input = _this$config.input) !== null && _this$config$input !== void 0 && _this$config$input.preventScroll && containerElement) {
      containerElement.addEventListener(
      "touchmove",
      event => event.preventDefault(),
      { passive: false });

    }

    if (coin) this._setupButton(coin, "COIN1", true);
    if (start) this._setupButton(start, "START1", true);

    return true;
  }

  _setupButton(element, button, isPulse) {
    if (!element || element.dataset.inputBound === "true") return;

    element.dataset.inputBound = "true";
    element.style.touchAction = "none";

    const press = event => {
      event.preventDefault();
      event.stopPropagation();

      if (isPulse) {
        this.pulseButton(button, InputManager.TOUCH_PULSE_MS);
        this._visualFeedback(element, InputManager.TOUCH_PULSE_MS);
      } else {
        this.pressButton(button);
        this._visualFeedback(element);
      }

      if (event.pointerId != null) {var _element$setPointerCa;
        (_element$setPointerCa = element.setPointerCapture) === null || _element$setPointerCa === void 0 ? void 0 : _element$setPointerCa.call(element, event.pointerId);
      }
    };

    const release = event => {
      event.preventDefault();
      event.stopPropagation();

      if (!isPulse) {
        this.releaseButton(button);
      }

      this._clearVisualFeedback(element);
    };

    const contextmenu = event => event.preventDefault();

    element.addEventListener("pointerdown", press, { passive: false });
    element.addEventListener("pointerup", release, { passive: false });
    element.addEventListener("pointercancel", release, { passive: false });
    element.addEventListener("lostpointercapture", release, { passive: false });
    element.addEventListener("contextmenu", contextmenu);

    // Stashed so destroy() can remove exactly what was added.
    this._boundElements.set(element, { press, release, contextmenu });
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

  /* ---------------- keyboard ---------------- */



























  setupKeyboardControls() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;

    this._onKeydown = event => {
      const mapped = InputManager.KEY_MAP[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (mapped.pulse) {
        if (!event.repeat) this.pulseButton(mapped.button);
      } else {
        this.pressButton(mapped.button);
      }
    };

    this._onKeyup = event => {
      const mapped = InputManager.KEY_MAP[event.key.toLowerCase()];
      if (!mapped) return;

      event.preventDefault();

      if (!mapped.pulse) this.releaseButton(mapped.button);
    };

    document.addEventListener("keydown", this._onKeydown);
    document.addEventListener("keyup", this._onKeyup);

    if (!this._blurBound) {
      this._blurBound = true;
      this._onBlur = () => this.releaseAll();
      this._onVisibility = () => {
        if (document.hidden) this.releaseAll();
      };
      window.addEventListener("blur", this._onBlur);
      document.addEventListener("visibilitychange", this._onVisibility);
    }
  }

  /* ---------------- teardown ----------------
     Call this before discarding an InputManager instance (e.g. at the top
     of a CodePen re-run) to avoid stacking duplicate document/window
     listeners across reloads — the original class had no way to undo
     setupKeyboardControls()/setupTouchControls(), so every re-run left the
     previous instance's handlers permanently attached. */
  destroy() {
    this.releaseAll();

    if (this._onKeydown)
    document.removeEventListener("keydown", this._onKeydown);
    if (this._onKeyup) document.removeEventListener("keyup", this._onKeyup);
    if (this._onBlur) window.removeEventListener("blur", this._onBlur);
    if (this._onVisibility) {
      document.removeEventListener("visibilitychange", this._onVisibility);
    }

    for (const [element, handlers] of this._boundElements) {
      element.removeEventListener("pointerdown", handlers.press);
      element.removeEventListener("pointerup", handlers.release);
      element.removeEventListener("pointercancel", handlers.release);
      element.removeEventListener("lostpointercapture", handlers.release);
      element.removeEventListener("contextmenu", handlers.contextmenu);
      delete element.dataset.inputBound;
    }
    this._boundElements.clear();

    this._keyboardBound = false;
    this._blurBound = false;
    this._onKeydown = null;
    this._onKeyup = null;
    this._onBlur = null;
    this._onVisibility = null;
    this.onStateChange = null;
  }}_defineProperty(InputManager, "PULSE_MS", 100);_defineProperty(InputManager, "TOUCH_PULSE_MS", 250);_defineProperty(InputManager, "BUTTONS", Object.freeze({ UP: { port: "in0", mask: 0x01, pulse: false, alias: "up" }, RIGHT: { port: "in0", mask: 0x02, pulse: false, alias: "right" }, DOWN: { port: "in0", mask: 0x04, pulse: false, alias: "down" }, LEFT: { port: "in0", mask: 0x08, pulse: false, alias: "left" }, FIRE: { port: "in1", mask: 0x01, pulse: false, alias: "fire" }, START1: { port: "in1", mask: 0x04, pulse: true }, START2: { port: "in1", mask: 0x08, pulse: true }, COIN1: { port: "in1", mask: 0x10, pulse: true }, COIN2: { port: "in1", mask: 0x20, pulse: true }, SERVICE: { port: "in1", mask: 0x40, pulse: true } }));_defineProperty(InputManager, "KEY_MAP", Object.freeze({ arrowup: { button: "UP", pulse: false }, w: { button: "UP", pulse: false }, arrowleft: { button: "LEFT", pulse: false }, a: { button: "LEFT", pulse: false }, arrowright: { button: "RIGHT", pulse: false }, d: { button: "RIGHT", pulse: false }, arrowdown: { button: "DOWN", pulse: false }, s: { button: "DOWN", pulse: false }, " ": { button: "FIRE", pulse: false }, z: { button: "FIRE", pulse: false }, x: { button: "FIRE", pulse: false }, 5: { button: "COIN1", pulse: true }, 6: { button: "COIN2", pulse: true }, 1: { button: "START1", pulse: true }, 2: { button: "START2", pulse: true }, 9: { button: "SERVICE", pulse: true } }));

class Touchpads {


  constructor(inputs = {}, options = {}) {var _options$deadzone, _options$dpadRadius, _options$ringRadius, _this$canvas$getConte, _this$canvas, _this$canvas$width, _this$canvas2, _this$canvas$height, _this$canvas3;
    this.inputs = inputs;

    this.deadzone = (_options$deadzone = options.deadzone) !== null && _options$deadzone !== void 0 ? _options$deadzone : 20;
    this.dpadRadius = (_options$dpadRadius = options.dpadRadius) !== null && _options$dpadRadius !== void 0 ? _options$dpadRadius : 90;
    this.ringRadius = (_options$ringRadius = options.ringRadius) !== null && _options$ringRadius !== void 0 ? _options$ringRadius : 18;

    this.dpadTouchId = null;
    this.fireTouchId = null;

    this.dpadEl = document.getElementById("dpad-ring");
    this.fireEl = document.getElementById("btn-fire");
    this.canvas = document.getElementById("dpad-canvas");
    this.dpadCtx = (_this$canvas$getConte = (_this$canvas = this.canvas) === null || _this$canvas === void 0 ? void 0 : _this$canvas.getContext("2d")) !== null && _this$canvas$getConte !== void 0 ? _this$canvas$getConte : null;

    this.canvasW = (_this$canvas$width = (_this$canvas2 = this.canvas) === null || _this$canvas2 === void 0 ? void 0 : _this$canvas2.width) !== null && _this$canvas$width !== void 0 ? _this$canvas$width : 200;
    this.canvasH = (_this$canvas$height = (_this$canvas3 = this.canvas) === null || _this$canvas3 === void 0 ? void 0 : _this$canvas3.height) !== null && _this$canvas$height !== void 0 ? _this$canvas$height : 200;

    this._dpadActive = {
      up: false,
      down: false,
      left: false,
      right: false };


    this._bound = {
      dpadStart: event => this._dpadStart(event),
      dpadMove: event => this._dpadMove(event),
      dpadEnd: event => this._dpadEnd(event),
      fireStart: event => this._fireStart(event),
      fireEnd: event => this._fireEnd(event),
      preventContextMenu: event => event.preventDefault() };


    this.bindEvents();
  }

  bindEvents() {
    const opts = { passive: false };

    if (this.dpadEl) {
      this.dpadEl.style.touchAction = "none";
      this.dpadEl.addEventListener("touchstart", this._bound.dpadStart, opts);
      this.dpadEl.addEventListener("touchmove", this._bound.dpadMove, opts);
      this.dpadEl.addEventListener("touchend", this._bound.dpadEnd, opts);
      this.dpadEl.addEventListener("touchcancel", this._bound.dpadEnd, opts);
      this.dpadEl.addEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    if (this.fireEl) {
      this.fireEl.style.touchAction = "none";
      this.fireEl.addEventListener("touchstart", this._bound.fireStart, opts);
      this.fireEl.addEventListener("touchend", this._bound.fireEnd, opts);
      this.fireEl.addEventListener("touchcancel", this._bound.fireEnd, opts);
      this.fireEl.addEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }
  }

  destroy() {
    const opts = { passive: false };

    if (this.dpadEl) {
      this.dpadEl.removeEventListener(
      "touchstart",
      this._bound.dpadStart,
      opts);

      this.dpadEl.removeEventListener("touchmove", this._bound.dpadMove, opts);
      this.dpadEl.removeEventListener("touchend", this._bound.dpadEnd, opts);
      this.dpadEl.removeEventListener("touchcancel", this._bound.dpadEnd, opts);
      this.dpadEl.removeEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    if (this.fireEl) {
      this.fireEl.removeEventListener(
      "touchstart",
      this._bound.fireStart,
      opts);

      this.fireEl.removeEventListener("touchend", this._bound.fireEnd, opts);
      this.fireEl.removeEventListener("touchcancel", this._bound.fireEnd, opts);
      this.fireEl.removeEventListener(
      "contextmenu",
      this._bound.preventContextMenu);

    }

    this.releaseAll();
  }

  releaseAll() {var _this$fireEl;
    this.dpadTouchId = null;
    this.fireTouchId = null;
    this._setDirections({
      up: false,
      down: false,
      left: false,
      right: false });

    this.setInput("fire", false);
    (_this$fireEl = this.fireEl) === null || _this$fireEl === void 0 ? void 0 : _this$fireEl.classList.remove("pressed");
    this.clearCanvas();
  }

  _dpadStart(event) {
    event.preventDefault();

    if (this.dpadTouchId !== null) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    this.dpadTouchId = touch.identifier;
    this._updateDpad(touch);
  }

  _dpadMove(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.dpadTouchId) {
        this._updateDpad(touch);
        return;
      }
    }
  }

  _dpadEnd(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.dpadTouchId) {
        this.dpadTouchId = null;
        this._setDirections({
          up: false,
          down: false,
          left: false,
          right: false });

        this.clearCanvas();
        return;
      }
    }
  }

  _fireStart(event) {var _this$fireEl2;
    event.preventDefault();

    if (this.fireTouchId !== null) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    this.fireTouchId = touch.identifier;
    this.setInput("fire", true);
    (_this$fireEl2 = this.fireEl) === null || _this$fireEl2 === void 0 ? void 0 : _this$fireEl2.classList.add("pressed");
  }

  _fireEnd(event) {
    event.preventDefault();

    for (const touch of event.changedTouches) {
      if (touch.identifier === this.fireTouchId) {var _this$fireEl3;
        this.fireTouchId = null;
        this.setInput("fire", false);
        (_this$fireEl3 = this.fireEl) === null || _this$fireEl3 === void 0 ? void 0 : _this$fireEl3.classList.remove("pressed");
        return;
      }
    }
  }

  _updateDpad(touch) {
    if (!this.dpadEl) return;

    const rect = this.dpadEl.getBoundingClientRect();

    const dx = touch.clientX - (rect.left + rect.width / 2);
    const dy = touch.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);

    if (distance < this.deadzone) {
      this._setDirections({
        up: false,
        down: false,
        left: false,
        right: false });

      this.drawTouchRing(0, 0, distance);
      return;
    }

    /*
     * Eight equal 45-degree sectors, centered on each cardinal/diagonal:
     *
     *                 UP
     *           UL           UR
     *       LEFT                 RIGHT
     *           DL           DR
     *                DOWN
     *
     * A diagonal produces two simultaneously asserted hardware direction
     * bits, which is precisely how the cabinet's 8-way joystick behaves.
     */
    const angle = Math.atan2(dy, dx);
    const sector = Math.round(angle / (Math.PI / 4));
    const octant = sector + 8 & 7;

    const next = {
      up: false,
      down: false,
      left: false,
      right: false };


    switch (octant) {
      case 0: // right
        next.right = true;
        break;

      case 1: // down-right
        next.down = true;
        next.right = true;
        break;

      case 2: // down
        next.down = true;
        break;

      case 3: // down-left
        next.down = true;
        next.left = true;
        break;

      case 4: // left
        next.left = true;
        break;

      case 5: // up-left
        next.up = true;
        next.left = true;
        break;

      case 6: // up
        next.up = true;
        break;

      case 7: // up-right
        next.up = true;
        next.right = true;
        break;}


    this._setDirections(next);

    const visualLimit = Math.min(
    distance,
    Math.min(this.dpadRadius, Math.min(rect.width, rect.height) / 2));


    this.drawTouchRing(
    Math.cos(angle) * visualLimit,
    Math.sin(angle) * visualLimit,
    distance);

  }

  _setDirections(next) {
    for (const direction of Touchpads.DIRECTIONS) {
      const state = !!next[direction];

      if (this._dpadActive[direction] !== state) {
        this._dpadActive[direction] = state;
        this.setInput(direction, state);
      }
    }
  }

  setInput(name, state) {var _this$inputs$setInput, _this$inputs;
    (_this$inputs$setInput = (_this$inputs = this.inputs).setInput) === null || _this$inputs$setInput === void 0 ? void 0 : _this$inputs$setInput.call(_this$inputs, name, state);
  }

  clearCanvas() {
    if (!this.dpadCtx) return;
    this.dpadCtx.clearRect(0, 0, this.canvasW, this.canvasH);
  }

  drawTouchRing(tx, ty, distance) {
    if (!this.dpadCtx) return;

    const ctx = this.dpadCtx;
    const cx = this.canvasW / 2;
    const cy = this.canvasH / 2;

    const alpha =
    distance < this.deadzone ? 0.25 : Math.min(1, distance / this.dpadRadius);

    this.clearCanvas();

    ctx.beginPath();
    ctx.arc(cx + tx, cy + ty, this.ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200, 50, 200, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }}_defineProperty(Touchpads, "DIRECTIONS", Object.freeze(["up", "down", "left", "right"]));

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
  updateStatusBar(frameCount, cpuStates) {
    const statusBar = document.getElementById("statusBar");
    if (!statusBar) return;

    let html = `Frame: ${frameCount}`;

    if (this.config.debug.showCPUState && cpuStates) {
      html += ` | M:0x${cpuStates.mainPC} S:0x${cpuStates.subPC} A:0x${cpuStates.soundPC}`;
    }

    if (this.config.debug.showFPS) {
      html += ` | FPS: ${this.fpsCounter.fps}`;
    }
    statusBar.innerHTML = html;
  }
  getContext() {
    return this.ctx;
  }}


class BoscoTimingSequencer {


  // All three Z80 CPUs run at MASTER_CLOCK / 6.


  // Pixel clock is MASTER_CLOCK / 3.




















  constructor(machine) {
    this.machine = machine;

    this.now = 0;

    this.sequence = 0;
    this.events = [];
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;

    this.rasterTimersArmed = false;
    this.cpu3NmiTimerArmed = false;
    this.cpu3NmiGateOpen = true;
    this.cpuSlots = [
    {
      kind: "cpu",
      name: "main",
      local: 0,
      cpu: () => this.machine.mainCpu },

    {
      kind: "cpu",
      name: "sub",
      local: 0,
      cpu: () => this.machine.subCpu },

    {
      kind: "cpu",
      name: "sub2",
      local: 0,
      cpu: () => this.machine.sub2Cpu }];


    this.mcuSlots = [
    {
      kind: "mcu",
      name: "51xx",
      local: 0,
      device: () => this.machine.inputController },

    {
      kind: "mcu",
      name: "50xx-cpu-board",
      local: 0,
      device: () => {var _this$machine$cpuBoar;return (_this$machine$cpuBoar = this.machine.cpuBoard50xx) !== null && _this$machine$cpuBoar !== void 0 ? _this$machine$cpuBoar : this.machine.movementMcu1;} },

    {
      kind: "mcu",
      name: "50xx-video-board",
      local: 0,
      device: () => {var _this$machine$videoBo;return (_this$machine$videoBo = this.machine.videoBoard50xx) !== null && _this$machine$videoBo !== void 0 ? _this$machine$videoBo : this.machine.movementMcu2;} },

    {
      kind: "mcu",
      name: "52xx",
      local: 0,
      device: () => this.machine.voiceChip },

    {
      kind: "mcu",
      name: "54xx",
      local: 0,
      device: () => this.machine.namco54xx }];


  }
  get schedulerTick() {var _this$activeTick;
    return (_this$activeTick = this.activeTick) !== null && _this$activeTick !== void 0 ? _this$activeTick : this.now;
  }
  get eventCount() {
    return this.events.length - this.eventHead;
  }
  get nextDeadline() {
    this.discardCancelledHead();

    return this.eventHead < this.events.length ?
    this.events[this.eventHead].deadline :
    Infinity;
  }
  reset() {
    this.now = 0;

    this.sequence = 0;
    this.events.length = 0;
    this.eventHead = 0;

    this.activeTick = null;
    this.activeSlot = null;

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
      "Invalid timing-event deadline: " + String(deadline));

    }

    const event = {
      deadline: Math.max(this.schedulerTick, requestedDeadline),
      sequence: ++this.sequence,
      callback,
      owner,
      cancelled: false };


    let low = this.eventHead;
    let high = this.events.length;

    while (low < high) {
      const middle = low + high >> 1;
      const other = this.events[middle];

      const insertAfter =
      other.deadline < event.deadline ||
      other.deadline === event.deadline && other.sequence <= event.sequence;

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
      } };

  }
  synchronize(callback, owner = null) {
    return this.at(this.schedulerTick, callback, owner);
  }
  cancelOwner(owner) {
    for (let index = this.eventHead; index < this.events.length; index++) {
      if (this.events[index].owner === owner) {
        this.events[index].cancelled = true;
      }
    }
  }
  discardCancelledHead() {
    while (
    this.eventHead < this.events.length &&
    this.events[this.eventHead].cancelled)
    {
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
  ownerName(owner) {var _owner$constructor$na, _owner$constructor;
    if (owner == null) {
      return "anonymous";
    }

    if (typeof owner === "string") {
      return owner;
    }

    return (_owner$constructor$na = (_owner$constructor = owner.constructor) === null || _owner$constructor === void 0 ? void 0 : _owner$constructor.name) !== null && _owner$constructor$na !== void 0 ? _owner$constructor$na : String(owner);
  }
  dispatchCurrentTime() {
    let dispatched = 0;

    for (;;) {
      this.discardCancelledHead();

      if (this.eventHead >= this.events.length) {
        return;
      }

      const event = this.events[this.eventHead];

      if (event.deadline > this.now) {
        return;
      }

      this.eventHead++;

      if (event.cancelled) {
        continue;
      }

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
        message);


        error.cause = cause;
        throw error;
      }

      dispatched++;

      if (dispatched > this.constructor.MAX_EVENTS_AT_ONE_TICK) {
        throw new Error(
        "Timing event-loop overflow at tick " +
        this.now +
        " owner " +
        this.ownerName(event.owner));

      }
    }
  }
  cpuIsHeld(slot) {var _slot$cpu;
    const cpu = (_slot$cpu = slot.cpu) === null || _slot$cpu === void 0 ? void 0 : _slot$cpu.call(slot);

    if (!cpu || cpu.inReset) {
      return true;
    }

    if (typeof cpu.isReset === "function" && cpu.isReset()) {
      return true;
    }

    /*
     * Q3 holds sub and sound CPU reset.
     * Main CPU always remains eligible to run.
     */
    if (slot.name !== "main") {var _this$machine$cpuBoar2;
      return !!((_this$machine$cpuBoar2 =
      this.machine.cpuBoardResetAsserted) !== null && _this$machine$cpuBoar2 !== void 0 ? _this$machine$cpuBoar2 : this.machine.subsystemsReset);

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

    for (const slot of this.mcuSlots) {var _slot$device;
      const device = (_slot$device = slot.device) === null || _slot$device === void 0 ? void 0 : _slot$device.call(slot);

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

    const consider = slot => {
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
  syncNow() {
    let earliest = Infinity;

    for (const slot of this.liveCpuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    for (const slot of this.liveMcuSlots()) {
      earliest = Math.min(earliest, slot.local);
    }

    if (Number.isFinite(earliest)) {
      this.now = earliest;
    }
  }
  runOneCpuInstruction(slot, barrier) {var _slot$cpu2;
    const cpu = (_slot$cpu2 = slot.cpu) === null || _slot$cpu2 === void 0 ? void 0 : _slot$cpu2.call(slot);

    if (!cpu || this.cpuIsHeld(slot)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    this.activeTick = slot.local;
    this.activeSlot = slot;
    this.machine._activeCpuName = slot.name;

    try {var _cpu$step, _cpu$step2;
      const cycles = (_cpu$step = (_cpu$step2 = cpu.step) === null || _cpu$step2 === void 0 ? void 0 : _cpu$step2.call(cpu)) !== null && _cpu$step !== void 0 ? _cpu$step : 0;

      if (!Number.isFinite(cycles) || cycles < 0) {
        throw new Error(
        "Invalid Z80 cycle result for " + slot.name + ": " + String(cycles));

      }

      if (cycles === 0) {
        slot.local = Math.max(slot.local, barrier);
        return;
      }

      slot.local += cycles * this.constructor.Z80_TICKS;
    } finally {
      this.activeTick = null;
      this.activeSlot = null;
      this.machine._activeCpuName = null;
    }
  }
  deviceQuantumTicks(device, name) {var _device$constructor;
    const quantum =
    typeof device.nextMasterTickBoundary === "function" ?
    device.nextMasterTickBoundary() : (_device$constructor =
    device.constructor) === null || _device$constructor === void 0 ? void 0 : _device$constructor.MASTER_TICKS_PER_MCU_CYCLE;

    if (!Number.isFinite(quantum) || quantum <= 0) {
      throw new Error(
      "Timing device " +
      name +
      " must expose nextMasterTickBoundary() or " +
      "MASTER_TICKS_PER_MCU_CYCLE");

    }

    return Math.floor(quantum);
  }
  runOneMcuQuantum(slot, barrier) {var _slot$device2;
    const device = (_slot$device2 = slot.device) === null || _slot$device2 === void 0 ? void 0 : _slot$device2.call(slot);

    if (!device || this.deviceIsHeld(slot, device)) {
      slot.local = Math.max(slot.local, this.now);
      return;
    }

    if (typeof device.advanceMasterTicks !== "function") {
      throw new Error(
      "Timing device " +
      slot.name +
      " must implement advanceMasterTicks(deltaMasterTicks)");

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
        "Timing deadline moved backward: " + barrier + " < " + this.now);

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

      this.syncNow();
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
      "Cannot run scheduler backward: " + target + " < " + this.now);

    }

    this.advanceTo(target);
  }
  frameOrigin() {
    return (
      Math.floor(this.now / this.constructor.FRAME_TICKS) *
      this.constructor.FRAME_TICKS);

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
    () => {var _this$machine$onVblan, _this$machine;
      (_this$machine$onVblan = (_this$machine = this.machine).onVblankFalling) === null || _this$machine$onVblan === void 0 ? void 0 : _this$machine$onVblan.call(_this$machine);

      this.scheduleVblankFalling(deadline + this.constructor.FRAME_TICKS);
    },
    "vblank-falling");

  }
  scheduleVblankRising(deadline) {
    this.at(
    deadline,
    () => {var _this$machine$onVblan2, _this$machine2;
      (_this$machine$onVblan2 = (_this$machine2 = this.machine).onVblankRising) === null || _this$machine$onVblan2 === void 0 ? void 0 : _this$machine$onVblan2.call(_this$machine2);

      this.scheduleVblankRising(deadline + this.constructor.FRAME_TICKS);
    },
    "vblank-rising");

  }
  setCpu3NmiGateFromQ2(q2State) {
    this.cpu3NmiGateOpen = !Boolean(q2State);

    return this.cpu3NmiGateOpen;
  }
  latchCpu3NmiFromTimer() {var _machine$cpuBoardRese, _soundCpu$isReset, _machine$soundNmiCoun;
    const machine = this.machine;
    const soundCpu = machine.sub2Cpu;

    const cpuBoardResetAsserted = !!((_machine$cpuBoardRese =
    machine.cpuBoardResetAsserted) !== null && _machine$cpuBoardRese !== void 0 ? _machine$cpuBoardRese : machine.subsystemsReset);


    const soundCpuReset = !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.inReset || soundCpu !== null && soundCpu !== void 0 && (_soundCpu$isReset = soundCpu.isReset) !== null && _soundCpu$isReset !== void 0 && _soundCpu$isReset.call(soundCpu));

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
    machine.soundNmiCount = ((_machine$soundNmiCoun = machine.soundNmiCount) !== null && _machine$soundNmiCoun !== void 0 ? _machine$soundNmiCoun : 0) + 1;

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
    "cpu3-nmi-timer");

  }
  runFrame() {
    this.armRasterTimers();
    this.armCpu3NmiTimer();

    const frameEnd = this.frameOrigin() + this.constructor.FRAME_TICKS;

    this.runUntil(Math.max(frameEnd, this.now + 1));
  }}_defineProperty(BoscoTimingSequencer, "MASTER_CLOCK", 18432000);_defineProperty(BoscoTimingSequencer, "Z80_TICKS", 6);_defineProperty(BoscoTimingSequencer, "PIXEL_TICKS", 3);_defineProperty(BoscoTimingSequencer, "HTOTAL", 384);_defineProperty(BoscoTimingSequencer, "VTOTAL", 264);_defineProperty(BoscoTimingSequencer, "VISIBLE_Y_START", 16);_defineProperty(BoscoTimingSequencer, "VISIBLE_Y_END_EXCLUSIVE", 240);_defineProperty(BoscoTimingSequencer, "VBLANK_START", 240);_defineProperty(BoscoTimingSequencer, "VBLANK_END", 16);_defineProperty(BoscoTimingSequencer, "SCANLINE_TICKS", BoscoTimingSequencer.HTOTAL * BoscoTimingSequencer.PIXEL_TICKS);_defineProperty(BoscoTimingSequencer, "FRAME_TICKS", BoscoTimingSequencer.SCANLINE_TICKS * BoscoTimingSequencer.VTOTAL);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_INITIAL_SCANLINE", 64);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_SCANLINE_STEP", 128);_defineProperty(BoscoTimingSequencer, "CPU3_NMI_WRAP", 272);_defineProperty(BoscoTimingSequencer, "MAX_EVENTS_AT_ONE_TICK", 100000);

class Namco05XX {







  /*
   * MAME starfield speed timing.
   *
   * The 05XX does not scroll stars by adding a pixel-coordinate offset.
   * Motion comes from advancing the LFSR a different number of times
   * during horizontal blanking before/after visible pixels.
   */
























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


  constructor(opts = {}) {var _opts$offsetX, _opts$offsetY, _opts$limitX, _opts$scrollXIndex, _opts$scrollYIndex, _opts$sf, _opts$sf2;
    /*
     * The physical 05XX produces a 256-pixel star window. Bosconian's
     * visible landscape presentation places that in a 288-pixel-wide area.
     */
    this.offsetX = (_opts$offsetX = opts.offsetX) !== null && _opts$offsetX !== void 0 ? _opts$offsetX : 0;
    this.offsetY = (_opts$offsetY = opts.offsetY) !== null && _opts$offsetY !== void 0 ? _opts$offsetY : 0;
    this.limitX = (_opts$limitX = opts.limitX) !== null && _opts$limitX !== void 0 ? _opts$limitX : Namco05XX.STARFIELD_PIXEL_WIDTH;

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

    this.scrollXIndex = (_opts$scrollXIndex = opts.scrollXIndex) !== null && _opts$scrollXIndex !== void 0 ? _opts$scrollXIndex : 7;
    this.scrollYIndex = (_opts$scrollYIndex = opts.scrollYIndex) !== null && _opts$scrollYIndex !== void 0 ? _opts$scrollYIndex : 0;

    this.sf0 = (_opts$sf = opts.sf0) !== null && _opts$sf !== void 0 ? _opts$sf : 0;
    this.sf1 = (_opts$sf2 = opts.sf1) !== null && _opts$sf2 !== void 0 ? _opts$sf2 : 0;

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
      const g = Namco05XX.STAR_G[color >>> 2 & 0x03];
      const b = Namco05XX.STAR_B[color >>> 4 & 0x03];

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

    switch (this.sf1 << 1 | this.sf0) {
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
        break;}

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
    Math.min(Namco05XX.STARFIELD_PIXEL_WIDTH, limX | 0));

  }

  static getNextLfsrState(lfsr) {
    const bit = (lfsr >> 0 ^ lfsr >> 3 ^ lfsr >> 5 ^ lfsr >> 10) & 0x01;

    return (lfsr >> 1 | bit << 15) & 0xffff;
  }

  static isHit(lfsr) {
    return (lfsr & Namco05XX.LFSR_HIT_MASK) === Namco05XX.LFSR_HIT_VALUE;
  }

  static getStarSet(lfsr) {
    return (lfsr >> 10 & 0x01) << 1 | lfsr >> 8 & 0x01;
  }

  static decodeColor6(lfsr) {
    let color = lfsr >> 5 & 0x07;
    color |= lfsr << 3 & 0x18;
    color |= lfsr << 2 & 0x20;

    return ~color & 0x3f;
  }

  static color6ToRgb(color6) {
    const color = color6 & 0x3f;

    return {
      r: Namco05XX.STAR_R[color & 0x03],
      g: Namco05XX.STAR_G[color >>> 2 & 0x03],
      b: Namco05XX.STAR_B[color >>> 4 & 0x03] };

  }

  render(ctx, opts = {}) {var _opts$flip, _opts$pixelSize, _opts$width, _opts$height, _opts$clipX, _opts$clipY, _opts$clipX2, _opts$clipY2;
    if (!this.enabled) {
      return;
    }

    const flip = (_opts$flip = opts.flip) !== null && _opts$flip !== void 0 ? _opts$flip : this.flip;
    const pixelSize = Math.max(1, (_opts$pixelSize = opts.pixelSize) !== null && _opts$pixelSize !== void 0 ? _opts$pixelSize : 1);

    const width = (_opts$width = opts.width) !== null && _opts$width !== void 0 ? _opts$width : 288;
    const height = (_opts$height = opts.height) !== null && _opts$height !== void 0 ? _opts$height : Namco05XX.VISIBLE_LINES;

    const clipX0 = (_opts$clipX = opts.clipX0) !== null && _opts$clipX !== void 0 ? _opts$clipX : 0;
    const clipY0 = (_opts$clipY = opts.clipY0) !== null && _opts$clipY !== void 0 ? _opts$clipY : 0;
    const clipX1 = (_opts$clipX2 = opts.clipX1) !== null && _opts$clipX2 !== void 0 ? _opts$clipX2 : width;
    const clipY1 = (_opts$clipY2 = opts.clipY1) !== null && _opts$clipY2 !== void 0 ? _opts$clipY2 : height;

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
          sourceX < visibleWindowEnd && (
          starSet === this.setA || starSet === this.setB))
          {
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
            drawY < clipY1)
            {
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
  }}_defineProperty(Namco05XX, "VISIBLE_LINES", 224);_defineProperty(Namco05XX, "STARFIELD_PIXEL_WIDTH", 256);_defineProperty(Namco05XX, "LFSR_HIT_MASK", 0xfa14);_defineProperty(Namco05XX, "LFSR_HIT_VALUE", 0x7800);_defineProperty(Namco05XX, "LFSR_SEED", 0x7fff);_defineProperty(Namco05XX, "SPEED_X_CYCLE_COUNT_OFFSET", [0, 1, 2, 3, -4, -3, -2, -1]);_defineProperty(Namco05XX, "PRE_VIS_CYCLE_COUNT_VALUES", [22 * 256, 23 * 256, 22 * 256, 23 * 256, 19 * 256, 20 * 256, 20 * 256, 22 * 256]);_defineProperty(Namco05XX, "POST_VIS_CYCLE_COUNT_VALUES", [10 * 256, 10 * 256, 12 * 256, 12 * 256, 9 * 256, 9 * 256, 10 * 256, 9 * 256]);_defineProperty(Namco05XX, "STAR_R", new Uint8Array([0, 71, 151, 222]));_defineProperty(Namco05XX, "STAR_G", new Uint8Array([0, 71, 151, 222]));_defineProperty(Namco05XX, "STAR_B", new Uint8Array([0, 81, 174, 255]));_defineProperty(Namco05XX, "STAR_CSS", Namco05XX.buildStarCssPalette());

class Namco50XX {
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

class voice52xxDac {












  constructor() {
    this.audioCtx = null;

    this.source = null;
    this.highPass = null;
    this.lowPass = null;
    this.gainNode = null;

    this.lastNibble = 0x08;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  attach(audioCtx, destination) {
    if (this.audioCtx === audioCtx && this.source) {
      return;
    }

    this.detach();

    this.audioCtx = audioCtx;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    this.source = audioCtx.createConstantSource();
    this.source.offset.setValueAtTime(
    this.nibbleToDacLevel(this.lastNibble),
    audioCtx.currentTime);


    this.highPass = audioCtx.createBiquadFilter();
    this.highPass.type = "highpass";
    this.highPass.frequency.setValueAtTime(80, audioCtx.currentTime);
    this.highPass.Q.setValueAtTime(0.3, audioCtx.currentTime);

    this.lowPass = audioCtx.createBiquadFilter();
    this.lowPass.type = "lowpass";
    this.lowPass.frequency.setValueAtTime(2400, audioCtx.currentTime);
    this.lowPass.Q.setValueAtTime(0.9, audioCtx.currentTime);

    this.gainNode = audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);

    this.source.connect(this.highPass);
    this.highPass.connect(this.lowPass);
    this.lowPass.connect(this.gainNode);
    this.gainNode.connect(destination);

    this.source.start();
  }

  nibbleToDacLevel(nibble) {
    const value = nibble & 0x0f;
    const weights = voice52xxDac.BIT_WEIGHTS;

    let output = 0;

    if (value & 0x01) {
      output += weights[0];
    }

    if (value & 0x02) {
      output += weights[1];
    }

    if (value & 0x04) {
      output += weights[2];
    }

    if (value & 0x08) {
      output += weights[3];
    }

    return output;
  }

  mapMasterTickToAudioTime(masterTick) {
    const ctx = this.audioCtx;

    if (!ctx) {
      return null;
    }

    const now = ctx.currentTime;
    const minimumTime = now + voice52xxDac.AUDIO_LEAD_SECONDS;

    if (!Number.isFinite(masterTick)) {
      return Math.max(minimumTime, this.lastScheduledAudioTime);
    }

    if (this.masterTickBase == null) {
      this.masterTickBase = masterTick;
      this.audioTimeBase = minimumTime;
      this.lastScheduledAudioTime = minimumTime;

      return minimumTime;
    }

    let audioTime =
    this.audioTimeBase +
    (masterTick - this.masterTickBase) / voice52xxDac.MASTER_CLOCK;

    if (audioTime < minimumTime) {
      this.masterTickBase = masterTick;
      this.audioTimeBase = minimumTime;
      audioTime = minimumTime;
    }

    if (audioTime < this.lastScheduledAudioTime) {
      audioTime = this.lastScheduledAudioTime;
    }

    this.lastScheduledAudioTime = audioTime;

    return audioTime;
  }

  pushNibble(nibble, masterTick = null) {
    const value = nibble & 0x0f;

    this.lastNibble = value;

    if (!this.source || !this.audioCtx) {
      return;
    }

    const audioTime = this.mapMasterTickToAudioTime(masterTick);

    if (audioTime == null) {
      return;
    }

    this.source.offset.setValueAtTime(this.nibbleToDacLevel(value), audioTime);
  }

  reset() {
    this.lastNibble = 0x08;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    if (!this.source || !this.audioCtx) {
      return;
    }

    const now = this.audioCtx.currentTime;

    this.source.offset.cancelScheduledValues(now);

    this.source.offset.setValueAtTime(
    this.nibbleToDacLevel(this.lastNibble),
    now);

  }

  detach() {var _this$source2, _this$highPass, _this$lowPass, _this$gainNode;
    try {var _this$source;
      (_this$source = this.source) === null || _this$source === void 0 ? void 0 : _this$source.stop();
    } catch (_) {}

    (_this$source2 = this.source) === null || _this$source2 === void 0 ? void 0 : _this$source2.disconnect();
    (_this$highPass = this.highPass) === null || _this$highPass === void 0 ? void 0 : _this$highPass.disconnect();
    (_this$lowPass = this.lowPass) === null || _this$lowPass === void 0 ? void 0 : _this$lowPass.disconnect();
    (_this$gainNode = this.gainNode) === null || _this$gainNode === void 0 ? void 0 : _this$gainNode.disconnect();

    this.source = null;
    this.highPass = null;
    this.lowPass = null;
    this.gainNode = null;
    this.audioCtx = null;

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }}_defineProperty(voice52xxDac, "MASTER_CLOCK", 18432000);_defineProperty(voice52xxDac, "AUDIO_LEAD_SECONDS", 0.04);_defineProperty(voice52xxDac, "BIT_WEIGHTS", (() => {const conductance = [1 / 100000, 1 / 47000, 1 / 22000, 1 / 10000];const total = conductance[0] + conductance[1] + conductance[2] + conductance[3];return conductance.map(value => value / total);})());

class Namco54xxDac {



  constructor() {
    this.audioCtx = null;
    this.destination = null;

    this.source = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.highPass = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.lowPass = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);
    this.channelGain = new Array(Namco54xxDac.CHANNEL_COUNT).fill(null);

    this.mixer = null;
    this.outputGain = null;

    this.channelData = new Uint8Array(Namco54xxDac.CHANNEL_COUNT);

    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  attach(audioCtx, destination) {
    if (this.audioCtx === audioCtx && this.mixer) {
      return;
    }

    this.detach();

    this.audioCtx = audioCtx;
    this.destination = destination;
    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;

    const now = audioCtx.currentTime;

    this.mixer = audioCtx.createGain();
    this.mixer.gain.setValueAtTime(1, now);

    this.outputGain = audioCtx.createGain();
    this.outputGain.gain.setValueAtTime(0.16, now);

    this.mixer.connect(this.outputGain);
    this.outputGain.connect(destination);

    const config = [
    {
      channel: 2,
      highPass: 1500,
      lowPass: 750,
      gain: 1.0 },

    {
      channel: 1,
      highPass: 320,
      lowPass: 110,
      gain: 0.82 },

    {
      channel: 0,
      highPass: 1050,
      lowPass: 725,
      gain: 0.52 }];



    for (let path = 0; path < config.length; path++) {
      const spec = config[path];
      const channel = spec.channel;

      const source = audioCtx.createConstantSource();

      const highPass = audioCtx.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.setValueAtTime(spec.highPass, now);
      highPass.Q.setValueAtTime(0.707, now);

      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.setValueAtTime(spec.lowPass, now);
      lowPass.Q.setValueAtTime(0.707, now);

      const channelGain = audioCtx.createGain();
      channelGain.gain.setValueAtTime(spec.gain, now);

      source.offset.setValueAtTime(
      this.nibbleToVoltage(this.channelData[channel]),
      now);


      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(channelGain);
      channelGain.connect(this.mixer);

      source.start(now);

      this.source[channel] = source;
      this.highPass[channel] = highPass;
      this.lowPass[channel] = lowPass;
      this.channelGain[channel] = channelGain;
    }
  }

  detach() {var _this$mixer, _this$outputGain;
    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {var _this$source$channel2, _this$highPass$channe, _this$lowPass$channel, _this$channelGain$cha;
      try {var _this$source$channel;
        (_this$source$channel = this.source[channel]) === null || _this$source$channel === void 0 ? void 0 : _this$source$channel.stop();
      } catch (_) {}

      (_this$source$channel2 = this.source[channel]) === null || _this$source$channel2 === void 0 ? void 0 : _this$source$channel2.disconnect();
      (_this$highPass$channe = this.highPass[channel]) === null || _this$highPass$channe === void 0 ? void 0 : _this$highPass$channe.disconnect();
      (_this$lowPass$channel = this.lowPass[channel]) === null || _this$lowPass$channel === void 0 ? void 0 : _this$lowPass$channel.disconnect();
      (_this$channelGain$cha = this.channelGain[channel]) === null || _this$channelGain$cha === void 0 ? void 0 : _this$channelGain$cha.disconnect();

      this.source[channel] = null;
      this.highPass[channel] = null;
      this.lowPass[channel] = null;
      this.channelGain[channel] = null;
    }

    (_this$mixer = this.mixer) === null || _this$mixer === void 0 ? void 0 : _this$mixer.disconnect();
    (_this$outputGain = this.outputGain) === null || _this$outputGain === void 0 ? void 0 : _this$outputGain.disconnect();

    this.mixer = null;
    this.outputGain = null;
    this.audioCtx = null;
    this.destination = null;
    this.masterTickBase = null;
    this.audioTimeBase = 0;
    this.lastScheduledAudioTime = 0;
  }

  reset() {var _this$audioCtx$curren, _this$audioCtx;
    this.channelData.fill(0);

    const now = (_this$audioCtx$curren = (_this$audioCtx = this.audioCtx) === null || _this$audioCtx === void 0 ? void 0 : _this$audioCtx.currentTime) !== null && _this$audioCtx$curren !== void 0 ? _this$audioCtx$curren : 0;

    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {var _this$source$channel3, _this$source$channel4;
      (_this$source$channel3 = this.source[channel]) === null || _this$source$channel3 === void 0 ? void 0 : _this$source$channel3.offset.cancelScheduledValues(now);
      (_this$source$channel4 = this.source[channel]) === null || _this$source$channel4 === void 0 ? void 0 : _this$source$channel4.offset.setValueAtTime(this.nibbleToVoltage(0), now);
    }
  }

  nibbleToVoltage(nibble) {
    const value = nibble & 0x0f;

    const r0 = 47000;
    const r1 = 22000;
    const r2 = 10000;
    const r3 = 4700;

    const g0 = 1 / r0;
    const g1 = 1 / r1;
    const g2 = 1 / r2;
    const g3 = 1 / r3;

    const totalConductance = g0 + g1 + g2 + g3;

    let enabledConductance = 0;

    if (value & 0x01) enabledConductance += g0;
    if (value & 0x02) enabledConductance += g1;
    if (value & 0x04) enabledConductance += g2;
    if (value & 0x08) enabledConductance += g3;

    return 4 * enabledConductance / totalConductance - 2;
  }

  masterTickToAudioTime(masterTick) {
    const ctx = this.audioCtx;

    if (!ctx) {
      return 0;
    }

    const tick = Math.max(0, Math.floor(Number(masterTick) || 0));

    if (this.masterTickBase === null) {
      this.masterTickBase = tick;
      this.audioTimeBase = ctx.currentTime + 0.015;
      this.lastScheduledAudioTime = this.audioTimeBase;
      return this.audioTimeBase;
    }

    const target =
    this.audioTimeBase +
    (tick - this.masterTickBase) / Namco54xxDac.MASTER_CLOCK;

    const minimum = ctx.currentTime + 0.001;
    const scheduled = Math.max(
    minimum,
    Math.min(target, this.lastScheduledAudioTime + 0.05));


    this.lastScheduledAudioTime = scheduled;

    return scheduled;
  }

  writeChannel(channel, value, masterTick = 0, force = false) {
    const index = channel | 0;

    if (index < 0 || index >= Namco54xxDac.CHANNEL_COUNT) {
      return false;
    }

    const next = value & 0x0f;

    if (!force && this.channelData[index] === next) {
      return false;
    }

    this.channelData[index] = next;

    const source = this.source[index];
    const ctx = this.audioCtx;

    if (!source || !ctx) {
      return true;
    }

    const when = this.masterTickToAudioTime(masterTick);
    const voltage = this.nibbleToVoltage(next);

    source.offset.cancelScheduledValues(when);
    source.offset.setValueAtTime(voltage, when);

    return true;
  }

  synchronizeState(masterTick = 0) {
    for (let channel = 0; channel < Namco54xxDac.CHANNEL_COUNT; channel++) {
      this.writeChannel(channel, this.channelData[channel], masterTick, true);
    }
  }

  getTraceState() {var _this$audioCtx$state, _this$audioCtx2;
    return {
      attached: !!this.mixer,
      contextState: (_this$audioCtx$state = (_this$audioCtx2 = this.audioCtx) === null || _this$audioCtx2 === void 0 ? void 0 : _this$audioCtx2.state) !== null && _this$audioCtx$state !== void 0 ? _this$audioCtx$state : null,
      channel0: this.channelData[0] & 0x0f,
      channel1: this.channelData[1] & 0x0f,
      channel2: this.channelData[2] & 0x0f,
      masterTickBase: this.masterTickBase,
      audioTimeBase: this.audioTimeBase,
      lastScheduledAudioTime: this.lastScheduledAudioTime };

  }}_defineProperty(Namco54xxDac, "MASTER_CLOCK", 18432000);_defineProperty(Namco54xxDac, "CHANNEL_COUNT", 3);

class NamcoWSG {













































  constructor(config) {var _config$audio;
    this.config = config;
    this.prom = new Uint8Array(256);
    this.regs = new Uint8Array(32);
    this.channels = [
    { freq: 0, wave: 0, vol: 0 },
    { freq: 0, wave: 0, vol: 0 },
    { freq: 0, wave: 0, vol: 0 }];

    this.audioCtx = null;
    this.gainNode = null;
    this.wsgNode = null;
    this.port = null;
    this.state = "idle";
    this.enabled = (config === null || config === void 0 ? void 0 : (_config$audio = config.audio) === null || _config$audio === void 0 ? void 0 : _config$audio.enabled) !== false;
    this.onAudioReady = null;
    this.gestureEvents = null;
    this.onGesture = null;
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

  reset() {var _this$port, _this$port2;
    this.regs.fill(0);
    for (const channel of this.channels) {
      channel.freq = 0;
      channel.wave = 0;
      channel.vol = 0;
    }
    (_this$port = this.port) === null || _this$port === void 0 ? void 0 : _this$port.postMessage({ type: "reset" });
    this.decodeAndSend();
    (_this$port2 = this.port) === null || _this$port2 === void 0 ? void 0 : _this$port2.postMessage({ type: "enabled", v: this.enabled });
  }

  initAudio() {
    if (this.onGesture) return;
    this.gestureEvents = ["touchend", "pointerup", "mousedown", "keydown"];
    this.onGesture = event => {
      if (event.isTrusted) this.unlockFromGesture();
    };
    for (const event of this.gestureEvents) {
      window.addEventListener(event, this.onGesture, {
        capture: true,
        passive: true });

    }
  }

  async setEnabled(enabled) {var _this$port3;
    this.enabled = !!enabled;
    if (this.state === "idle") await this.createAudioGraph();
    if (this.state === "ready") await this.resumeIfNeeded();
    (_this$port3 = this.port) === null || _this$port3 === void 0 ? void 0 : _this$port3.postMessage({ type: "enabled", v: this.enabled });
  }

  async unlockFromGesture() {
    if (this.state === "idle") await this.createAudioGraph();
    if (this.state === "ready") await this.resumeIfNeeded();
  }

  async resumeIfNeeded() {
    if (!this.audioCtx || this.audioCtx.state === "running") return;
    try {
      await this.audioCtx.resume();
    } catch (_) {}
  }

  async createAudioGraph() {
    if (this.state !== "idle") return;
    this.state = "pending";
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.state = "idle";
      return;
    }
    try {var _this$config$audio$ma, _this$config2, _this$config2$audio, _this$onAudioReady;
      this.audioCtx = new AudioContextClass();
      await this.resumeIfNeeded();
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime((_this$config$audio$ma = (_this$config2 =
      this.config) === null || _this$config2 === void 0 ? void 0 : (_this$config2$audio = _this$config2.audio) === null || _this$config2$audio === void 0 ? void 0 : _this$config2$audio.masterVolume) !== null && _this$config$audio$ma !== void 0 ? _this$config$audio$ma : 0.5,
      this.audioCtx.currentTime);

      this.gainNode.connect(this.audioCtx.destination);
      const url = URL.createObjectURL(
      new Blob([NamcoWSG.WORKLET_SOURCE], { type: "application/javascript" }));

      try {
        await this.audioCtx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.wsgNode = new AudioWorkletNode(this.audioCtx, "namco-wsg", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          waveData: Array.from(this.prom, value => value & 15) } });


      this.wsgNode.connect(this.gainNode);
      this.port = this.wsgNode.port;
      this.state = "ready";
      this.decodeAndSend();
      this.port.postMessage({ type: "enabled", v: this.enabled });
      (_this$onAudioReady = this.onAudioReady) === null || _this$onAudioReady === void 0 ? void 0 : _this$onAudioReady.call(this, this.audioCtx, this.gainNode);
    } catch (error) {
      console.warn("[WSG] Audio init failed", error);
      this.teardownAudioGraph();
    }
  }

  teardownAudioGraph() {var _this$wsgNode, _this$gainNode2, _this$audioCtx3, _this$audioCtx3$close, _this$audioCtx3$close2, _this$audioCtx3$close3;
    (_this$wsgNode = this.wsgNode) === null || _this$wsgNode === void 0 ? void 0 : _this$wsgNode.disconnect();
    (_this$gainNode2 = this.gainNode) === null || _this$gainNode2 === void 0 ? void 0 : _this$gainNode2.disconnect();
    (_this$audioCtx3 = this.audioCtx) === null || _this$audioCtx3 === void 0 ? void 0 : (_this$audioCtx3$close = _this$audioCtx3.close) === null || _this$audioCtx3$close === void 0 ? void 0 : (_this$audioCtx3$close2 = (_this$audioCtx3$close3 = _this$audioCtx3$close.call(_this$audioCtx3)).catch) === null || _this$audioCtx3$close2 === void 0 ? void 0 : _this$audioCtx3$close2.call(_this$audioCtx3$close3, () => {});
    this.audioCtx = null;
    this.gainNode = null;
    this.wsgNode = null;
    this.port = null;
    this.state = "idle";
  }

  decodeAndSend() {var _this$port4;
    const r = this.regs;
    this.channels[0].freq =
    r[0x10] |
    r[0x11] << 4 |
    r[0x12] << 8 |
    r[0x13] << 12 |
    r[0x14] << 16;
    this.channels[0].wave = r[0x05] & 7;
    this.channels[0].vol = r[0x15] & 15;
    this.channels[1].freq =
    r[0x16] << 4 | r[0x17] << 8 | r[0x18] << 12 | r[0x19] << 16;
    this.channels[1].wave = r[0x0a] & 7;
    this.channels[1].vol = r[0x1a] & 15;
    this.channels[2].freq =
    r[0x1b] << 4 | r[0x1c] << 8 | r[0x1d] << 12 | r[0x1e] << 16;
    this.channels[2].wave = r[0x0f] & 7;
    this.channels[2].vol = r[0x1f] & 15;
    (_this$port4 = this.port) === null || _this$port4 === void 0 ? void 0 : _this$port4.postMessage({ type: "voices", v: this.channels });
  }}_defineProperty(NamcoWSG, "WORKLET_SOURCE", `
class NamcoWSGProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions: { waveData } }) {
    super();
    this.wave = new Uint8Array(waveData);
    this.accum = new Float64Array(3);
    this.voices = [
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 },
      { freq: 0, wave: 0, vol: 0 }
    ];
    this.enabled = true;
    this.step = 192000 / sampleRate;
    this.port.onmessage = ({ data }) => {
      if (data.type === "voices") this.voices = data.v;
      if (data.type === "enabled") this.enabled = !!data.v;
      if (data.type === "reset") this.accum.fill(0);
    };
  }
  process(inputs, outputs) {
    void inputs;
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.enabled) {
      out.fill(0);
      return true;
    }
    for (let i = 0; i < out.length; i++) {
      let mix = 0;
      for (let voiceIndex = 0; voiceIndex < 3; voiceIndex++) {
        const voice = this.voices[voiceIndex];
        if (!voice.freq || !voice.vol) continue;
        const position = ((this.accum[voiceIndex] | 0) >>> 16) & 31;
        const sample = (this.wave[((voice.wave & 7) << 5) + position] & 15) - 8;
        mix += sample * (voice.vol & 15);
        this.accum[voiceIndex] = (this.accum[voiceIndex] + voice.freq * this.step) % 0x200000;
      }
      out[i] = mix / 384;
    }
    return true;
  }
}
registerProcessor("namco-wsg", NamcoWSGProcessor);
`);class NamcoLS259Latch {constructor(name = "ls259") {this.name = name;this.state = 0x00;this.callbacks = new Array(8).fill(null);}setCallback(bit, fn) {this.callbacks[bit & 0x07] = fn;return this;}getBit(bit) {return this.state >>> (bit & 0x07) & 0x01;}write(addr, data) {var _window$JSBosco;const address = addr & 0xffff;const bit = address & 0x07;const next = data & 0x01;const trace = false;const e = (_window$JSBosco = window.JSBosco) === null || _window$JSBosco === void 0 ? void 0 : _window$JSBosco.emulator;if (trace) {var _e$timing$schedulerTi, _e$timing, _e$_activeCpuName, _this$getBit, _this$getBit2;console.log("[CPU BOARD LS259 WRITE]", { tick: (_e$timing$schedulerTi = e === null || e === void 0 ? void 0 : (_e$timing = e.timing) === null || _e$timing === void 0 ? void 0 : _e$timing.schedulerTick) !== null && _e$timing$schedulerTi !== void 0 ? _e$timing$schedulerTi : null, cpu: (_e$_activeCpuName = e === null || e === void 0 ? void 0 : e._activeCpuName) !== null && _e$_activeCpuName !== void 0 ? _e$_activeCpuName : null, addr: "0x" + address.toString(16), bit, data: "0x" + (data & 0xff).toString(16), d0: next, qBefore: (_this$getBit = (_this$getBit2 = this.getBit) === null || _this$getBit2 === void 0 ? void 0 : _this$getBit2.call(this, bit)) !== null && _this$getBit !== void 0 ? _this$getBit : null });}

    this.setBit(bit, next);

    if (trace) {var _e$timing$schedulerTi2, _e$timing2, _this$getBit3, _this$getBit4, _this$getBit5, _this$getBit6, _e$sub2NmiMask, _e$cpu3NmiEnabled, _ref, _e$cpuBoardResetAsser, _ref2, _e$sub2Cpu$inReset, _e$sub2Cpu, _e$sub2Cpu2, _e$sub2Cpu2$isReset, _ref3, _ref4, _e$sub2Cpu$getPC, _e$sub2Cpu3, _e$sub2Cpu3$getPC, _e$sub2Cpu4, _e$sub2Cpu5;
      console.log("[CPU BOARD LS259 RESULT]", {
        tick: (_e$timing$schedulerTi2 = e === null || e === void 0 ? void 0 : (_e$timing2 = e.timing) === null || _e$timing2 === void 0 ? void 0 : _e$timing2.schedulerTick) !== null && _e$timing$schedulerTi2 !== void 0 ? _e$timing$schedulerTi2 : null,

        q2: (_this$getBit3 = (_this$getBit4 = this.getBit) === null || _this$getBit4 === void 0 ? void 0 : _this$getBit4.call(this, 2)) !== null && _this$getBit3 !== void 0 ? _this$getBit3 : null,

        q3: (_this$getBit5 = (_this$getBit6 = this.getBit) === null || _this$getBit6 === void 0 ? void 0 : _this$getBit6.call(this, 3)) !== null && _this$getBit5 !== void 0 ? _this$getBit5 : null,

        sub2NmiMask: (_e$sub2NmiMask =
        e === null || e === void 0 ? void 0 : e.sub2NmiMask) !== null && _e$sub2NmiMask !== void 0 ? _e$sub2NmiMask :
        (e === null || e === void 0 ? void 0 : e.cpu3NmiEnabled) == null ? null : !e.cpu3NmiEnabled,

        soundNmiEnabled: (_e$cpu3NmiEnabled = e === null || e === void 0 ? void 0 : e.cpu3NmiEnabled) !== null && _e$cpu3NmiEnabled !== void 0 ? _e$cpu3NmiEnabled : null,

        cpuBoardResetAsserted: (_ref = (_e$cpuBoardResetAsser =
        e === null || e === void 0 ? void 0 : e.cpuBoardResetAsserted) !== null && _e$cpuBoardResetAsser !== void 0 ? _e$cpuBoardResetAsser : e === null || e === void 0 ? void 0 : e.subsystemsReset) !== null && _ref !== void 0 ? _ref : null,

        soundCpuInReset: (_ref2 = (_e$sub2Cpu$inReset = e === null || e === void 0 ? void 0 : (_e$sub2Cpu = e.sub2Cpu) === null || _e$sub2Cpu === void 0 ? void 0 : _e$sub2Cpu.inReset) !== null && _e$sub2Cpu$inReset !== void 0 ? _e$sub2Cpu$inReset : e === null || e === void 0 ? void 0 : (_e$sub2Cpu2 = e.sub2Cpu) === null || _e$sub2Cpu2 === void 0 ? void 0 : (_e$sub2Cpu2$isReset = _e$sub2Cpu2.isReset) === null || _e$sub2Cpu2$isReset === void 0 ? void 0 : _e$sub2Cpu2$isReset.call(_e$sub2Cpu2)) !== null && _ref2 !== void 0 ? _ref2 : null,

        soundPc: (_ref3 = (_ref4 = (_e$sub2Cpu$getPC =
        e === null || e === void 0 ? void 0 : (_e$sub2Cpu3 = e.sub2Cpu) === null || _e$sub2Cpu3 === void 0 ? void 0 : (_e$sub2Cpu3$getPC = _e$sub2Cpu3.getPC) === null || _e$sub2Cpu3$getPC === void 0 ? void 0 : _e$sub2Cpu3$getPC.call(_e$sub2Cpu3)) !== null && _e$sub2Cpu$getPC !== void 0 ? _e$sub2Cpu$getPC : e === null || e === void 0 ? void 0 : (_e$sub2Cpu4 = e.sub2Cpu) === null || _e$sub2Cpu4 === void 0 ? void 0 : _e$sub2Cpu4.PC) !== null && _ref4 !== void 0 ? _ref4 : e === null || e === void 0 ? void 0 : (_e$sub2Cpu5 = e.sub2Cpu) === null || _e$sub2Cpu5 === void 0 ? void 0 : _e$sub2Cpu5.pc) !== null && _ref3 !== void 0 ? _ref3 : null });

    }

    return true;
  }

  setBit(bit, value, force = false) {var _this$callbacks$index, _this$callbacks;
    const index = bit & 0x07;
    const next = value & 0x01;
    const previous = this.getBit(index);

    if (!force && previous === next) {
      return false;
    }

    this.state = this.state & ~(1 << index) | next << index;

    (_this$callbacks$index = (_this$callbacks = this.callbacks)[index]) === null || _this$callbacks$index === void 0 ? void 0 : _this$callbacks$index.call(_this$callbacks, next, this.state, index);

    return true;
  }

  clear(forceCallbacks = false) {
    const previousState = this.state;

    if (previousState === 0x00 && !forceCallbacks) {
      return;
    }

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = previousState >>> bit & 0x01;

      if (forceCallbacks || previous !== 0) {var _this$callbacks$bit, _this$callbacks2;
        (_this$callbacks$bit = (_this$callbacks2 = this.callbacks)[bit]) === null || _this$callbacks$bit === void 0 ? void 0 : _this$callbacks$bit.call(_this$callbacks2, 0, this.state, bit);
      }
    }
  }}

class NamcoVideoLatch extends NamcoLS259Latch {
  constructor(onScreenFlip = null, onChipReset = null) {
    super("video_latch");

    // bit0 -> flip_screen_set, INVERTED (bosco() config: .invert())
    this.setCallback(0, value => {
      onScreenFlip === null || onScreenFlip === void 0 ? void 0 : onScreenFlip(!value);
    });

    // bit7 -> reset 50xx_2 AND 52xx (video-board chips), no inversion.
    // namco_50xx_device::reset(state): state=1 -> CLEAR_LINE (running),
    // state=0 -> ASSERT_LINE (held in reset) — same polarity convention
    // as setResetLine() elsewhere in this codebase.
    this.setCallback(7, value => {
      onChipReset === null || onChipReset === void 0 ? void 0 : onChipReset(!!value);
    });
  }

  reset() {
    const previousState = this.state;
    if (previousState === 0x00) return;

    this.state = 0x00;

    for (let bit = 0; bit < 8; bit++) {
      const previous = previousState >>> bit & 0x01;
      if (previous) {var _this$callbacks$bit2, _this$callbacks3;
        (_this$callbacks$bit2 = (_this$callbacks3 = this.callbacks)[bit]) === null || _this$callbacks$bit2 === void 0 ? void 0 : _this$callbacks$bit2.call(_this$callbacks3, 0, this.state, bit);
      }
    }
  }}


class BoscoEmulator {
  // MAME: PERIOD_OF_555_ASTABLE_NSEC(RES_K(33), RES_K(10), CAP_U(0.0047)).
  // The integer master-tick scheduler uses the closest representable period.






  constructor(config) {var _this$soundChip, _this$inputController, _this$inputController2, _this$cpuBoard50xx$se, _this$cpuBoard50xx, _this$videoBoard50xx$, _this$videoBoard50xx, _this$voiceChip$setSc, _this$voiceChip, _this$namco54xx$setSc, _this$namco54xx;
    this.config = config;

    this.mainCpuRom = new Uint8Array(0x4000);
    this.subCpuRom = new Uint8Array(0x2000);
    this.sub2CpuRom = new Uint8Array(0x1000);
    this.charRom = new Uint8Array(0x1000);
    this.spriteRom = new Uint8Array(0x1000);
    this.spriteShapeRom = new Uint8Array(0x0100);
    this.voiceRom = new Uint8Array(0x3000);
    this.mcuRom50 = new Uint8Array(0x0800);
    this.mcuRom51 = new Uint8Array(0x0400);
    this.mcuRom52 = new Uint8Array(0x0400);
    this.mcuRom54 = new Uint8Array(0x0400);
    this.share1 = new Uint8Array(0x0800);
    this.videoram = new Uint8Array(0x1000);
    this.radarattr = new Uint8Array(0x10);
    this.starcontrol = new Uint8Array(1);

    this.starclr = 1;
    this._scrollX = 0;
    this._scrollY = 0;
    this.bgDirty = new Uint8Array(0x400).fill(1);
    this.fgDirty = new Uint8Array(0x400).fill(1);
    this.watchVramWrites = new Set();

    this.proms = new Uint8Array(0x0160);
    this.masterPaletteProm = this.proms.subarray(0x0000, 0x0020);
    this.lutProm = this.proms.subarray(0x0020, 0x0120);
    this.palette = [];
    this.tileCache8x8 = null;
    this.tileCache16x16 = null;
    this.tileCacheBullet = null;

    this.soundProms = new Uint8Array(0x0200);
    this.waveProm = this.soundProms.subarray(0x0000, 0x0100);
    this.soundTimingProm = this.soundProms.subarray(0x0100, 0x0200);

    this.mainIrqMask = false;
    this.subIrqMask = false;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;
    this.cpu3NmiLatchQ2 = 0;
    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;
    this.mainIrqEnabled = false;
    this.subIrqArmed = false;
    this.flipScreen = false;
    this.led0 = false;
    this.led1 = false;
    this.coinLocked = false;
    this.mod0 = false;
    this.mod1 = false;
    this.mod2 = false;
    this.in0 = 0xff;
    this.in1 = 0xff;
    this._in0 = 0xff;
    this._in1 = 0xff;

    this.dipSwitches = new BoscoDipSwitches();
    this._activeCpuName = null;
    this.frameCounter = 0;
    this.running = false;
    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.watchdogResetPending = false;
    this.watchdogResetCount = 0;
    this.watchdogKickSequence = 0;
    this.watchdogKickHistory = [];
    this.lastWatchdogExpiry = null;
    this.lastResetReason = "power-on";
    this.soundNmiCount = 0;

    this.mainCpu = new Z80(
    address => this.mainRead(address),
    (address, data) => this.mainWrite(address, data));

    this.subCpu = new Z80(
    address => this.subRead(address),
    (address, data) => this.subWrite(address, data));

    this.sub2Cpu = new Z80(
    address => this.sub2Read(address),
    (address, data) => this.sub2Write(address, data));


    this.inputController = new Namco51XX(
    this.dipSwitches,
    data => {
      this.led1 = !!(data & 0x01);
      this.led0 = !!(data & 0x02);
    },
    locked => {
      this.coinLocked = !!locked;
    });


    this.cpuBoard50xx = new Namco50XX();
    this.videoBoard50xx = new Namco50XX();

    this.voice52xxDac = new voice52xxDac();
    this.voiceChip = new Namco52XX(this.voiceRom, {
      externalClockPeriodTicks: BoscoEmulator.NAMCO52XX_TC_PERIOD_TICKS,
      onDacWrite: (data, masterTick) => {
        this.voice52xxDac.pushNibble(data & 0x0f, masterTick);
      } });


    this.namco54xxDac = new Namco54xxDac();
    this.namco54xx = new Namco54XX({
      onChannelData: (channel, nibble, masterTick, force) => {
        this.namco54xxDac.writeChannel(channel, nibble, masterTick, force);
      },

      onReset: (_resetLine, masterTick) => {
        this.namco54xxDac.synchronizeState(masterTick);
      } });


    this.starfield = new Namco05XX();
    this.starfield.setStarfieldConfig(0, 16, 224);
    this.movementMcu1 = this.cpuBoard50xx;
    this.movementMcu2 = this.videoBoard50xx;

    this.soundChip = new NamcoWSG(this.config);
    if (!(((_this$soundChip = this.soundChip) === null || _this$soundChip === void 0 ? void 0 : _this$soundChip.prom) instanceof Uint8Array)) {
      throw new Error("NamcoWSG did not expose a Uint8Array waveform PROM");
    }
    if (this.soundChip.prom.length !== this.waveProm.length) {
      throw new Error(
      "NamcoWSG PROM size mismatch: expected " +
      this.waveProm.length +
      ", got " +
      this.soundChip.prom.length);

    }
    this.soundChip.prom = this.waveProm;
    this.soundChip.onAudioReady = (audioCtx, gainNode) => {
      this.voice52xxDac.attach(audioCtx, gainNode);
      this.namco54xxDac.attach(audioCtx, gainNode);
    };

    this.timing = new BoscoTimingSequencer(this);
    this.timing.setCpu3NmiGateFromQ2(0);
    (_this$inputController = (_this$inputController2 = this.inputController).setScheduler) === null || _this$inputController === void 0 ? void 0 : _this$inputController.call(_this$inputController2, this.timing);
    (_this$cpuBoard50xx$se = (_this$cpuBoard50xx = this.cpuBoard50xx).setScheduler) === null || _this$cpuBoard50xx$se === void 0 ? void 0 : _this$cpuBoard50xx$se.call(_this$cpuBoard50xx, this.timing);
    (_this$videoBoard50xx$ = (_this$videoBoard50xx = this.videoBoard50xx).setScheduler) === null || _this$videoBoard50xx$ === void 0 ? void 0 : _this$videoBoard50xx$.call(_this$videoBoard50xx, this.timing);
    (_this$voiceChip$setSc = (_this$voiceChip = this.voiceChip).setScheduler) === null || _this$voiceChip$setSc === void 0 ? void 0 : _this$voiceChip$setSc.call(_this$voiceChip, this.timing);
    (_this$namco54xx$setSc = (_this$namco54xx = this.namco54xx).setScheduler) === null || _this$namco54xx$setSc === void 0 ? void 0 : _this$namco54xx$setSc.call(_this$namco54xx, this.timing);
    this.cpuBoard50xx.traceReads = false;
    this.cpuBoard50xx.traceOChanges = false;
    this.videoBoard50xx.traceReads = false;
    this.videoBoard50xx.traceOChanges = false;

    this.busInterface0 = new Namco06XX({
      z80CyclesPerDeviceClock: 64,
      hostCpu: () => this.mainCpu,
      onHostNmi: () => {var _this$mainCpu$nmi, _this$mainCpu;
        (_this$mainCpu$nmi = (_this$mainCpu = this.mainCpu).nmi) === null || _this$mainCpu$nmi === void 0 ? void 0 : _this$mainCpu$nmi.call(_this$mainCpu);
      },
      onHostNmiClear: () => {var _this$mainCpu$clearNm, _this$mainCpu2;
        (_this$mainCpu$clearNm = (_this$mainCpu2 = this.mainCpu).clearNmiLatch) === null || _this$mainCpu$clearNm === void 0 ? void 0 : _this$mainCpu$clearNm.call(_this$mainCpu2);
      } });

    this.busInterface1 = new Namco06XX({
      z80CyclesPerDeviceClock: 512,
      hostCpu: () => this.subCpu,
      onHostNmi: () => {var _this$subCpu$nmi, _this$subCpu;
        (_this$subCpu$nmi = (_this$subCpu = this.subCpu).nmi) === null || _this$subCpu$nmi === void 0 ? void 0 : _this$subCpu$nmi.call(_this$subCpu);
      },
      onHostNmiClear: () => {var _this$subCpu$clearNmi, _this$subCpu2;
        (_this$subCpu$clearNmi = (_this$subCpu2 = this.subCpu).clearNmiLatch) === null || _this$subCpu$clearNmi === void 0 ? void 0 : _this$subCpu$clearNmi.call(_this$subCpu2);
      } });

    this.busInterface0.setScheduler(this.timing);
    this.busInterface1.setScheduler(this.timing);
    this.busInterface0.attachDevice(0, this.inputController);
    this.busInterface0.attachDevice(2, this.cpuBoard50xx);
    this.busInterface0.attachDevice(3, this.namco54xx);
    this.busInterface1.attachDevice(0, this.videoBoard50xx);
    this.busInterface1.attachDevice(1, this.voiceChip);

    this.miscLatch = new NamcoLS259Latch("misclatch");
    this.miscLatch.setCallback(0, state => {var _this$mainCpu$clearIr, _this$mainCpu3;
      this.mainIrqMask = !!state;
      this.mainIrqEnabled = this.mainIrqMask;
      if (!this.mainIrqMask) (_this$mainCpu$clearIr = (_this$mainCpu3 = this.mainCpu).clearIrq) === null || _this$mainCpu$clearIr === void 0 ? void 0 : _this$mainCpu$clearIr.call(_this$mainCpu3);
    });
    this.miscLatch.setCallback(1, state => {var _this$subCpu$clearIrq, _this$subCpu3;
      this.subIrqMask = !!state;
      this.subIrqArmed = this.subIrqMask;
      if (!this.subIrqMask) (_this$subCpu$clearIrq = (_this$subCpu3 = this.subCpu).clearIrq) === null || _this$subCpu$clearIrq === void 0 ? void 0 : _this$subCpu$clearIrq.call(_this$subCpu3);
    });
    this.miscLatch.setCallback(2, state => {
      const q2 = state ? 1 : 0;
      const timerEnabled = !Boolean(q2);
      this.cpu3NmiLatchQ2 = q2;
      this.sub2NmiMask = timerEnabled;
      this.cpu3NmiEnabled = timerEnabled;
      this.timing.setCpu3NmiGateFromQ2(q2);
    });
    this.miscLatch.setCallback(3, state => {var _this$subCpu$setReset, _this$subCpu4, _this$sub2Cpu$setRese, _this$sub2Cpu, _this$inputController3, _this$inputController4, _this$cpuBoard50xx$se2, _this$cpuBoard50xx2, _this$namco54xx$setRe, _this$namco54xx2;
      const resetAsserted = !Boolean(state);

      this.cpuBoardResetAsserted = resetAsserted;
      this.subsystemsReset = resetAsserted;

      (_this$subCpu$setReset = (_this$subCpu4 = this.subCpu).setReset) === null || _this$subCpu$setReset === void 0 ? void 0 : _this$subCpu$setReset.call(_this$subCpu4, resetAsserted);
      (_this$sub2Cpu$setRese = (_this$sub2Cpu = this.sub2Cpu).setReset) === null || _this$sub2Cpu$setRese === void 0 ? void 0 : _this$sub2Cpu$setRese.call(_this$sub2Cpu, resetAsserted);

      const activeLowLevel = resetAsserted ? 0 : 1;
      (_this$inputController3 = (_this$inputController4 = this.inputController).setResetLine) === null || _this$inputController3 === void 0 ? void 0 : _this$inputController3.call(_this$inputController4, activeLowLevel);
      (_this$cpuBoard50xx$se2 = (_this$cpuBoard50xx2 = this.cpuBoard50xx).setResetLine) === null || _this$cpuBoard50xx$se2 === void 0 ? void 0 : _this$cpuBoard50xx$se2.call(_this$cpuBoard50xx2, activeLowLevel);
      (_this$namco54xx$setRe = (_this$namco54xx2 = this.namco54xx).setResetLine) === null || _this$namco54xx$setRe === void 0 ? void 0 : _this$namco54xx$setRe.call(_this$namco54xx2, activeLowLevel);
    });
    this.miscLatch.setCallback(4, () => {});
    this.miscLatch.setCallback(5, state => {
      this.mod0 = !!state;
    });
    this.miscLatch.setCallback(6, state => {
      this.mod1 = !!state;
    });
    this.miscLatch.setCallback(7, state => {
      this.mod2 = !!state;
    });

    this.videoLatch = new NamcoVideoLatch(
    flipped => {
      this.flipScreen = !!flipped;
    },
    running => {var _this$videoBoard50xx$2, _this$videoBoard50xx2, _this$voiceChip$setRe, _this$voiceChip2;
      const resetLine = running ? 1 : 0;
      (_this$videoBoard50xx$2 = (_this$videoBoard50xx2 = this.videoBoard50xx).setResetLine) === null || _this$videoBoard50xx$2 === void 0 ? void 0 : _this$videoBoard50xx$2.call(_this$videoBoard50xx2, resetLine);
      (_this$voiceChip$setRe = (_this$voiceChip2 = this.voiceChip).setResetLine) === null || _this$voiceChip$setRe === void 0 ? void 0 : _this$voiceChip$setRe.call(_this$voiceChip2, resetLine);
    });


    this.miscLatch.setBit(2, 0, true);
    this.miscLatch.setBit(3, 0, true);
    this.videoLatch.setBit(7, 0, true);

    this.dumpSoundInitState = () => {var _ref6, _ref7, _ref8, _soundCpu$nmiPending, _this$timing$now, _this$timing, _this$timing$eventCou, _this$timing2, _this$timing$nextDead, _this$timing3, _this$miscLatch$getBi, _this$miscLatch, _this$miscLatch$getBi2, _this$miscLatch$getBi3, _this$miscLatch2, _this$miscLatch2$getB, _this$timing$cpu3NmiT, _this$timing4, _this$mainCpu4, _this$subCpu5, _this$mainCpu5, _this$subCpu6, _this$busInterface0$c, _this$busInterface, _this$busInterface1$c, _this$busInterface2, _this$inputController5, _this$inputController6, _this$inputController7, _this$cpuBoard50xx$ge, _this$cpuBoard50xx3, _this$cpuBoard50xx3$g, _this$videoBoard50xx$3, _this$videoBoard50xx3, _this$videoBoard50xx4, _this$voiceChip$getTr, _this$voiceChip3, _this$voiceChip3$getT, _this$namco54xx$getTr, _this$namco54xx3, _this$namco54xx3$getT, _this$namco54xxDac$ge, _this$namco54xxDac, _this$namco54xxDac$ge2;
      const pcOf = cpu => {var _ref5, _cpu$PC;return (
          typeof (cpu === null || cpu === void 0 ? void 0 : cpu.getPC) === "function" ?
          cpu.getPC() & 0xffff :
          ((_ref5 = (_cpu$PC = cpu === null || cpu === void 0 ? void 0 : cpu.PC) !== null && _cpu$PC !== void 0 ? _cpu$PC : cpu === null || cpu === void 0 ? void 0 : cpu.pc) !== null && _ref5 !== void 0 ? _ref5 : 0) & 0xffff);};

      const soundCpu = this.sub2Cpu;
      const soundNmiPending = (_ref6 = (_ref7 = (_ref8 = (_soundCpu$nmiPending =
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiPending) !== null && _soundCpu$nmiPending !== void 0 ? _soundCpu$nmiPending :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiLatch) !== null && _ref8 !== void 0 ? _ref8 :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.nmiRequested) !== null && _ref7 !== void 0 ? _ref7 :
      soundCpu === null || soundCpu === void 0 ? void 0 : soundCpu.pendingNmi) !== null && _ref6 !== void 0 ? _ref6 :
      null;

      return {
        timingNow: (_this$timing$now = (_this$timing = this.timing) === null || _this$timing === void 0 ? void 0 : _this$timing.now) !== null && _this$timing$now !== void 0 ? _this$timing$now : null,
        timingEvents: (_this$timing$eventCou = (_this$timing2 = this.timing) === null || _this$timing2 === void 0 ? void 0 : _this$timing2.eventCount) !== null && _this$timing$eventCou !== void 0 ? _this$timing$eventCou : null,
        nextDeadline: (_this$timing$nextDead = (_this$timing3 = this.timing) === null || _this$timing3 === void 0 ? void 0 : _this$timing3.nextDeadline) !== null && _this$timing$nextDead !== void 0 ? _this$timing$nextDead : null,
        q2: (_this$miscLatch$getBi = (_this$miscLatch = this.miscLatch) === null || _this$miscLatch === void 0 ? void 0 : (_this$miscLatch$getBi2 = _this$miscLatch.getBit) === null || _this$miscLatch$getBi2 === void 0 ? void 0 : _this$miscLatch$getBi2.call(_this$miscLatch, 2)) !== null && _this$miscLatch$getBi !== void 0 ? _this$miscLatch$getBi : null,
        q3: (_this$miscLatch$getBi3 = (_this$miscLatch2 = this.miscLatch) === null || _this$miscLatch2 === void 0 ? void 0 : (_this$miscLatch2$getB = _this$miscLatch2.getBit) === null || _this$miscLatch2$getB === void 0 ? void 0 : _this$miscLatch2$getB.call(_this$miscLatch2, 3)) !== null && _this$miscLatch$getBi3 !== void 0 ? _this$miscLatch$getBi3 : null,
        mainIrqMask: this.mainIrqMask,
        subIrqMask: this.subIrqMask,
        sub2NmiMask: this.sub2NmiMask,
        cpu3NmiEnabled: this.cpu3NmiEnabled,
        cpu3NmiTimerEnabled: (_this$timing$cpu3NmiT = (_this$timing4 = this.timing) === null || _this$timing4 === void 0 ? void 0 : _this$timing4.cpu3NmiTimerEnabled) !== null && _this$timing$cpu3NmiT !== void 0 ? _this$timing$cpu3NmiT : null,
        cpuBoardResetAsserted: this.cpuBoardResetAsserted,
        mainPC: pcOf(this.mainCpu),
        subPC: pcOf(this.subCpu),
        soundPC: pcOf(soundCpu),
        mainReset: !!((_this$mainCpu4 = this.mainCpu) !== null && _this$mainCpu4 !== void 0 && _this$mainCpu4.inReset),
        subReset: !!((_this$subCpu5 = this.subCpu) !== null && _this$subCpu5 !== void 0 && _this$subCpu5.inReset),
        soundReset: !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.inReset),
        mainHalted: !!((_this$mainCpu5 = this.mainCpu) !== null && _this$mainCpu5 !== void 0 && _this$mainCpu5.halted),
        subHalted: !!((_this$subCpu6 = this.subCpu) !== null && _this$subCpu6 !== void 0 && _this$subCpu6.halted),
        soundHalted: !!(soundCpu !== null && soundCpu !== void 0 && soundCpu.halted),
        soundNmiPending: soundNmiPending == null ? null : !!soundNmiPending,
        soundNmiCount: this.soundNmiCount,
        cpu06Control: (_this$busInterface0$c = (_this$busInterface = this.busInterface0) === null || _this$busInterface === void 0 ? void 0 : _this$busInterface.control) !== null && _this$busInterface0$c !== void 0 ? _this$busInterface0$c : null,
        video06Control: (_this$busInterface1$c = (_this$busInterface2 = this.busInterface1) === null || _this$busInterface2 === void 0 ? void 0 : _this$busInterface2.control) !== null && _this$busInterface1$c !== void 0 ? _this$busInterface1$c : null,
        soundRomAt0000: this.sub2CpuRom[0x0000],
        soundRomAt0066: this.sub2CpuRom[0x0066],
        input51xx: (_this$inputController5 = (_this$inputController6 = this.inputController) === null || _this$inputController6 === void 0 ? void 0 : (_this$inputController7 = _this$inputController6.getTraceState) === null || _this$inputController7 === void 0 ? void 0 : _this$inputController7.call(_this$inputController6)) !== null && _this$inputController5 !== void 0 ? _this$inputController5 : null,
        cpuBoard50xx: (_this$cpuBoard50xx$ge = (_this$cpuBoard50xx3 = this.cpuBoard50xx) === null || _this$cpuBoard50xx3 === void 0 ? void 0 : (_this$cpuBoard50xx3$g = _this$cpuBoard50xx3.getTraceState) === null || _this$cpuBoard50xx3$g === void 0 ? void 0 : _this$cpuBoard50xx3$g.call(_this$cpuBoard50xx3)) !== null && _this$cpuBoard50xx$ge !== void 0 ? _this$cpuBoard50xx$ge : null,
        videoBoard50xx: (_this$videoBoard50xx$3 = (_this$videoBoard50xx3 = this.videoBoard50xx) === null || _this$videoBoard50xx3 === void 0 ? void 0 : (_this$videoBoard50xx4 = _this$videoBoard50xx3.getTraceState) === null || _this$videoBoard50xx4 === void 0 ? void 0 : _this$videoBoard50xx4.call(_this$videoBoard50xx3)) !== null && _this$videoBoard50xx$3 !== void 0 ? _this$videoBoard50xx$3 : null,
        voice52xx: (_this$voiceChip$getTr = (_this$voiceChip3 = this.voiceChip) === null || _this$voiceChip3 === void 0 ? void 0 : (_this$voiceChip3$getT = _this$voiceChip3.getTraceState) === null || _this$voiceChip3$getT === void 0 ? void 0 : _this$voiceChip3$getT.call(_this$voiceChip3)) !== null && _this$voiceChip$getTr !== void 0 ? _this$voiceChip$getTr : null,
        sound54xx: (_this$namco54xx$getTr = (_this$namco54xx3 = this.namco54xx) === null || _this$namco54xx3 === void 0 ? void 0 : (_this$namco54xx3$getT = _this$namco54xx3.getTraceState) === null || _this$namco54xx3$getT === void 0 ? void 0 : _this$namco54xx3$getT.call(_this$namco54xx3)) !== null && _this$namco54xx$getTr !== void 0 ? _this$namco54xx$getTr : null,
        namco54xxDac: (_this$namco54xxDac$ge = (_this$namco54xxDac = this.namco54xxDac) === null || _this$namco54xxDac === void 0 ? void 0 : (_this$namco54xxDac$ge2 = _this$namco54xxDac.getTraceState) === null || _this$namco54xxDac$ge2 === void 0 ? void 0 : _this$namco54xxDac$ge2.call(_this$namco54xxDac)) !== null && _this$namco54xxDac$ge !== void 0 ? _this$namco54xxDac$ge : null };

    };

    this.reset({
      preserveRunning: false,
      fromWatchdog: false });

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
  getDipSwitchSummary() {var _this$dipSwitches$get, _this$dipSwitches, _this$dipSwitches$get2;
    return (_this$dipSwitches$get = (_this$dipSwitches = this.dipSwitches) === null || _this$dipSwitches === void 0 ? void 0 : (_this$dipSwitches$get2 = _this$dipSwitches.getSummary) === null || _this$dipSwitches$get2 === void 0 ? void 0 : _this$dipSwitches$get2.call(_this$dipSwitches)) !== null && _this$dipSwitches$get !== void 0 ? _this$dipSwitches$get : null;
  }

  canDeliverSoundNmi() {var _this$cpuBoardResetAs, _this$sub2Cpu2, _this$sub2Cpu3, _this$sub2Cpu3$isRese;
    const timerEnabled = !!this.cpu3NmiEnabled;

    const cpuBoardResetAsserted = !!((_this$cpuBoardResetAs =
    this.cpuBoardResetAsserted) !== null && _this$cpuBoardResetAs !== void 0 ? _this$cpuBoardResetAs : this.subsystemsReset);


    const soundCpuReset = !!(
    (_this$sub2Cpu2 = this.sub2Cpu) !== null && _this$sub2Cpu2 !== void 0 && _this$sub2Cpu2.inReset || (_this$sub2Cpu3 = this.sub2Cpu) !== null && _this$sub2Cpu3 !== void 0 && (_this$sub2Cpu3$isRese = _this$sub2Cpu3.isReset) !== null && _this$sub2Cpu3$isRese !== void 0 && _this$sub2Cpu3$isRese.call(_this$sub2Cpu3));


    return timerEnabled && !cpuBoardResetAsserted && !soundCpuReset;
  }

  readDSW(addr) {
    const offset = addr & 0x07;
    const dswa = this.dipSwitches.getBankA();
    const dswb = this.dipSwitches.getBankB();
    return dswb >> offset & 1 | (dswa >> offset & 1) << 1;
  }
  reset({ preserveRunning = false, fromWatchdog = false } = {}) {var _this$mainCpu$clearIr2, _this$mainCpu6, _this$subCpu$clearIrq2, _this$subCpu7, _this$sub2Cpu$clearIr, _this$sub2Cpu4, _this$mainCpu$clearNm2, _this$mainCpu7, _this$subCpu$clearNmi2, _this$subCpu8, _this$sub2Cpu$clearNm, _this$sub2Cpu5, _this$soundChip$reset, _this$soundChip2, _this$starfield$reset, _this$starfield, _this$movementMcu1$re, _this$movementMcu, _this$movementMcu2$re, _this$movementMcu2, _this$inputController8, _this$inputController9, _this$voiceChip$reset, _this$voiceChip4, _this$voiceChip$setSc2, _this$voiceChip5, _this$namco54xx$reset, _this$namco54xx4, _this$subCpu$setReset2, _this$subCpu9, _this$sub2Cpu$setRese2, _this$sub2Cpu6, _this$inputController10, _this$inputController11, _this$cpuBoard50xx$se3, _this$cpuBoard50xx4, _this$namco54xx$setRe2, _this$namco54xx5, _this$videoBoard50xx$4, _this$videoBoard50xx5, _this$voiceChip$setRe2, _this$voiceChip6, _this$inputController12, _this$inputController13, _this$inputController14, _this$inputController15;
    const wasRunning = !!this.running;

    this.running = preserveRunning ? wasRunning : false;
    this.frameCounter = 0;

    this.watchdogTimer = 0;
    this.watchdogEverKicked = false;
    this.watchdogResetPending = false;

    this.soundNmiCount = 0;

    this.mainIrqMask = false;
    this.subIrqMask = false;

    this.mainIrqEnabled = false;
    this.subIrqArmed = false;

    this.cpu3NmiLatchQ2 = 0;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;

    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;

    this.flipScreen = false;

    this.timing.reset();

    this.timing.cpu3NmiTimerEnabled = true;

    this.share1.fill(0);
    this.videoram.fill(0);

    this.radarattr.fill(0);
    this.starcontrol.fill(0);

    this.starclr = 1;
    this._scrollX = 0;
    this._scrollY = 0;

    this.bgDirty.fill(1);
    this.fgDirty.fill(1);

    this.mainCpu.reset(this.mainRead.bind(this));
    this.subCpu.reset(this.subRead.bind(this));
    this.sub2Cpu.reset(this.sub2Read.bind(this));

    (_this$mainCpu$clearIr2 = (_this$mainCpu6 = this.mainCpu).clearIrq) === null || _this$mainCpu$clearIr2 === void 0 ? void 0 : _this$mainCpu$clearIr2.call(_this$mainCpu6);
    (_this$subCpu$clearIrq2 = (_this$subCpu7 = this.subCpu).clearIrq) === null || _this$subCpu$clearIrq2 === void 0 ? void 0 : _this$subCpu$clearIrq2.call(_this$subCpu7);
    (_this$sub2Cpu$clearIr = (_this$sub2Cpu4 = this.sub2Cpu).clearIrq) === null || _this$sub2Cpu$clearIr === void 0 ? void 0 : _this$sub2Cpu$clearIr.call(_this$sub2Cpu4);

    (_this$mainCpu$clearNm2 = (_this$mainCpu7 = this.mainCpu).clearNmiLatch) === null || _this$mainCpu$clearNm2 === void 0 ? void 0 : _this$mainCpu$clearNm2.call(_this$mainCpu7);
    (_this$subCpu$clearNmi2 = (_this$subCpu8 = this.subCpu).clearNmiLatch) === null || _this$subCpu$clearNmi2 === void 0 ? void 0 : _this$subCpu$clearNmi2.call(_this$subCpu8);
    (_this$sub2Cpu$clearNm = (_this$sub2Cpu5 = this.sub2Cpu).clearNmiLatch) === null || _this$sub2Cpu$clearNm === void 0 ? void 0 : _this$sub2Cpu$clearNm.call(_this$sub2Cpu5);

    (_this$soundChip$reset = (_this$soundChip2 = this.soundChip).reset) === null || _this$soundChip$reset === void 0 ? void 0 : _this$soundChip$reset.call(_this$soundChip2);
    (_this$starfield$reset = (_this$starfield = this.starfield).reset) === null || _this$starfield$reset === void 0 ? void 0 : _this$starfield$reset.call(_this$starfield);

    this.busInterface0.reset();
    this.busInterface0.setScheduler(this.timing);

    this.busInterface1.reset();
    this.busInterface1.setScheduler(this.timing);

    (_this$movementMcu1$re = (_this$movementMcu = this.movementMcu1).reset) === null || _this$movementMcu1$re === void 0 ? void 0 : _this$movementMcu1$re.call(_this$movementMcu);
    (_this$movementMcu2$re = (_this$movementMcu2 = this.movementMcu2).reset) === null || _this$movementMcu2$re === void 0 ? void 0 : _this$movementMcu2$re.call(_this$movementMcu2);

    (_this$inputController8 = (_this$inputController9 = this.inputController).reset) === null || _this$inputController8 === void 0 ? void 0 : _this$inputController8.call(_this$inputController9);
    (_this$voiceChip$reset = (_this$voiceChip4 = this.voiceChip).reset) === null || _this$voiceChip$reset === void 0 ? void 0 : _this$voiceChip$reset.call(_this$voiceChip4);
    (_this$voiceChip$setSc2 = (_this$voiceChip5 = this.voiceChip).setScheduler) === null || _this$voiceChip$setSc2 === void 0 ? void 0 : _this$voiceChip$setSc2.call(_this$voiceChip5, this.timing);
    (_this$namco54xx$reset = (_this$namco54xx4 = this.namco54xx).reset) === null || _this$namco54xx$reset === void 0 ? void 0 : _this$namco54xx$reset.call(_this$namco54xx4);

    (_this$subCpu$setReset2 = (_this$subCpu9 = this.subCpu).setReset) === null || _this$subCpu$setReset2 === void 0 ? void 0 : _this$subCpu$setReset2.call(_this$subCpu9, true);
    (_this$sub2Cpu$setRese2 = (_this$sub2Cpu6 = this.sub2Cpu).setReset) === null || _this$sub2Cpu$setRese2 === void 0 ? void 0 : _this$sub2Cpu$setRese2.call(_this$sub2Cpu6, true);

    (_this$inputController10 = (_this$inputController11 = this.inputController).setResetLine) === null || _this$inputController10 === void 0 ? void 0 : _this$inputController10.call(_this$inputController11, 0);
    (_this$cpuBoard50xx$se3 = (_this$cpuBoard50xx4 = this.cpuBoard50xx).setResetLine) === null || _this$cpuBoard50xx$se3 === void 0 ? void 0 : _this$cpuBoard50xx$se3.call(_this$cpuBoard50xx4, 0);
    (_this$namco54xx$setRe2 = (_this$namco54xx5 = this.namco54xx).setResetLine) === null || _this$namco54xx$setRe2 === void 0 ? void 0 : _this$namco54xx$setRe2.call(_this$namco54xx5, 0);

    (_this$videoBoard50xx$4 = (_this$videoBoard50xx5 = this.videoBoard50xx).setResetLine) === null || _this$videoBoard50xx$4 === void 0 ? void 0 : _this$videoBoard50xx$4.call(_this$videoBoard50xx5, 0);
    (_this$voiceChip$setRe2 = (_this$voiceChip6 = this.voiceChip).setResetLine) === null || _this$voiceChip$setRe2 === void 0 ? void 0 : _this$voiceChip$setRe2.call(_this$voiceChip6, 0);

    (_this$inputController12 = (_this$inputController13 = this.inputController).vblank) === null || _this$inputController12 === void 0 ? void 0 : _this$inputController12.call(_this$inputController13, false);
    (_this$inputController14 = (_this$inputController15 = this.inputController).setPorts) === null || _this$inputController14 === void 0 ? void 0 : _this$inputController14.call(_this$inputController15, this.in0, this.in1);

    this.miscLatch.clear();
    this.videoLatch.reset();

    this.miscLatch.setBit(2, 0, true);

    this.miscLatch.setBit(3, 0, true);

    this.videoLatch.setBit(7, 0, true);

    this.cpu3NmiLatchQ2 = 0;
    this.sub2NmiMask = true;
    this.cpu3NmiEnabled = true;

    this.timing.setCpu3NmiGateFromQ2(0);

    this.cpuBoardResetAsserted = true;
    this.subsystemsReset = true;

    this.lastResetReason = fromWatchdog ? "watchdog" : "manual";
  }
  connectInput(inputManager) {
    if (
    !this.inputController ||
    typeof this.inputController.setPorts !== "function")
    {
      console.error(
      "inputController is not initialized or missing setPorts",
      this.inputController);

      return;
    }

    const sync = ports => {
      this.in0 = ports.in0 & 0xff;
      this.in1 = ports.in1 & 0xff;

      this.inputController.setPorts(this.in0, this.in1);
    };

    sync(inputManager.getState());
    inputManager.setOnStateChange(sync);
  }
  get scrollX() {
    return this._scrollX;
  }
  set scrollX(v) {
    this._scrollX = v & 0xff;
  }
  get scrollY() {
    return this._scrollY;
  }
  set scrollY(v) {
    this._scrollY = v & 0xff;
  }

  sharedRead(addr) {
    addr &= 0xffff;

    if (addr >= 0x6800 && addr <= 0x6807) return this.readDSW(addr);
    if (addr >= 0x7000 && addr <= 0x70ff)
    return this.busInterface0.dataRead(addr - 0x7000);
    if (addr === 0x7100) return this.busInterface0.readControl();
    if (addr >= 0x7800 && addr <= 0x7fff) return this.share1[addr - 0x7800];
    if (addr >= 0x8000 && addr <= 0x8fff) return this.videoram[addr - 0x8000];
    if (addr >= 0x9000 && addr <= 0x90ff)
    return this.busInterface1.dataRead(addr - 0x9000);
    if (addr === 0x9100) return this.busInterface1.readControl();
    // 0x9800-0x9877 (radarattr/scroll/starcontrol/starclr/videolatch) is
    // writeonly() in bosco_map — open bus on read.
    return 0xff;
  }
  sharedWrite(addr, data) {
    addr &= 0xffff;
    data &= 0xff;

    if (addr >= 0x6800 && addr <= 0x681f) {var _this$soundChip3;
      (_this$soundChip3 = this.soundChip) === null || _this$soundChip3 === void 0 ? void 0 : _this$soundChip3.write(addr & 0x1f, data);
      return true;
    }
    if (addr >= 0x6820 && addr <= 0x6827) {
      this.miscLatch.write(addr, data);
      return true;
    }
    if (addr === 0x6830) {
      this.kickWatchdog();
      return true;
    }

    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.busInterface0.dataWrite(addr - 0x7000, data);
      return true;
    }
    if (addr === 0x7100) {
      this.busInterface0.controlWrite(data);
      return true;
    }

    if (addr >= 0x7800 && addr <= 0x7fff) {
      this.share1[addr - 0x7800] = data;
      return true;
    }

    if (addr >= 0x8000 && addr <= 0x8fff) {
      // bosco_videoram_w: dirty-flag the correct tilemap by bit 0x400.
      const offset = addr - 0x8000;
      this.videoram[offset] = data;
      if (offset & 0x400) this.bgDirty[offset & 0x3ff] = 1;else
      this.fgDirty[offset & 0x3ff] = 1;
      return true;
    }

    if (addr >= 0x9000 && addr <= 0x90ff) {
      this.busInterface1.dataWrite(addr - 0x9000, data);
      return true;
    }
    if (addr === 0x9100) {
      this.busInterface1.controlWrite(data);
      return true;
    }

    if (addr >= 0x9800 && addr <= 0x980f) {
      this.radarattr[addr - 0x9800] = data;
      return true;
    }
    if (addr === 0x9810) {
      this.scrollX = data;
      return true;
    }
    if (addr === 0x9820) {
      this.scrollY = data;
      return true;
    }
    if (addr === 0x9830) {
      this.starcontrol[0] = data;
      return true;
    }
    if (addr === 0x9840) {
      this.starclr = 0;
      return true;
    } // any write arms it
    if (addr >= 0x9870 && addr <= 0x9877) {
      this.videoLatch.write(addr, data);
      return true;
    }

    return false;
  }
  mainRead(addr) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return this.mainCpuRom[addr];
    return this.sharedRead(addr);
  }
  mainWrite(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return; // ROM region: nopw(), writes discarded
    this.sharedWrite(addr, data);
  }
  subRead(addr) {var _this$subCpuRom$addr;
    addr &= 0xffff;
    if (addr <= 0x3fff) return (_this$subCpuRom$addr = this.subCpuRom[addr]) !== null && _this$subCpuRom$addr !== void 0 ? _this$subCpuRom$addr : 0xff; // 0x2000-0x3fff n.c.
    return this.sharedRead(addr);
  }
  subWrite(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return;
    this.sharedWrite(addr, data);
  }
  sub2Read(addr) {var _this$sub2CpuRom$addr;
    addr &= 0xffff;
    if (addr <= 0x0fff) return (_this$sub2CpuRom$addr = this.sub2CpuRom[addr]) !== null && _this$sub2CpuRom$addr !== void 0 ? _this$sub2CpuRom$addr : 0xff;
    if (addr <= 0x3fff) return 0xff; // n.c.
    return this.sharedRead(addr);
  }
  sub2Write(addr, data) {
    addr &= 0xffff;
    if (addr <= 0x3fff) return;
    this.sharedWrite(addr, data);
  }

  onVblankRising() {var _this$inputController16, _this$inputController17;
    this.watchdogKickCountThisFrame = 0;

    if (this.mainIrqEnabled) {var _this$mainCpu$irq, _this$mainCpu8;
      (_this$mainCpu$irq = (_this$mainCpu8 = this.mainCpu).irq) === null || _this$mainCpu$irq === void 0 ? void 0 : _this$mainCpu$irq.call(_this$mainCpu8);
    }

    if (!this.subsystemsReset && this.subIrqArmed) {var _this$subCpu$irq, _this$subCpu10;
      (_this$subCpu$irq = (_this$subCpu10 = this.subCpu).irq) === null || _this$subCpu$irq === void 0 ? void 0 : _this$subCpu$irq.call(_this$subCpu10);
    }

    (_this$inputController16 = this.inputController) === null || _this$inputController16 === void 0 ? void 0 : (_this$inputController17 = _this$inputController16.vblank) === null || _this$inputController17 === void 0 ? void 0 : _this$inputController17.call(_this$inputController16, true);

    this.watchdogTimer++;

    if (this.watchdogTimer >= 8) {
      this.watchdogResetPending = true;
    }
  }
  onVblankFalling() {var _this$inputController18, _this$inputController19;
    (_this$inputController18 = this.inputController) === null || _this$inputController18 === void 0 ? void 0 : (_this$inputController19 = _this$inputController18.vblank) === null || _this$inputController19 === void 0 ? void 0 : _this$inputController19.call(_this$inputController18, false);

    const control = this.starcontrol[0];
    const speedIndexX = control & 0x07;
    const speedIndexY = control >>> 3 & 0x07;

    this.starfield.setScrollSpeed(speedIndexX, speedIndexY);

    const q4 = this.videoLatch.getBit(4);
    const q5 = this.videoLatch.getBit(5);

    this.starfield.setActiveStarfieldSets(q4, q5 | 0x02);
    this.starfield.enableStarfield(!this.starclr);
  }

  kickWatchdog() {var _this$_activeCpuName, _cpu, _ref9, _cpu$PC2, _cpu2, _cpu3, _this$timing$schedule, _this$timing5, _this$watchdogKickSeq, _this$watchdogKickCou;
    const cpuName = (_this$_activeCpuName = this._activeCpuName) !== null && _this$_activeCpuName !== void 0 ? _this$_activeCpuName : "unknown";

    let cpu = null;

    switch (cpuName) {
      case "main":
        cpu = this.mainCpu;
        break;

      case "sub":
        cpu = this.subCpu;
        break;

      case "sub2":
        cpu = this.sub2Cpu;
        break;}


    const pc =
    typeof ((_cpu = cpu) === null || _cpu === void 0 ? void 0 : _cpu.getPC) === "function" ? cpu.getPC() : (_ref9 = (_cpu$PC2 = (_cpu2 = cpu) === null || _cpu2 === void 0 ? void 0 : _cpu2.PC) !== null && _cpu$PC2 !== void 0 ? _cpu$PC2 : (_cpu3 = cpu) === null || _cpu3 === void 0 ? void 0 : _cpu3.pc) !== null && _ref9 !== void 0 ? _ref9 : 0;

    const frame = this.frameCounter;
    const tick = (_this$timing$schedule = (_this$timing5 = this.timing) === null || _this$timing5 === void 0 ? void 0 : _this$timing5.schedulerTick) !== null && _this$timing$schedule !== void 0 ? _this$timing$schedule : null;

    this.watchdogKickSequence = ((_this$watchdogKickSeq = this.watchdogKickSequence) !== null && _this$watchdogKickSeq !== void 0 ? _this$watchdogKickSeq : 0) + 1;

    this.watchdogKickCountThisFrame =
    ((_this$watchdogKickCou = this.watchdogKickCountThisFrame) !== null && _this$watchdogKickCou !== void 0 ? _this$watchdogKickCou : 0) + 1;

    /*
     * Preserve one representative watchdog write per frame.
     *
     * This reveals the first frame where normal service stops without
     * allowing a tight $3e95 loop to overwrite the entire history.
     */
    if (this.watchdogLastRecordedFrame !== frame) {
      this.watchdogLastRecordedFrame = frame;

      this.watchdogKickHistory.push({
        sequence: this.watchdogKickSequence,
        frame,
        tick,
        cpu: cpuName,
        pc: pc & 0xffff,
        countBeforeKick: this.watchdogTimer,
        writesThisFrameAtRecord: this.watchdogKickCountThisFrame });


      if (this.watchdogKickHistory.length > 64) {
        this.watchdogKickHistory.shift();
      }
    }

    this.watchdogTimer = 0;
    this.watchdogEverKicked = true;
    this.watchdogResetPending = false;
  }
  onWatchdogFired() {var _this$watchdogResetCo;
    this.watchdogResetCount = ((_this$watchdogResetCo = this.watchdogResetCount) !== null && _this$watchdogResetCo !== void 0 ? _this$watchdogResetCo : 0) + 1;

    this.reset({
      preserveRunning: true,
      fromWatchdog: true });

  }

  step() {
    this.timing.runFrame();
    if (this.watchdogResetPending) {
      this.watchdogResetPending = false;
      this.onWatchdogFired();
      return;
    }
    this.frameCounter++;
  }


  buildTileCache() {
    // Pre-decode all immutable ROM graphics so the render hot path
    // never decodes the same tile twice.
    this.tileCache8x8 = new Array(0x200);
    for (let code = 0; code < 0x200; code++) {
      this.tileCache8x8[code] = this.decode8x8(this.charRom, code);
    }

    this.tileCache16x16 = new Array(0x80);
    for (let code = 0; code < 0x80; code++) {
      this.tileCache16x16[code] = this.decode16x16(code);
    }

    this.tileCacheBullet = new Array(0x08);
    for (let code = 0; code < 0x08; code++) {
      this.tileCacheBullet[code] = this.decodeBullet(code);
    }
  }
  decode8x8(rom, code) {
    const TILE = 8;
    const pixels = new Uint8Array(TILE * TILE);
    const base = (code & 0x1ff) * 16;

    for (let y = 0; y < TILE; y++) {var _rom, _rom2;
      const lo = (_rom = rom[base + y + 8]) !== null && _rom !== void 0 ? _rom : 0;
      const hi = (_rom2 = rom[base + y]) !== null && _rom2 !== void 0 ? _rom2 : 0;
      const row = y * TILE;

      for (let x = 0; x < 4; x++) {
        const bit = 3 - x;
        pixels[row + x] = lo >> bit & 1 | (lo >> bit + 4 & 1) << 1;
        pixels[row + x + 4] =
        hi >> bit & 1 | (hi >> bit + 4 & 1) << 1;
      }
    }
    return pixels;
  }
  decode16x16(code) {
    const pixels = new Uint8Array(16 * 16);
    const rom = this.spriteRom;
    const base = (code & 0x7f) * 64;

    // MAME spritelayout_bosco:
    //
    // x offsets:
    //   output x= 0.. 3 -> + 8 bytes
    //   output x= 4.. 7 -> +16 bytes
    //   output x= 8..11 -> +24 bytes
    //   output x=12..15 -> + 0 bytes
    //
    // y offsets:
    //   y=0..7  -> +0..7 bytes
    //   y=8..15 -> +32..39 bytes
    const GROUP_OFFSET = BoscoEmulator.SPRITE_GROUP_OFFSET;

    for (let y = 0; y < 16; y++) {
      const rowBase = base + (y < 8 ? y : y + 24);
      const row = y * 16;

      for (let group = 0; group < 4; group++) {var _rom3;
        const value = (_rom3 = rom[rowBase + GROUP_OFFSET[group]]) !== null && _rom3 !== void 0 ? _rom3 : 0;
        const dstX = group * 4;

        for (let bitIndex = 0; bitIndex < 4; bitIndex++) {
          const bit = 3 - bitIndex;

          // Plane 0: bit 0..3.
          // Plane 1: bit 4..7.
          pixels[row + dstX + bitIndex] =
          value >> bit & 1 | (value >> bit + 4 & 1) << 1;
        }
      }
    }

    return pixels;
  }
  blitPen(buf, W, H, rgb, x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;

    const dst = y * W + x << 2;
    buf[dst] = rgb.r;
    buf[dst + 1] = rgb.g;
    buf[dst + 2] = rgb.b;
    buf[dst + 3] = 0xff;
    return true;
  }
  renderTiles(data, W, H) {var _this$lutProm;
    const TILE = 8;
    const flip = !!this.flipScreen;
    const lutValid = ((_this$lutProm = this.lutProm) === null || _this$lutProm === void 0 ? void 0 : _this$lutProm.length) >= 256;
    const buf = data;

    const getTileInfo = (tileIndex, ramOffs) => {
      const attr = this.videoram[ramOffs + tileIndex + 0x800];
      const code = this.videoram[ramOffs + tileIndex];
      const group = attr & 0x3f;
      const rawFlip = attr >> 6 & 0x03;
      const flipX = (rawFlip ^ 0x01) & 0x01;
      const flipY = rawFlip >> 1 & 0x01;
      return { code, color: group, flipX, flipY };
    };

    const plotTile = (
    info,
    drawX,
    drawY,
    clipMinX,
    clipMaxX,
    transparent = false) =>
    {
      const pixels = this.tileCache8x8 ?
      this.tileCache8x8[info.code & 0x1ff] :
      this.decode8x8(this.charRom, info.code);
      const screenFlip = !!this.flipScreen;
      const outX = screenFlip ? W - TILE - drawX : drawX;
      const outY = (screenFlip ? H - TILE - drawY : drawY) - 16;

      const effectiveFlipX = info.flipX ^ screenFlip;
      const effectiveFlipY = info.flipY ^ screenFlip;

      const lutBase = info.color << 2;
      const penRgb = [null, null, null, null];

      for (let pen = 0; pen < 4; pen++) {
        const palettePen = lutValid ?
        this.lutProm[lutBase | pen] & 0x0f :
        (lutBase | pen) & 0x0f;

        if (!transparent || palettePen !== 0x0f) {var _this$palette;
          penRgb[pen] = (_this$palette = this.palette[0x10 + palettePen]) !== null && _this$palette !== void 0 ? _this$palette : null;
        }
      }

      for (let py = 0; py < TILE; py++) {
        const y = outY + py;
        if (y < 0 || y >= H) continue;

        const srcRow = effectiveFlipY ? TILE - 1 - py : py;

        for (let px = 0; px < TILE; px++) {
          const x = outX + px;
          if (x < clipMinX || x > clipMaxX) continue;

          const srcCol = effectiveFlipX ? TILE - 1 - px : px;
          const rgb = penRgb[pixels[srcRow * TILE + srcCol]];
          if (rgb) this.blitPen(buf, W, H, rgb, x, y);
        }
      }
    };

    const bgMinX = flip ? 8 * TILE : 0;
    const bgMaxX = flip ? W - 1 : 28 * TILE - 1;
    const MAP_SIZE = 32 * TILE; // 256 pixels
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        // MAME TILEMAP_SCAN_ROWS: tx + (ty << 5)
        const info = getTileInfo(tx + (ty << 5), 0x400);

        // Normalize base position modulo 256 px so wrap is seamless
        const baseX =
        ((tx * TILE - this.scrollX) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;
        const baseY =
        ((ty * TILE - this.scrollY) % MAP_SIZE + MAP_SIZE) % MAP_SIZE;

        // 2x2 wrapping quadrant offsets
        const wrapX = baseX >= 256 - 32 ? baseX - MAP_SIZE : baseX;
        const wrapY = baseY >= 256 - 32 ? baseY - MAP_SIZE : baseY;

        // Plot primary and all adjacent wrapping instances
        plotTile(info, baseX, baseY, bgMinX, bgMaxX, true);
        plotTile(info, wrapX, baseY, bgMinX, bgMaxX, true);
        plotTile(info, baseX, wrapY, bgMinX, bgMaxX, true);
        plotTile(info, wrapX, wrapY, bgMinX, bgMaxX, true);
      }
    }

    const fgMinX = flip ? 0 : 28 * TILE;
    const fgMaxX = flip ? 8 * TILE - 1 : W - 1;
    const FG_MAP_W = 8 * TILE; // 64 px

    for (let ty = 0; ty < 32; ty++) {
      for (let logicalCol = 0; logicalCol < 8; logicalCol++) {
        const tileIndex = logicalCol + (ty << 5);
        const info = getTileInfo(tileIndex, 0x000);

        // Equivalent to MAME's horizontally repeating 8x32 fg tilemap.
        for (let mapX = 0; mapX < W; mapX += FG_MAP_W) {
          plotTile(
          info,
          mapX + logicalCol * TILE,
          ty * TILE,
          fgMinX,
          fgMaxX,
          false);

        }
      }
    }
  }
  renderSprites(data, W, H) {var _this$spriteLutProm;
    const flipScreen = !!this.flipScreen;
    const lutValid = ((_this$spriteLutProm = this.spriteLutProm) === null || _this$spriteLutProm === void 0 ? void 0 : _this$spriteLutProm.length) >= 256;
    const buf = data;

    const spriteBase = 0x03d4;
    const spriteram = this.videoram.subarray(spriteBase, spriteBase + 0x0c);
    const spriteram2 = this.videoram.subarray(
    spriteBase + 0x0800,
    spriteBase + 0x0800 + 0x0c);


    for (let offs = 0; offs < 0x0c; offs += 2) {
      let sx = spriteram[offs + 1] - 2;
      const sy = 224 - spriteram2[offs];

      let flipX = spriteram[offs] & 1;
      let flipY = spriteram[offs] >>> 1 & 1;
      const color = spriteram2[offs + 1] & 0x3f;
      const code = (spriteram[offs] & 0xfc) >> 2;

      if (flipScreen) sx += 32 - 1;

      const pixels = this.tileCache16x16 ?
      this.tileCache16x16[code & 0x7f] :
      this.decode16x16(code);
      const lutBase = color << 2;
      const penRgb = [null, null, null, null];
      for (let pen = 0; pen < 4; pen++) {var _this$palette$palette;
        const palettePen = this.lutProm[lutBase | pen] & 0x0f;

        penRgb[pen] =
        palettePen === 0x0f ? null : (_this$palette$palette = this.palette[palettePen]) !== null && _this$palette$palette !== void 0 ? _this$palette$palette : null;
      }
      for (let py = 0; py < 16; py++) {
        const srcRow = flipY ? 15 - py : py;
        for (let px = 0; px < 16; px++) {
          const srcCol = flipX ? 15 - px : px;
          const rgb = penRgb[pixels[srcRow * 16 + srcCol]];
          if (!rgb) continue;
          this.blitPen(buf, W, H, rgb, sx + px, sy + py);
        }
      }
    }
  }
  decodeBullet(code) {
    const pixels = new Uint8Array(16);
    const base = (code & 0x07) * 16;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const pen = this.spriteShapeRom[base + row * 4 + col] & 0x07;

        // Exact visible behavior of MAME transmask(..., 0xf0):
        // pens 4, 5, 6, and 7 do not draw.
        pixels[row * 4 + col] = pen < 4 ? pen : 0xff;
      }
    }

    return pixels;
  }
  drawBullets(data, W, H) {
    const flip = !!this.flipScreen;
    const buffer = data;

    const radarBase = 0x03f0;
    const radarx = this.videoram.subarray(radarBase, radarBase + 0x10);
    const radary = this.videoram.subarray(
    radarBase + 0x0800,
    radarBase + 0x0800 + 0x10);


    // Exact MAME loop: offs = 4 through 15.
    // Despite the function name, these are the 12 dot/radar slots
    // drawn by the gfx3 dot generator.
    for (let offs = 4; offs < 0x10; offs++) {
      const attr = this.radarattr[offs];

      // Exact MAME coordinate equations.
      let x = radarx[offs] + ((~attr & 0x01) << 8) - 2;
      let y = 235 - radary[offs];

      if (flip) {
        x -= 1;
        y += 2;
      }

      // Exact MAME shape selection.
      const code = (attr & 0x0e) >> 1 ^ 0x07;
      const pixels = this.tileCacheBullet ?
      this.tileCacheBullet[code & 0x07] :
      this.decodeBullet(code);

      // Exact MAME transmask(..., !flip, !flip, ..., 0xf0).
      // transmask 0xf0 makes pens 4-7 transparent.
      for (let dstY = 0; dstY < 4; dstY++) {
        const srcY = flip ? dstY : 3 - dstY;

        for (let dstX = 0; dstX < 4; dstX++) {
          const srcX = flip ? dstX : 3 - dstX;
          const pen = pixels[srcY * 4 + srcX];

          // MAME transmask(..., 0xf0):
          // binary 11110000 => pen indices 4..7 transparent.
          if (pen >= 4) continue;

          // MAME bosco_palette:
          // dot pen 0 -> indirect color 31
          // dot pen 1 -> indirect color 30
          // dot pen 2 -> indirect color 29
          // dot pen 3 -> indirect color 28.
          const rgb = this.palette[31 - pen];

          // This must be the corrected six-argument call.
          this.blitPen(buffer, W, H, rgb, x + dstX, y + dstY);
        }
      }
    }
  }
  applyRadarShift(data, W, H) {
    const shift = 3;
    const flip = !!this.flipScreen;
    const buf = data;

    const copyPixel = (srcX, dstX, y) => {
      const src = (y * W + srcX) * 4;
      const dst = (y * W + dstX) * 4;

      buf[dst] = buf[src];
      buf[dst + 1] = buf[src + 1];
      buf[dst + 2] = buf[src + 2];
      buf[dst + 3] = 255;
    };

    const clearPixel = (x, y) => {
      const i = (y * W + x) * 4;
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 255;
    };

    for (let y = 0; y < H; y++) {
      if (flip) {
        // Radar occupies 0..63; shift it right to 3..66.
        for (let x = 63; x >= 0; x--) {
          copyPixel(x, x + shift, y);
        }

        for (let x = 0; x < shift; x++) {
          clearPixel(x, y);
        }
      } else {
        // Radar occupies 224..287; shift it left to 221..284.
        for (let x = 224; x < W; x++) {
          copyPixel(x, x - shift, y);
        }

        for (let x = W - shift; x < W; x++) {
          clearPixel(x, y);
        }
      }
    }
  }
  render(ctx) {
    ctx.fillStyle = "rgb(0,0,0)";
    ctx.fillRect(0, 0, 288, 224);
    this.starfield.render(ctx, { flip: !!this.flipScreen });

    // Single ImageData buffer for all pixel-level layers — avoids 4
    // separate getImageData/putImageData round-trips per frame.
    const W = 288,
    H = 224;
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    this.renderSprites(data, W, H);
    this.renderTiles(data, W, H);
    this.drawBullets(data, W, H);
    this.applyRadarShift(data, W, H);

    ctx.putImageData(imgData, 0, 0);
    this.soundChip.flushRegisters();
  }

  initPaletteFromProm() {
    const resistances = [1000, 470, 220];
    const computeWeights = (resList, pulldown = 0) => {
      const n = resList.length;
      const table = new Array(1 << n);
      for (let comb = 0; comb < table.length; comb++) {
        let gOn = 0,
        gTotal = 0;
        for (let j = 0; j < n; j++) {
          const g = 1 / resList[j];
          gTotal += g;
          if (comb >> j & 1) gOn += g;
        }
        if (pulldown > 0) gTotal += 1 / pulldown;
        table[comb] = 5.0 * gOn / gTotal;
      }
      return table;
    };
    const scaleTo255 = tables => {
      let maxv = 0;
      for (const t of tables) for (const v of t) if (v > maxv) maxv = v;
      const scale = maxv > 0 ? 255 / maxv : 0;
      return tables.map(t => t.map(v => Math.round(v * scale)));
    };

    const [rWeights, gWeights, bWeights] = scaleTo255([
    computeWeights(resistances),
    computeWeights(resistances),
    computeWeights(resistances.slice(1))]);


    for (let i = 0; i < 32; i++) {
      const byte = this.masterPaletteProm[i];
      const bit = n => byte >> n & 1;
      const rIdx = bit(0) | bit(1) << 1 | bit(2) << 2;
      const gIdx = bit(3) | bit(4) << 1 | bit(5) << 2;
      const bIdx = bit(6) | bit(7) << 1;
      this.palette[i] = {
        r: rWeights[rIdx],
        g: gWeights[gIdx],
        b: bWeights[bIdx] };

    }

    const [starR, starG, starB] = scaleTo255([
    computeWeights(resistances.slice(1), resistances[0]),
    computeWeights(resistances.slice(1), resistances[0]),
    computeWeights(resistances.slice(1))]);

    for (let i = 0; i < 64; i++) {
      this.palette[32 + i] = {
        r: starR[i & 0x03],
        g: starG[i >> 2 & 0x03],
        b: starB[i >> 4 & 0x03] };

    }
  }
  async loadRoms(progressCallback = null) {
    const { files: romFiles } = this.config.roms;

    if (!Array.isArray(romFiles)) {
      throw new Error("[ROM] config.roms.files must be an array");
    }

    let crc32Table = this.constructor._crc32Table;

    if (!crc32Table) {
      crc32Table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let bit = 0; bit < 8; bit++) {
          c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
        }
        crc32Table[i] = c >>> 0;
      }
      this.constructor._crc32Table = crc32Table;
    }

    const results = await Promise.all(
    romFiles.map(async (file, index) => {
      try {var _file$offset;
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
          `${file.name}: size mismatch, expected ${file.size}, got ${data.length}`);

        }

        let actualCrc = null;

        if (file.crc32) {
          let crc = 0xffffffff;

          for (let i = 0; i < data.length; i++) {
            crc = crc32Table[(crc ^ data[i]) & 0xff] ^ crc >>> 8;
          }

          actualCrc = ((crc ^ 0xffffffff) >>> 0).
          toString(16).
          padStart(8, "0");

          const expectedCrc = String(file.crc32).toLowerCase();

          if (actualCrc !== expectedCrc) {
            throw new Error(
            `${file.name}: CRC mismatch, expected ${expectedCrc}, got ${actualCrc}`);

          }
        }

        const target = file.target ? this[file.target] : null;

        if (!(target instanceof Uint8Array)) {
          throw new Error(
          `${file.name}: no valid Uint8Array target "${file.target}"`);

        }

        const offset = (_file$offset = file.offset) !== null && _file$offset !== void 0 ? _file$offset : 0;

        if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset + data.length > target.length)
        {
          throw new Error(
          `${file.name}: ${file.target} overflow at 0x${offset.toString(
          16)
          }`);

        }

        // Raw byte-for-byte copy. Do not modify graphics ROMs here.
        target.set(data, offset);

        if (file.soundPromRole === "waveform") {var _this$soundChip4, _this$soundChip4$noti;
          (_this$soundChip4 = this.soundChip) === null || _this$soundChip4 === void 0 ? void 0 : (_this$soundChip4$noti = _this$soundChip4.notifyPromLoaded) === null || _this$soundChip4$noti === void 0 ? void 0 : _this$soundChip4$noti.call(_this$soundChip4);
        }

        progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback(index + 1, romFiles.length, file.name);

        return {
          success: true,
          file,
          error: null,
          actualCrc };

      } catch (error) {
        console.error(`[ROM FAIL] ${file.name}`, error);

        return {
          success: false,
          file,
          error,
          actualCrc: null };

      }
    }));


    const failed = results.filter(result => !result.success);
    const failedFiles = failed.map(result => result.file.name);
    const criticalMissing = failed.some(result => result.file.critical);
    const successCount = results.length - failed.length;

    // Runs only after every ROM fetch/copy attempt has completed.
    this.initPaletteFromProm();
    this.buildTileCache();
    if (failed.length > 0) {
      console.warn(
      `[ROM LOAD] ${failed.length}/${results.length} ROM file(s) failed:`,
      failed.map(result => {var _result$file$offset, _result$error$message, _result$error;return {
          name: result.file.name,
          target: result.file.target,
          offset: (_result$file$offset = result.file.offset) !== null && _result$file$offset !== void 0 ? _result$file$offset : 0,
          error: (_result$error$message = (_result$error = result.error) === null || _result$error === void 0 ? void 0 : _result$error.message) !== null && _result$error$message !== void 0 ? _result$error$message : "unknown error" };}));


    }
    if (criticalMissing) {
      console.error("[ROM LOAD] Critical ROM(s) missing:", failedFiles);
    }
    const rom50 = results.find(result => {var _result$file;return ((_result$file = result.file) === null || _result$file === void 0 ? void 0 : _result$file.name) === "50xx.bin";});
    if (rom50 !== null && rom50 !== void 0 && rom50.success) {
      this.movementMcu1.loadROM(this.mcuRom50);
      this.movementMcu2.loadROM(this.mcuRom50);
    } else {
      console.warn(
      "[50XX] 50xx.bin not found — movement MCUs use behavioral fallback");

    }
    const rom51 = results.find(result => {var _result$file2;return ((_result$file2 = result.file) === null || _result$file2 === void 0 ? void 0 : _result$file2.name) === "51xx.bin";});
    if (rom51 !== null && rom51 !== void 0 && rom51.success) {
      this.inputController.loadROM(this.mcuRom51);
    } else {
      console.warn(
      "[51XX] 51xx.bin not found — input controller uses behavioral fallback");

    }
    const rom52 = results.find(result => {var _result$file3;return ((_result$file3 = result.file) === null || _result$file3 === void 0 ? void 0 : _result$file3.name) === "52xx.bin";});
    if (rom52 !== null && rom52 !== void 0 && rom52.success) {
      this.voiceChip.loadROM(this.mcuRom52);
    } else {
      console.warn(
      "[52XX] 52xx.bin not found — voice playback uses behavioral fallback");

    }
    const voiceSamplesLoaded = ["bos1_9.5n", "bos1_10.5m", "bos1_11.5k"].every(
    name => {var _results$find;return (_results$find = results.find(result => {var _result$file4;return ((_result$file4 = result.file) === null || _result$file4 === void 0 ? void 0 : _result$file4.name) === name;})) === null || _results$find === void 0 ? void 0 : _results$find.success;});

    if (voiceSamplesLoaded) {var _this$voiceChip$loadS, _this$voiceChip7;
      (_this$voiceChip$loadS = (_this$voiceChip7 = this.voiceChip).loadSamples) === null || _this$voiceChip$loadS === void 0 ? void 0 : _this$voiceChip$loadS.call(_this$voiceChip7, this.voiceRom);
    } else {
      console.warn(
      "[52XX] Voice sample ROMs incomplete — speech will be silent/fallback");

    }
    const rom54 = results.find(result => {var _result$file5;return ((_result$file5 = result.file) === null || _result$file5 === void 0 ? void 0 : _result$file5.name) === "54xx.bin";});
    if (rom54 !== null && rom54 !== void 0 && rom54.success) {
      this.namco54xx.loadROM(this.mcuRom54);
    } else {
      console.warn("[54XX] 54xx.bin not found — using behavioral fallback");
    }
    return {
      successCount,
      failedFiles,
      criticalMissing };

  }}_defineProperty(BoscoEmulator, "NAMCO52XX_TC_PERIOD_TICKS", Math.round(0.6931471805599453 * (33000 + 2 * 10000) * 0.0047e-6 * BoscoTimingSequencer.MASTER_CLOCK));_defineProperty(BoscoEmulator, "SPRITE_GROUP_OFFSET", [8, 16, 24, 0]);

class BoscoApp {
  constructor() {
    this.config = new EmulatorConfig();
    this.ui = new UIManager(this.config);
    this.input = new InputManager(this.config);
    this.emulator = new BoscoEmulator(this.config);
    this.touchpads = null;
    this.animationId = null;
    this.lastFrameTime = 0;
    this.frameAccum = 0;
    this.fatalError = false;
    this.TARGET_MS = 1000 / this.config.performance.targetFPS;
    this.MAX_DELTA = 100;
    this.MAX_STEPS = 6;
    this.WATCHDOG_WARN = 6;
    this.gameLoop = this.gameLoop.bind(this);
  }
  static formatError(error) {
    if (error instanceof Error) {
      let text = `${error.name}: ${error.message || "(no message)"}`;

      if (error.cause) {
        text += `\nCause: ${BoscoApp.formatError(error.cause)}`;
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
      const details = {};

      for (const key of Object.getOwnPropertyNames(error)) {
        details[key] = String(error[key]);
      }

      return JSON.stringify(details);
    } catch {
      return String(error);
    }
  }
  async init() {var _this$touchpads, _this$config$input$to;
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
    this.input.setupTouchControls(container);
    (_this$touchpads = this.touchpads) === null || _this$touchpads === void 0 ? void 0 : _this$touchpads.destroy();
    this.touchpads = new Touchpads(this.input, {
      deadzone: (_this$config$input$to = this.config.input.touchDeadzone) !== null && _this$config$input$to !== void 0 ? _this$config$input$to : 20,
      dpadRadius: 82,
      ringRadius: 18 });

    this.emulator.soundChip.initAudio();
    return true;
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
      if (stepsRun > 0) {var _this$ui$updateStatus, _this$ui, _ref10, _this$emulator$mainCp, _this$emulator$mainCp2, _this$emulator$mainCp3, _this$emulator$mainCp4, _ref11, _this$emulator$subCpu, _this$emulator$subCpu2, _this$emulator$subCpu3, _this$emulator$subCpu4, _ref12, _this$emulator$sub2Cp, _this$emulator$sub2Cp2, _this$emulator$sub2Cp3, _this$emulator$sub2Cp4;
        const ctx = this.ui.getContext();
        if (!ctx) {
          throw new Error("Canvas context is not initialized");
        }
        this.ui.beginFrame();
        this.emulator.render(ctx);
        this.ui.endFrame();
        (_this$ui$updateStatus = (_this$ui = this.ui).updateStatusBar) === null || _this$ui$updateStatus === void 0 ? void 0 : _this$ui$updateStatus.call(_this$ui, this.emulator.frameCounter, {
          mainPC: (_ref10 = (_this$emulator$mainCp = (_this$emulator$mainCp2 =
          this.emulator.mainCpu) === null || _this$emulator$mainCp2 === void 0 ? void 0 : (_this$emulator$mainCp3 = _this$emulator$mainCp2.getPC) === null || _this$emulator$mainCp3 === void 0 ? void 0 : _this$emulator$mainCp3.call(_this$emulator$mainCp2)) !== null && _this$emulator$mainCp !== void 0 ? _this$emulator$mainCp : (_this$emulator$mainCp4 = this.emulator.mainCpu) === null || _this$emulator$mainCp4 === void 0 ? void 0 : _this$emulator$mainCp4.PC) !== null && _ref10 !== void 0 ? _ref10 : 0,

          subPC: (_ref11 = (_this$emulator$subCpu = (_this$emulator$subCpu2 =
          this.emulator.subCpu) === null || _this$emulator$subCpu2 === void 0 ? void 0 : (_this$emulator$subCpu3 = _this$emulator$subCpu2.getPC) === null || _this$emulator$subCpu3 === void 0 ? void 0 : _this$emulator$subCpu3.call(_this$emulator$subCpu2)) !== null && _this$emulator$subCpu !== void 0 ? _this$emulator$subCpu : (_this$emulator$subCpu4 = this.emulator.subCpu) === null || _this$emulator$subCpu4 === void 0 ? void 0 : _this$emulator$subCpu4.PC) !== null && _ref11 !== void 0 ? _ref11 : 0,

          soundPC: (_ref12 = (_this$emulator$sub2Cp = (_this$emulator$sub2Cp2 =
          this.emulator.sub2Cpu) === null || _this$emulator$sub2Cp2 === void 0 ? void 0 : (_this$emulator$sub2Cp3 = _this$emulator$sub2Cp2.getPC) === null || _this$emulator$sub2Cp3 === void 0 ? void 0 : _this$emulator$sub2Cp3.call(_this$emulator$sub2Cp2)) !== null && _this$emulator$sub2Cp !== void 0 ? _this$emulator$sub2Cp : (_this$emulator$sub2Cp4 = this.emulator.sub2Cpu) === null || _this$emulator$sub2Cp4 === void 0 ? void 0 : _this$emulator$sub2Cp4.PC) !== null && _ref12 !== void 0 ? _ref12 : 0 });

        if (this.emulator.watchdogTimer >= this.WATCHDOG_WARN) {var _this$ui$showWarning, _this$ui2;
          (_this$ui$showWarning = (_this$ui2 = this.ui).showWarning) === null || _this$ui$showWarning === void 0 ? void 0 : _this$ui$showWarning.call(_this$ui2,
          "Watchdog nearing timeout — CPU may be stalled");

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

    this.emulator.running = true;

    this.lastFrameTime = performance.now();
    this.frameAccum = 0;

    this.animationId = requestAnimationFrame(this.gameLoop);
  }
  stop() {
    this.emulator.running = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  reset({ restart = true } = {}) {
    this.stop();

    this.fatalError = false;
    this.frameAccum = 0;
    this.lastFrameTime = 0;

    this.emulator.reset();

    if (restart) {
      this.start();
    }
  }
  abort(error) {var _this$emulator$frameC, _this$emulator, _this$ui$showError, _this$ui3;
    if (this.fatalError) {
      return;
    }

    this.fatalError = true;
    this.stop();

    const message = BoscoApp.formatError(error);

    const frame = (_this$emulator$frameC = (_this$emulator = this.emulator) === null || _this$emulator === void 0 ? void 0 : _this$emulator.frameCounter) !== null && _this$emulator$frameC !== void 0 ? _this$emulator$frameC : 0;

    const displayText = `FATAL ERROR — frame ${frame}\n${message}`;

    console.error("[JSBosco] FATAL:", {
      frame,
      error,
      message,
      stack: error instanceof Error ? error.stack : null });


    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = displayText;
      statusBar.className = "error";
    }

    (_this$ui$showError = (_this$ui3 = this.ui).showError) === null || _this$ui$showError === void 0 ? void 0 : _this$ui$showError.call(_this$ui3, displayText);
  }}


let app = null;
window.JSBosco = {
  get app() {
    return app;
  },

  get emulator() {var _app$emulator, _app;
    return (_app$emulator = (_app = app) === null || _app === void 0 ? void 0 : _app.emulator) !== null && _app$emulator !== void 0 ? _app$emulator : null;
  },

  start() {var _app2;
    (_app2 = app) === null || _app2 === void 0 ? void 0 : _app2.start();
  },

  stop() {var _app3;
    (_app3 = app) === null || _app3 === void 0 ? void 0 : _app3.stop();
  },

  reset() {var _app4;
    (_app4 = app) === null || _app4 === void 0 ? void 0 : _app4.reset({ restart: true });
  },

  resetStopped() {var _app5;
    (_app5 = app) === null || _app5 === void 0 ? void 0 : _app5.reset({ restart: false });
  } };

async function initApp() {
  try {var _app6, _app7, _app7$touchpads, _app8, _app8$input, _app8$input$destroy;
    (_app6 = app) === null || _app6 === void 0 ? void 0 : _app6.stop();
    (_app7 = app) === null || _app7 === void 0 ? void 0 : (_app7$touchpads = _app7.touchpads) === null || _app7$touchpads === void 0 ? void 0 : _app7$touchpads.destroy();
    (_app8 = app) === null || _app8 === void 0 ? void 0 : (_app8$input = _app8.input) === null || _app8$input === void 0 ? void 0 : (_app8$input$destroy = _app8$input.destroy) === null || _app8$input$destroy === void 0 ? void 0 : _app8$input$destroy.call(_app8$input);

    app = new BoscoApp();

    const initialized = await app.init();

    if (initialized) {
      app.start();
    }
  } catch (error) {
    console.error("[JSBosco] Initialization failed:", error);

    if (app) {
      app.abort(error);
      return;
    }

    const text = BoscoApp.formatError(error);

    const statusBar = document.getElementById("statusBar");

    if (statusBar) {
      statusBar.textContent = `FATAL ERROR: ${text}`;

      statusBar.className = "error";
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void initApp(), {
    once: true });

} else {
  void initApp();
}
