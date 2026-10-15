// Edit this table in CodePen; save the same script.js to GitHub when ready.
// source = verified provenance notes, not editable CPU hooks.
// Brightness/lineGlow: 0–4. fillOpacity: 0–1 or a percentage string.
import { Battlezone } from "./runtime.js?v=20261015-object-styles";

export const OBJECTS = {
  unclassified: {
    source: {},
    color: "green", brightness: 1, lineGlow: 0.35,
    fillSupported: false, fillOpacity: 0
  },
  mountains: {
    source: {"cpu":["0x58a7"]},
    color: "purple", brightness: 0.8, lineGlow: 0.25,
    fillSupported: false, fillOpacity: 0
  },
  horizon: {
    source: {"cpu":["0x5806"]},
    color: "darkPurple", brightness: 0.8, lineGlow: 0.3,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15
  },
  moon: {
    source: {"vectorROM":["0x3054–0x30c3"]},
    color: "blue", brightness: 0.9, lineGlow: 0.4,
    fillSupported: false, fillOpacity: 0
  },
  obstacle: {
    source: {"cpu":["0x5c5c"],"types":["0x00","0x01","0x0c","0x0f"]},
    color: "orange", brightness: 0.9, lineGlow: 0.3,
    fillSupported: true, fillOpacity: 0.32
  },
  crosshair: {
    source: {"cpu":["0x50ff"]},
    color: "red", brightness: 1.15, lineGlow: 0.55,
    fillSupported: false, fillOpacity: 0
  },
  volcanoSpark: {
    source: {"cpu":["0x589e"]},
    color: "red", brightness: 1.25, lineGlow: 0.7,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15
  },
  tank: {
    source: {"cpu":["0x5c5c"],"types":["0x02","0x04–0x0b","0x0d","0x21"]},
    color: "green", brightness: 1, lineGlow: 0.35,
    fillSupported: false, fillOpacity: 0
  },
  playerLives: {
    source: {"cpu":["0x6d3c"]},
    color: "green", brightness: 1, lineGlow: 0.35,
    fillSupported: false, fillOpacity: 0
  },
  projectile: {
    source: {"types":["0x03","0x0e"]},
    color: "green", brightness: 1, lineGlow: 0.35,
    fillSupported: false, fillOpacity: 0
  },
  debris: {
    source: {"types":["0x10–0x1d","0x24–0x2b"],"note":"Missile and logo types take precedence."},
    color: "green", brightness: 0.95, lineGlow: 0.3,
    fillSupported: false, fillOpacity: 0
  },
  missile: {
    source: {"types":["0x16"]},
    color: "green", brightness: 1.15, lineGlow: 0.55,
    fillSupported: false, fillOpacity: 0
  },
  logo: {
    source: {"types":["0x17","0x1e","0x1f"]},
    color: "blue", brightness: 1, lineGlow: 0.4,
    fillSupported: false, fillOpacity: 0
  },
  saucer: {
    source: {"types":["0x20"]},
    color: "green", brightness: 1.05, lineGlow: 0.5,
    fillSupported: false, fillOpacity: 0
  },
  hudRadar: {
    source: {"cpu":["0x6ae9"]},
    color: "green", brightness: 0.9, lineGlow: 0.3,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15
  },
  radarSweep: {
    source: {"cpu":["0x6b34"]},
    color: "green", brightness: 1.2, lineGlow: 0.9,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15
  },
  radarTicks: {
    source: {"vectorROM":["0x3542","0x3548","0x354e","0x355c"]},
    color: "green", brightness: 0.9, lineGlow: 0.3,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15
  },
  enemyBlip: {
    source: {"cpu":["0x6c33"]},
    color: "red", brightness: 1.2, lineGlow: 1,
    fillSupported: false, fillOpacity: 0, displayIntensity: 15, ringRadius: 8
  },
  score: {
    source: {"cpu":["0x6d59"]},
    color: "red", brightness: 0.8, lineGlow: 0.25,
    fillSupported: false, fillOpacity: 0
  },
  highScore: {
    source: {"cpu":["0x6d6c"]},
    color: "orange", brightness: 1.05, lineGlow: 0.4,
    fillSupported: false, fillOpacity: 0
  },
  enemyInRange: {
    source: {"cpu":["0x6c98"],"text":["0x10"]},
    color: "lightOrange", brightness: 1.05, lineGlow: 0.45,
    fillSupported: false, fillOpacity: 0
  },
  enemyDirection: {
    source: {"cpu":["0x6c98"],"text":["0x00","0x02","0x04","0x06"]},
    color: "lightOrange", brightness: 1.05, lineGlow: 0.45,
    fillSupported: false, fillOpacity: 0
  },
  motionBlocked: {
    source: {"cpu":["0x6c98"],"text":["0x12"]},
    color: "lightOrange", brightness: 1.05, lineGlow: 0.45,
    fillSupported: false, fillOpacity: 0
  },
};

const game = new Battlezone();
await game.init();
game.setObjectStyles(OBJECTS);
window.battlezone = game;
game.run();

// Live console edits (also work while paused):
// battlezone.setObjectStyle('obstacle', {color:'magenta', brightness:1.2, lineGlow:1, fillOpacity:'25%'});
// battlezone.exportObjectStyles() returns the complete current table as JSON.
