// Relative screen trackpad for the IIgs ADB mouse; independent of joystick input.
export function attachTouchMouse(screen,adb,host=window) {
 let hover=null;
 let pointer=null,x=0,y=0,startX=0,startY=0,moved=false,held=false,timer=null,fx=0,fy=0;
 const cancelTimer=()=>{if(timer!==null){host.clearTimeout(timer);timer=null;}};
 const release=(click=false)=>{
  cancelTimer();
  if(click&&!held){adb.mouseInput(0,0,true);adb.mouseInput(0,0,false);}
  else if(held)adb.mouseInput(0,0,false);
  held=false;pointer=null;fx=fy=0;
 };
 const move=(dx,dy,down)=>{
  const box=screen.getBoundingClientRect();
  fx+=dx*640/Math.max(1,box.width);
  fy+=dy*400/Math.max(1,box.height);
  const mx=Math.trunc(fx),my=Math.trunc(fy);fx-=mx;fy-=my;
  if(mx||my)adb.mouseInput(mx,my,down);
 };
 screen.style.touchAction='none';
 // iPadOS exposes Magic Keyboard trackpad movement as mouse pointer events.
 // Track hover as well as captured movement so clicking is not needed to move.
 screen.addEventListener('pointerenter',e=>{
  if(e.pointerType==='mouse'&&pointer===null){hover={x:e.clientX,y:e.clientY};fx=fy=0;}
 });
 screen.addEventListener('pointerleave',()=>{hover=null;if(pointer===null)fx=fy=0;});
 screen.addEventListener('pointerdown',e=>{
  if(pointer!==null||e.button>0)return;
  hover=null;
  e.preventDefault();pointer=e.pointerId;x=startX=e.clientX;y=startY=e.clientY;moved=false;
  screen.setPointerCapture?.(pointer);
  if(e.pointerType==='mouse'){held=true;adb.mouseInput(0,0,true);}
  else timer=host.setTimeout(()=>{timer=null;if(pointer!==null&&!moved){held=true;adb.mouseInput(0,0,true);}},350);
 });
 screen.addEventListener('pointermove',e=>{
  if(pointer===null&&e.pointerType==='mouse'){
   if(hover)move(e.clientX-hover.x,e.clientY-hover.y,false);
   hover={x:e.clientX,y:e.clientY};
   return;
  }
  if(e.pointerId!==pointer)return;
  e.preventDefault();
  if(Math.hypot(e.clientX-startX,e.clientY-startY)>6){moved=true;cancelTimer();}
  move(e.clientX-x,e.clientY-y,held);
  x=e.clientX;y=e.clientY;
 });
 screen.addEventListener('pointerup',e=>{
  if(e.pointerId!==pointer)return;e.preventDefault();release(!moved);
  if(e.pointerType==='mouse')hover={x:e.clientX,y:e.clientY};
 });
 for(const type of ['pointercancel','lostpointercapture'])screen.addEventListener(type,e=>{
  if(e.pointerId===pointer){release();hover=null;}
 });
 host.addEventListener('blur',()=>{release();hover=null;});
 screen.addEventListener('contextmenu',e=>e.preventDefault());
 return {release};
}
