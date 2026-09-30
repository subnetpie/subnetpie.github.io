const machineParam = new URLSearchParams(location.search).get("machine");
const machineType = machineParam === "iie" ? "iie" : "iigs";
// IIgs is the default machine. Its 65816 speed changes dynamically through
// $C036 SPEED; the browser scheduler always supplies 2.8 MHz master-time.
const khz = machineType === "iigs" ? 2800 : 1020.5;
let motherboard;
let screenMouse;
import {attachTouchMouse} from "./touch_mouse.js?v=20260929-mouse";
let interval;
let last_ms;
let bootWatchdog = 0;
function showBootStatus(text) {
  const el = document.getElementById("bootStatus");
  if(!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}
window.addEventListener("error", e => {
  showBootStatus("JS STARTUP ERROR\n" + (e.message || "unknown error") +
    (e.filename ? "\n" + e.filename.split("/").pop() + ":" + e.lineno + ":" + e.colno : ""));
});
window.addEventListener("unhandledrejection", e => {
  const r = e.reason;
  showBootStatus("JS PROMISE ERROR\n" + String(r && r.message ? r.message : r));
});
setTimeout(() => {
  if(!motherboard) showBootStatus("JS STARTUP STALL\nscript loaded but motherboard was not initialized");
}, 1500);
var joyWidth = 256;
var joyHeight = 256;
var posX=127,posY=127, element="";
var val0=0,val1=0,I1=0,I2=0,Z=3.25;
var joyX=joyWidth/2,joyY=joyHeight/2;
var joy0=joyWidth/2,joy1=joyHeight/2;
var joyValues = {axis0:joyX,axis1:joyY,axis2:joyX,axis3:joyY,button0:val0,button1:val1};
var joyCenter = {joyX:joyWidth/2,joyY:joyHeight/2,on:true};
var joyPad = document.getElementById("joyPadCanvas");
var joyPadCtx = joyPad.getContext("2d");
var joyButtons = document.getElementById("joyButtonsCanvas");
var joyButtonsCtx = joyButtons.getContext("2d");
document.oncontextmenu = new Function("return false;");

import {decodeMedia, isZip, readZipEntries, mountMedia} from './media.js?v=20260930-diskfix';

function chooseArchiveImage(name, entries) {
  const dialog = document.getElementById('archiveDialog');
  const select = document.getElementById('archiveImages');
  document.getElementById('archiveName').textContent = name;
  select.replaceChildren();
  entries.forEach((entry, index) => {
    const option = document.createElement('option');
    option.value = index; option.textContent = entry.name; select.append(option);
  });
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'load' ? entries[Number(select.value)] : null), {once:true});
    dialog.showModal();
  });
}

import { Motherboard } from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20260930-diskfix";

class Drive {
  constructor(num, display, led, dialog, restart=true) {
    this.num = num;
    this.restart = restart;
    this.display = document.querySelector("canvas");
    this.led = document.getElementById(led);
    this.dialog = document.getElementById(dialog);
    this.dialog.addEventListener('change', this.on_file_select.bind(this));
  }

  load_media(name, buffer) {
    const media = decodeMedia(name, buffer);
    mountMedia(motherboard, media, this.num, {preserveSession:!this.restart});
    if(!this.restart) {
      showBootStatus('');
      return true;
    }
    stop();
    clearTimeout(bootWatchdog);
    showBootStatus('');
    // Boot the chosen image instead of resuming the previous program.
    motherboard.reset(machineType === 'iigs');
    run();
    return true;
  }

  async load_zip(name, buffer) {
    const entries = readZipEntries(buffer);
    const selected = entries.length === 1 ? entries[0] : await chooseArchiveImage(name, entries);
    if(!selected) return false;
    return this.load_media(selected.name, selected.data);
  }

