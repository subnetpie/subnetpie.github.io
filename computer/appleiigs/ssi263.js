// SSI-263 sample-based speech. GPL-2.0-or-later.
// Hardware handshake reference: AppleWin SSI263.cpp (GPL-2.0-or-later),
// and Silicon Systems SSI 263A User's Guide / Data Sheet.
import {phonemeInfo,phonemePCM} from './vendor/ssi263-phonemes.js';
export class SSI263 {
  constructor({hz=1020500,request=()=>{}}={}){this.hz=hz;this.request=request;this.reset();}
  reset(){this.reg=new Uint8Array([0,0,0,128,255]);this.pending=false;this.enabled=false;this.mode=2;this.pitchCode=0;this.pitchCoarse=0;this.sampleClock=0;this.previousVoice=null;this.start=0;this.deadline=Infinity;this.filter=0;this.request(false);}
  get poweredDown(){return !!(this.reg[3]&128);}
  // Datasheet phoneme duration: (16-RATE)*4096 clocks * (4-DUR),
  // using the approximately 1.023 MHz SSI clock.
  duration(){return (16-(this.reg[2]>>4))*4096/1023000*(this.mode===1?1:4-(this.reg[0]>>6))*this.hz;}
  acknowledge(){this.pending=false;this.request(false);}
  inflection(){return ((this.reg[2]&8)<<8)|(this.reg[1]<<3)|(this.reg[2]&7);}
  pitchHz(){return 1023000/(8*(4096-this.pitchCode));}
  transitionSeconds(){return (8-((this.reg[3]>>4)&7))*.004;}
  begin(clock){this.start=clock;this.deadline=clock+this.duration();}
  write(register,value,clock){
    this.sync(clock);register&=7;if(register>4)register=4;value&=255;
    const old=this.reg[register];
    if(register<3 || (register===3 && (value&128)))this.acknowledge();
    if(register===0 && !this.poweredDown)this.previousVoice={reg:this.reg.slice(),start:this.start,duration:this.duration()};
    this.reg[register]=value;
    if(register===0 && !this.poweredDown)this.begin(clock);
    if(register===3){
      if(value&128){this.deadline=Infinity;this.filter=0;}
      else if(old&128){this.enabled=!!(this.reg[0]&192);if(this.enabled)this.mode=this.reg[0]>>6;this.pitchCode=this.inflection();this.pitchCoarse=this.pitchCode&0x7c0;this.sampleClock=clock;this.begin(clock);}
    }
    if(register===2 && !this.poweredDown)this.deadline=clock+this.duration();
  }
  sync(clock){
    if(this.poweredDown || clock<this.deadline)return;
    if(!this.pending){this.pending=true;this.request(this.enabled);}
    const duration=this.duration();
    this.deadline+= (Math.floor((clock-this.deadline)/duration)+1)*duration;
  }
  // Two overlapping grains separate speech duration from oscillator pitch.
  // This is a sample-domain approximation of the chip's vocal-tract filters.
  voice(reg,start,duration,clock,pitch){
    if(!(reg[0]&63))return 0;
    const [offset,length]=phonemeInfo[Math.max(2,reg[0]&63)-2];
    const elapsed=Math.max(0,clock-start)/this.hz, window=256, hop=128;
    const output=elapsed*22050, grain=Math.floor(output/hop);
    let sum=0,weight=0;
    for(let k=grain-1;k<=grain;k++){
      const age=output-k*hop;
      if(age<0||age>=window)continue;
      const w=.5-.5*Math.cos(2*Math.PI*age/window);
      const centerTime=(k*hop+window/2)/22050*this.hz;
      const center=((centerTime%duration)+duration)%duration/duration*(length-1);
      const pos=Math.max(0,Math.min(length-1,center+(age-window/2)*pitch/90));
      const i=Math.floor(pos),f=pos-i;
      sum+=w*(phonemePCM[offset+i]*(1-f)+phonemePCM[offset+Math.min(i+1,length-1)]*f)/32768;weight+=w;
    }
    return weight?sum/weight:0;
  }
  sample(clock){
    const dt=Math.max(0,clock-this.sampleClock)/this.hz;this.sampleClock=clock;
    if(this.poweredDown){this.filter=0;return 0;}
    const target=this.inflection();
    if(this.mode===3){
      // I10..I6 glide; I5..I3 choose the glide rate. I11 and I2..I0
      // are immediate in either mode, as specified by the datasheet.
      const mask=0x7c0,current=this.pitchCoarse;
      const step=2048*dt/((8-(this.reg[1]&7))*.016);
      const coarse=current+Math.max(-step,Math.min(step,(target&mask)-current));
      this.pitchCoarse=coarse;this.pitchCode=(target&0x807)+coarse;
    }else this.pitchCode=target;
    const pitch=this.pitchHz();
    let sample=this.voice(this.reg,this.start,this.duration(),clock,pitch);
    if(this.previousVoice){
      const blend=Math.min(1,Math.max(0,(clock-this.start)/this.hz/this.transitionSeconds()));
      const old=this.previousVoice;
      sample=this.voice(old.reg,old.start,old.duration,clock,pitch)*(1-blend)+sample*blend;
      if(blend===1)this.previousVoice=null;
    }
    const gain=(this.reg[3]&15)/15*.45;
    const filterClock=1023000/(2*(256-this.reg[4]));
    // The switched-capacitor clock changes timbre independently of pitch.
    const cutoff=Math.min(10000,filterClock/5);
    const alpha=1-Math.exp(-2*Math.PI*cutoff/22050);
    this.filter+=alpha*(sample-this.filter);
    return this.filter*gain;
  }
}
