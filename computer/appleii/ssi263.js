// SSI-263 sample-based speech. GPL-2.0-or-later.
// Hardware handshake reference: AppleWin SSI263.cpp (GPL-2.0-or-later),
// and Silicon Systems SSI 263A User's Guide / Data Sheet.
import {phonemeInfo,phonemePCM} from './vendor/ssi263-phonemes.js';
export class SSI263 {
  constructor({hz=1020500,request=()=>{}}={}){this.hz=hz;this.request=request;this.reset();}
  reset(){this.reg=new Uint8Array([0,0,0,128,255]);this.pending=false;this.enabled=false;this.start=0;this.deadline=Infinity;this.filter=0;this.request(false);}
  get poweredDown(){return !!(this.reg[3]&128);}
  // Datasheet phoneme duration: (16-RATE)*4096 clocks * (4-DUR),
  // using the approximately 1.023 MHz SSI clock.
  duration(){return (16-(this.reg[2]>>4))*4096/1023000*(4-(this.reg[0]>>6))*this.hz;}
  acknowledge(){this.pending=false;this.request(false);}
  begin(clock){this.start=clock;this.deadline=clock+this.duration();}
  write(register,value,clock){
    this.sync(clock);register&=7;if(register>4)register=4;value&=255;
    const old=this.reg[register];
    if(register<3 || (register===3 && (value&128)))this.acknowledge();
    this.reg[register]=value;
    if(register===0 && !this.poweredDown)this.begin(clock);
    if(register===3){
      if(value&128){this.deadline=Infinity;this.filter=0;}
      else if(old&128){this.enabled=!!(this.reg[0]&192);this.begin(clock);}
    }
    if(register===2 && !this.poweredDown)this.deadline=clock+this.duration();
  }
  sync(clock){
    if(this.poweredDown || clock<this.deadline)return;
    if(!this.pending){this.pending=true;this.request(this.enabled);}
    const duration=this.duration();
    this.deadline+= (Math.floor((clock-this.deadline)/duration)+1)*duration;
  }
  sample(clock){
    if(this.poweredDown || !(this.reg[3]&15) || !(this.reg[0]&63))return 0;
    const phoneme=Math.max(2,this.reg[0]&63),[offset,length]=phonemeInfo[phoneme-2];
    // Resample the recorded phoneme to the programmed duration. Inflection
    // and articulation registers are retained, but their analog response is
    // not modeled by this sample-based backend.
    const phase=((Math.max(0,clock-this.start)%this.duration())/this.duration())*(length-1);
    const index=Math.floor(phase),fraction=phase-index;
    const sample=(phonemePCM[offset+index]*(1-fraction)+phonemePCM[offset+Math.min(index+1,length-1)]*fraction)/32768;
    const gain=(this.reg[3]&15)/15*.45;
    // Filter-frequency control: a stable one-pole approximation, not the
    // original chip's multi-formant analog filter network.
    const alpha=.08+.92*this.reg[4]/255;
    this.filter+=alpha*(sample-this.filter);
    return this.filter*gain;
  }
}