  on_file_select(e) {
    document.getElementById('mediaDialog').close();
    const file = e.target.files[0];
    if(!file) return;
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        if(isZip(file.name, fr.result))
          await this.load_zip(file.name, fr.result);
        else
          this.load_media(file.name, fr.result);
      } catch(err) {
        console.error(err);
        showBootStatus('LOAD ERROR\n' + (err.message || 'Media load failed'));
        if(this.restart)motherboard.message(err.message || 'media load failed');
      }
    };
    fr.onerror = () => showBootStatus('LOAD ERROR\nUnable to read ' + file.name);
    fr.readAsArrayBuffer(file);
    e.target.value = "";
  }
}

// Both actions target drive 1, with separate pickers so cancellation cannot
// accidentally leave the next load in the wrong mode.
const drives = [new Drive(0, "drivetitle1", "led1", "filedialog1"),
                new Drive(0, "drivetitle1", "led1", "filedialogInsert", false)];
document.getElementById('buttonLoad').addEventListener('click',()=>document.getElementById('mediaDialog').showModal());

const perfMode = new URLSearchParams(location.search).get("perf") === "1";
let perfHud=null, perfFrames=0, perfDropped=0, perfWindowStart=performance.now();
let perfAccum={cpu:0,video:0,disk:0,audio:0,peripheral:0,render:0};
if(perfMode) {
  perfHud=document.createElement("pre");
  perfHud.id="perfHud";
  Object.assign(perfHud.style,{
    position:"fixed",left:"6px",top:"6px",zIndex:"10000",margin:"0",
    padding:"6px 8px",background:"rgba(0,0,0,.78)",color:"#7fff7f",
    font:"11px/1.25 monospace",pointerEvents:"none"
  });
  document.body.appendChild(perfHud);
}

let cycle_fraction = 0;
function on_interval(now_ms) {
  // Do not mask the frame budget to 15 bits. At IIgs speed a normal
  // 60 Hz frame is ~46,667 cycles, so "& 0x7fff" wrapped it to ~13,899
  // and starved ROM03 to about 30% speed. Preserve fractional cycles and
  // cap only unusually long browser stalls.
  // Never try to repay an arbitrarily large wall-clock stall in one RAF.
  // Doing so creates a positive feedback loop: one GC/render hitch causes a
  // huge 65816 catch-up slice, which makes the following frame even later.
  // At 60 Hz the normal slice is ~16.67 ms; allow modest jitter but discard
  // excess wall-clock debt rather than entering a catch-up spiral.
  const elapsed = Math.max(0, Math.min(now_ms - last_ms, 25));
  const budget = elapsed * khz + cycle_fraction;
  const cycles = Math.floor(budget);
  cycle_fraction = budget - cycles;
  if(perfMode && elapsed > 1000/45)
    perfDropped += Math.max(1,Math.round(elapsed/(1000/60))-1);
  last_ms = now_ms;
  try {
    if(perfMode) motherboard.setPerfEnabled(true);
    motherboard.clock(cycles);
    const io = motherboard.io_manager;
    const renderStart=perfMode ? performance.now() : 0;
    if(motherboard.iigsEnabled && motherboard.video_iigs && motherboard.video_iigs.isSuperHires()) {
      motherboard.video_iigs.refresh();
    } else if(motherboard.iigsEnabled) {
      // Compatibility video is presented inside Motherboard.clock() exactly
      // at the emulated frame boundary. Re-presenting here would upload
      // backing-store changes made for the following frame and reintroduce
      // one-frame flicker.
    } else if(!io._text_mode && motherboard.legacyMemory.dms_hires && io._double_hires) {
      motherboard.display_double_hires.refresh();
      if(io._mixed_mode) io.draw_mixed_text();
    }
    if(perfMode) {
      perfAccum.render += performance.now()-renderStart;
      const p=motherboard.consumePerf();
      perfAccum.cpu+=p.cpu; perfAccum.video+=p.video; perfAccum.disk+=p.disk;
      perfAccum.audio+=p.audio; perfAccum.peripheral+=p.peripheral;
      perfFrames++;
      const span=now_ms-perfWindowStart;
      if(span>=500) {
        const d=Math.max(1,perfFrames), fps=perfFrames*1000/span;
        perfHud.textContent=
          `FPS ${fps.toFixed(1)}  dropped ${perfDropped}\n`+
          `CPU   ${(perfAccum.cpu/d).toFixed(2)} ms\n`+
          `video ${((perfAccum.video+perfAccum.render)/d).toFixed(2)} ms\n`+
          `disk  ${(perfAccum.disk/d).toFixed(2)} ms\n`+
          `audio ${(perfAccum.audio/d).toFixed(2)} ms\n`+
          `other ${(perfAccum.peripheral/d).toFixed(2)} ms`;
        perfFrames=0; perfDropped=0; perfWindowStart=now_ms;
        perfAccum={cpu:0,video:0,disk:0,audio:0,peripheral:0,render:0};
      }
    }
  } catch(err) {
    window.appleBootError = err;
    console.error('[Apple IIgs emulation]', err);
    interval = undefined;
    buttonRunStop.innerText = 'run';
    const msg = String(err && err.message ? err.message : err);
    showBootStatus('EMULATION ERROR\n' + msg);
    motherboard.message(msg.slice(0, 38));
    return;
  }
  interval = window.requestAnimationFrame(on_interval);
}

