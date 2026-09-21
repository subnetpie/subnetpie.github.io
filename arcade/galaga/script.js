import { Z80 } from "../../cpu/z80.js";
import { Namco06XX } from "../../chips/Namco06XX.js";
import { Namco51XX } from "../../chips/Namco51XX.js";
import { Namco54XX } from "../../chips/Namco54XX.js";
import { NamcoWSG } from "../../chips/NamcoWSG.js";
import { Namco54xxDac } from "../../audio/Namco54xxDac.js";
import { EmulatorAudioWorklet } from "../../audio/EmulatorAudioWorklet.js";
import { MB88xx, MB8843, MB8844 } from "../../chips/MB88xx.js";

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

    this.soundChip = new NamcoWSG({ waveformProm: this.waveProm });
    this.audio = new EmulatorAudioWorklet({ gain: this.config.audio.masterVolume });
    this.audioSampleFraction = 0;
    this.namco54xxDac = new Namco54xxDac({ sampleRate: this.soundChip.sampleRate });
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
    const audioStartTick = this.timing.now;
    this.timing.runFrame();
    const audioEndTick = this.timing.now;
    this.renderAudioFrame(audioStartTick, audioEndTick);
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
    this.audioSampleFraction = 0;
    this.audio.clear();
    this.namco54xxDac.reset();

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

  renderAudioFrame(startTick, endTick) {
    if (!this.audio.ready || endTick <= startTick) return;
    this.audioSampleFraction +=
      (endTick - startTick) * this.soundChip.sampleRate / TimingSequencer.MASTER_CLOCK;
    const count = Math.floor(this.audioSampleFraction);
    this.audioSampleFraction -= count;
    if (!count) return;

    const wsg = new Float32Array(count);
    const dac54 = new Float32Array(count);
    this.soundChip.renderMono(wsg);
    this.namco54xxDac.render(dac54, startTick, endTick);
    // MAME Galaga routes the Namco WSG at 0.25 and the 54XX discrete\n    // network at 0.90. Namco54xxDac already applies its discrete route gain.\n    for (let i = 0; i < count; i++) wsg[i] = wsg[i] * 0.25 + dac54[i];
    this.audio.push(wsg, this.soundChip.sampleRate);
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
        text += `
Cause: ${GalagaApp.formatError(error.cause)}`;
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

    const unlockAudio = () => {
      this.emulator.audio.unlock()
        .then(() => {
          this.emulator.audio.setEnabled(this.config.audio.enabled !== false);
          this.emulator.namco54xx.syncOutputs();
        })
        .catch((error) => console.warn("[Galaga audio] unlock failed:", error));
    };
    const resumeAudio = () => this.emulator.audio.resume();
    // Same browser interaction path used by the working Pac-Man frontend.
    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio, { passive: true });
    document.addEventListener("mousedown", resumeAudio);

    // Expose enough state to diagnose iOS audio without coupling the machine
    // devices to WebAudio.
    const audioStatus = () => ({
      ready: this.emulator.audio.ready,
      contextState: this.emulator.audio.context?.state ?? "not-created",
      contextSampleRate: this.emulator.audio.context?.sampleRate ?? 0,
      machineSampleRate: this.emulator.soundChip.sampleRate,
      enabled: this.emulator.audio.enabled,
      frame: this.emulator.frameCounter
    });
    window.galagaAudioStatus = audioStatus;

    // iPhone/Safari has no convenient on-device console. A four-finger tap
    // displays the same diagnostics in the existing status bar.
    document.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 4) return;
      const status = audioStatus();
      const statusBar = document.getElementById("statusBar");
      if (statusBar) {
        statusBar.textContent =
          "AUDIO " + (status.ready ? "READY" : "NOT READY") +
          " | ctx=" + status.contextState +
          " " + status.contextSampleRate + "Hz" +
          " | machine=" + status.machineSampleRate + "Hz" +
          " | enabled=" + status.enabled +
          " | frame=" + status.frame;
      }
    }, { passive: true });

    const audioDiag = document.createElement("button");
    audioDiag.id = "galaga54Diag";
    audioDiag.type = "button";
    audioDiag.title = "Tap to copy the recent 54XX command/DAC trace";
    audioDiag.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;" +
      "padding:5px;border:0;background:#111;color:#0f0;font:11px monospace;" +
      "text-align:center;white-space:pre-wrap;max-height:26vh;overflow:auto";
    document.body.appendChild(audioDiag);
    const traceText = () => {
      const d = this.emulator.namco54xxDac;
      const chip = this.emulator.namco54xx;
      const lines = chip?.dumpTrace?.().split("\\n").slice(-18) ?? [];
      return "54XX writes=" + d.totalWrites +
        " ch=" + Array.from(d.channelWrites).join("/") +
        " nz=" + Array.from(d.nonzeroWrites).join("/") +
        " data=" + Array.from(d.channelData).join("/") +
        " peak=" + d.lastPeak.toFixed(4) +
        " hold=" + d.peakHold.toFixed(4) +
        "\\nTap this panel to copy trace\\n" + lines.join("\\n");
    };
    audioDiag.addEventListener("click", async () => {
      const text = this.emulator.namco54xx?.dumpTrace?.() ?? "";
      try {
        await navigator.clipboard.writeText(text);
        audioDiag.dataset.copied = "1";
      } catch {
        // iOS may deny Clipboard API outside a secure/allowed context.
        // A prompt provides a selectable fallback without requiring Web Inspector.
        window.prompt("Copy 54XX trace:", text);
      }
    });
    setInterval(() => {
      audioDiag.textContent = traceText();
      if (audioDiag.dataset.copied === "1") {
        audioDiag.textContent = "COPIED 54XX TRACE\\n" + audioDiag.textContent;
        delete audioDiag.dataset.copied;
      }
    }, 250);

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

    // start() may run automatically after page load, before Safari grants
    // audio activation. If a context already exists, resume it here; otherwise
    // the user-gesture handlers installed by init() will create it.
    void this.emulator.audio.resume();

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

    const displayText = `FATAL ERROR — frame ${frame}
${message}`;

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
