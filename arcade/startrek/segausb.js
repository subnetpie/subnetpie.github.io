import { MCS48 } from './mcs48.js';

const MASTER=6000000, CPU_CPS=MASTER/15, AUDIO_HZ=MASTER/3, PCS_HZ=AUDIO_HZ/2, GOS_HZ=AUDIO_HZ/16/4, NOISE_HZ=100000;
const u16=v=>v&0xffff;
class RC { constructor(r,c){this.cap=0;this.exp=1-Math.exp(-1/(r*c*AUDIO_HZ));} rc(x){return this.cap+=(x-this.cap)*this.exp;} cr(x){const y=x-this.cap;this.cap+=y*this.exp;return y;} }
class Chan { constructor(){this.holding=0;this.latchmode=0;this.latchtoggle=0;this.clockmode=0;this.bcdmode=0;this.output=0;this.lastgate=0;this.gate=0;this.subcount=0;this.count=0;this.remain=0;} clock(){const old=this.lastgate;this.lastgate=this.gate;if(this.holding)return;if(this.clockmode===1){if(!old&&this.gate){this.output=0;this.remain=this.count;}else{this.remain=u16(this.remain-1);if(this.remain===0)this.output=1;}}else if(this.clockmode===3){this.remain=u16(this.remain-1)&0xfffe;if(this.remain===0){this.output^=1;this.remain=this.count;}}} }
class Group { constructor(){this.ch=[new Chan(),new Chan(),new Chan()];this.env=[0,0,0];this.cf=[new RC(1e4,1e-6),new RC(1e4,1e-6)];this.g1=new RC(1e5,.01e-6);this.g2=new RC(2e5,.01e-6);this.config=0;} }