function init() {
  showBootStatus(machineType === "iigs" ? "IIgs startup: constructing motherboard..." : "Apple II startup: constructing motherboard...");
  let canvas = document.querySelector("canvas");
  motherboard = new Motherboard(khz, canvas, joyValues, (n, s) => {}, machineType);
  if(motherboard.iigsEnabled) {
    screenMouse=attachTouchMouse(canvas,motherboard.memory.adb);
    document.getElementById('mouseHint').hidden=false;
  }
  showBootStatus(machineType === "iigs" ? "IIgs startup: motherboard constructed" : "Apple II startup: motherboard constructed");

async function loadBuiltInIIgsROM() {
  if(machineType !== "iigs") return false;

  // MAME ROM 03 is split across two 128K devices. Convert the raw chip
  // layout into the 256K linear ROM image expected by the IIgs bus:
  // 341-0728 + upper 64K of 341-0748 + lower 64K of 341-0748.
  const [loResponse, hiResponse] = await Promise.all([
    fetch("rom/341-0728"),
    fetch("rom/341-0748")
  ]);
  if(!loResponse.ok || !hiResponse.ok)
    throw new Error("Unable to load built-in Apple IIgs ROM 03");

  const lo = new Uint8Array(await loResponse.arrayBuffer());
  const hi = new Uint8Array(await hiResponse.arrayBuffer());
  if(lo.length !== 0x20000 || hi.length !== 0x20000)
    throw new Error("Apple IIgs ROM 03 chip images must each be 128K");

  const rom = new Uint8Array(0x40000);
  rom.set(lo, 0x00000);
  rom.set(hi.subarray(0x10000, 0x20000), 0x20000);
  rom.set(hi.subarray(0x00000, 0x10000), 0x30000);
  motherboard.loadIIgsROM(rom);
  return true;
}
  motherboard.reset();
  setScanlines();
  setColor();
  if(machineType === "iigs") {
    motherboard.message("loading IIgs ROM 03...");
    loadBuiltInIIgsROM().then(() => {
      motherboard.message("No disk - press load");
      showBootStatus("");
      run();
      clearTimeout(bootWatchdog);
      // An empty slot-6 drive normally polls forever at $C65E. A timed
      // register snapshot is diagnostic information, not a boot failure.
      // Keep it opt-in so ordinary startup does not show an error panel.
      if(new URLSearchParams(location.search).get("bootTrace") === "1")
      bootWatchdog = setTimeout(() => {
        if(!motherboard || !motherboard.cpu || !interval) return;
        const r = motherboard.cpu.register;
        const pc = ((((r.pb || 0)&0xff)<<16) | ((r.pc || 0)&0xffff)) >>> 0;
        const mem = motherboard.memory;
        const bytes=[];
        for(let i=0;i<8;i++) {
          try { bytes.push(mem.read((pc+i)&0xffffff).toString(16).padStart(2,"0").toUpperCase()); }
          catch(e) { bytes.push("??"); }
        }
        const line = motherboard.video_iigs ? motherboard.video_iigs.currentScanline : -1;
        showBootStatus("IIgs BOOT TRACE\nPC=$" +
          pc.toString(16).padStart(6,"0").toUpperCase() +
          "  bytes=" + bytes.join(" ") +
          "\nA=$" + (r.a>>>0).toString(16).padStart(4,"0").toUpperCase() +
          " X=$" + (r.x>>>0).toString(16).padStart(4,"0").toUpperCase() +
          " Y=$" + (r.y>>>0).toString(16).padStart(4,"0").toUpperCase() +
          " S=$" + ((r.s===undefined?r.sp:r.s)>>>0).toString(16).padStart(4,"0").toUpperCase() +
          " P=$" + (r.p>>>0).toString(16).padStart(2,"0").toUpperCase() +
          " E=" + (r.e ? "1" : "0") +
          "\ncycles=" + motherboard.cycles + " scanline=" + line +
          " SPEED=$" + (mem.speed>>>0).toString(16).padStart(2,"0").toUpperCase() +
          "\nSHADOW=$" + (mem.shadow>>>0).toString(16).padStart(2,"0").toUpperCase() +
          " STATE=$" + mem.readState().toString(16).padStart(2,"0").toUpperCase() +
          " NEWVIDEO=$" + (motherboard.video_iigs ? motherboard.video_iigs.readNewVideo() : 0).toString(16).padStart(2,"0").toUpperCase() +
          "\nADBSTAT=$" + mem.adb.readStatus().toString(16).padStart(2,"0").toUpperCase() +
          " INTFLAG=$" + (mem.intFlag>>>0).toString(16).padStart(2,"0").toUpperCase() +
          " INTEN=$" + (mem.intEnable>>>0).toString(16).padStart(2,"0").toUpperCase());
      }, 3000);
    }).catch(err => {
      console.error(err);
      showBootStatus("IIgs ROM LOAD ERROR\n" + String(err && err.message ? err.message : err));
      motherboard.message("IIgs ROM load failed");
    });
  } else {
    motherboard.message('press "run" to start');
  }
}

