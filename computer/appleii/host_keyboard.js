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
  // Keep each physical key separately so the emulated one-key data register can
  // follow the newest still-held key. This gives the IIgs proper rollover for
  // combinations such as held direction keys while modifiers remain independent.
  const held=new Map();
  let sequence=0;

  function modifiers(e) {
    joystick.keyboardCommand=!!e.metaKey;
    joystick.keyboardOption=!!e.altKey;
    adb?.setKeyModifiers((e.shiftKey?1:0)|(e.ctrlKey?2:0)|
      (e.getModifierState?.('CapsLock')?4:0)|(e.repeat?8:0)|
      (e.location===3?16:0)|(e.altKey?64:0)|(e.metaKey?128:0));
  }
  function activeHeld() {
    let active=null;
    for(const entry of held.values())
      if(!active || entry.sequence>active.sequence) active=entry;
    return active;
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
    const id=e.code || e.key;
    const existing=held.get(id);
    // Browser auto-repeat should retrigger the same key without changing the
    // ordering of other held keys. A real fresh press becomes the newest key.
    held.set(id,{value,sequence:existing?.sequence ?? ++sequence});
    keyboard.pressAscii(value);
  }
  function up(e) {
    const id=e.code || e.key;
    const wasHeld=held.delete(id);
    if(excluded(e)) { release(); return; }
    modifiers(e);
    if(wasHeld) {
      e.preventDefault();
      const active=activeHeld();
      if(active) keyboard.pressAscii(active.value);
      else keyboard.key_up();
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
