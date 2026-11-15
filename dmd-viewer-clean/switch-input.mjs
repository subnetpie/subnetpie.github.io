// One physical press per gesture. Repeated taps cannot extend or repeat it.
export function bindSwitch(button,{down,up}){
 let owner=null;
 const begin=source=>{if(owner!==null||!down())return false;owner=source;return true;};
 const end=source=>{if(owner!==source)return;owner=null;up();};
 button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();if(begin(event.pointerId))button.setPointerCapture?.(event.pointerId);});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,event=>end(event.pointerId));
 button.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)begin(event.key);}});
 button.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();end(event.key);}});
 button.addEventListener('blur',()=>{if(owner!==null){owner=null;up();}});
 button.addEventListener('click',event=>{event.preventDefault();if(event.detail===0&&begin('assistive'))end('assistive');});
 button.addEventListener('dblclick',event=>event.preventDefault());
}
export function tapGuard(now=()=>performance.now(),delay=450){
 const blocked=new Map();
 return {accept(key){const time=now();if(time<(blocked.get(key)??-Infinity))return false;blocked.set(key,time+delay);return true;},release(key){blocked.set(key,now()+delay);},clear(){blocked.clear();}};
}