function stop() {
  screenMouse?.release();
  if(motherboard?.audio) motherboard.audio.reset();
  buttonRunStop.innerText = "run";
  
  if(interval) {
    window.cancelAnimationFrame(interval);
    interval = undefined;
  }
}

function run() {
  buttonRunStop.innerText = "stop";
  if (interval) return;
  motherboard.audio.init();
  last_ms = performance.now();
  interval = window.requestAnimationFrame(on_interval);
}

// Safari/iOS only permits WebAudio to become audible from a user activation.
// Media loading completes asynchronously, so run() can occur after the file
// picker gesture has ended. Unlock/resume audio on the next direct interaction.
function unlockAudio() {
  if(!motherboard || !motherboard.audio) return;
  motherboard.audio.unlock().catch(()=>{});
}
document.addEventListener("pointerdown", unlockAudio, {passive:true});
document.addEventListener("touchstart", unlockAudio, {passive:true});
document.addEventListener("mousedown", unlockAudio, {passive:true});
document.addEventListener("keydown", unlockAudio);

// Keyboard

// Wrapped in an IIFE so that the Map declaration and for-of loop are in a
// single block scope. CodePen's script concatenation/parsing breaks when a
// for-of loop appears at the top level between var declarations and function
// definitions, producing "Can't find variable: keys" and unexpected-token errors.
(function() {
  var keys = new Map();
  keys.set('#button0', 0x30);
  keys.set('#button1', 0x31);
  keys.set('#button2', 0x32);
  keys.set('#button3', 0x33);
  keys.set('#button4', 0x34);
  keys.set('#button5', 0x35);
  keys.set('#button6', 0x36);
  keys.set('#button7', 0x37);
  keys.set('#button8', 0x38);
  keys.set('#button9', 0x39);
  keys.set('#buttonA', 0x41);
  keys.set('#buttonB', 0x42);
  keys.set('#buttonC', 0x43);
  keys.set('#buttonD', 0x44);
  keys.set('#buttonE', 0x45);
  keys.set('#buttonF', 0x46);
  keys.set('#buttonG', 0x47);
  keys.set('#buttonH', 0x48);
  keys.set('#buttonI', 0x49);
  keys.set('#buttonJ', 0x4a);
  keys.set('#buttonK', 0x4b);
  keys.set('#buttonL', 0x4c);
  keys.set('#buttonM', 0x4d);
  keys.set('#buttonN', 0x4e);
  keys.set('#buttonO', 0x4f);
  keys.set('#buttonP', 0x50);
  keys.set('#buttonQ', 0x51);
  keys.set('#buttonR', 0x52);
  keys.set('#buttonS', 0x53);
  keys.set('#buttonT', 0x54);
  keys.set('#buttonU', 0x55);
  keys.set('#buttonV', 0x56);
  keys.set('#buttonW', 0x57);
  keys.set('#buttonX', 0x58);
  keys.set('#buttonY', 0x59);
  keys.set('#buttonZ', 0x5a);
  keys.set('#buttonLarr', 0x08);
  keys.set('#buttonBS', 0x08);
  keys.set('#buttonTab', 0x09);
  keys.set('#buttonUarr', 0x0b);
  keys.set('#buttonDarr', 0x0a);
  keys.set('#buttonCR', 0x0d);
  keys.set('#buttonRarr', 0x15);
  keys.set('#buttonEsc', 0x1b);
  keys.set('#buttonSpace', 0xa0);
  keys.set('#buttonExcl', 0xa1);
  keys.set('#buttonQuot', 0xa2);
  keys.set('#buttonNum', 0xa3);
  keys.set('#buttonDollar', 0xa4);
  keys.set('#buttonPercnt', 0xa5);
  keys.set('#buttonAmp', 0xa6);
  keys.set('#buttonApos', 0xa7);
  keys.set('#buttonLpar', 0xa8);
  keys.set('#buttonRpar', 0xa9);
  keys.set('#buttonAst', 0xaa);
  keys.set('#buttonPlus', 0xab);
  keys.set('#buttonMinus', 0xad);
  keys.set('#buttonComma', 0xbc);
  keys.set('#buttonEquals', 0xbd);
  keys.set('#buttonPeriod', 0xbe);
  keys.set('#buttonColon', 0x3a);
  keys.set('#buttonSemi', 0x3b);
  keys.set('#buttonLt', 0x3c);
  keys.set('#buttonGt', 0x3e);
  keys.set('#buttonCommat', 0x40);
  keys.set('#buttonLbrack', 0x5b);
  keys.set('#buttonRbrack', 0x5d);
  keys.set('#buttonHat', 0x5e);
  keys.set('#buttonDel', 0x7f);
  for (const [selector, val] of keys.entries()) {
    document.querySelectorAll(selector).forEach((key) => {
      key.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        key.setPointerCapture?.(e.pointerId);
        motherboard.keyboard.key_down(val, false, false, false);
      });
      const release = (e) => {
        e.preventDefault();
        motherboard.keyboard.key_up();
      };
      key.addEventListener("pointerup", release);
      key.addEventListener("pointercancel", release);
    });
  }
})();

