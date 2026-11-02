const shifted=Object.fromEntries([..."1234567890-=[]\\;',./`"].map((char,i)=>
  [char,"!@#$%^&*()_+{}|:\"<>?~"[i]]));
export function shiftedKey(key) {
  return /^[a-z]$/.test(key)?key.toUpperCase():shifted[key]??key;
}

// One input state for touch latches, physical modifiers, and key rollover.
export function createKeyboardInput(keyboard, adb, joystick) {
  const latched=new Set(), held=new Map(), listeners=new Set();
  let host={},sequence=0;
  const modifiers=()=>Object.fromEntries(['shift','control','option','command','capsLock']
    .map(name=>[name,latched.has(name)||!!host[name]]));
  function publish() {
    const m=modifiers();
    joystick.keyboardCommand=m.command;
    joystick.keyboardOption=m.option;
    adb?.setKeyModifiers((m.shift?1:0)|(m.control?2:0)|(m.capsLock?4:0)|
      (host.repeat?8:0)|(host.keypad?16:0)|(m.option?64:0)|(m.command?128:0));
    for(const listener of listeners)listener(m,held);
  }
  function active() {
    let latest=null;
    for(const entry of held.values())if(!latest || entry.sequence>latest.sequence)latest=entry;
    return latest;
  }
  function press(id,value) {
    held.set(id,{value,sequence:held.get(id)?.sequence??++sequence});
    keyboard.pressAscii(value);publish();
  }
  function release(id) {
    const previous=active();
    if(!held.delete(id))return;
    const latest=active();
    if(previous!==latest) {
      if(latest)keyboard.pressAscii(latest.value);
      else keyboard.key_up();
    }
    publish();
  }
  function clear() {
    held.clear();latched.clear();host={};
    keyboard.key_up();keyboard.strobe();
    adb?.setKeyData(0,false);adb?.clearKeyStrobe();publish();
  }
  return {
    modifiers,press,release,clear,
    toggle(name){if(latched.has(name))latched.delete(name);else latched.add(name);publish();},
    setHostModifiers(value){host=value;publish();},
    releaseHost(){for(const id of [...held.keys()])if(id.startsWith('host:'))release(id);host={};publish();},
    subscribe(listener){listeners.add(listener);listener(modifiers(),held);return ()=>listeners.delete(listener);}
  };
}

// Determine the chord before clearing it. Plain Reset stays a warm reset.
export function resetWithKeyboard(board,input,event={}) {
  const m=input?.modifiers()??{};
  const cold=!!((m.control||event.ctrlKey)&&(m.command||event.metaKey));
  input?.clear();
  board.reset(cold);
  return cold;
}
