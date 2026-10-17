import {Motherboard} from "https://subnetpie.github.io/computer/appleii/motherboard.js?v=20261017-nox128k1";

const STORAGE_KEY='subnetpie.apple2.displaySpeed.v1';
const MODES=[
  {id:'1.0',label:'1.0',mhz:1.0},
  {id:'2.8',label:'2.8',mhz:2.8},
  {id:'7.1',label:'7.1',mhz:7.1},
  {id:'14.3',label:'14.3',mhz:14.3},
  {id:'infinity',label:'∞',mhz:null}
];
const machineType=new URLSearchParams(location.search).get('machine')==='iie'?'iie':'iigs';
const defaultMode=machineType==='iie'?'1.0':'2.8';

function readMode(){
  try{
    const v=localStorage.getItem(STORAGE_KEY);
    return MODES.some(m=>m.id===v)?v:defaultMode;
  }catch(_){return defaultMode;}
}
function writeMode(id){
  if(!MODES.some(m=>m.id===id))id=defaultMode;
  try{localStorage.setItem(STORAGE_KEY,id);}catch(_){}
  return id;
}

let activeMode=readMode();
const legacyButtons=new Map();
const unifiedButtons=new Map();

function sync(){
  for(const [id,button] of legacyButtons){
    const selected=id===activeMode;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-checked',selected?'true':'false');
  }
  for(const [id,button] of unifiedButtons){
    const selected=id===activeMode;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',selected?'true':'false');
  }
}
function setMode(id){activeMode=writeMode(id);sync();}

// Host-side scheduler scaling only. The IIgs still performs its normal
// $C036 fast/slow switching internally; this changes how much emulated master
// time is supplied per browser frame.
const originalClock=Motherboard.prototype.clock;
if(!Motherboard.prototype.__displaySpeedPresets){
  Motherboard.prototype.__displaySpeedPresets=true;
  Motherboard.prototype.clock=function(cycles,...args){
    const mode=MODES.find(m=>m.id===activeMode)||MODES.find(m=>m.id===defaultMode);
    if(mode.id==='infinity'){
      const start=performance.now();
      let result;
      do{result=originalClock.call(this,cycles,...args);}while(performance.now()-start<11);
      return result;
    }
    const nativeMHz=this.iigsEnabled?2.8:1.0205;
    const scaled=Math.max(1,Math.round(cycles*(mode.mhz/nativeMHz)));
    return originalClock.call(this,scaled,...args);
  };
}

function installLegacy(){
  const controls=document.getElementById('controls');
  if(!controls||document.getElementById('displaySpeedPresets'))return;

  const panel=document.createElement('div');
  panel.id='displaySpeedPresets';
  panel.className='display-speed-presets';
  panel.setAttribute('role','radiogroup');
  panel.setAttribute('aria-label','Emulation speed');

  for(const mode of MODES){
    const button=document.createElement('button');
    button.type='button';
    button.className='display-speed-preset';
    button.textContent=mode.label;
    button.dataset.speedMode=mode.id;
    button.setAttribute('role','radio');
    button.setAttribute('aria-label',mode.id==='infinity'?'Unlimited speed':`${mode.label} MHz`);
    button.title=mode.id==='infinity'?'Browser-limited turbo':`${mode.label} MHz host speed`;
    button.addEventListener('click',()=>setMode(mode.id));
    panel.append(button);
    legacyButtons.set(mode.id,button);
  }

  const colorPanel=document.getElementById('displayColorPresets');
  if(colorPanel)controls.insertBefore(panel,colorPanel);
  else{
    const scan=document.getElementById('buttonScanlines');
    controls.insertBefore(panel,scan||null);
  }

  const style=document.createElement('style');
  style.textContent=`
    #displaySpeedPresets{
      grid-column:1 / -1;
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:7px;
      padding:7px;
      background:#183f2b;
      border:2px solid #426a52;
      border-radius:5px;
    }
    .display-speed-preset{
      min-width:0;
      min-height:58px;
      padding:4px;
      border:4px solid #101416;
      border-radius:3px;
      background:#253fff;
      color:#fff;
      font-size:16px;
      font-weight:700;
      touch-action:manipulation;
    }
    .display-speed-preset.selected{
      outline:3px solid #35ff39;
      outline-offset:1px;
    }
    @media(max-width:430px){
      #displaySpeedPresets{gap:5px;padding:5px}
      .display-speed-preset{min-height:54px;font-size:14px}
    }
  `;
  document.head.append(style);
  sync();
}

function installUnified(){
  const target=document.getElementById('unifiedSpeed');
  if(!target||target.dataset.speedInstalled)return false;
  target.dataset.speedInstalled='1';
  target.replaceChildren();
  unifiedButtons.clear();
  for(const mode of MODES){
    const button=document.createElement('button');
    button.type='button';
    button.className='unified-choice';
    button.textContent=mode.label;
    button.setAttribute('aria-label',mode.id==='infinity'?'Unlimited speed':`${mode.label} MHz`);
    button.addEventListener('click',()=>setMode(mode.id));
    target.append(button);
    unifiedButtons.set(mode.id,button);
  }
  sync();
  return true;
}

function install(){
  installLegacy();
  if(!installUnified()){
    const observer=new MutationObserver(()=>{if(installUnified())observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
}

window.apple2DisplaySpeed={modes:MODES.map(m=>({...m})),getMode:()=>activeMode,setMode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