function setInput(e) {
  if (e=="keyboard") {
    buttonInput.innerText = "joystick";
  } else {
    buttonInput.innerText = "keyboard";
  }
  composeScreen();
}

function setKeyboard(e) {
  if (e=="123") {
    buttonKeyboard.innerText = "ABC";
  } else {
    buttonKeyboard.innerText = "123";
  }
  composeScreen();
}

function setMode(e) {
  switch (e) {
    case "8-way":
      buttonMode.innerText = "4-way";
    break;
    case "4-way":
      buttonMode.innerText = "analog";
    break;
    default:
      buttonMode.innerText = "8-way";
    break;
  }
  setJoy();
}

function setCenter(e) {
  if (e=="off") {
    buttonCenter.innerText = "on";
  } else {
    buttonCenter.innerText = "off";
  }
}

function setGrid(e) {
  if (e=="off") {
    buttonGrid.innerText = "on";
  } else {
    buttonGrid.innerText = "off";
  }
}

function setDebug(e) {
  if (e=="off") {
    buttonDebug.innerText = "on";
    motherboard.startTrace();
  } else {
    buttonDebug.innerText = "off";
    motherboard.stopTrace();
    // Keep the last bounded trace reachable from Safari/Web Inspector without
    // leaving instrumentation active during normal emulation.
    window.appleTrace = motherboard.traceText();
    console.log(window.appleTrace);
  }
}

