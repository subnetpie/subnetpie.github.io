import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMachine} from './test-support/headless.mjs';
import {createKeyboardInput,resetWithKeyboard} from './keyboard_input.js';
import {attachTouchKeyboard} from './touch_keyboard.js';
import {attachHostKeyboard} from './host_keyboard.js';

class Key extends EventTarget {
  constructor(){super();this.attributes=new Map();this.classes=new Set();this.classList={
    toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  setAttribute(name,value){this.attributes.set(name,value);}
  setPointerCapture(){}
}
function setup() {
  const {board,joystick}=createMachine();
  const input=createKeyboardInput(board.keyboard,board.memory.adb,joystick);
  const doc=new EventTarget(),host=new EventTarget(),elements=new Map();
  for(const id of ['buttonShift','buttonShiftRight','buttonCtrl','buttonOpenApple','buttonSolidApple',
    'buttonCaps','buttonA','buttonB','button1','buttonKeyboardReset'])elements.set(id,new Key());
  doc.getElementById=id=>elements.get(id);
  const resets=[];
  attachTouchKeyboard(input,e=>resets.push(resetWithKeyboard(board,input,e)),doc,host);
  attachHostKeyboard(board.keyboard,board.memory.adb,joystick,doc,host,input);
  const send=(target,type,props={})=>{
    const e=new Event(type,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e;
  };
  const tap=(id,pointerId=1)=>{send(elements.get(id),'pointerdown',{pointerId});send(elements.get(id),'pointerup',{pointerId});};
  return {board,input,doc,host,elements,resets,send,tap};
}

test('touch modifiers latch together, reach guest registers, and remain visibly held',()=>{
  const s=setup();
  for(const id of ['buttonShift','buttonCtrl','buttonOpenApple','buttonSolidApple'])s.tap(id);
  assert.equal(s.board.memory.read(0xc025)&0xc3,0xc3);
  assert.equal(s.board.memory.read(0xc061)&128,128);
  assert.equal(s.board.memory.read(0xc062)&128,128);
  s.tap('buttonA');
  assert.equal(s.board.keyboard.key&127,1,'Control + A delivers ASCII 1');
  for(const id of ['buttonShift','buttonShiftRight','buttonCtrl','buttonOpenApple','buttonSolidApple']) {
    assert.equal(s.elements.get(id).attributes.get('aria-pressed'),'true',id);
    assert.ok(s.elements.get(id).classes.has('active'),id);
  }
  s.tap('buttonCtrl');
  assert.equal(s.input.modifiers().control,false);
  assert.equal(s.input.modifiers().shift,true,'Control does not cancel Shift');
  s.tap('button1');assert.equal(s.board.keyboard.key&127,33,'Shift + 1 delivers !');
});

test('touch rollover and pointer cancellation release only the relevant key',()=>{
  const s=setup(),a=s.elements.get('buttonA'),b=s.elements.get('buttonB');
  s.send(a,'pointerdown',{pointerId:11});s.send(b,'pointerdown',{pointerId:12});
  s.send(a,'pointerup',{pointerId:11});
  assert.equal(s.board.keyboard.key_pressed,true);
  assert.equal(s.board.keyboard.key&127,66);
  s.send(b,'pointercancel',{pointerId:12});
  assert.equal(s.board.keyboard.key_pressed,false);
  assert.ok(!b.classes.has('pressed'));
  s.send(a,'pointerdown',{pointerId:13});s.send(b,'pointerdown',{pointerId:14});
  s.send(b,'pointerup',{pointerId:14});
  assert.equal(s.board.keyboard.key&127,65,'release newest key restores still-held A');
  s.host.dispatchEvent(new Event('blur'));
  assert.equal(s.board.keyboard.key_pressed,false);
  assert.ok(!a.classes.has('pressed'));
});

test('Control + Open Apple + Reset cold-reboots and clears all held input',()=>{
  const s=setup();
  s.board.prodosBlock.load_image('boot.hdv',new Uint8Array(1024));
  s.board.memory.ram[0x20000]=0x5a;
  for(const id of ['buttonShift','buttonCtrl','buttonOpenApple','buttonSolidApple','buttonCaps'])s.tap(id);
  s.send(s.elements.get('buttonA'),'pointerdown',{pointerId:9});
  s.tap('buttonKeyboardReset');
  assert.deepEqual(s.resets,[true]);
  assert.equal(s.board.memory.ram[0x20000],0,'hard reboot clears RAM');
  assert.equal(s.board.keyboard.key_pressed,false);
  assert.equal(s.board.memory.adb.readKeyModifiers(),0);
  assert.equal(s.board.memory.adb.readKeyData()&128,0);
  assert.equal(s.board.memory.read(0xc061)&128,0);
  assert.equal(s.board.memory.read(0xc062)&128,0);
  assert.ok(s.board.prodosBlock.drives[0].image,'hard reboot preserves mounted disks');
  for(const id of ['buttonShift','buttonCtrl','buttonOpenApple','buttonSolidApple','buttonCaps'])
    assert.equal(s.elements.get(id).attributes.get('aria-pressed'),'false',id);
  assert.ok(!s.elements.get('buttonA').classes.has('pressed'));
  s.board.memory.ram[0x20000]=0x5a;
  s.tap('buttonKeyboardReset');assert.deepEqual(s.resets,[true,false],'plain Reset stays warm');
  assert.equal(s.board.memory.ram[0x20000],0x5a,'plain Reset preserves RAM');
});

test('physical and touch modifiers combine without overwriting one another',()=>{
  const s=setup();s.tap('buttonOpenApple');
  s.send(s.doc,'keydown',{key:'Control',code:'ControlLeft',ctrlKey:true});
  assert.equal(s.input.modifiers().command,true);
  assert.equal(s.elements.get('buttonCtrl').attributes.get('aria-pressed'),'true');
  s.tap('buttonKeyboardReset');assert.deepEqual(s.resets,[true]);
  s.send(s.doc,'keyup',{key:'Control',code:'ControlLeft',ctrlKey:false});
  s.tap('buttonCtrl');
  s.send(s.doc,'keydown',{key:'a',code:'KeyA'});
  assert.equal(s.board.keyboard.key&127,1,'touch Control applies to physical A');
  s.send(s.doc,'keyup',{key:'a',code:'KeyA'});
  assert.equal(s.input.modifiers().control,true,'physical release preserves touch latch');
  s.tap('buttonCtrl');s.tap('buttonShift');
  s.send(s.doc,'keydown',{key:'1',code:'Digit1'});
  assert.equal(s.board.keyboard.key&127,33,'touch Shift applies to physical punctuation');
  s.send(s.doc,'keyup',{key:'1',code:'Digit1'});
  s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(s.input.modifiers().control,false);
});

test('physical Control + Command and plain reset events use the same reset policy',()=>{
  const s=setup();
  s.send(s.doc,'keydown',{key:'Meta',code:'MetaLeft',ctrlKey:true,metaKey:true});
  assert.equal(resetWithKeyboard(s.board,s.input),true);
  assert.equal(resetWithKeyboard(s.board,s.input,{shiftKey:true}),false);
  assert.equal(resetWithKeyboard(s.board,s.input,{altKey:true}),false);
  assert.equal(resetWithKeyboard(s.board,s.input,{ctrlKey:true,metaKey:true}),true);
});
