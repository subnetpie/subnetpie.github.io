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
  for (const [key, val] of keys.entries()) {
    $(key).bind('touchstart', function() {
      motherboard.keyboard.key_down(val);
    }).bind('touchend', function() {
      motherboard.keyboard.key_up();
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

document.getElementById("buttonInput").addEventListener("touchstart", () => {setInput(buttonInput.innerText)});
document.getElementById("buttonColor").addEventListener("touchstart", () => {setColor(buttonColor.innerText)});
document.getElementById("buttonScanlines").addEventListener("touchstart", () => {setScanlines(buttonScanlines.innerText)});

$('#buttonLoad').click(function() {
  $('#filedialog1').trigger('click');
});

document.getElementById("buttonRunStop").addEventListener("touchstart", ()=>{(interval?stop:run)()});
document.getElementById("buttonReset").addEventListener("touchstart", buttonReset);

document.getElementById("buttonKeyboard").addEventListener("touchstart", ()=>{setKeyboard(buttonKeyboard.innerText)});
document.getElementById("buttonMode").addEventListener("touchstart", ()=>{setMode(buttonMode.innerText)});
document.getElementById("buttonCenter").addEventListener("touchstart", ()=>{setCenter(buttonCenter.innerText)});
document.getElementById("buttonGrid").addEventListener("touchstart", ()=>{setGrid(buttonGrid.innerText)});
document.getElementById("buttonDebug").addEventListener("touchstart", ()=>{setDebug(buttonDebug.innerText)});

init();

function buttonLoad(event) { $('#filedialog1').trigger('click'); }
function buttonReset(event) {
  const was_stopped = !interval;
  stop();
  const cold = event && (event.shiftKey || event.altKey || event.metaKey);
  motherboard.reset(cold);
  run();
}

function getPos(e,element,I) {
  var rect = element.getBoundingClientRect();
  posX = Math.round((e.touches[I-1].clientX - rect.left) / (rect.right - rect.left) * element.width);
  posY = Math.round((e.touches[I-1].clientY - rect.top) / (rect.bottom - rect.top) * element.height);
  if (posX<0) { posX=0; };
  if (posX>joyWidth) { posX=joyWidth; };
  if (posY<0) { posY=0; };
  if (posY>joyHeight) { posY=joyHeight; };  
  return posX, posY;
}

function setButtons(joy0,joy1) {
  joy1 < 128 ? val0 = 1 : val0 = 0;
  joy1 > 128 ? val1 = 1 : val1 = 0;
}

joyPad.addEventListener("touchstart", function(e) {
  e.preventDefault();
  if (I1 == 0) { I1 = e.touches.length; }
  getPos(e,joyPad,I1);
  setJoy();
}, false);
joyPad.addEventListener("touchmove", function(e) {
  e.preventDefault();
  if (I1 > e.touches.length) { 
    I1=Math.max(0, I1-1); I2=Math.max(0, I2-1); };
  getPos(e,joyPad,I1);
  setJoy();
}, false);
joyPad.addEventListener("touchend", function() {
  I1 = 0;
  if (buttonCenter.innerText=="on") {
    joyX=joyWidth/2;
    joyY=joyHeight/2;
    posX=joyWidth/2;
    posY=joyHeight/2;
  }
}, false);

joyButtons.addEventListener("touchstart", function(e) {
  e.preventDefault();
  if (I2 == 0) { I2 = e.touches.length; }
  getPos(e,joyButtons,I2);
  setButtons(posX,posY);
}, false);
joyButtons.addEventListener("touchmove", function(e) {
  e.preventDefault();
  if (I2 > e.touches.length) {
    I1=Math.max(0, I1-1); I2=Math.max(0, I2-1); };
  getPos(e,joyButtons,I2);
  setButtons(posX,posY);
}, false);
joyButtons.addEventListener("touchend", function(e) {
  I2 = 0;
  val0 = 0;
  val1 = 0;
  joy0 = joyWidth/2; joy1 = joyHeight/2;
}, false);

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
  var width = $(window).width();
  var height = $(window).height();
  let body = document.body;
  let controls = document.getElementById('controls');
  let screen = document.getElementById('screen');
  let joystick = document.getElementById('joyStick');
  let screenRatio = 390 / 564;
  if (width>height && width!=414 && width!=428 && width!=430 && width!=736) {
    if (width==735 || width==831) {
      $("#keypad").hide();
      $("#keyboard0").hide();
      $("#keyboard1").hide();
      $("#keyboard2").hide();
      $("#controls").hide();
      $("#joyStick").show();
      $("#joyControls").hide();
      screen.style.height = height + "px";
      screen.style.width = width * screenRatio + "px";
      joystick.style.top = height * 0.5 + "px";
    } else {
      $("#keypad").hide();
      $("#keyboard0").hide();
      $("#keyboard1").hide();
      $("#keyboard2").hide();
      $("#controls").hide();
      $("#joyStick").show();
      $("#joyControls").show();
      screen.style.width = 551/screenRatio+"px";
      screen.style.height = "551px";
      joystick.style.top = "20px";
    }
    body.style.backgroundColor = "#0f0000";
    screen.style.left = "50%";
    screen.style.top = "0px";
    joystick.style.height = "70%";
    joystick.style.opacity = "30%";
  } else {
    $("#keypad").show();
    $("#keyboard0").hide();
    $("#keyboard1").hide();
    $("#keyboard2").hide();
    $("#controls").show();
    $("#joyStick").hide();
    $("#joyControls").hide();
    controls.style.top = "3px";
    body.style.backgroundColor = "#c4c1a0";
    screen.style.width = width * 0.75 + "px";
    screen.style.height = width * 0.752 * screenRatio + "px";
    screen.style.left = width * 0.38 + "px";
    screen.style.top = "35px";
    keypad.style.width = width * 0.24 + "px";
    keypad.style.right = "1px";
    keypad.style.top = "34.5px";
    if (width < height) {
      $("#keypad").hide();
      if (buttonInput.innerText=="joystick") {
        if (buttonKeyboard.innerText=="123") {
          $("#keyboard0").show();
          $("#keyboard1").show();
          $("#keyboard2").hide();
        } else {
          $("#keyboard0").show();
          $("#keyboard1").hide();
          $("#keyboard2").show();
        }
        $("#joyStick").hide();
      } else {
        $("#keyboard0").hide();
        $("#keyboard1").hide();
        $("#keyboard2").hide();
        $("#joyStick").show();
      }
      $("#controls").show();
      $("#joyControls").show();
      controls.style.top = "0px";
      screen.style.height = width * screenRatio + "px";
      screen.style.width = width + "px";
      screen.style.left = width * 0.5 + "px";
      screen.style.top = "28px";
      joystick.style.top = "81.5%";
    }
    joystick.style.height = "34%";
    joystick.style.opacity = "100%";
    joystick.style.left = "51%";
  }
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
      joyRender.debug(joyPadCtx,joyX,joyY,I1,val0,val1);
    }
    joyRender.buttons(joyButtonsCtx);
  },1);
});