function setColor(e) {
  var rgbText = {tg:0x00ff66, ta:0xffd429, tw:0xeeeeee};       
  var rgbHires = {gc:0, gg:0x00ff66, ga:0xffd429};
  switch (e) {
    case "color":
      buttonColor.innerText = "green";
      motherboard.display_text.fore = rgbText["tg"];
      motherboard.display_hires.fore = rgbHires["gg"];
      motherboard.display_double_hires.fore=rgbHires["gg"];
    break;
    case "green":
      buttonColor.innerText = "amber";
      motherboard.display_text.fore = rgbText["ta"];
      motherboard.display_hires.fore = rgbHires["ga"];
      motherboard.display_double_hires.fore=rgbHires["ga"];
    break;
    default:
      buttonColor.innerText = "color";
      motherboard.display_text.fore = rgbText["tw"];
      motherboard.display_hires.fore = rgbHires["gc"];
      motherboard.display_double_hires.fore=rgbHires["gc"];
    break;
  }
}

function setScanlines(e) {
  if (e=="scanlines") {
    buttonScanlines.innerText = "solid";
    motherboard.display_text.hscan = false;
    motherboard.display_hires.vscan = false;
  } else {
    buttonScanlines.innerText = "scanlines";
    motherboard.display_text.hscan = true;
    motherboard.display_hires.vscan = true;
  }
}

document.getElementById("buttonInput").addEventListener("pointerdown", () => {setInput(buttonInput.innerText)});
document.getElementById("buttonColor").addEventListener("pointerdown", () => {setColor(buttonColor.innerText)});
document.getElementById("buttonScanlines").addEventListener("pointerdown", () => {setScanlines(buttonScanlines.innerText)});

document.getElementById("buttonRunStop").addEventListener("pointerdown", ()=>{(interval?stop:run)()});
document.getElementById("buttonReset").addEventListener("pointerdown", buttonReset);

document.getElementById("buttonKeyboard").addEventListener("pointerdown", ()=>{setKeyboard(buttonKeyboard.innerText)});
document.getElementById("buttonMode").addEventListener("pointerdown", ()=>{setMode(buttonMode.innerText)});
document.getElementById("buttonCenter").addEventListener("pointerdown", ()=>{setCenter(buttonCenter.innerText)});
document.getElementById("buttonGrid").addEventListener("pointerdown", ()=>{setGrid(buttonGrid.innerText)});
document.getElementById("buttonDebug").addEventListener("pointerdown", ()=>{setDebug(buttonDebug.innerText)});

init();

function buttonReset(event) {
  const was_stopped = !interval;
  stop();
  const cold = event && (event.shiftKey || event.altKey || event.metaKey);
  motherboard.reset(cold);
  run();
}

