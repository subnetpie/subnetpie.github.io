import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMachine} from './test-support/headless.mjs';
import {appleKey,attachHostKeyboard} from './host_keyboard.js';

test('iPad layout characters, arrows, delete and control codes map to IIgs ASCII',()=>{
  for(const [key,value] of [['a',97],['A',65],['%',37],["'",39],['(',40],['Enter',13],['Escape',27],['Tab',9],['Backspace',127],['Delete',127],['ArrowLeft',8],['ArrowRight',21],['ArrowUp',11],['ArrowDown',10]])
    assert.equal(appleKey({key}),value,key);
  for(let i=0;i<26;i++) assert.equal(appleKey({key:String.fromCharCode(97+i),ctrlKey:true}),i+1);
  assert.equal(appleKey({key:'[',ctrlKey:true}),27);
  assert.equal(appleKey({key:'Dead',code:'KeyE',altKey:true}),101);
  assert.equal(appleKey({key:'é',isComposing:true}),null);
});

test('host events reach IIgs registers and release modifiers without losing joystick fire',()=>{
  const {board,joystick}=createMachine();
  const doc=new EventTarget(),host=new EventTarget();
  const detach=attachHostKeyboard(board.keyboard,board.memory.adb,joystick,doc,host);
  function send(type,props={}) {
    const e=new Event(type,{cancelable:true});
    Object.assign(e,{key:'a',code:'KeyA',getModifierState:()=>false},props);
    doc.dispatchEvent(e); return e;
  }
  assert.equal(send('keydown').defaultPrevented,true);
  assert.equal(board.memory.read(0xc000),0xe1);
  send('keyup');
  assert.equal(board.keyboard.key_pressed,false);
  send('keydown',{key:'%',code:'Digit5',shiftKey:true,metaKey:true,altKey:true,ctrlKey:true,getModifierState:()=>true});
  assert.equal(board.memory.read(0xc025)&0xc7,0xc7);
  assert.equal(board.memory.read(0xc061)&128,128);
  assert.equal(board.memory.read(0xc062)&128,128);
  joystick.button0=true;
  host.dispatchEvent(new Event('blur'));
  assert.equal(board.memory.read(0xc025),0);
  assert.equal(board.memory.read(0xc061)&128,128);
  assert.equal(board.memory.read(0xc062)&128,0);

  // Physical-key rollover: newest held key is active; releasing it restores
  // the previous still-held key instead of falsely reporting keyboard-up.
  send('keydown',{key:'a',code:'KeyA'});
  assert.equal(board.memory.read(0xc000),0xe1);
  send('keydown',{key:'b',code:'KeyB'});
  assert.equal(board.memory.read(0xc000),0xe2);
  send('keyup',{key:'b',code:'KeyB'});
  assert.equal(board.keyboard.key_pressed,true);
  assert.equal(board.memory.read(0xc000),0xe1);
  send('keyup',{key:'a',code:'KeyA'});
  assert.equal(board.keyboard.key_pressed,false);

  doc.closest=()=>true;
  assert.equal(send('keydown').defaultPrevented,false);
  assert.equal(board.keyboard.key_pressed,false);
  detach();
});