export class SegaUSB {
  constructor(){
    this.programRam=new Uint8Array(0x1000);this.workRam=new Uint8Array(0x400);this.inLatch=0;this.outLatch=0;this.lastP2=0;this.bank=0;this.t1Clock=0;this.t1Mask=0x10;
    this.groups=[new Group(),new Group(),new Group()];this.noiseShift=0x15555;this.noiseState=0;this.noiseSubcount=0;
    this.noiseFilters=[new RC(5400,1e-6),new RC(3700,.30e-6),new RC(2970,.15e-6),new RC(2700,.082e-6),new RC(33000,.1e-6)];
    this.finalFilter=new RC(100000,4.7e-6);
    const tmp=(r,c)=>1-Math.exp(-1/(r*c*AUDIO_HZ));this.g1exp=[tmp(1e5,.01e-6),tmp(1e3,.01e-6)];this.g2exp=[tmp(2e5,.01e-6),tmp(2e3,.01e-6)];
    this.cpuBudget=0;this.t1Phase=0;this.audioPhase=0;this.output=0;
    this.cpu=new MCS48({ramSize:64,programRead:a=>this.programRam[a&0xfff],extRead:a=>this.workRead(a),extWrite:(a,v)=>this.workWrite(a,v),portRead:p=>p===1?(this.inLatch&0x7f):0xff,portWrite:(p,v)=>{if(p===1)this.p1Write(v);else if(p===2)this.p2Write(v);},testRead:n=>n===1?this.t1Read():0});
    this.cpu.setReset(true);
  }
  status(){return (this.outLatch&0x81)|(this.inLatch&0x7e);}
  dataWrite(data){data&=255;this.cpu.setReset(!!(data&0x80));if((this.lastP2&0x40)===0)data&=0x80;this.inLatch=data;}
  readRam(a){return this.programRam[a&0xfff];}
  writeRam(a,v){if(this.inLatch&0x80)this.programRam[a&0xfff]=v&255;}
  p1Write(data){this.outLatch=(this.outLatch&0xfe)|((data>>>7)&1);}
  p2Write(data){data&=255;const old=this.lastP2;this.lastP2=data;this.bank=data&3;this.outLatch=((data&0x40)<<1)|(this.outLatch&0x7f);if(!(data&0x40))this.inLatch=0;if((old&0x80)&&!(data&0x80))this.t1Clock=0;}
  t1Read(){return (this.t1Clock&this.t1Mask)?1:0;}
  workRead(off){return this.workRam[((this.bank<<8)|(off&255))&0x3ff];}
  workWrite(off,data){const a=((this.bank<<8)|(off&255))&0x3ff;data&=255;this.workRam[a]=data;if(a>=0x18)return;switch(a&~3){case 0:this.timerWrite(0,a&3,data);break;case 4:this.envWrite(0,a&3,data);break;case 8:this.timerWrite(1,a&3,data);break;case 12:this.envWrite(1,a&3,data);break;case 16:this.timerWrite(2,a&3,data);break;case 20:this.envWrite(2,a&3,data);break;}}
  timerWrite(which,off,data){const g=this.groups[which];if(off<3){const c=g.ch[off],held=!!c.holding;if(c.latchmode===1){c.count=data;c.holding=0;}else if(c.latchmode===2){c.count=(data<<8)&0xffff;c.holding=0;}else if(c.latchmode===3){if(c.latchtoggle===0){c.count=(c.count&0xff00)|data;c.latchtoggle=1;}else{c.count=(c.count&0xff)|(data<<8);c.holding=0;c.latchtoggle=0;}}if(held&&!c.holding)c.remain=1;}else{const n=(data>>6)&3;if(n<3){const c=g.ch[n];c.holding=1;c.latchmode=(data>>4)&3;c.clockmode=(data>>1)&7;c.bcdmode=data&1;c.latchtoggle=0;c.output=c.clockmode===1?1:0;}}}
  envWrite(which,off,data){const g=this.groups[which];if(off<3)g.env[off]=data;else g.config=data&1;}
  runCpuSample(sampleRate){this.cpuBudget+=CPU_CPS/sampleRate;while(this.cpuBudget>=1){const used=this.cpu.step();this.cpuBudget-=used;this.t1Phase+=used*(AUDIO_HZ/256)/CPU_CPS;while(this.t1Phase>=1){if(!(this.lastP2&0x80))this.t1Clock=(this.t1Clock+1)&255;this.t1Phase-=1;}}}
  analogTick(){
    if(this.noiseSubcount--===0){this.noiseShift=((this.noiseShift<<1)|(((this.noiseShift>>13)^(this.noiseShift>>16))&1))>>>0;this.noiseState=(this.noiseShift>>16)&1;this.noiseSubcount+=AUDIO_HZ/NOISE_HZ;}
    const nf=this.noiseFilters;nf[0].cap=.99765*nf[0].cap+this.noiseState*.0990460;nf[1].cap=.96300*nf[1].cap+this.noiseState*.2965164;nf[2].cap=.57000*nf[2].cap+this.noiseState*1.0526913;
    let noise=nf[0].cap+nf[1].cap+nf[2].cap+this.noiseState*.1848;noise=nf[4].cr(noise)*.075;
    let sample=0;
    for(const g of this.groups){
      const c0=g.ch[0];if(c0.subcount--===0){c0.subcount+=AUDIO_HZ/PCS_HZ;c0.gate=1;c0.clock();}const ch0=g.cf[0].cr(c0.output)*g.env[0]/100;
      const c1=g.ch[1];if(c1.subcount--===0){c1.subcount+=AUDIO_HZ/PCS_HZ;c1.gate=1;c1.clock();}const ch1=g.cf[1].cr(c1.output)*g.env[1]/100;
      const c2=g.ch[2];if(c2.subcount--===0){c2.subcount+=AUDIO_HZ/GOS_HZ/2;c2.gate=c2.gate?0:1;}c2.clock();g.g1.exp=this.g1exp[c2.output&1];g.g2.exp=this.g2exp[c2.output&1];
      let ch2,mix;if(g.config===0){ch2=g.g2.rc(g.g1.rc(noise))*-1.56*g.env[2]/33;mix=ch0+ch1+ch2;}else{ch2=-noise*g.env[2]/33;mix=ch0+ch1+ch2;mix=g.g2.rc(g.g1.rc(-mix))*1.56;}sample+=mix;
    }
    return .1*this.finalFilter.cr(sample);
  }
  stepSample(sampleRate){this.runCpuSample(sampleRate);this.audioPhase+=AUDIO_HZ/sampleRate;let sum=0,n=0;while(this.audioPhase>=1){sum+=this.analogTick();n++;this.audioPhase-=1;}if(n)this.output=sum/n;return this.output;}
}