function getPointerPos(e, element) {
  const rect = element.getBoundingClientRect();
  posX = Math.max(0, Math.min(joyWidth,
    Math.round((e.clientX - rect.left) / rect.width * element.width)));
  posY = Math.max(0, Math.min(joyHeight,
    Math.round((e.clientY - rect.top) / rect.height * element.height)));
}

function setButtons(y) {
  val0 = y < joyHeight / 2 ? 1 : 0;
  val1 = y >= joyHeight / 2 ? 1 : 0;
}

function publishJoy() {
  // Apple II/IIgs paddles are 8-bit values.
  joyValues.axis0 = Math.max(0, Math.min(255, Math.round(joyX)));
  joyValues.axis1 = Math.max(0, Math.min(255, Math.round(joyY)));
  joyValues.button0 = val0;
  joyValues.button1 = val1;
}

let joyPadPointer = null;
joyPad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  joyPadPointer = e.pointerId;
  joyPad.setPointerCapture?.(e.pointerId);
  getPointerPos(e, joyPad);
  setJoy();
});
joyPad.addEventListener("pointermove", (e) => {
  if (e.pointerId !== joyPadPointer) return;
  e.preventDefault();
  getPointerPos(e, joyPad);
  setJoy();
});
const releaseJoy = (e) => {
  if (e.pointerId !== joyPadPointer) return;
  joyPadPointer = null;
  if (buttonCenter.innerText === "on") {
    joyX = posX = joyWidth / 2;
    joyY = posY = joyHeight / 2;
    publishJoy();
  }
};
joyPad.addEventListener("pointerup", releaseJoy);
joyPad.addEventListener("pointercancel", releaseJoy);

const firePointers = new Map();
function updateFire() {
  val0 = 0; val1 = 0;
  for (const button of firePointers.values()) {
    if (button === 0) val0 = 1;
    else val1 = 1;
  }
  // Hardware-visible state must change on the pointer event itself. Games such
  // as Choplifter poll $C061/$C062 in a tight loop and should not depend on the
  // separate UI repaint timer to publish a fire-button transition.
  joyValues.button0 = val0;
  joyValues.button1 = val1;
}
joyButtons.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  joyButtons.setPointerCapture?.(e.pointerId);
  getPointerPos(e, joyButtons);
  firePointers.set(e.pointerId, posY < joyHeight / 2 ? 0 : 1);
  updateFire();
});
joyButtons.addEventListener("pointermove", (e) => {
  if (!firePointers.has(e.pointerId)) return;
  e.preventDefault();
  getPointerPos(e, joyButtons);
  firePointers.set(e.pointerId, posY < joyHeight / 2 ? 0 : 1);
  updateFire();
});
const releaseFire = (e) => {
  firePointers.delete(e.pointerId);
  updateFire();
};
joyButtons.addEventListener("pointerup", releaseFire);
joyButtons.addEventListener("pointercancel", releaseFire);

function setJoy() {
  if (buttonMode.innerText!="analog") {
    if ((posX>joyWidth/Z)&&(posX<(joyWidth/Z)*(Z-1))&&
        (posY>joyHeight/Z)&&(posY<(joyHeight/Z)*(Z-1))) {
      joyX=127; joyY=127;
    }
    if ((posX<110||posX>146)||
        (posY<110||posY>146)) {
      if (posX<joyWidth/Z) {
        joyX=0; joyY=127;
      }
      if (posX>(joyWidth/Z)*(Z-1)){
        joyX=255; joyY=127;
      }
      if (posY<joyHeight/Z) {
        joyX=127; joyY=0;
      }
      if (posY>(joyHeight/Z)*(Z-1)) {
        joyX=127; joyY=255;
      }
      if (buttonMode.innerText=="8-way") {
        if ((posX>(joyWidth/Z)*(Z-1)) &&
            (posY<joyHeight/Z)) {
          joyX=255; joyY=0;
        }
        if ((posX>(joyWidth/Z)*(Z-1)) &&
            (posY>(joyHeight/Z)*(Z-1))) {
          joyX=255; joyY=255;
        }
        if ((posX<joyWidth/Z) &&
            (posY>(joyHeight/Z)*(Z-1))) {
          joyX=0; joyY=255;
        }
        if ((posX<joyWidth/Z) &&
            (posY<joyHeight/Z)) {
          joyX=0; joyY=0;
        }
      }
    }
  } else {
    joyX = posX; joyY = posY;
  }
  // Publish paddle state synchronously so games polling $C064/$C065 see the
  // new position on the same pointer event.
  publishJoy();
}

