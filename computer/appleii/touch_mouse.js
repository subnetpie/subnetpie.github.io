// Relative screen trackpad for the IIgs ADB mouse; independent of joystick input.
export function attachTouchMouse(screen,adb,host=window) {
 let pointer=null,x=0,y=0,startX=0,startY=0,moved=false,held=false,timer=null,fx=0,fy=0;
 const cancelTimer=()=>{if(timer!==null){host.clearTimeout(timer);timer=null;}};
 const release=(click=false)=>{
  cancelTimer();
  if(click&&!held){adb.mouseInput(0,0,true);adb.mouseInput(0,0,false);}
  else if(held)adb.mouseInput(0,0,false);
  held=false;pointer=null;fx=fy=0;
 };
 screen.style.touchAction='none';
 screen.addEventListener('pointerdown',e=>{
  if(pointer!==null||e.button>0)return;
  e.preventDefault();pointer=e.pointerId;x=startX=e.clientX;y=startY=e.clientY;moved=false;
  screen.setPointerCapture?.(pointer);
  if(e.pointerType==='mouse'){held=true;adb.mouseInput(0,0,true);}
  else timer=host.setTimeout(()=>{timer=null;if(pointer!==null&&!moved){held=true;adb.mouseInput(0,0,true);}},350);
 });
 screen.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  e.preventDefault();
  if(Math.hypot(e.clientX-startX,e.clientY-startY)>6){moved=true;cancelTimer();}
  const box=screen.getBoundingClientRect();
  fx+=(e.clientX-x)*640/Math.max(1,box.width);
  fy+=(e.clientY-y)*200/Math.max(1,box.height);
  x=e.clientX;y=e.clientY;
  const dx=Math.trunc(fx),dy=Math.trunc(fy);fx-=dx;fy-=dy;
  if(dx||dy)adb.mouseInput(dx,dy,held);
 });
 screen.addEventListener('pointerup',e=>{
  if(e.pointerId!==pointer)return;e.preventDefault();release(!moved);
 });
 for(const type of ['pointercancel','lostpointercapture'])screen.addEventListener(type,e=>{
  if(e.pointerId===pointer)release();
 });
 host.addEventListener('blur',()=>release());
 screen.addEventListener('contextmenu',e=>e.preventDefault());
 return {release};
}
