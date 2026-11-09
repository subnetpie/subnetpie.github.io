import assert from 'node:assert/strict';
// Exercise actual event handlers with browser primitives stubbed; no game assets.
const elements=new Map(),events=new Map();
const defaults={brightness:'100',palette:'amber',speed:'1',search:'',sceneFilter:'all'};
class Element{
  constructor(id=''){this.id=id;this.value=defaults[id]??'';this.checked=['dots','glow'].includes(id);this.tagName='BUTTON';this.style={};this.children=[];this.attrs={};this.classList={toggle(){},add(){},remove(){}}}
  replaceChildren(...children){this.children=children}append(...children){this.children.push(...children)}
  setAttribute(name,value){this.attrs[name]=value}querySelector(){return null}add(option){this.children.push(option)}
  click(){this.onclick?.()}getContext(){return {fillRect(){},beginPath(){},arc(){},fill(){}}}
}
globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)},createElement(){return new Element()},addEventListener(name,callback){events.set(name,callback)},activeElement:{tagName:'BODY'}};
globalThis.Option=class{constructor(text,value){this.textContent=text;this.value=value}};
globalThis.requestAnimationFrame=callback=>{globalThis.nextTick=callback};globalThis.location={search:''};
await import('./dist/app.mjs');
const $=id=>elements.get(id);
function key(code,extra={}){const e={code,repeat:false,preventDefault(){this.prevented=true},...extra};events.get('keydown')(e);return e}
assert.equal($('playState').textContent,'PLAYING');
$('play').click();assert.equal($('playState').textContent,'PAUSED');
$('next').click();assert.match($('frameInfo').textContent,/FRAME 002/);
const before=$('displayName').textContent;
$('nextScene').click();assert.notEqual($('displayName').textContent,before);assert.match($('frameInfo').textContent,/FRAME 001/);assert.match($('animationInfo').textContent,/002 \/ 3/);assert.equal($('playState').textContent,'PAUSED');
document.activeElement=$('next');
assert.equal(key('Space').prevented,true);assert.equal($('playState').textContent,'PLAYING');
key('Space',{repeat:true});assert.equal($('playState').textContent,'PLAYING');
key('ArrowRight');assert.equal($('playState').textContent,'PAUSED');assert.match($('frameInfo').textContent,/FRAME 002/);
const second=$('displayName').textContent;key('ArrowRight',{altKey:true});assert.notEqual($('displayName').textContent,second);assert.match($('frameInfo').textContent,/FRAME 001/);
$('next').click();$('play').click();$('first').click();assert.equal($('playState').textContent,'PLAYING');assert.match($('frameInfo').textContent,/FRAME 001/);
document.activeElement={tagName:'INPUT'};assert.equal(key('Space').prevented,undefined);assert.equal($('playState').textContent,'PLAYING');
document.activeElement={tagName:'BODY'};key('Space');assert.equal($('playState').textContent,'PAUSED');
$('prevScene').click();assert.equal($('displayName').textContent,second);
assert.match($('play').innerHTML,/<svg/);assert.notEqual($('first').innerHTML,$('prev').innerHTML);assert.notEqual($('next').innerHTML,$('play').innerHTML);
console.log('Passed controls: next animation resets frame and changes scene; focused-button keyboard shortcuts; held Space; frame stepping; restart; distinct SVG icons.');