function composeScreen() {
  const screenCanvas = document.getElementById("screen");
  const portrait = window.innerHeight >= window.innerWidth;
  const keyboardMode = buttonInput.innerText.trim().toLowerCase() === "joystick";
  const symbols = buttonKeyboard.innerText.trim().toUpperCase() === "ABC";

  const keyboard0 = document.getElementById("keyboard0");
  const keyboard1 = document.getElementById("keyboard1");
  const keyboard2 = document.getElementById("keyboard2");
  const keypad = document.getElementById("keypad");
  const joyStickEl = document.getElementById("joyStick");
  const joyControlsEl = document.getElementById("joyControls");
  const controlsEl = document.getElementById("controls");

  document.body.classList.toggle("keyboard-mode", keyboardMode);
  document.body.classList.toggle("joystick-mode", !keyboardMode);
  [keyboard0, keyboard1, keyboard2, keypad, joyStickEl, joyControlsEl]
    .forEach(el => { if (el) el.style.removeProperty("display"); });

  controlsEl.style.display = "flex";
  document.body.style.backgroundColor = "#c4c1a0";

  if (portrait) {
    screenCanvas.style.left = "50%";
    screenCanvas.style.top = "";
    screenCanvas.style.width = "";
    screenCanvas.style.height = "";

    document.body.classList.toggle("symbols-mode", symbols);
    return;
  }

  controlsEl.style.display = "none";
  document.body.style.backgroundColor = "#0f0000";
  screenCanvas.style.left = "50%";
  screenCanvas.style.top = "0px";
  screenCanvas.style.height = window.innerHeight + "px";
  screenCanvas.style.width = (window.innerHeight * 564 / 390) + "px";
}

// MAIN FUNCTION //
$(function() {
  $(window).on('resize', function() {
    composeScreen();
  });
  composeScreen();
  joyPadCtx.joyWidth = joyWidth;
  joyPadCtx.joyHeight = joyHeight;
  joyRender.init(joyPadCtx);
  publishJoy();

  // UI painting follows the display refresh rate. Hardware input itself is
  // published synchronously by the pointer handlers above, so this does not
  // add input latency and avoids the old 1 ms (~1000 Hz) main-thread timer.
  function renderJoystickUI() {
    joyRender.clear(joyPadCtx);
    joyRender.plot(joyPadCtx,joyX,joyY);
    if (buttonGrid.innerText=="on") {
      joyRender.crosshair(joyPadCtx,Z);
      if (joyX<joyWidth/Z) joyRender.left(joyPadCtx);
      if (joyX>(joyWidth/Z)*(Z-1)) joyRender.right(joyPadCtx);
      if (joyY<joyHeight/Z) joyRender.up(joyPadCtx);
      if (joyY>(joyHeight/Z)*(Z-1)) joyRender.down(joyPadCtx);
    }
    if (buttonDebug.innerText=="on")
      joyRender.debug(joyPadCtx,joyX,joyY,joyPadPointer===null?0:1,val0,val1);
    joyRender.buttons(joyButtonsCtx,val0,val1);
    window.requestAnimationFrame(renderJoystickUI);
  }
  window.requestAnimationFrame(renderJoystickUI);
});