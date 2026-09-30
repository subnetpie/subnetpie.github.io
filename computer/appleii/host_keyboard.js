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

export function attachHostKeyboard(keyboard, adb, joystick, doc=document, host=window) {
  const held=new Set();
  function modifiers(e) {
    joystick.keyboardCommand=!!e.metaKey;
    joystick.keyboardOption=!!e.altKey;
    adb?.setKeyModifiers((e.shiftKey?1:0)|(e.ctrlKey?2:0)|
      (e.getModifierState?.('CapsLock')?4:0)|(e.repeat?8:0)|
      (e.location===3?16:0)|(e.altKey?64:0)|(e.metaKey?128:0));
  }
  function release() {
    held.clear(); keyboard.key_up(); modifiers({});
  }
  function excluded(e) {
    return e.target?.isContentEditable ||
      e.target?.closest?.('input,textarea,select,dialog,#controls,#buttonSettings,[contenteditable="true"]');
  }
  function down(e) {
    if(excluded(e)) { release(); return; }
    modifiers(e);
    const value=appleKey(e);
    if(value===null) return;
    e.preventDefault();
    held.add(e.code || e.key);
    keyboard.pressAscii(value);
  }
  function up(e) {
    const wasHeld=held.delete(e.code || e.key);
    if(excluded(e)) { release(); return; }
    modifiers(e);
    if(wasHeld) {
      e.preventDefault();
      if(!held.size) keyboard.key_up();
    }
  }
  const visibility=()=>{if(doc.hidden)release();};
  doc.addEventListener('keydown',down);
  doc.addEventListener('keyup',up);
  host.addEventListener('blur',release);
  doc.addEventListener('visibilitychange',visibility);
  return ()=>{
    release();
    doc.removeEventListener('keydown',down); doc.removeEventListener('keyup',up);
    host.removeEventListener('blur',release);
    doc.removeEventListener('visibilitychange',visibility);
  };
}
