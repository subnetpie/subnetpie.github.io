import { PolePosition } from './pole-position.js';
import { ROMLoader } from './rom-loader.js';
import { ROM_CONFIG } from './rom-manifest.js';
import { PolePositionWSG } from './polepos-wsg.js';
import './polepos-voices.js';

export class EmulatorConfig {
  constructor() {
    this.roms=ROM_CONFIG;
    this.display={width:256,height:224};
    this.performance={cpuClock:3072000,cyclesPerFrame:50688,targetFPS:3072000/50688};
  }
}
class AudioManager {
  constructor(){this.context=null;this.next=0;this.muted=false;this.sources=new Set();}
  async unlock(){
    if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=this.muted?0:0.45;this.gain.connect(this.context.destination);}
    await this.context.resume();
  }
  configure(regions,core){
    const sr=this.context.sampleRate;this.fraction=0;
    this.wsg=new PolePositionWSG(sr,regions.namco);
    this.voices=new globalThis.PolePositionVoices(sr,regions.engine);
    core.onSound=(offset,value)=>this.wsg.write(offset,value);
    core.soundRegs().forEach((v,i)=>this.wsg.write(i,v));
  }
  reset(){this.stop();this.wsg?.reset();this.voices?.reset();this.fraction=0;}
  stop(){for(const source of this.sources){source.stop();source.disconnect();}this.sources.clear();this.next=0;}
  frame(core){
    if(!this.context || !this.wsg)return;
    this.fraction+=this.context.sampleRate*core.frameCycles/3072000;
    const count=Math.floor(this.fraction);this.fraction-=count;
    const samples=new Float32Array(count);
    this.wsg.render(samples,Boolean(core.engineLatch().clson));
    const stereo=new Int16Array(count*2);
    for(let i=0;i<count;i++)stereo[i*2]=stereo[i*2+1]=Math.max(-32768,Math.min(32767,samples[i]*32768));
    this.voices.mixInto(stereo,count,core);
    if(this.context.state!=='running')return;
    const now=this.context.currentTime;
    if(this.next>now+0.15)return;
    this.next=Math.max(this.next,now+0.02);
    const buffer=this.context.createBuffer(1,count,this.context.sampleRate);
    // Upstream discrete mixer emits signed 16-bit-scale samples.
    const normalized=Float32Array.from({length:count},(_,i)=>stereo[i*2]/32768);
    buffer.copyToChannel(normalized,0);
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);
    this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();};
    source.start(this.next);this.next+=count/this.context.sampleRate;
  }
}
class PolePositionApp {
  constructor(){
    this.config=new EmulatorConfig();this.loader=new ROMLoader(this.config.roms);this.audio=new AudioManager();
    this.canvas=document.querySelector('#gameCanvas');this.status=document.querySelector('#status');
    this.panel=document.querySelector('#loadingPanel');this.play=document.querySelector('#play');
    this.running=false;this.core=null;this.sources=new Map();this.gear=false;this.previous=0;this.accumulator=0;
    this.bindControls();this.load();requestAnimationFrame(t=>this.frame(t));
  }
  async load(files){
    this.running=false;this.audio.stop();this.panel.hidden=false;this.play.hidden=true;
    document.querySelector('#romErrors').textContent='';this.status.textContent='Loading ROMs…';
    document.querySelector('#loadFiles').disabled=true;
    try{
      if(files)await this.loader.addFiles(files);
      this.regions=await this.loader.load(message=>this.status.textContent=message);
      this.core=PolePosition.create(this.canvas,this.regions);
      this.sources.clear();this.setGear(false);
      this.status.textContent='Ready to race';this.play.hidden=false;
      document.querySelector('#btnPause').disabled=false;document.querySelector('#btnReset').disabled=false;
    }catch(error){this.core=null;this.status.textContent='Some ROMs could not be loaded. Select your ROM files below.';document.querySelector('#romErrors').textContent=error.message;document.querySelector('details').open=true;}
    finally{document.querySelector('#loadFiles').disabled=false;}
  }
  async start(){
    if(!this.core)return;
    try{await this.audio.unlock();this.audio.configure(this.regions,this.core);}catch(error){this.status.textContent=`Audio unavailable: ${error.message}. Playing silently.`;}
    this.panel.hidden=true;this.running=true;this.previous=performance.now();this.accumulator=0;
    document.querySelector('#btnPause').textContent='Pause';
  }
  input(name,source,down){
    if(!this.sources.has(name))this.sources.set(name,new Set());const active=this.sources.get(name);
    if(down)active.add(source);else active.delete(source);
    this.core?.setInput(this.core.MASK[name],active.size>0);
  }
  releaseInputs(){for(const [name]of this.sources)this.core?.setInput(this.core.MASK[name],false);this.sources.clear();document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
  setGear(high){this.gear=high;this.core?.setInput(this.core.MASK.gear,high);const el=document.querySelector('#btnGear');el.setAttribute('aria-pressed',String(high));el.textContent=high?'HIGH GEAR · G':'LOW GEAR · G';}
  pause(){this.running=false;this.audio.stop();this.releaseInputs();document.querySelector('#btnPause').textContent='Resume';}
  bindControls(){
    this.play.onclick=()=>this.start();
    document.querySelector('#loadFiles').onclick=()=>this.load(document.querySelector('#romFiles').files);
    document.querySelector('#btnPause').onclick=()=>{if(this.running)this.pause();else{this.audio.unlock().catch(()=>{});this.running=Boolean(this.core);this.previous=performance.now();document.querySelector('#btnPause').textContent='Pause';}};
    document.querySelector('#btnReset').onclick=()=>{this.core?.reset();this.audio.reset();this.releaseInputs();this.setGear(false);};
    document.querySelector('#btnGear').onclick=()=>this.setGear(!this.gear);
    document.querySelector('#btnSound').onclick=()=>{this.audio.muted=!this.audio.muted;if(this.audio.gain)this.audio.gain.gain.value=this.audio.muted?0:0.45;const el=document.querySelector('#btnSound');el.textContent=this.audio.muted?'Sound off':'Sound on';el.setAttribute('aria-pressed',String(!this.audio.muted));};
    document.querySelector('#btnFullscreen').onclick=()=>document.querySelector('#gameContainer').requestFullscreen?.().catch(()=>{});
    const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'accel',ArrowDown:'brake',Digit5:'coin'};
    for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
      if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
      const name=keyMap[event.code];if(name){event.preventDefault();this.input(name,event.code,type==='keydown');}
      if(event.code==='KeyG'&&type==='keydown'&&!event.repeat)this.setGear(!this.gear);
    });
    document.querySelectorAll('[data-input]').forEach(button=>{
      button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);button.classList.add('held');this.input(button.dataset.input,event.pointerId,true);};
      const release=event=>{button.classList.remove('held');this.input(button.dataset.input,event.pointerId,false);};
      button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
    });
    window.addEventListener('blur',()=>this.pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
  }
  frame(now){
    if(this.running&&this.core){
      this.accumulator+=Math.min(now-this.previous,100);const interval=1000/this.config.performance.targetFPS;
      let frames=0;while(this.accumulator>=interval&&frames++<6){this.core.runFrame();this.audio.frame(this.core);this.accumulator-=interval;}
      this.core.render();
    }
    this.previous=now;requestAnimationFrame(t=>this.frame(t));
  }
}
new PolePositionApp();
