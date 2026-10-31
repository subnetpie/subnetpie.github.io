import { SegaUSB } from './segausb.js';
import { SegaSpeech } from './segaspeech.js';

class AudioSink {
  constructor(){
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.ctx=AC?new AC({latencyHint:'interactive'}):null;
    this.rate=this.ctx?.sampleRate||48000;this.block=new Float32Array(1024);this.pos=0;this.nextTime=0;this.enabled=false;
  }
  async unlock(){
    if(!this.ctx)return;
    const wasRunning=this.enabled&&this.ctx.state==='running';
    try{
      if(this.ctx.state!=='running')await this.ctx.resume();
      this.enabled=this.ctx.state==='running';
      if(this.enabled&&!wasRunning){this.pos=0;this.nextTime=this.ctx.currentTime+.035;}
    }catch{}
  }
  push(v){if(!this.ctx||!this.enabled||this.ctx.state!=='running')return;this.block[this.pos++]=Math.max(-1,Math.min(1,v));if(this.pos<this.block.length)return;const b=this.ctx.createBuffer(1,this.block.length,this.rate);b.copyToChannel(this.block,0);const s=this.ctx.createBufferSource();s.buffer=b;s.connect(this.ctx.destination);const now=this.ctx.currentTime;if(this.nextTime<now+.015||this.nextTime>now+.25)this.nextTime=now+.035;s.start(this.nextTime);this.nextTime+=this.block.length/this.rate;this.pos=0;this.block=new Float32Array(1024);}
}

export class StarTrekAudio {
  constructor(speechCpuRom,speechDataRom){this.usb=new SegaUSB();this.speech=new SegaSpeech(speechCpuRom,speechDataRom);this.sink=new AudioSink();this.sampleRate=this.sink.rate;this.phase=0;}
  unlock(){return this.sink.unlock();}
  advanceMainCycles(cycles,mainHz){this.phase+=cycles*this.sampleRate/mainHz;while(this.phase>=1){const u=this.usb.stepSample(this.sampleRate);const s=this.speech.stepSample(this.sampleRate);this.sink.push(s+u*this.speech.usbGain);this.phase-=1;}}
}
