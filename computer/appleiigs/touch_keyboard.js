import {shiftedKey} from './keyboard_input.js?v=20261102-keyboard-reset1';
const modifiers={buttonShift:'shift',buttonShiftRight:'shift',buttonCtrl:'control',
  buttonSolidApple:'option',buttonOpenApple:'command',buttonCaps:'capsLock'};
const keys={buttonLarr:8,buttonTab:9,buttonUarr:11,buttonDarr:10,buttonCR:13,
  buttonRarr:21,buttonEsc:27,buttonSpace:32,buttonDel:127,buttonMinus:45,
  buttonEquals:61,buttonSemi:59,buttonApos:39,buttonComma:44,buttonPeriod:46,
  buttonSlash:47,buttonGrave:96,buttonLbrack:91,buttonBackslash:92,buttonRbrack:93};
for(const char of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')keys['button'+char]=char.charCodeAt(0);
export function touchKeyValue(value,m) {
  if(m.control) {
    if(value===32)return 0;
    return value>=64&&value<=95?value&31:value;
  }
  if(m.shift)return shiftedKey(String.fromCharCode(value)).charCodeAt(0);
  return value;
}

export function attachTouchKeyboard(input,onReset,doc=document,host=window) {
  const bindings=[],pointers=new Map();
  const get=id=>doc.getElementById(id);
  const listen=(el,type,handler)=>{el.addEventListener(type,handler);bindings.push(()=>el.removeEventListener(type,handler));};
  for(const id of [...Object.keys(modifiers),...Object.keys(keys),'buttonKeyboardReset']) {
    const key=get(id);if(!key)continue;
    key.setAttribute('role','button');key.setAttribute('tabindex','0');
    if(modifiers[id])key.setAttribute('aria-pressed','false');
    function down(e) {
      e.preventDefault();e.stopPropagation?.();
      if(id==='buttonKeyboardReset'){onReset(e);return;}
      if(modifiers[id]){input.toggle(modifiers[id]);return;}
      const token=e.pointerId===undefined?'focus:'+id:'touch:'+e.pointerId;
      if(e.pointerId!==undefined){key.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{token,id});}
      input.press(token,touchKeyValue(keys[id],input.modifiers()));
    }
    function release(e) {
      const token=e.pointerId===undefined?'focus:'+id:pointers.get(e.pointerId)?.token;
      if(token)input.release(token);
      if(e.pointerId!==undefined)pointers.delete(e.pointerId);
    }
    listen(key,'pointerdown',down);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(key,type,release);
    listen(key,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(!e.repeat)down(e);}});
    listen(key,'keyup',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();release(e);}});
  }
  const unsubscribe=input.subscribe((m,held)=>{
    for(const [id,name] of Object.entries(modifiers)) {
      const key=get(id);if(!key)continue;
      key.classList.toggle('active',m[name]);key.setAttribute('aria-pressed',String(m[name]));
    }
    get('buttonIndicator')?.classList.toggle('caps-on',m.capsLock);
    for(const id of Object.keys(keys)) {
      const pressed=[...pointers.values()].some(p=>p.id===id&&held.has(p.token))||held.has('focus:'+id);
      get(id)?.classList.toggle('pressed',pressed);
    }
    if(!held.size)pointers.clear();
  });
  const clear=()=>input.clear();
  const visibility=()=>{if(doc.hidden)clear();};
  listen(host,'blur',clear);listen(doc,'visibilitychange',visibility);
  return ()=>{unsubscribe();for(const remove of bindings)remove();clear();};
}
