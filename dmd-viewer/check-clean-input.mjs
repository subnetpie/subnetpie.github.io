import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {bindSwitch,tapGuard} from '../dmd-viewer-clean/switch-input.mjs';
const {window}=new JSDOM('<button></button><button></button>'),buttons=[...window.document.querySelectorAll('button')];
let now=0;const guard=tapGuard(()=>now),events=[];
for(const button of buttons)bindSwitch(button,{down:()=>{if(!guard.accept(1))return false;events.push('down');return true;},up:()=>{guard.release(1);events.push('up');}});
function pointer(button,type,id=1){const event=new window.Event(type,{cancelable:true});Object.assign(event,{button:0,pointerId:id});button.dispatchEvent(event);}
function key(type,value=' ',repeat=false){buttons[0].dispatchEvent(new window.KeyboardEvent(type,{key:value,repeat,cancelable:true}));}
pointer(buttons[0],'pointerdown');now=20;pointer(buttons[0],'pointerup');now=80;pointer(buttons[0],'pointerdown');pointer(buttons[0],'pointerup');
assert.deepEqual(events,['down','up'],'Double tap must activate once.');
pointer(buttons[1],'pointerdown');pointer(buttons[1],'pointerup');assert.equal(events.length,2,'Duplicate diagram points share the guard.');
now=500;pointer(buttons[0],'pointerdown');pointer(buttons[0],'pointerdown',2);pointer(buttons[0],'pointerup',2);assert.equal(events.at(-1),'down','Second finger cannot release an existing hold.');
now=1500;pointer(buttons[0],'pointerup');pointer(buttons[0],'lostpointercapture');assert.deepEqual(events,['down','up','down','up']);
now=1600;key('keydown');key('keyup');assert.equal(events.length,4,'Hold release also blocks an immediate repeat.');
now=2000;key('keydown');key('keydown',' ',true);key('keyup');buttons[0].dispatchEvent(new window.MouseEvent('click',{detail:0}));assert.equal(events.length,6,'Keyboard repeat and synthetic click cannot duplicate a press.');
now=2500;buttons[0].dispatchEvent(new window.MouseEvent('click',{detail:0}));assert.deepEqual(events.slice(-2),['down','up'],'Assistive activation remains available.');
const double=new window.MouseEvent('dblclick',{cancelable:true});buttons[0].dispatchEvent(double);assert.equal(double.defaultPrevented,true);
guard.clear();assert.equal(guard.accept(1),true);
console.log('Clean input passed: double taps, duplicate points, multiple fingers, hold/release, keyboard repeat, assistive clicks and double-click prevention.');
