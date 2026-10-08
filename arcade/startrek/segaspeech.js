import { MCS48 } from './mcs48.js';
import { SP0250 } from './sp0250.js';

const MASTER=3120000;
const CPU_CPS=MASTER/15;
const SP_RATE=(MASTER/2)/(4*39);

export class SegaSpeech {
  constructor(cpuRom,dataRom){
    this.cpuRom=cpuRom;this.dataRom=dataRom;this.latch=0;this.t0=0;this.p2=0;this.drq=1;
    this.speechGain=0;this.usbGain=0;this.cpuBudget=0;this.spPhase=0;this.output=0;
    this.sp=new SP0250(state=>{this.drq=state?1:0;});
    this.cpu=new MCS48({
      ramSize:64,
      programRead:a=>this.cpuRom[a&0x7ff]??0xff,
      extRead:a=>this.dataRom[(((this.p2&0x3f)<<8)|(a&0xff))&0x3fff]??0,
      extWrite:(a,v)=>this.sp.write(v),
      portRead:p=>p===1?(this.latch&0x7f):0xff,
      portWrite:(p,v)=>{if(p===1){if(!(v&0x80))this.t0=0;}else if(p===2)this.p2=v&255;},
      testRead:n=>n===0?this.t0:this.drq
    });
  }
  dataWrite(data){data&=255;const old=this.latch;this.latch=data;this.cpu.setIRQ((data&0x80)===0);if(!(old&0x80)&&(data&0x80))this.t0=1;}
  controlWrite(data){data&=255;this.speechGain=(data&0x08)?1:0;this.usbGain=(data&0x20)?1:0;}
  stepSample(sampleRate){
    this.cpuBudget+=CPU_CPS/sampleRate;
    while(this.cpuBudget>=1){const used=this.cpu.step();this.cpuBudget-=used;}
    this.spPhase+=SP_RATE/sampleRate;
    while(this.spPhase>=1){this.output=this.sp.next();this.spPhase-=1;}
    return this.output*this.speechGain;
  }
}
