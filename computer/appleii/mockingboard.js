import {SC01A,SC01_CLOCK} from './sc01.js?v=20261005-mame0289-sc01a1';
// Mockingboard v2.2, slot 4.
// Register wiring follows MAME 0.289 a2mockingboard.cpp: dual VIA/AY audio
// plus one Votrax SC-01A on VIA1 PB, CB2 strobe and CB1 A/R return.
const LEVELS=[0,.00999,.01445,.02106,.03070,.04555,.06450,.10736,.12659,.20499,.29221,.37284,.49253,.63532,.80558,1];
export class AY8913 {
  constructor(){this.reset();}
  reset(){this.reg=new Uint8Array(16);this.address=255;this.phase=0;this.count=[0,0,0];this.out=[0,0,0];this.noiseCount=0;this.noise=1;this.envCount=0;this.envStep=15;this.attack=0;this.holding=false;}
  write(value){
    const r=this.address;if(r>15)return;
    const masks=[255,15,255,15,255,15,31,255,31,31,31,255,255,15,255,255];
    this.reg[r]=value&masks[r];
    if(r===13){this.envCount=0;this.envStep=15;this.attack=value&4?15:0;this.holding=false;}
  }
  advance(cycles){
    this.phase+=cycles;
    while(this.phase>=8){
      this.phase-=8;
      for(let c=0;c<3;c++)if(++this.count[c]>=Math.max(1,this.reg[c*2]|this.reg[c*2+1]<<8)){this.count[c]=0;this.out[c]^=1;}
      if(++this.noiseCount>=2*Math.max(1,this.reg[6])){this.noiseCount=0;this.noise=(this.noise>>>1)|(((this.noise^(this.noise>>>3))&1)<<16);}
      if(++this.envCount>=32*Math.max(1,this.reg[11]|this.reg[12]<<8)){
        this.envCount=0;
        if(!this.holding && --this.envStep<0){
          const shape=this.reg[13];
          if(!(shape&8)){this.attack=0;this.envStep=0;this.holding=true;}
          else if(shape&1){if(shape&2)this.attack^=15;this.envStep=0;this.holding=true;}
          else {if(shape&2)this.attack^=15;this.envStep=15;}
        }
      }
    }
    let sum=0;
    for(let c=0;c<3;c++){
      const level=this.reg[8+c]&16 ? this.envStep^this.attack : this.reg[8+c]&15;
      if((this.out[c] || (this.reg[7]&(1<<c))) && ((this.noise&1) || (this.reg[7]&(8<<c))))sum+=LEVELS[level];
    }
    return sum*.12;
  }
}
export class VIA6522 {
  constructor(ay,changed,{cb2=()=>{}}={}){this.ay=ay;this.changed=changed;this.cb2Changed=cb2;this.reset();}
  reset(){this.r=new Uint8Array(16);this.t1=0xffff;this.t2=0xffff;this.latch1=0xffff;this.latch2=0xffff;this.active1=false;this.active2=false;this.pb7=1;this.ca1Level=true;this.cb1Level=true;this.cb2Level=true;this.changed?.();}
  get irq(){return !!(this.r[13]&this.r[14]&0x7f);}
  ca1(request){
    const level=!request;
    if(this.ca1Level!==level && level===!!(this.r[12]&1)) {this.r[13]|=2;this.changed();}
    this.ca1Level=level;
  }
  cb1(level){
    level=!!level;
    if(this.cb1Level!==level && level===!!(this.r[12]&0x10)) {this.r[13]|=0x10;this.changed();}
    this.cb1Level=level;
  }
  setCb2(level){
    level=!!level;
    if(this.cb2Level===level)return;
    const old=this.cb2Level;this.cb2Level=level;
    this.cb2Changed(level,old);
  }
  updateCb2FromPCR(){
    const mode=(this.r[12]>>5)&7;
    if(mode===6)this.setCb2(false);
    else if(mode===7 || mode===4 || mode===5)this.setCb2(true);
  }
  clear(mask){this.r[13]&=~mask;this.changed();}
  bus(){
    const control=(this.r[0]&this.r[2])|(~this.r[2]&255);
    const data=(this.r[1]&this.r[3])|(~this.r[3]&255);
    if(!(control&4))this.ay.reset();
    else if((control&3)===3)this.ay.address=data;
    else if((control&3)===2)this.ay.write(data);
  }
  read(reg){
    switch(reg){
      case 0:this.clear(0x18);return ((this.r[0]&this.r[2])|(~this.r[2]&255))&~(this.r[11]&128) | ((this.r[11]&128)?this.pb7<<7:0);
      case 1:case 15:{if(reg===1)this.clear(2);const control=(this.r[0]&this.r[2])|(~this.r[2]&255);const input=(control&7)===5?(this.ay.reg[this.ay.address]??255):255;return (this.r[1]&this.r[3])|(input&~this.r[3]);}
      case 4:this.clear(64);return this.t1&255;
      case 5:return (this.t1>>>8)&255;
      case 6:return this.latch1&255;
      case 7:return this.latch1>>>8;
      case 8:this.clear(32);return this.t2&255;
      case 9:return (this.t2>>>8)&255;
      case 13:return this.r[13]|(this.irq?128:0);
      case 14:return this.r[14]|128;
      default:return this.r[reg];
    }
  }
  write(reg,value){
    value&=255;
    switch(reg){
      case 0:{
        this.clear(0x18);this.r[0]=value;this.bus();
        const mode=(this.r[12]>>5)&7;
        if(mode===4)this.setCb2(false);
        else if(mode===5){this.setCb2(false);this.setCb2(true);}
        break;
      }
      case 1:case 2:case 3:case 15:if(reg===1)this.clear(2);this.r[reg===15?1:reg]=value;this.bus();break;
      case 4:case 6:this.latch1=(this.latch1&0xff00)|value;break;
      case 5:this.latch1=(value<<8)|(this.latch1&255);this.t1=this.latch1+1;this.active1=true;this.pb7=0;this.clear(64);break;
      case 7:this.latch1=(value<<8)|(this.latch1&255);this.clear(64);break;
      case 8:this.latch2=(this.latch2&0xff00)|value;break;
      case 9:this.latch2=(value<<8)|(this.latch2&255);this.t2=this.latch2+1;this.active2=true;this.clear(32);break;
      case 12:this.r[12]=value;this.updateCb2FromPCR();break;
      case 13:this.clear(value&127);break;
      case 14:if(value&128)this.r[14]|=value&127;else this.r[14]&=~value;this.changed();break;
      default:this.r[reg]=value;
    }
  }
  tick(cycles){
    const period=this.latch1+2;
    const nextEvent=this.t1>=0?this.t1+1:period;
    const events=cycles>=nextEvent?1+Math.floor((cycles-nextEvent)/period):0;
    if(events && this.active1){
      this.r[13]|=64;
      if(this.r[11]&64)this.pb7^=events&1;
      else {this.pb7=1;this.active1=false;}
    }
    this.t1-=cycles;
    // T1 reloads even in one-shot mode; only IRQ generation is one-shot.
    // $FFFF is visible for one clock before the latch is reloaded.
    if(this.t1< -1)this.t1+=Math.ceil((-1-this.t1)/period)*period;
    if(!(this.r[11]&32)){
      this.t2-=cycles;
      if(this.t2<0){if(this.active2)this.r[13]|=32;this.active2=false;this.t2&=65535;}
    }
    this.changed();
  }
}
export class Mockingboard {
  constructor(memory,{clock=()=>0,hz=1020500,irq=()=>{},flush=()=>{},selected=()=>true}={}){
    this.clock=clock;this.hz=hz;this.irq=irq;this.flush=flush;this.selected=selected;
    this.ay=[new AY8913(),new AY8913()];
    this.via=[];
    this.via.push(new VIA6522(this.ay[0],()=>this.updateIRQ(),{cb2:(level,old)=>this.via1Cb2(level,old)}));
    this.via.push(new VIA6522(this.ay[1],()=>this.updateIRQ()));
    this.speech=new SC01A({hostHz:hz,ar:state=>this.via[0].cb1(state)});
    this.reset();
    memory.add_read_hook(addr=>{if(!this.handles(addr))return;this.sync(this.clock());return this.via[(addr>>7)&1].read(addr&15);});
    memory.add_write_hook((addr,value)=>{if(!this.handles(addr))return;this.sync(this.clock());this.flush(this.clock());this.via[(addr>>7)&1].write(addr&15,value);return true;});
  }
  via1Cb2(level,old){
    // MAME 0.289: CB2 high->low latches VIA1 PB into the SC-01A, then PB7:6
    // are applied as the two inflection inputs.
    if(old && !level){
      const portb=this.via[0].r[0];
      this.speech.write(portb,this.clock());
      this.speech.inflection_w(portb>>6);
    }
  }
  handles(addr){const bank=addr>>>16;return (bank===0||bank===1||bank===0xe0||bank===0xe1)&&(addr&0xff00)===0xc400&&this.selected();}
  updateIRQ(){this.irq(this.via.some(v=>v.irq));}
  reset(){this.lastClock=0;this.audioClock=0;this.fraction=0;this.previous=[0,0];this.filtered=[0,0];for(const ay of this.ay)ay.reset();for(const via of this.via)via.reset();this.speech.reset();this.updateIRQ();}
  sync(clock){const elapsed=Math.max(0,clock-this.lastClock);this.lastClock=clock;this.fraction+=elapsed*SC01_CLOCK/this.hz;const ticks=Math.floor(this.fraction);this.fraction-=ticks;if(ticks)for(const via of this.via)via.tick(ticks);this.speech.sync(clock);}
  sample(clock){const elapsed=Math.max(0,clock-this.audioClock)*SC01_CLOCK/this.hz;this.audioClock=clock;
    const speech=this.speech.sample(clock);
    return this.ay.map((ay,i)=>{const raw=ay.advance(elapsed);this.filtered[i]=raw-this.previous[i]+.995*this.filtered[i];this.previous[i]=raw;return this.filtered[i]+speech;});
  }
}
