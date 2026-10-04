// Mockingboard v2.2 (unpopulated speech sockets), slot 4.
// Register wiring: MAME 0.289 a2mockingboard.cpp; AY-3-8913 and R6522 data sheets.
const LEVELS=[0,.00999,.01445,.02106,.03070,.04555,.06450,.10736,.12659,.20499,.29221,.37284,.49253,.63532,.80558,1];
export class AY8913 {
  constructor(){this.reset();}
  reset(){this.reg=new Uint8Array(16);this.address=0;this.phase=0;this.count=[0,0,0];this.out=[0,0,0];this.noiseCount=0;this.noise=1;this.envCount=0;this.envStep=15;this.attack=0;this.holding=false;}
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
  constructor(ay,changed){this.ay=ay;this.changed=changed;this.reset();}
  reset(){this.r=new Uint8Array(16);this.t1=0xffff;this.t2=0xffff;this.latch1=0xffff;this.latch2=0xffff;this.active1=false;this.active2=false;this.pb7=1;this.changed?.();}
  get irq(){return !!(this.r[13]&this.r[14]&0x7f);}
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
      case 0:return ((this.r[0]&this.r[2])|(~this.r[2]&255))&~(this.r[11]&128) | ((this.r[11]&128)?this.pb7<<7:0);
      case 1:case 15:{const control=(this.r[0]&this.r[2])|(~this.r[2]&255);const input=(control&7)===5?(this.ay.reg[this.ay.address]??255):255;return (this.r[1]&this.r[3])|(input&~this.r[3]);}
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
      case 0:case 1:case 2:case 3:case 15:this.r[reg===15?1:reg]=value;this.bus();break;
      case 4:case 6:this.latch1=(this.latch1&0xff00)|value;break;
      case 5:this.latch1=(value<<8)|(this.latch1&255);this.t1=this.latch1+1;this.active1=true;this.pb7=0;this.clear(64);break;
      case 7:this.latch1=(value<<8)|(this.latch1&255);this.clear(64);break;
      case 8:this.latch2=(this.latch2&0xff00)|value;break;
      case 9:this.latch2=(value<<8)|(this.latch2&255);this.t2=this.latch2+1;this.active2=true;this.clear(32);break;
      case 13:this.clear(value&127);break;
      case 14:if(value&128)this.r[14]|=value&127;else this.r[14]&=~value;this.changed();break;
      default:this.r[reg]=value;
    }
  }
  tick(cycles){
    this.t1-=cycles;
    if(this.t1<0){
      if(this.active1){this.r[13]|=64;this.pb7^=1;}
      if(this.active1&&(this.r[11]&64)){while(this.t1<0)this.t1+=this.latch1+2;}
      else {this.active1=false;this.t1&=65535;}
    }
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
    for(const ay of this.ay)this.via.push(new VIA6522(ay,()=>this.updateIRQ()));
    this.reset();
    memory.add_read_hook(addr=>{if(!this.handles(addr))return;this.sync(this.clock());return this.via[(addr>>7)&1].read(addr&15);});
    memory.add_write_hook((addr,value)=>{if(!this.handles(addr))return;this.sync(this.clock());this.flush(this.clock());this.via[(addr>>7)&1].write(addr&15,value);return true;});
  }
  handles(addr){const bank=addr>>>16;return (bank===0||bank===1||bank===0xe0||bank===0xe1)&&(addr&0xff00)===0xc400&&this.selected();}
  updateIRQ(){this.irq(this.via.some(v=>v.irq));}
  reset(){this.lastClock=0;this.audioClock=0;this.fraction=0;this.previous=[0,0];this.filtered=[0,0];for(const ay of this.ay)ay.reset();for(const via of this.via)via.reset();this.updateIRQ();}
  sync(clock){const elapsed=Math.max(0,clock-this.lastClock);this.lastClock=clock;this.fraction+=elapsed*1020500/this.hz;const ticks=Math.floor(this.fraction);this.fraction-=ticks;if(ticks)for(const via of this.via)via.tick(ticks);}
  sample(clock){const elapsed=Math.max(0,clock-this.audioClock)*1020500/this.hz;this.audioClock=clock;
    return this.ay.map((ay,i)=>{const raw=ay.advance(elapsed);this.filtered[i]=raw-this.previous[i]+.995*this.filtered[i];this.previous[i]=raw;return this.filtered[i];});
  }
}
