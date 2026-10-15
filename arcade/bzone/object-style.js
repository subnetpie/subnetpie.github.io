import { ASSETS } from './assets.js?v=20261001-radar-fan';

// Only known game identities can be styled. CPU/AVG hooks remain in AssetTrace.
const STYLE_KEYS = new Set(['source','color','brightness','lineGlow','fillSupported','fillOpacity','displayIntensity','ringRadius']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function number(value,name,max) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)
    throw new TypeError(`${name} must be a finite number from 0 to ${max}`);
  return value;
}
function opacity(value) {
  if(typeof value==='string'&&/^\s*(?:\d+(?:\.\d+)?|\.\d+)\s*%\s*$/.test(value))value=Number(value.replace('%',''))/100;
  return number(value,'fillOpacity',1);
}
export function compileObjectStyles(objects) {
  if(!objects||typeof objects!=='object'||Array.isArray(objects))throw new TypeError('OBJECTS must be an object');
  const result={};
  for(const [name,rule] of Object.entries(objects)) {
    if(!own(ASSETS,name))throw new TypeError(`Unknown game object: ${name}`);
    if(!rule||typeof rule!=='object'||Array.isArray(rule))throw new TypeError(`Invalid rule: ${name}`);
    for(const key of Object.keys(rule))if(!STYLE_KEYS.has(key))throw new TypeError(`Unknown setting ${name}.${key}`);
    if(rule.source!==undefined&&(!rule.source||typeof rule.source!=='object'||Array.isArray(rule.source)))throw new TypeError('source must be provenance metadata');
    const style={};
    if(rule.color!==undefined) {
      if(typeof rule.color!=='string'||!rule.color.trim())throw new TypeError('color must be a nonempty CSS color or palette name');
      style.color=rule.color;
    }
    if(rule.brightness!==undefined)style.brightness=number(rule.brightness,'brightness',4);
    if(rule.lineGlow!==undefined)style.glow=number(rule.lineGlow,'lineGlow',4);
    if(rule.displayIntensity!==undefined)style.displayIntensity=rule.displayIntensity===null?null:number(rule.displayIntensity,'displayIntensity',15);
    if(rule.ringRadius!==undefined)style.ringRadius=number(rule.ringRadius,'ringRadius',32);
    // Capability comes from existing geometry support, never from a caller's claim.
    const capable=name==='obstacle';
    if(rule.fillSupported!==undefined&&typeof rule.fillSupported!=='boolean')throw new TypeError('fillSupported must be boolean');
    if(rule.fillSupported===true&&!capable)throw new TypeError(`Fill geometry is not supported for ${name}`);
    const fill=rule.fillOpacity===undefined?(ASSETS[name].fillOpacity??0):opacity(rule.fillOpacity);
    if(fill>0&&!capable)throw new TypeError(`Fill geometry is not supported for ${name}`);
    style.fillOpacity=rule.fillSupported===false?0:fill;
    result[name]=style;
  }
  return result;
}
export function patchObjectStyle(objects,name,patch) {
  if(!own(objects,name))throw new TypeError(`Unknown game object: ${name}`);
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new TypeError('Style patch must be an object');
  if(own(patch,'source'))throw new TypeError('source is provenance metadata; change verified hooks in AssetTrace');
  const next=structuredClone(objects);
  next[name]={...next[name],...patch};
  compileObjectStyles(next); // Validate the full result before replacing live settings.
  return next;
}
