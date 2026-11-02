import {createKeyboardInput,shiftedKey} from "./keyboard_input.js?v=20261102-keyboard-reset1";

// Browser KeyboardEvent.key is already translated by the iPad keyboard layout.
// Keep ASCII separate from the touch keyboard's legacy numeric keycodes.
const special = {Enter:13, Escape:27, Tab:9, Backspace:127, Delete:127,
  ArrowLeft:8, ArrowUp:11, ArrowRight:21, ArrowDown:10};
export function appleKey(event) {
  if(event.isComposing) return null;
  if(Object.hasOwn(special,event.key)) return special[event.key];
  let key=event.key || '';
  // Option may produce a dead key or a Unicode character on Apple keyboards.
  // IIgs shortcuts need the underlying ASCII key plus the Option modifier.
  if(event.altKey && /^Key[A-Z]$/.test(event.code))
    key=event.shiftKey ? event.code.slice(3) : event.code.slice(3).toLowerCase();
  if(key.length!==1) return null;
  let code=key.charCodeAt(0);
  if(event.ctrlKey) {
    code=key.toUpperCase().charCodeAt(0);
    if(code>=64 && code<=95) return code&31;
    if(key===' ') return 0;
    return null;
  }
  return code>=32 && code<=126 ? code : null;
}

export function attachHostKeyboard(keyboard, adb, joystick, doc=document, host=window, input=null) {
  input??=createKeyboardInput(keyboard,adb,joystick);
  function modifiers(e) {
    input.setHostModifiers({shift:!!e.shiftKey,control:!!e.ctrlKey,
      option:!!e.altKey,command:!!e.metaKey,capsLock:!!e.getModifierState?.('CapsLock'),
      repeat:!!e.repeat,keypad:e.location===3});
  }
  const release=()=>input.releaseHost();
  function excluded(e) {
    return e.target?.isContentEditable ||
      e.target?.closest?.('input,textarea,select,dialog,#controls,#buttonSettings,[contenteditable="true"]');
  }
  function down(e) {
    if(excluded(e)) { release(); return; }
    modifiers(e);
    const m=input.modifiers();
    const key=m.shift&&!e.shiftKey?shiftedKey(e.key):e.key;
    const value=appleKey({key,code:e.code,isComposing:e.isComposing,
      shiftKey:m.shift,ctrlKey:m.control,altKey:m.option});
    if(value===null) return;
    e.preventDefault();
    input.press('host:'+(e.code||e.key),value);
  }
  function up(e) {
    if(excluded(e)) { release(); return; }
    modifiers(e);
    input.release('host:'+(e.code||e.key));
  }
  const visibility=()=>{if(doc.hidden)release();};
  doc.addEventListener('keydown',down);
  doc.addEventListener('keyup',up);
  host.addEventListener('blur',release);
  doc.addEventListener('visibilitychange',visibility);
  return ()=>{
    release();
    doc.removeEventListener('keydown',down);doc.removeEventListener('keyup',up);
    host.removeEventListener('blur',release);
    doc.removeEventListener('visibilitychange',visibility);
  };
}
