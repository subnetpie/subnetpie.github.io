import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsADB} from './iigs_adb.js';
import {attachTouchMouse} from './touch_mouse.js';
const packet=d=>[d.readMouseData(),d.readMouseData()];
test('mouse preserves signed motion, X/Y packet boundaries, clicks and IRQ',()=>{
 let irq=false;const d=new IIgsADB(v=>irq=v);d.writeStatus(0x40);
 d.mouseInput(130,-70,false);assert.equal(irq,true);
 assert.equal(d.readMouseData(),0xbf);
 d.mouseInput(0,0,true);d.mouseInput(0,0,false);
 assert.equal(d.readMouseData(),0xc0);
 assert.deepEqual(packet(d),[0xbf,0xfa]);
 assert.deepEqual(packet(d),[0x84,0x80]);
 assert.deepEqual(packet(d),[0x80,0]);
 assert.deepEqual(packet(d),[0x80,0x80]);
 assert.equal(irq,false);assert.equal(d.mouseFull,false);
});
function fixture(){
 const handlers={},events=[],timers=new Map();let id=0;
 const screen={style:{},addEventListener:(n,fn)=>handlers[n]=fn,setPointerCapture(){},getBoundingClientRect:()=>({width:640,height:400})};
 const host={setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:n=>timers.delete(n),addEventListener:(n,fn)=>handlers[n]=fn};
 attachTouchMouse(screen,{mouseInput:(...a)=>events.push(a)},host);
 const fire=(name,x=0,y=0,extra={})=>handlers[name]({pointerId:1,pointerType:'touch',button:0,clientX:x,clientY:y,preventDefault(){},...extra});
 return {events,fire,hold(){for(const fn of timers.values())fn();timers.clear();}};
}
test('tap and double tap deliver distinct down/up transitions',()=>{
 const f=fixture();for(let i=0;i<2;i++){f.fire('pointerdown');f.fire('pointerup');}
 assert.deepEqual(f.events,[[0,0,true],[0,0,false],[0,0,true],[0,0,false]]);
});
test('swipe moves without clicking; hold then move drags and cancellation releases',()=>{
 const f=fixture();f.fire('pointerdown');f.fire('pointermove',20,20);f.fire('pointerup',20,20);
 assert.deepEqual(f.events,[[20,20,false]]);
 f.fire('pointerdown');f.hold();f.fire('pointermove',30,40);f.fire('pointercancel');
 assert.deepEqual(f.events.slice(1),[[0,0,true],[30,40,true],[0,0,false]]);
});
test('second pointer is ignored and blur releases drag',()=>{
 const f=fixture();f.fire('pointerdown');f.hold();f.fire('pointerdown',10,10,{pointerId:2});f.fire('pointerup',10,10,{pointerId:2});
 f.fire('blur');assert.deepEqual(f.events,[[0,0,true],[0,0,false]]);
});
test('Magic Keyboard hover moves without a click and reentry never jumps',()=>{
 const f=fixture(),mouse={pointerType:'mouse'};
 f.fire('pointerenter',100,100,mouse);
 f.fire('pointermove',120,120,mouse);
 f.fire('pointermove',130,100,mouse);
 assert.deepEqual(f.events,[[20,20,false],[10,-20,false]]);
 f.fire('pointerleave',130,100,mouse);
 f.fire('pointerenter',500,300,mouse);
 f.fire('pointermove',510,310,mouse);
 assert.deepEqual(f.events.at(-1),[10,10,false]);
 f.fire('blur');
 const count=f.events.length;
 f.fire('pointermove',10,10,mouse);
 assert.equal(f.events.length,count);
});
test('trackpad click-drag captures movement and releases outside screen',()=>{
 const f=fixture(),mouse={pointerType:'mouse'};
 f.fire('pointerenter',10,10,mouse);
 f.fire('pointerdown',10,10,mouse);
 f.fire('pointermove',30,50,mouse);
 f.fire('pointerleave',30,50,mouse);
 f.fire('pointermove',40,60,mouse);
 f.fire('pointerup',40,60,mouse);
 assert.deepEqual(f.events,[[0,0,true],[20,40,true],[10,10,true],[0,0,false]]);
 f.fire('pointermove',42,62,mouse);
 assert.deepEqual(f.events.at(-1),[2,2,false]);
});
