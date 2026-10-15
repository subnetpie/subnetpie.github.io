// Shared chip classes
import { M6502 } from "https://subnetpie.github.io/cpu/m6502.js";
import { PokeyAudio, POKEY_CLOCK } from "https://subnetpie.github.io/arcade/bzone/pokey-audio.js?v=20260930-mame289";
import { PokeyRandom } from "https://subnetpie.github.io/arcade/bzone/pokey-random.js";

// Game object attributes
export const OBJECTS = {
  unclassified: {
    source: {},
    color: "green",
    brightness: 1,
    lineGlow: 0.35,
  },
  mountains: {
    source: {
      cpu: ["0x58a7"],
    },
    color: "purple",
    brightness: 0.8,
    lineGlow: 0.25,
  },
  horizon: {
    source: {
      cpu: ["0x5806"],
    },
    color: "darkPurple",
    brightness: 0.8,
    lineGlow: 0.3,
    displayIntensity: 15,
  },
  moon: {
    source: {
      vectorROM: ["0x3054–0x30c3"],
    },
    color: "blue",
    brightness: 0.9,
    lineGlow: 0.4,
  },
  obstacle: {
    source: {
      cpu: ["0x5c5c"],
      types: ["0x00", "0x01", "0x0c", "0x0f"],
    },
    color: "orange",
    brightness: 0.9,
    lineGlow: 0.3,
    fillOpacity: 0.32,
    fill: true,
  },
  crosshair: {
    source: {
      cpu: ["0x50ff"],
    },
    color: "red",
    brightness: 1.15,
    lineGlow: 0.55,
  },
  volcanoSpark: {
    source: {
      cpu: ["0x589e"],
    },
    color: "red",
    brightness: 1.25,
    lineGlow: 0.7,
    displayIntensity: 15,
  },
  tank: {
    source: {
      cpu: ["0x5c5c"],
      types: ["0x02", "0x04–0x0b", "0x0d", "0x21"],
    },
    color: "green",
    brightness: 1,
    lineGlow: 0.35,
    coordinateSpace: "world",
  },
  playerLives: {
    source: {
      cpu: ["0x6d3c"],
    },
    color: "green",
    brightness: 1,
    lineGlow: 0.35,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  projectile: {
    source: {
      types: ["0x03", "0x0e"],
    },
    color: "green",
    brightness: 1,
    lineGlow: 0.35,
    coordinateSpace: "world",
  },
  debris: {
    source: {
      types: ["0x10–0x1d", "0x24–0x2b"],
      note: "Missile and logo types take precedence.",
    },
    color: "green",
    brightness: 0.95,
    lineGlow: 0.3,
    coordinateSpace: "world",
  },
  missile: {
    source: {
      types: ["0x16"],
    },
    color: "green",
    brightness: 1.15,
    lineGlow: 0.55,
    coordinateSpace: "world",
  },
  logo: {
    source: {
      types: ["0x17", "0x1e", "0x1f"],
    },
    color: "blue",
    brightness: 1,
    lineGlow: 0.4,
    coordinateSpace: "hud",
  },
  saucer: {
    source: {
      types: ["0x20"],
    },
    color: "green",
    brightness: 1.05,
    lineGlow: 0.5,
    coordinateSpace: "world",
  },
  hudRadar: {
    source: {
      cpu: ["0x6ae9"],
    },
    color: "green",
    brightness: 0.9,
    lineGlow: 0.3,
    displayIntensity: 15,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  radarSweep: {
    source: {
      cpu: ["0x6b34"],
    },
    color: "green",
    brightness: 1.2,
    lineGlow: 0.9,
    displayIntensity: 15,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  radarTicks: {
    source: {
      vectorROM: ["0x3542", "0x3548", "0x354e", "0x355c"],
    },
    color: "green",
    brightness: 0.9,
    lineGlow: 0.3,
    displayIntensity: 15,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  enemyBlip: {
    source: {
      cpu: ["0x6c33"],
    },
    color: "red",
    brightness: 1.2,
    lineGlow: 1,
    displayIntensity: 15,
    ringRadius: 8,
    originalColor: "red",
    coordinateSpace: "hud",
    primitive: "point",
  },
  score: {
    source: {
      cpu: ["0x6d59"],
    },
    color: "red",
    brightness: 0.8,
    lineGlow: 0.25,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  highScore: {
    source: {
      cpu: ["0x6d6c"],
    },
    color: "orange",
    brightness: 1.05,
    lineGlow: 0.4,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  enemyInRange: {
    source: {
      cpu: ["0x6c98"],
      text: ["0x10"],
    },
    color: "lightOrange",
    brightness: 1.05,
    lineGlow: 0.45,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  enemyDirection: {
    source: {
      cpu: ["0x6c98"],
      text: ["0x00", "0x02", "0x04", "0x06"],
    },
    color: "lightOrange",
    brightness: 1.05,
    lineGlow: 0.45,
    originalColor: "red",
    coordinateSpace: "hud",
  },
  motionBlocked: {
    source: {
      cpu: ["0x6c98"],
      text: ["0x12"],
    },
    color: "lightOrange",
    brightness: 1.05,
    lineGlow: 0.45,
    originalColor: "red",
    coordinateSpace: "hud",
  },
};

const CPU_CLOCK = 12096000 / 8,
  IRQ_HZ = 12096000 / 4096 / 12,
  FPS = IRQ_HZ / 6,
  W = 580,
  H = 400;
// MAME 0.289 DIP banks: 3 tanks; 1 coin / 1 play, x1 coin multipliers, no bonus coins.
const DSW0 = 0x15,
  DSW1 = 0x02;
const s16 = (v) => ((v & 65535) ^ 32768) - 32768;

// Presentation defaults derived from the object table
const ASSETS = Object.freeze(
  Object.fromEntries(
    Object.entries(OBJECTS).map(([name, rule]) => [
      name,
      { ...rule, glow: rule.lineGlow },
    ]),
  ),
);

// Battlezone rev 2 semantic provenance. See ASSETS.md for ROM/source evidence.

export function shapeAsset(type) {
  if ([0, 1, 0x0c, 0x0f].includes(type)) return "obstacle";
  if (
    type === 2 ||
    type === 0x21 ||
    (type >= 4 && type <= 0x0b) ||
    type === 0x0d
  )
    return "tank";
  if (type === 3 || type === 0x0e) return "projectile";
  if (type === 0x16) return "missile";
  if ([0x17, 0x1e, 0x1f].includes(type)) return "logo";
  if (type === 0x20) return "saucer";
  if ((type >= 0x10 && type <= 0x1d) || (type >= 0x24 && type <= 0x2b))
    return "debris";
  return "unclassified";
}

export const PALETTE = Object.freeze({
  green: "rgb(80,255,80)",
  purple: "rgb(190,70,255)",
  darkPurple: "rgb(95,30,140)",
  orange: "rgb(255,145,35)",
  lightOrange: "rgb(255,190,105)",
  red: "rgb(255,45,45)",
  blue: "rgb(70,135,255)",
});
const bounded = (value, fallback, max) =>
  Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
export function assetStyle(asset, sourceIntensity, overrides = {}, colorized = true) {
  const name = Object.hasOwn(ASSETS, asset) ? asset : "unclassified";
  const defaults = ASSETS[name];
  const style = { ...defaults, ...overrides[name] };
  const source = bounded(sourceIntensity, 0, 15);
  return {
    asset: name,
    color: colorized
      ? (style.color ?? defaults.color)
      : (defaults.originalColor ?? "green"),
    brightness: colorized
      ? bounded(style.brightness, defaults.brightness, 4)
      : 1,
    glow: colorized ? bounded(style.glow, defaults.glow, 4) : 0.35,
    coordinateSpace: defaults.coordinateSpace ?? "world",
    displayIntensity: colorized
      ? bounded(style.displayIntensity, source, 15)
      : source,
    fillOpacity: colorized ? bounded(style.fillOpacity, 0, 1) : 0,
    ringRadius: colorized ? bounded(style.ringRadius, 0, 32) : 0,
    primitive: defaults.primitive ?? null,
  };
}

// Supported live presentation edits; provenance and original-mode behavior stay
// separate from appearance. Null displayIntensity restores the ROM intensity.

export class AssetTrace {
  constructor(mem) {
    this.mem = mem;
    this.bytes = new Array(0x1000).fill(null);
    this.scopes = [];
    this.serial = 0;
    // Fail closed for another ROM revision: these CPU hooks are revision-specific.
    let hash = 2166136261;
    for (const [start, end] of [
      [0x3000, 0x4000],
      [0x5000, 0x8000],
    ])
      for (let a = start; a < end; a++)
        hash = Math.imul(hash ^ mem[a], 16777619) >>> 0;
    this.enabled = hash === 0x1056a217;
  }

  beforeStep(cpu) {
    if (!this.enabled) return;
    const pc = cpu.pc & 0x7fff;
    // Both return PC and SP must match, including across NMI interruptions.
    while (this.scopes.length) {
      const top = this.scopes.at(-1);
      if (pc !== top.end || cpu.s !== top.sp) break;
      this.scopes.pop();
    }
    let asset,
      fields = {},
      end,
      sp;
    if (pc === 0x6d3c) {
      // DrawScoreLives: isolate the extra-player tank icons before score drawing begins.
      asset = "playerLives";
      fields = { record: 0x00cc };
      end = 0x6d59;
      sp = cpu.s;
    } else if (pc === 0x5c5c) {
      const slot = this.mem[0x10],
        type = cpu.a;
      asset = shapeAsset(type);
      fields = {
        slot: slot >>> 1,
        record: 0x270 + slot,
        type,
        shape: this.mem[0x7472 + type * 2] | (this.mem[0x7473 + type * 2] << 8),
      };
    } else if (pc === 0x6ae9) {
      asset = "hudRadar";
    } else if (
      pc === 0x6b34 &&
      this.scopes.at(-1)?.origin.asset === "hudRadar"
    ) {
      asset = "radarSweep";
      end = 0x6b37;
      sp = cpu.s;
    } else if (
      pc === 0x6c33 &&
      this.scopes.at(-1)?.origin.asset === "hudRadar"
    ) {
      // Two VgDrawPoint calls emit the contact, then return to radar/text drawing.
      asset = "enemyBlip";
      end = 0x6c3b;
      sp = cpu.s;
      fields = { radarStrength: Math.min(1, this.mem[0x02e9] / 0xf0) };
    } else if (pc === 0x6d59 || pc === 0x6d6c) {
      // One scope includes the label, fixed zeroes, and changing BCD digits.
      asset = pc === 0x6d59 ? "score" : "highScore";
      fields = {
        record: pc === 0x6d59 ? 0xb8 : 0x300,
        textId: pc === 0x6d59 ? 0x18 : 0x0e,
      };
      end = pc === 0x6d59 ? 0x6d6c : 0x6d8e;
      sp = cpu.s;
    } else if (pc === 0x6c98) {
      if (["score", "highScore"].includes(this.scopes.at(-1)?.origin.asset))
        return;
      // Direction strings comprise a shared prefix and a separate suffix.
      asset =
        cpu.x === 0x10
          ? "enemyInRange"
          : cpu.x === 0x12
            ? "motionBlocked"
            : [0, 2, 4, 6].includes(cpu.x)
              ? "enemyDirection"
              : "unclassified";
      fields = { textId: cpu.x };
    } else if (pc === 0x58a7) {
      asset = "mountains";
      fields = { segment: (cpu.a & 14) >>> 1 };
    } else if (pc === 0x5806) {
      asset = "horizon";
      end = 0x5809;
      sp = cpu.s;
    } else if (pc === 0x50ff) {
      asset = "crosshair";
      end = 0x5102;
      sp = cpu.s;
    } else if (pc === 0x589e) {
      asset = "volcanoSpark";
      fields = { slot: this.mem[8], record: 0x34d + this.mem[8] };
      end = 0x58a1;
      sp = cpu.s;
    } else return;
    if (end === undefined) {
      const lo = this.mem[0x100 | ((cpu.s + 1) & 255)];
      const hi = this.mem[0x100 | ((cpu.s + 2) & 255)];
      end = ((lo | (hi << 8)) + 1) & 0x7fff;
      sp = (cpu.s + 2) & 255;
    }
    const origin = Object.freeze({
      id: ++this.serial,
      asset,
      cpuPC: pc,
      ...fields,
    });
    this.scopes.push({ end, sp, origin });
  }

  write(address) {
    // Overwrite even with null, so recycled display-list RAM cannot retain tags.
    this.bytes[address - 0x2000] = this.scopes.at(-1)?.origin ?? null;
  }

  instruction(pc, inherited) {
    if (!this.enabled) return null;
    if (pc < 0x1000) return this.bytes[pc];
    // MTN0 contains a complete embedded moon, not a separate AVG subroutine.
    // Atari BZMTNS.MAC explicitly marks MOON through END OF MOON here.
    if (inherited?.asset === "mountains" && pc >= 0x1054 && pc < 0x10c4)
      return { ...inherited, asset: "moon", parentAsset: "mountains" };
    // AVG fetch tags the high byte; normalize to the instruction's word address.
    // The four short compass strokes are static ROM vectors, not enemy contacts.
    const tick = { 0x1542: "3", 0x1548: "6", 0x154e: "9", 0x155c: "12" }[
      pc & ~1
    ];
    if (inherited?.asset === "hudRadar" && tick)
      return {
        ...inherited,
        asset: "radarTicks",
        parentAsset: "hudRadar",
        clockPosition: tick,
      };
    return inherited;
  }
  styleInstruction(origin, primitive) {
    if (!this.enabled) return primitive;
    const dx = (primitive?.x2 ?? 0) - (primitive?.x1 ?? 0);
    const dy = (primitive?.y2 ?? 0) - (primitive?.y1 ?? 0);
    const length =
      Number.isFinite(dx) && Number.isFinite(dy)
        ? Math.hypot(dx, dy)
        : Infinity;
    const asset = origin?.asset ?? "unclassified";
    const style = assetStyle(asset, primitive?.intensity);
    return {
      ...primitive,
      asset: style.asset,
      color: style.color,
      brightness: style.brightness,
      glow: style.glow,
      coordinateSpace: style.coordinateSpace,
      primitiveStyle: style.primitive,
      displayIntensity: style.displayIntensity,
      length,
    };
  }
}

// Only known game identities can be styled. CPU/AVG hooks remain in AssetTrace.
const STYLE_KEYS = new Set([
  "source",
  "color",
  "brightness",
  "lineGlow",
  "fill",
  "fillOpacity",
  "displayIntensity",
  "ringRadius",
  "originalColor",
  "coordinateSpace",
  "primitive",
]);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function number(value, name, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new TypeError(`${name} must be a finite number from 0 to ${max}`);
  return value;
}
function opacity(value) {
  if (
    typeof value === "string" &&
    /^\s*(?:\d+(?:\.\d+)?|\.\d+)\s*%\s*$/.test(value)
  )
    value = Number(value.replace("%", "")) / 100;
  return number(value, "fillOpacity", 1);
}
export function compileObjectStyles(objects) {
  if (!objects || typeof objects !== "object" || Array.isArray(objects))
    throw new TypeError("OBJECTS must be an object");
  const result = {};
  for (const [name, rule] of Object.entries(objects)) {
    if (!own(ASSETS, name)) throw new TypeError(`Unknown game object: ${name}`);
    if (!rule || typeof rule !== "object" || Array.isArray(rule))
      throw new TypeError(`Invalid rule: ${name}`);
    for (const key of Object.keys(rule))
      if (!STYLE_KEYS.has(key))
        throw new TypeError(`Unknown setting ${name}.${key}`);
    if (
      rule.source !== undefined &&
      (!rule.source ||
        typeof rule.source !== "object" ||
        Array.isArray(rule.source))
    )
      throw new TypeError("source must be provenance metadata");
    const style = {};
    if (rule.color !== undefined) {
      if (typeof rule.color !== "string" || !rule.color.trim())
        throw new TypeError(
          "color must be a nonempty CSS color or palette name",
        );
      style.color = rule.color;
    }
    if (rule.brightness !== undefined)
      style.brightness = number(rule.brightness, "brightness", 4);
    if (rule.lineGlow !== undefined)
      style.glow = number(rule.lineGlow, "lineGlow", 4);
    if (rule.displayIntensity !== undefined)
      style.displayIntensity =
        rule.displayIntensity === null
          ? null
          : number(rule.displayIntensity, "displayIntensity", 15);
    if (rule.ringRadius !== undefined)
      style.ringRadius = number(rule.ringRadius, "ringRadius", 32);
    // Capability comes from existing geometry support, never from a caller's claim.
    const capable = name === "obstacle";
    if (rule.fill !== undefined && typeof rule.fill !== "boolean")
      throw new TypeError("fill must be boolean");
    if ((own(rule, "fill") || own(rule, "fillOpacity")) && !capable)
      throw new TypeError(`Fill geometry is not supported for ${name}`);
    const fill =
      rule.fillOpacity === undefined
        ? (ASSETS[name].fillOpacity ?? 0)
        : opacity(rule.fillOpacity);
    if (fill > 0 && !capable)
      throw new TypeError(`Fill geometry is not supported for ${name}`);
    style.fillOpacity = rule.fill === false ? 0 : fill;
    result[name] = style;
  }
  return result;
}
export function patchObjectStyle(objects, name, patch) {
  if (!own(objects, name)) throw new TypeError(`Unknown game object: ${name}`);
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new TypeError("Style patch must be an object");
  if (own(patch, "source"))
    throw new TypeError(
      "source is provenance metadata; change verified hooks in AssetTrace",
    );
  const next = structuredClone(objects);
  next[name] = { ...next[name], ...patch };
  compileObjectStyles(next); // Validate the full result before replacing live settings.
  return next;
}

// Unique hardware and sound classes
// Atari Battlezone mathbox. Extracted without arithmetic changes.
class Mathbox {
  constructor() {
    this.r = new Int16Array(16);
    this.result = 0;
  }
  set(i, v) {
    this.r[i] = s16(v);
    return this.r[i];
  }
  go(o, d) {
    let r = this.r;
    o &= 31;
    d &= 255;
    const lo = (i) => this.set(i, (r[i] & 0xff00) | d),
      hi = (i) => this.set(i, (r[i] & 255) | (d << 8));
    switch (o) {
      case 0:
      case 2:
      case 4:
      case 6:
      case 8:
        this.result = lo(o >> 1);
        return;
      case 1:
      case 3:
      case 5:
      case 7:
      case 9:
        this.result = hi(o >> 1);
        return;
      case 10:
        this.result = lo(5);
        return;
      case 12:
        this.result = this.set(6, d);
        return;
      case 21:
        this.result = lo(7);
        return;
      case 22:
        this.result = hi(7);
        return;
      case 26:
        this.result = lo(8);
        return;
      case 27:
        this.result = hi(8);
        return;
      case 13:
        this.result = lo(10);
        return;
      case 14:
        this.result = hi(10);
        return;
      case 15:
        this.result = lo(11);
        return;
      case 16:
        this.result = hi(11);
        return;
      case 23:
        this.result = r[7];
        return;
      case 25:
        this.result = r[8];
        return;
      case 24:
        this.result = r[9];
        return;
      case 11:
        hi(5);
        this.set(15, -1);
        this.set(4, r[4] - r[2]);
        this.set(5, r[5] - r[3]);
        this.mulA();
        return;
      case 17:
        hi(5);
        this.set(15, 0);
        this.mulA();
        return;
      case 18:
        this.mulB();
        return;
      case 19:
        this.divide(r[9], r[8]);
        return;
      case 20:
        this.divide(r[10], r[11]);
        return;
      case 28:
        hi(5);
        do {
          this.set(14, (r[4] + r[7]) >> 1);
          this.set(15, (r[5] + r[8]) >> 1);
          if (r[11] < r[14] && r[15] < r[14] && s16(r[14] + r[15]) >= 0) {
            this.set(7, r[14]);
            this.set(8, r[15]);
          } else {
            this.set(4, r[14]);
            this.set(5, r[15]);
          }
        } while (this.set(6, r[6] - 1) >= 0);
        this.result = r[8];
        return;
      case 29:
        hi(3);
        this.set(2, r[2] - r[0]);
        if (r[2] < 0) this.set(2, -r[2]);
        this.set(3, r[3] - r[1]);
        if (r[3] < 0) this.set(3, -r[3]);
      case 30:
        if (r[3] >= r[2]) {
          this.set(12, r[2]);
          this.set(13, r[3]);
        } else {
          this.set(13, r[2]);
          this.set(12, r[3]);
        }
        this.set(12, r[12] >> 2);
        this.set(13, r[13] + r[12]);
        this.set(12, r[12] >> 1);
        this.result = this.set(13, r[12] + r[13]);
        return;
    }
  }
  mulA() {
    let r = this.r,
      t,
      q;
    t = (r[0] * r[4]) | 0;
    this.set(12, t >> 16);
    this.set(14, t);
    t = (-r[1] * r[5]) | 0;
    this.set(7, t >> 16);
    q = s16(t);
    this.set(7, r[7] + r[12]);
    this.set(14, (r[14] >> 1) & 32767);
    this.set(12, (q >> 1) & 32767);
    q = s16(r[12] + r[14]);
    if (q < 0) this.set(7, r[7] + 1);
    this.result = r[7];
    if (r[15] < 0) return;
    this.set(7, r[7] + r[2]);
    this.mulB();
  }
  mulB() {
    let r = this.r,
      t,
      q;
    t = (r[1] * r[4]) | 0;
    this.set(12, t >> 16);
    this.set(9, t);
    t = (r[0] * r[5]) | 0;
    this.set(8, t >> 16);
    q = s16(t);
    this.set(8, r[8] + r[12]);
    this.set(9, (r[9] >> 1) & 32767);
    this.set(12, (q >> 1) & 32767);
    this.set(9, r[9] + r[12]);
    if (r[9] < 0) this.set(8, r[8] + 1);
    this.set(9, r[9] << 1);
    this.result = r[8];
    if (r[15] < 0) return;
    this.set(8, r[8] + r[3]);
    this.set(9, r[9] & 0xff00);
    this.divide(r[9], r[8]);
  }
  divide(c, q) {
    let r = this.r,
      qq = s16(q);
    this.set(14, r[7] ^ qq);
    this.set(13, qq);
    if (qq >= 0) qq = s16(c);
    else {
      this.set(13, -qq - 1);
      qq = s16(-c - 1);
      if (qq < 0 && s16(qq + 1) < 0) this.set(13, r[13] + 1);
      qq = s16(qq + 1);
    }
    this.set(12, r[7] >= 0 ? r[7] : -r[7]);
    this.set(15, r[6]);
    do {
      this.set(13, r[13] - r[12]);
      let msb = qq & 32768;
      qq = s16(qq << 1);
      if (r[13] >= 0) qq = s16(qq + 1);
      else this.set(13, r[13] + r[12]);
      this.set(13, r[13] << 1);
      this.set(13, r[13] + (msb ? 1 : 0));
    } while (this.set(15, r[15] - 1) >= 0);
    this.result = s16(r[14] >= 0 ? qq : -qq);
  }
  lo() {
    return this.result & 255;
  }
  hi() {
    return (this.result >> 8) & 255;
  }
}

// SPDX-License-Identifier: BSD-3-Clause
// MAME 0.289 bzone_a.cpp circuit port, default R11 adjustment = 40% (49 kohm).
// Original copyright: Couriersud; discrete primitives: K.Wilkins, Derrick Renaud.
const parallel = (a, b) => 1 / (1 / a + 1 / b);
const exp = (dt, rc) => 1 - Math.exp(-dt / rc);
class NoiseEnvelope {
  constructor(dt, c) {
    this.cap = 0;
    this.out = 0;
    this.drop = 23270 / 23540;
    this.charge = exp(dt, 270 * c);
    this.discharge = exp(dt, 23270 * c);
    this.both = exp(dt, parallel(270, 23270) * c);
    this.filter = exp(dt, 330000 * 4.7e-9);
    this.gain = [
      1 + 330000 / 43000,
      1 + 330000 / (parallel(270, 33000) + 10000),
    ];
  }
  step(gate, noise, loud) {
    if (gate)
      this.cap +=
        ((noise ? 5 * this.drop : 5) - this.cap) *
        (noise ? this.both : this.charge);
    else if (noise) this.cap -= this.cap * this.discharge;
    const v = noise
      ? Math.min(20.5, ((this.cap * this.drop) / 23) * this.gain[loud])
      : 0;
    this.out += (v - this.out) * this.filter;
    return this.out;
  }
}
export class BattlezoneDiscrete {
  constructor(sampleRate) {
    this.dt = 1 / sampleRate;
    this.latch = 0;
    this.noiseReg = 0;
    this.noisePhase = 0;
    this.noise31 = 0;
    this.noise34 = 0;
    this.nand = 0;
    this.shell = new NoiseEnvelope(this.dt, 4.7e-6);
    this.explosion = new NoiseEnvelope(this.dt, 10e-6);
    this.cv = 0;
    this.cap = 0;
    this.ff = 1;
    this.vco = 0;
    this.count4 = 0;
    this.count6 = 0;
    this.counterClock = 0;
    this.engine = 0;
    this.coupling = 0;
    this.cvSlow = exp(this.dt, 100000 * 10e-6);
    this.cvFast = exp(this.dt, parallel(100000, 22000) * 10e-6);
    this.engineAlpha = exp(this.dt, 8250 * 0.47e-6);
    this.outputAlpha = exp(this.dt, 100000 * 0.1e-6);
    this.chargeRC = 149000 * 15e-9;
    this.dischargeRC = 49000 * 15e-9;
    this.chargeAlpha = exp(this.dt, this.chargeRC);
    this.dischargeAlpha = exp(this.dt, this.dischargeRC);
    this.mixR =
      1 / (1 / 100000 + 1 / 100000 + 1 / 41250 + 1 / 330000 + 1 / 22000);
  }
  oscillator() {
    if (this.cv < 0.25) return this.vco;
    const threshold = this.cv,
      trigger = threshold / 2;
    let ff = this.ff,
      v = this.cap,
      dt = this.dt,
      changes = 0,
      updated = false;
    if (v >= threshold) {
      ff = 0;
      changes++;
    } else if (v <= trigger) {
      ff = 1;
      changes++;
    }
    do {
      let next;
      if (ff) {
        next =
          v + (5 - v) * (updated ? exp(dt, this.chargeRC) : this.chargeAlpha);
        dt = 0;
        if (next >= threshold) {
          dt = this.chargeRC * Math.log(1 / (1 - (next - threshold) / (5 - v)));
          next = threshold;
          ff = 0;
          changes++;
          updated = true;
        }
      } else {
        next =
          v - v * (updated ? exp(dt, this.dischargeRC) : this.dischargeAlpha);
        dt = 0;
        if (next <= trigger) {
          if (next < trigger)
            dt = this.dischargeRC * Math.log(1 / (1 - (trigger - next) / v));
          next = trigger;
          ff = 1;
          changes++;
          updated = true;
        }
      }
      v = next;
    } while (dt > 0);
    this.cap = v;
    this.vco = changes >= 2 ? 1 - this.ff : ff;
    this.ff = ff;
    return this.vco;
  }
  step(pokeyVoltage = 0) {
    const d = this.latch;
    this.noisePhase += 6000 * this.dt;
    const oldBit = (this.noiseReg >>> 15) & 1,
      oldNand = this.nand;
    while (this.noisePhase >= 1) {
      this.noisePhase -= 1;
      this.noiseReg =
        ((this.noiseReg << 1) |
          (1 ^ (((this.noiseReg >>> 3) ^ (this.noiseReg >>> 14)) & 1))) &
        65535;
    }
    if (!oldBit && this.noiseReg & 32768) this.noise31 ^= 1;
    this.nand = (this.noiseReg & 0x7800) === 0x7800 ? 0 : 1;
    if (!oldNand && this.nand) this.noise34 ^= 1;
    // MAME 0.289 deliberately wires BOTH loud/soft filter inputs to D1, not D3.
    const shell = this.shell.step(d & 4, this.noise31, (d >>> 1) & 1);
    const explosion = this.explosion.step(d & 1, this.noise34, (d >>> 1) & 1);
    const r = d & 16 ? parallel(1270, 4700) : 4700;
    const diff = (5 * r) / (1000 + r) - this.cv;
    this.cv += diff * (diff > 0.5 ? this.cvFast : this.cvSlow);
    const clock = this.oscillator();
    if (!(d & 128)) this.count4 = this.count6 = 0;
    else {
      if (!this.counterClock && clock) {
        this.count4++;
        if (this.count4 > 15) this.count4 = 4;
        this.count6++;
        if (this.count6 > 15) this.count6 = 6;
      }
      this.counterClock = clock;
    }
    const taps =
      (this.count4 > 7) +
      (this.count4 === 15) +
      (this.count6 > 7) +
      (this.count6 === 15);
    this.engine += (taps / 4 - this.engine) * this.engineAlpha;
    if (!(d & 32)) return 0; // mixer capacitor holds charge while disabled
    const mix =
      (shell / 100000 +
        explosion / 100000 +
        (this.engine * 3.4) / 41250 +
        pokeyVoltage / 330000) *
      this.mixR;
    this.coupling += (mix - this.coupling) * this.outputAlpha;
    return ((mix - this.coupling) * 48000) / 32768;
  }
}

// CPU-timestamped synthesis. Browser callbacks only drain the produced samples;
// they never run an independent sound clock or discard register-write timing.
export class BzoneAudio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.reg = new Uint8Array(16);
    this.latch = 0;
    this.queue = new Float32Array(16384);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.count = 0;
    this.primed = false;
  }
  start() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.pokey = new PokeyAudio();
      this.discrete = new BattlezoneDiscrete(this.ctx.sampleRate);
      for (let r = 0; r < 16; r++)
        if (r !== 9) this.pokey.write(r, this.reg[r]);
      this.pokey.write(9, 0);
      this.discrete.latch = this.latch;
      this.audioCycle = this.game.cpu?.cycles ?? 0;
      this.samplePhase = 0;
      this.sampleSum = 0;
      this.sampleClocks = 0;
      this.node = this.ctx.createScriptProcessor(1024, 0, 1);
      this.node.onaudioprocess = (e) =>
        this.render(e.outputBuffer.getChannelData(0));
      this.node.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended" || this.ctx.state === "interrupted")
      this.ctx.resume().catch(() => {});
  }
  read(r) {
    return (r & 15) === 8 ? this.game.in3() : this.reg[r & 15];
  }
  write(r, d) {
    this.sync();
    r &= 15;
    d &= 255;
    this.reg[r] = d;
    this.pokey?.write(r, d);
  }
  control(d) {
    this.sync();
    this.latch = d & 255;
    if (this.discrete) this.discrete.latch = this.latch;
  }
  sync(cycle = this.game.cpu?.cycles ?? 0) {
    if (!this.ctx) return;
    while (this.audioCycle < cycle) {
      this.audioCycle++;
      this.sampleSum += this.pokey.step();
      this.sampleClocks++;
      this.samplePhase += this.ctx.sampleRate;
      if (this.samplePhase < POKEY_CLOCK) continue;
      this.samplePhase -= POKEY_CLOCK;
      const sample = this.discrete.step(this.sampleSum / this.sampleClocks);
      this.sampleSum = 0;
      this.sampleClocks = 0;
      if (this.count === this.queue.length) {
        this.readIndex = (this.readIndex + 1) % this.queue.length;
        this.count--;
      }
      this.queue[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.queue.length;
      this.count++;
    }
  }
  render(out) {
    out.fill(0);
    if (this.game.paused) {
      this.count = 0;
      this.readIndex = this.writeIndex;
      this.primed = false;
      return;
    }
    // Two callback blocks cushion the 41 Hz emulation frame boundary.
    if (!this.primed) {
      if (this.count < out.length * 2) return;
      this.primed = true;
    }
    for (let i = 0; i < out.length; i++) {
      if (!this.count) {
        this.primed = false;
        break;
      }
      out[i] = this.queue[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.queue.length;
      this.count--;
    }
  }
}

// Vector rendering
const clamp = (v) => Math.max(0, Math.min(1, v));
function colorValue(name) {
  const value = PALETTE[name] ?? name;
  if (typeof value !== "string") return PALETTE.green;
  // CSS.supports accepts named/hex/rgb/hsl colors in browsers. Explicit fallback
  // prevents invalid settings from accidentally reusing the previous asset's ink.
  if (globalThis.CSS?.supports)
    return CSS.supports("color", value) ? value : PALETTE.green;
  return (
    PALETTE[name] ??
    (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value) ? value : PALETTE.green)
  );
}
export function vectorStyle(vector, settings = {}, colorized = true) {
  const style = assetStyle(vector[8]?.asset, vector[4], settings, colorized);
  const signal = colorized
    ? clamp(vector[8]?.radarStrength ?? 1) *
      clamp(vector[8]?.trailStrength ?? 1)
    : 1;
  return {
    ...style,
    glow: style.glow * signal,
    ink: colorValue(style.color),
    alpha: (style.displayIntensity / 15) * style.brightness * signal,
    width: 0.75 + style.displayIntensity / 20,
  };
}
function hull(points) {
  const unique = new Map();
  for (const p of points) unique.set(p.join(","), p);
  const p = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return [];
  const cross = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lo = [],
    hi = [];
  for (const q of p) {
    while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
export function renderVectors(ctx, vectors, options = {}) {
  const { width = 580, height = 400, colorized = true, settings = {} } = options;
  // Resolve settings once per frame. Cached AVG tuple style fields are diagnostic
  // snapshots only: edits take effect even while emulation is paused.
  const prepared = [];
  for (const v of vectors) {
    if (v[4] <= 0 || !v.slice(0, 4).every(Number.isFinite)) continue;
    const style = vectorStyle(v, settings, colorized);
    if (style.alpha > 0) prepared.push({ v, style });
  }
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round";
  const groups = new Map();
  for (const { v, style } of prepared) {
    if (style.fillOpacity <= 0 || v[8]?.id == null) continue;
    const key = style.asset + ":" + v[8].id;
    if (!groups.has(key)) groups.set(key, { points: [], style, alpha: 0 });
    const group = groups.get(key);
    group.points.push([v[0], v[1]], [v[2], v[3]]);
    group.alpha = Math.max(group.alpha, style.alpha);
  }
  for (const { points, style, alpha } of groups.values()) {
    const polygon = hull(points);
    if (polygon.length < 3) continue;
    ctx.fillStyle = style.ink;
    ctx.globalAlpha = clamp(alpha * style.fillOpacity);
    ctx.beginPath();
    ctx.moveTo(...polygon[0]);
    for (const p of polygon.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
  // Fill narrow angular slices between observed sweep positions. The slices
  // share edges, producing a continuous fan instead of disconnected spokes.
  for (const { v, style: s } of prepared) {
    const edge = v[8]?.trailEdge;
    if (!edge || s.glow === 0) continue;
    const strength = v[8].trailStrength,
      next = v[8].trailNextStrength ?? strength;
    const steps = 16;
    ctx.fillStyle = s.ink;
    for (let i = 0; i < steps; i++) {
      const a = i / steps,
        b = (i + 1) / steps;
      const fade = strength + ((next - strength) * (a + b)) / 2;
      ctx.globalAlpha = clamp(
        (s.alpha / Math.max(strength, 1e-9)) *
          fade *
          0.38 *
          (s.glow / Math.max(strength, 1e-9) / 0.9),
      );
      ctx.beginPath();
      ctx.moveTo(v[0], v[1]);
      ctx.lineTo(v[2] + (edge[0] - v[2]) * a, v[3] + (edge[1] - v[3]) * a);
      ctx.lineTo(v[2] + (edge[0] - v[2]) * b, v[3] + (edge[1] - v[3]) * b);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (const [spread, gain] of [
    [7, 0.035],
    [4, 0.09],
    [2, 0.24],
    [1, 1],
  ]) {
    for (const { v, style: s } of prepared) {
      if (v[8]?.trailEdge) continue;
      const halo = spread > 1;
      if (halo && s.glow === 0) continue;
      ctx.globalAlpha = clamp(s.alpha * gain * (halo ? s.glow / 0.35 : 1));
      ctx.strokeStyle = ctx.fillStyle = s.ink;
      ctx.lineWidth = s.width * spread * (halo ? 0.65 + s.glow : 1);
      ctx.beginPath();
      if (v[0] === v[2] && v[1] === v[3]) {
        ctx.arc(v[0], v[1], ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(v[0], v[1]);
        ctx.lineTo(v[2], v[3]);
        ctx.stroke();
      }
    }
  }
  // The same resolved ink/alpha/glow controls endpoint dwell and point bloom.
  for (const { v, style: s } of prepared) {
    if (v[8]?.trailEdge) continue;
    const points =
      v[0] === v[2] && v[1] === v[3]
        ? [[v[0], v[1]]]
        : [
            [v[0], v[1]],
            [v[2], v[3]],
          ];
    for (const halo of [true, false]) {
      if (halo && s.glow === 0) continue;
      ctx.fillStyle = s.ink;
      ctx.globalAlpha = clamp(s.alpha * (halo ? (0.12 * s.glow) / 0.35 : 0.65));
      const radius = (s.width / 2) * (halo ? 1 + 2 * s.glow : 1.1);
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(...p, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // One expanding contact ring per point, despite the ROM drawing it twice.
  const rings = new Set();
  if (colorized)
    for (const { v, style: s } of prepared) {
      if (!s.ringRadius || !s.glow || v[0] !== v[2] || v[1] !== v[3]) continue;
      const key = s.asset + ":" + v[0] + ":" + v[1];
      if (rings.has(key)) continue;
      rings.add(key);
      const signal = clamp(v[8]?.radarStrength ?? 1);
      const radius = 2 + (1 - signal) * s.ringRadius;
      ctx.save();
      ctx.strokeStyle = s.ink;
      ctx.shadowColor = s.ink;
      ctx.shadowBlur = 4 * s.glow;
      ctx.globalAlpha = clamp(s.alpha * 0.45);
      ctx.lineWidth = 0.65 + s.glow * 0.5;
      ctx.beginPath();
      ctx.arc(v[0], v[1], radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  ctx.restore();
}

// Only the sweep has persistence. No compass ticks, text or world geometry are
// retained. Use emulated seconds so pause and repeated settings redraws freeze it.
export class RadarPersistence {
  constructor() {
    this.history = [];
    this.lastVectors = null;
    this.lastTime = 0;
  }
  clear() {
    this.history = [];
    this.lastVectors = null;
  }
  vectors(vectors, time, colorized = true) {
    if (!colorized || time < this.lastTime) {
      this.clear();
      this.lastTime = time;
      return vectors;
    }
    this.lastTime = time;
    const sweeps = vectors.filter((v) => v[8]?.asset === "radarSweep");
    if (!sweeps.length) {
      this.clear();
      return vectors;
    }
    this.history = this.history.filter((entry) => time - entry.time < 0.24);
    if (vectors !== this.lastVectors) {
      this.history.push({ time, vectors: sweeps });
      this.lastVectors = vectors;
      if (this.history.length > 24) this.history.shift();
    }
    const trails = [];
    for (let i = 0; i < this.history.length - 1; i++) {
      const entry = this.history[i],
        next = this.history[i + 1],
        age = time - entry.time;
      if (age <= 0) continue;
      for (let j = 0; j < entry.vectors.length; j++) {
        const v = entry.vectors[j],
          end = next.vectors[j];
        if (!end || Math.hypot(v[0] - end[0], v[1] - end[1]) > 1) continue;
        const ghost = v.slice();
        ghost[8] = {
          ...v[8],
          trailStrength: Math.exp(-age / 0.09),
          trailNextStrength: Math.exp(-(time - next.time) / 0.09),
          trailEdge: [end[2], end[3]],
        };
        trails.push(ghost);
      }
    }
    return [...trails, ...vectors];
  }
}

export class JSbzone {
  constructor() {
    this.cv = document.querySelector("#gameCanvas");
    this.cx = this.cv.getContext("2d");
    this.cv.width = W;
    this.cv.height = H;
    this.mem = new Uint8Array(32768);
    this.math = new Mathbox();
    this.pokeyRandom = new PokeyRandom();
    this.i = { coin1: 0, start1: 0, fire: 0, lu: 0, ld: 0, ru: 0, rd: 0 };
    this.sound = 0;
    this.audio = new BzoneAudio(this);
    this.avgDone = 1;
    this.vectors = [];
    this.colorized = true;
    this.assetSettings = {};
    this.paused = false;
    this.bind();
  }
  async rom(n) {
    const r = await fetch(
      "https://subnetpie.github.io/arcade/bzone-old/roms/" + n,
    );
    if (!r.ok) throw Error("ROM " + n);
    return new Uint8Array(await r.arrayBuffer());
  }
  async init() {
    const files = [
        "036408-01.k7",
        "036414-02.e1",
        "036413-01.h1",
        "036412-01.j1",
        "036411-01.k1",
        "036410-01.lm1",
        "036409-01.n1",
        "036422-01.bc3",
        "036421-01.a3",
      ],
      a = Object.fromEntries(
        await Promise.all(files.map(async (n) => [n, await this.rom(n)])),
      );
    [
      ["036414-02.e1", 20480],
      ["036413-01.h1", 22528],
      ["036412-01.j1", 24576],
      ["036411-01.k1", 26624],
      ["036410-01.lm1", 28672],
      ["036409-01.n1", 30720],
      ["036422-01.bc3", 12288],
      ["036421-01.a3", 14336],
    ].forEach(([n, o]) => this.mem.set(a[n], o));
    this.avgProm = a["036408-01.k7"];
    this.assetTrace = new AssetTrace(this.mem);
    this.cpu = new M6502(
      (x) => this.read(x),
      (x, d) => this.write(x, d),
    );
    this.cpu.reset();
  }
  in0() {
    let v = 255;
    if (this.i.coin1) v &= 254;
    if (this.avgDone) v |= 64;
    else v &= 191;
    if (this.cpu.cycles & 256) v |= 128;
    else v &= 127;
    return v;
  }
  in3() {
    let v = 0;
    if (this.i.rd) v |= 1;
    if (this.i.ru) v |= 2;
    if (this.i.ld) v |= 4;
    if (this.i.lu) v |= 8;
    if (this.i.fire) v |= 16;
    if (this.i.start1) v |= 32;
    return v;
  }
  read(a) {
    a &= 32767;
    if (a < 1024) return this.mem[a];
    if (a === 2048) return this.in0();
    if (a === 2560) return DSW0;
    if (a === 3072) return DSW1;
    if (a === 6144) return 0;
    if (a === 6160) return this.math.lo();
    if (a === 6168) return this.math.hi();
    if (a === 0x182a) return this.pokeyRandom.read(this.cpu?.cycles ?? 0);
    if (a >= 6176 && a <= 6191) return this.audio.read(a & 15);
    if (a >= 8192) return this.mem[a];
    return 255;
  }
  write(a, d) {
    a &= 32767;
    d &= 255;
    if (a < 1024) {
      this.mem[a] = d;
      return;
    }
    if (a === 4608) {
      this.runAVG();
      return;
    }
    if (a === 5632) {
      this.avgDone = 1;
      return;
    }
    if (a >= 6176 && a <= 6191) {
      this.pokeyRandom.write(a & 15, d, this.cpu?.cycles ?? 0);
      this.audio.write(a & 15, d);
      return;
    }
    if (a === 6208) {
      this.sound = d;
      this.audio.control(d);
      return;
    }
    if (a >= 6240 && a <= 6271) {
      this.math.go(a - 6240, d);
      return;
    }
    if (a >= 8192 && a < 12288) {
      this.mem[a] = d;
      this.assetTrace?.write(a);
    }
  }
  word(pc) {
    const a = 8192 + (pc & 8191);
    return this.mem[a] | (this.mem[(a + 1) & 32767] << 8);
  }
  runAVG() {
    this.avgDone = 0;
    let pc = 0,
      sp = 0,
      dvx = 0,
      dvy = 0,
      data = 0,
      state = 0,
      scale = 0,
      intensity = 0,
      op = 0,
      dvy12 = 0,
      timer = 0,
      intLatch = 0,
      binScale = 0,
      halt = 0;
    let x = 290 << 16,
      y = 200 << 16,
      hst = 0,
      lst = 0,
      clip = [0, 0, W << 16, H << 16],
      steps = 0,
      out = [],
      stack = new Uint16Array(4);
    const bit = (n) => (op >> n) & 1;
    const rd = () => this.mem[0x2000 + (pc ^ 1)];
    let origin = null,
      callOrigin = null,
      instructionPC = 0;
    const originStack = new Array(4).fill(null);
    const point = (nx, ny, z) => {
      let x1 = x / 65536,
        y1 = y / 65536,
        x2 = nx / 65536,
        y2 = ny / 65536;
      if (z > 0) {
        const primitive = {
          x1,
          y1,
          x2,
          y2,
          intensity: z,
          visible: true,
          isMove: false,
        };
        const styled = this.assetTrace?.styleInstruction
          ? this.assetTrace.styleInstruction(origin, primitive)
          : primitive;
        const asset = styled.asset ?? origin?.asset ?? "unclassified";
        const vectorOrigin = origin
          ? { ...origin, asset }
          : Object.freeze({ asset });
        out.push([
          x1,
          y1,
          x2,
          y2,
          z,
          clip.slice(),
          styled.color ?? ASSETS[asset]?.color ?? ASSETS.unclassified.color,
          instructionPC,
          vectorOrigin,
          styled.brightness ?? ASSETS[asset]?.brightness ?? 1,
          styled.glow ?? ASSETS[asset]?.glow ?? 0.35,
          styled.displayIntensity ?? ASSETS[asset]?.displayIntensity ?? z,
        ]);
      }
      x = nx;
      y = ny;
    };
    while (steps++ < 200000 && !halt) {
      state =
        (state & 0x10) |
        (this.avgProm[(((state >> 4) ^ 1) << 7) | (op << 4) | (state & 15)] &
          15);
      if (state & 8) {
        data = rd();
        switch (state & 7) {
          case 0:
            dvy = (dvy & 0x1f00) | data;
            pc = (pc + 1) & 0x1fff;
            break;
          case 1:
            instructionPC = pc;
            origin = this.assetTrace.instruction(pc, callOrigin);
            if (!hst) {
              clip[2] = x;
              clip[1] = y;
            }
            if (!lst) {
              clip[0] = x;
              clip[3] = y;
            }
            lst = hst = 1;
            dvy12 = (data >> 4) & 1;
            op = data >> 5;
            intLatch = 0;
            dvy = (dvy12 << 12) | ((data & 15) << 8);
            dvx = 0;
            pc = (pc + 1) & 0x1fff;
            break;
          case 2:
            dvx = (dvx & 0x1f00) | data;
            pc = (pc + 1) & 0x1fff;
            break;
          case 3:
            intLatch = data >> 4;
            dvx = ((intLatch & 1) << 12) | ((data & 15) << 8) | (dvx & 255);
            pc = (pc + 1) & 0x1fff;
            break;
          case 4:
            if (bit(0)) {
              stack[sp & 3] = pc;
              originStack[sp & 3] = callOrigin;
            } else {
              let i = 0;
              while (
                ((dvy ^ (dvy << 1)) & 0x1000) === 0 &&
                ((dvx ^ (dvx << 1)) & 0x1000) === 0 &&
                i++ < 16
              ) {
                dvy = (dvy & 0x1000) | ((dvy << 1) & 0x1fff);
                dvx = (dvx & 0x1000) | ((dvx << 1) & 0x1fff);
                timer = (timer >>> 1) | 0x4000 | (bit(1) << 7);
              }
              if (bit(1)) timer &= 255;
            }
            break;
          case 5:
            if (!bit(2)) {
              for (let i = binScale; i > 0; i--)
                timer = (timer >>> 1) | 0x4000 | (bit(1) << 7);
              if (bit(1)) timer &= 255;
            }
            if (bit(2)) sp = (sp + (bit(1) ? 15 : 1)) & 15;
            break;
          case 6:
            if (!bit(2) && !dvy12) {
              intensity = (dvy >> 4) & 15;
              if (!(dvy & 0x400)) {
                lst = dvy & 0x200;
                hst = lst ^ 0x200;
              }
            }
            if (bit(2)) {
              if (bit(0)) {
                pc = (dvy << 1) & 0x1fff;
                callOrigin = origin;
              } else {
                pc = stack[sp & 3];
                callOrigin = originStack[sp & 3];
              }
            } else if (dvy12) {
              scale = dvy & 255;
              binScale = (dvy >> 8) & 7;
            }
            break;
          case 7: {
            halt = bit(0);
            if (!bit(0) && !bit(2)) {
              let cycles = bit(1) ? 0x100 - (timer & 255) : 0x8000 - timer;
              timer = 0;
              let nx =
                x +
                Math.trunc(
                  ((((dvx >> 3) ^ 0x200) - 0x200) * cycles * (scale ^ 255)) /
                    16,
                );
              let ny =
                y -
                Math.trunc(
                  ((((dvy >> 3) ^ 0x200) - 0x200) * cycles * (scale ^ 255)) /
                    16,
                );
              let z = intLatch >> 1 === 1 ? intensity : intLatch & 14;
              point(nx, ny, z);
              x = nx;
              y = ny;
            } else if (bit(2)) {
              timer = 0;
              x = 290 << 16;
              y = 200 << 16;
            }
            break;
          }
        }
      }
      state = (halt << 4) | (state & 15);
    }
    this.vectors = out;
    this.avgDone = 1;
    this.draw();
  }
  setObjectStyles(objects) {
    const compiled = compileObjectStyles(objects);
    this.objectStyles = structuredClone(objects);
    this.assetSettings = structuredClone(compiled);
    this.draw();
    return this;
  }
  setObjectStyle(asset, patch) {
    const next = patchObjectStyle(this.objectStyles, asset, patch);
    return this.setObjectStyles(next);
  }
  exportObjectStyles() {
    return JSON.stringify(this.objectStyles, null, 2);
  }
  draw() {
    this.radarPersistence ??= new RadarPersistence();
    const vectors = this.radarPersistence.vectors(
      this.vectors,
      (this.cpu?.cycles ?? 0) / CPU_CLOCK,
      this.colorized,
    );
    renderVectors(this.cx, vectors, {
      width: W,
      height: H,
      colorized: this.colorized,
      settings: this.assetSettings,
    });
  }
  frame() {
    this.nextIRQ ??= this.cpu.cycles;
    for (let n = 0; n < 6; n++) {
      this.nextIRQ += CPU_CLOCK / IRQ_HZ;
      while (this.cpu.cycles < this.nextIRQ) {
        this.assetTrace.beforeStep(this.cpu);
        this.cpu.step();
      }
      this.cpu.nmi();
    }
    this.audio.sync();
    if (!this.vectors.length) this.draw();
  }
  run() {
    let last = null,
      accumulated = 0;
    const period = 1000 / FPS;
    const loop = (t) => {
      if (last === null) last = t;
      const elapsed = Math.max(0, Math.min(100, t - last));
      last = t;
      if (this.paused) accumulated = 0;
      else {
        accumulated += elapsed;
        while (accumulated >= period) {
          this.frame();
          accumulated -= period;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  bind() {
    const colorToggle = document.querySelector("#colorToggle"),
      pauseToggle = document.querySelector("#pauseToggle");
    if (colorToggle) {
      colorToggle.onclick = (e) => {
        e.preventDefault();
        this.colorized = !this.colorized;
        colorToggle.textContent = this.colorized ? "COLORIZED" : "ORIGINAL";
        this.draw();
      };
    }
    if (pauseToggle) {
      pauseToggle.onclick = (e) => {
        e.preventDefault();
        this.paused = !this.paused;
        pauseToggle.textContent = this.paused ? "RUN" : "PAUSE";
        if (this.paused) {
          this.i.fire = this.i.lu = this.i.ld = this.i.ru = this.i.rd = 0;
        }
      };
    }
    let lastTouch = 0;
    document.addEventListener(
      "touchend",
      (e) => {
        if (!e.target.closest("#top,.tank-controls")) return;
        const now = Date.now();
        if (now - lastTouch < 350) e.preventDefault();
        lastTouch = now;
      },
      { passive: false },
    );
    const unlock = () => this.audio.start();
    addEventListener("pointerdown", unlock, { passive: true });
    addEventListener("touchstart", unlock, { passive: true });
    addEventListener("keydown", unlock);
    const set = (n, v) => (this.i[n] = v),
      pulse = (n) => {
        set(n, 1);
        setTimeout(() => set(n, 0), 140);
      },
      km = { KeyQ: "lu", KeyA: "ld", KeyE: "ru", KeyD: "rd", Space: "fire" };
    addEventListener("keydown", (e) => {
      if (km[e.code]) set(km[e.code], 1);
      if (e.code === "Digit1") pulse("start1");
      if (e.code === "Digit5") pulse("coin1");
    });
    addEventListener("keyup", (e) => km[e.code] && set(km[e.code], 0));
    document.querySelectorAll("[data-btn]").forEach((el) => {
      let n = el.dataset.btn;
      el.onpointerdown = (e) => {
        e.preventDefault();
        this.audio.start();
        n === "coin1" || n === "start1" ? pulse(n) : set(n, 1);
      };
      el.onpointerup = () => set(n, 0);
    });
    const controlPointers = new Set(),
      tapPointers = new Map(),
      TAP_MOVE = 12,
      TAP_MS = 350,
      fireDown = (e) => {
        if (e.pointerType !== "touch") return;
        if (e.target.closest("#top,.tank-controls")) {
          controlPointers.add(e.pointerId);
          tapPointers.delete(e.pointerId);
          return;
        }
        if (controlPointers.has(e.pointerId)) return;
        e.preventDefault();
        this.audio.start();
        tapPointers.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
          t: performance.now(),
          moved: false,
        });
      },
      fireMove = (e) => {
        const tap = tapPointers.get(e.pointerId);
        if (!tap) return;
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_MOVE) {
          tap.moved = true;
        }
      },
      fireUp = (e) => {
        if (controlPointers.delete(e.pointerId)) {
          tapPointers.delete(e.pointerId);
          return;
        }
        const tap = tapPointers.get(e.pointerId);
        tapPointers.delete(e.pointerId);
        if (!tap || tap.moved || performance.now() - tap.t > TAP_MS) return;
        pulse("fire");
      },
      fireCancel = (e) => {
        controlPointers.delete(e.pointerId);
        tapPointers.delete(e.pointerId);
      };
    document.addEventListener("pointerdown", fireDown, { passive: false });
    document.addEventListener("pointermove", fireMove, { passive: true });
    document.addEventListener("pointerup", fireUp);
    document.addEventListener("pointercancel", fireCancel);
    const stick = (id, up, down) => {
      let el = document.querySelector(id),
        knob = el.querySelector(".stick-knob"),
        move = (e) => {
          let r = el.getBoundingClientRect(),
            half = r.height / 2,
            y = e.clientY - r.top - half,
            max = half - knob.offsetHeight / 2 - 6,
            pos = Math.max(-max, Math.min(max, y));
          knob.style.transition = "none";
          knob.style.transform = "translateY(calc(-50% + " + pos + "px))";
          set(up, y < -12);
          set(down, y > 12);
        },
        release = () => {
          set(up, 0);
          set(down, 0);
          knob.style.transition = "transform .12s ease-out";
          knob.style.transform = "translateY(-50%)";
        };
      el.onpointerdown = (e) => {
        e.preventDefault();
        this.audio.start();
        el.setPointerCapture(e.pointerId);
        move(e);
      };
      el.onpointermove = (e) => el.hasPointerCapture(e.pointerId) && move(e);
      el.onpointerup = release;
      el.onpointercancel = release;
    };
    stick("#leftStick", "lu", "ld");
    stick("#rightStick", "ru", "rd");
  }
}

// Main
const game = new JSbzone();
await game.init();
game.setObjectStyles(OBJECTS);
window.bzone = game;
game.run();
