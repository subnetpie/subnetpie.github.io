import {PokeyAudio,POKEY_CLOCK} from './pokey-audio.js?v=20260930-mame289';
import {BattlezoneDiscrete} from './discrete-audio.js?v=20260930-mame289';

// CPU-timestamped synthesis. Browser callbacks only drain the produced samples;
// they never run an independent sound clock or discard register-write timing.
export class BzoneAudio {
 constructor(game) {
  this.game=game;this.ctx=null;this.reg=new Uint8Array(16);this.latch=0;
  this.queue=new Float32Array(16384);this.readIndex=0;this.writeIndex=0;this.count=0;
  this.underruns=0;this.overruns=0;this.primed=false;
 }
 start() {
  if(!this.ctx) {
   const AudioCtx=window.AudioContext||window.webkitAudioContext;
   if(!AudioCtx)return;
   this.ctx=new AudioCtx();
   this.pokey=new PokeyAudio();this.discrete=new BattlezoneDiscrete(this.ctx.sampleRate);
   for(let r=0;r<16;r++)if(r!==9)this.pokey.write(r,this.reg[r]);
   this.pokey.write(9,0);this.discrete.latch=this.latch;
   this.audioCycle=this.game.cpu?.cycles??0;
   this.samplePhase=0;this.sampleSum=0;this.sampleClocks=0;
   this.node=this.ctx.createScriptProcessor(1024,0,1);
   this.node.onaudioprocess=e=>this.render(e.outputBuffer.getChannelData(0));
   this.node.connect(this.ctx.destination);
  }
  if(this.ctx.state==='suspended'||this.ctx.state==='interrupted')this.ctx.resume().catch(()=>{});
 }
 read(r){return (r&15)===8?this.game.in3():this.reg[r&15];}
 write(r,d){
  this.sync();r&=15;d&=255;this.reg[r]=d;
  this.pokey?.write(r,d);
 }
 control(d){this.sync();this.latch=d&255;if(this.discrete)this.discrete.latch=this.latch;}
 sync(cycle=this.game.cpu?.cycles??0) {
  if(!this.ctx)return;
  while(this.audioCycle<cycle) {
   this.audioCycle++;
   this.sampleSum+=this.pokey.step();this.sampleClocks++;
   this.samplePhase+=this.ctx.sampleRate;
   if(this.samplePhase<POKEY_CLOCK)continue;
   this.samplePhase-=POKEY_CLOCK;
   const sample=this.discrete.step(this.sampleSum/this.sampleClocks);
   this.sampleSum=0;this.sampleClocks=0;
   if(this.count===this.queue.length){this.readIndex=(this.readIndex+1)%this.queue.length;this.count--;this.overruns++;}
   this.queue[this.writeIndex]=sample;this.writeIndex=(this.writeIndex+1)%this.queue.length;this.count++;
  }
 }
 render(out) {
  out.fill(0);
  if(this.game.paused){this.count=0;this.readIndex=this.writeIndex;this.primed=false;return;}
  // Two callback blocks cushion the 41 Hz emulation frame boundary.
  if(!this.primed){if(this.count<out.length*2)return;this.primed=true;}
  for(let i=0;i<out.length;i++) {
   if(!this.count){this.underruns++;this.primed=false;break;}
   out[i]=this.queue[this.readIndex];this.readIndex=(this.readIndex+1)%this.queue.length;this.count--;
  }
 }
}
