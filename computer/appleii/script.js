const khz = 1020.5;
let motherboard;
let interval;
let last_ms;
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

// Keep iOS Safari gestures from stealing the emulator's touch controls.
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = performance.now();
  if (now - lastTouchEnd <= 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

import { Motherboard } from "https://subnetpie.github.io/computer/appleii/motherboard.js";

class Drive {
  constructor(num, display, led, dialog) {
    this.num = num;
    this.display = document.querySelector("canvas");
    this.led = document.getElementById(led);
    this.dialog = document.getElementById(dialog);
    this.dialog.addEventListener('change', this.on_file_select.bind(this));
  }

  on_file_select(e) {
    const file = e.target.files[0];
    const path = this.dialog.value;
    const name = path.substring(path.lastIndexOf("\\")+1);
    const fr = new FileReader();
    fr.onload = () => {
      // FIX 1: use load_image() instead of load_disk() so that WOZ signature
      // detection runs before the DSK size check. load_disk() was rejecting all
      // WOZ files with "invalid disk image size" because it only accepts 143360-byte
      // DSK images. load_image() detects WOZ1/WOZ2 by signature and routes correctly.
      const ok = motherboard.floppy525.load_image(this.num, name, fr.result);

      // FIX 2: reset and run after a successful disk load so the machine boots
      // from the newly mounted image without requiring the user to press Run.
      // The commented-out run() call below was the original intent but was never
      // completed; a reset is also needed to restart the CPU from $FFFC.
      if(ok) {
        stop();
        motherboard.reset();
        run();
      }
    };
    fr.readAsArrayBuffer(file);
    e.target.removeAttribute("open");
  }
}

// Drive 2 reuses filedialog1 since only one file picker exists in the HTML.
// To add independent drive 2 loading, add filedialog2 and led2 elements to
// the HTML and change the second entry to: new Drive(1, "drivetitle2", "led2", "filedialog2")
const drives = [
  new Drive(0, "drivetitle1", "led1", "filedialog1"),
  new Drive(1, "drivetitle1", "led1", "filedialog1")
];

function on_interval(now_ms) {
  const cycles = ((now_ms - last_ms) * khz) & 0x7fff;
  last_ms = now_ms;
  motherboard.clock(cycles);
  interval = window.requestAnimationFrame(on_interval);

    if (motherboard.io_manager._double_hires) {
      motherboard.display_double_hires.refresh();
    };
}

function init() {
  let canvas = document.querySelector("canvas");
  motherboard = new Motherboard(khz, canvas, joyValues, (n, s) => {});
  motherboard.reset();
  setScanlines();
  setColor();
  motherboard.message('press "run" to start');
}

function stop() {
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
  } else {
    buttonDebug.innerText = "off";
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

$('#buttonLoad').click(function() {
  $('#filedialog1').trigger('click');
});

document.getElementById("buttonRunStop").addEventListener("pointerdown", ()=>{(interval?stop:run)()});
document.getElementById("buttonReset").addEventListener("pointerdown", buttonReset);

document.getElementById("buttonKeyboard").addEventListener("pointerdown", ()=>{setKeyboard(buttonKeyboard.innerText)});
document.getElementById("buttonMode").addEventListener("pointerdown", ()=>{setMode(buttonMode.innerText)});
document.getElementById("buttonCenter").addEventListener("pointerdown", ()=>{setCenter(buttonCenter.innerText)});
document.getElementById("buttonGrid").addEventListener("pointerdown", ()=>{setGrid(buttonGrid.innerText)});
document.getElementById("buttonDebug").addEventListener("pointerdown", ()=>{setDebug(buttonDebug.innerText)});

init();

function buttonLoad(event) { $('#filedialog1').trigger('click'); }
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
}

function composeScreen() {
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

  [keyboard0, keyboard1, keyboard2, keypad, joyStickEl, joyControlsEl]
    .forEach(el => { if (el) el.style.display = "none"; });

  controlsEl.style.display = "flex";
  document.body.style.backgroundColor = "#c4c1a0";

  if (portrait) {
    screen.style.left = "50%";
    screen.style.top = "";
    screen.style.width = "";
    screen.style.height = "";

    if (keyboardMode) {
      keyboard0.style.display = "block";
      (symbols ? keyboard2 : keyboard1).style.display = "block";
    } else {
      joyStickEl.style.display = "block";
      joyControlsEl.style.display = "block";
    }
    return;
  }

  controlsEl.style.display = "none";
  joyStickEl.style.display = "block";
  document.body.style.backgroundColor = "#0f0000";
  screen.style.left = "50%";
  screen.style.top = "0px";
  screen.style.height = window.innerHeight + "px";
  screen.style.width = (window.innerHeight * 564 / 390) + "px";
  joyStickEl.style.left = "50%";
  joyStickEl.style.top = "50%";
  joyStickEl.style.height = "70%";
  joyStickEl.style.opacity = "0.3";
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
  setInterval(function() {
    joyValues.axis0 = joyX * 10;
    joyValues.axis1 = joyY * 10;
    joyValues.button0 = val0;
    joyValues.button1 = val1;
    joyRender.clear(joyPadCtx);
    if ($(window).width()==414) {
      joyRender.status(joyPadCtx,joyX,joyY);
    } else {
      joyRender.plot(joyPadCtx,joyX,joyY);
    }
    if (buttonGrid.innerText=="on") {
      joyRender.crosshair(joyPadCtx,Z);
      if (joyX<joyWidth/Z) {
        joyRender.left(joyPadCtx);
      }
      if (joyX>(joyWidth/Z)*(Z-1)){
        joyRender.right(joyPadCtx);
      }
      if (joyY<joyHeight/Z) {
        joyRender.up(joyPadCtx);
      }
      if(joyY>(joyHeight/Z)*(Z-1)) {
        joyRender.down(joyPadCtx);
      }
    }
    if (buttonDebug.innerText=="on") {
      joyRender.debug(joyPadCtx,joyX,joyY,joyPadPointer===null?0:1,val0,val1);
    }
    joyRender.buttons(joyButtonsCtx);
  },1);
});