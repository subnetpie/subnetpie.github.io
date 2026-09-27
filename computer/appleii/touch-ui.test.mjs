import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source = readFileSync(new URL('./script.js', import.meta.url), 'utf8');
const compose = source.slice(source.indexOf('function composeScreen()'), source.indexOf('// MAIN FUNCTION //'));
for(const [width,height] of [[390,844],[844,390]]) {
  test(`layout initializes with the real browser screen global at ${width}x${height}`, () => {
    const elements = new Map();
    const get = id => {
      if(!elements.has(id)) elements.set(id, {style: {removeProperty() {}}, innerText: ''});
      return elements.get(id);
    };
    get('buttonInput').innerText = 'keyboard';
    get('buttonKeyboard').innerText = '123';
    const browserScreen = Object.freeze({width,height});
    vm.runInNewContext(compose + '\ncomposeScreen();', {
      screen: browserScreen, window: {innerWidth: width, innerHeight: height},
      buttonInput: get('buttonInput'), buttonKeyboard: get('buttonKeyboard'),
      document: {getElementById: get, body: {style: {}, classList: {toggle() {}}}}
    });
    assert.equal(get('screen').style.left, '50%');
    assert.equal(browserScreen.style, undefined);
  });
}
test('native Load label is exempt from touch cancellation', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /<label[^>]*id="buttonLoad"[^>]*for="filedialog1"/);
  const handlers = new Map();
  class Element {
    constructor(kind) {this.kind = kind;}
    closest(selector) { return (this.kind === 'load' && selector.includes('#buttonLoad')) ||
      (this.kind === 'input' && selector.includes('input')) ||
      (this.kind === 'archive' && selector.includes('#archiveDialog')); }
  }
  vm.runInNewContext(readFileSync(new URL('./touch-guard.js', import.meta.url), 'utf8'), {
    Element, document: {addEventListener(type, handler) {handlers.set(type, handler);}}
  });
  for(const type of ['pointerdown','touchend']) {
    for(const kind of ['load','input','archive','stick']) {
      let prevented = false;
      handlers.get(type)({target: new Element(kind), pointerType: 'touch', cancelable: true,
        preventDefault() {prevented = true;}});
      assert.equal(prevented, kind === 'stick', `${type} ${kind}`);
    }
  }
});

test('ZIP picker returns the selected image and supports cancellation', async () => {
  const picker = source.slice(source.indexOf('function chooseArchiveImage('), source.indexOf('import { Motherboard }'));
  let closed;
  const dialog = {returnValue:'', addEventListener(type,fn){closed=fn;},showModal(){}};
  const select = {value:'0', replaceChildren(){this.options=[];}, append(option){this.options.push(option);}};
  const title = {};
  const context = {document:{getElementById(id){return id==='archiveDialog'?dialog:id==='archiveImages'?select:title;},createElement(){return {};}}};
  vm.createContext(context);vm.runInContext(picker, context);
  const entries=[{name:'disk1.dsk'},{name:'disk2.dsk'}];
  const chosen=context.chooseArchiveImage('game.zip',entries);
  assert.equal(title.textContent,'game.zip');
  assert.equal(select.options.length,2);
  select.value='1';dialog.returnValue='load';closed();
  assert.equal(await chosen,entries[1]);
  const cancelled=context.chooseArchiveImage('game.zip',entries);
  dialog.returnValue='cancel';closed();assert.equal(await cancelled,null);
});
