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
      (this.kind === 'input' && selector.includes('input')); }
  }
  vm.runInNewContext(readFileSync(new URL('./touch-guard.js', import.meta.url), 'utf8'), {
    Element, document: {addEventListener(type, handler) {handlers.set(type, handler);}}
  });
  for(const type of ['pointerdown','touchend']) {
    for(const kind of ['load','input','stick']) {
      let prevented = false;
      handlers.get(type)({target: new Element(kind), pointerType: 'touch', cancelable: true,
        preventDefault() {prevented = true;}});
      assert.equal(prevented, kind === 'stick', `${type} ${kind}`);
    }
  }
});
