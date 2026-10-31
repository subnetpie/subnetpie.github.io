// Intel 8035/MCS-48 core, behavior matched to MAME 0.289 mcs48.cpp.
const C_FLAG=0x80,A_FLAG=0x40,F_FLAG=0x20,B_FLAG=0x10;
const TIMER_ENABLED=1,COUNTER_ENABLED=2;

export class MCS48 {
  constructor(opts={}) {
    this.programRead=opts.programRead||(()=>0xff);
    this.extRead=opts.extRead||(()=>0xff);
    this.extWrite=opts.extWrite||(()=>{});
    this.busRead=opts.busRead||(()=>0xff);
    this.busWrite=opts.busWrite||(()=>{});
    this.portRead=opts.portRead||(()=>0xff);
    this.portWrite=opts.portWrite||(()=>{});
    this.testRead=opts.testRead||(()=>0);
    this.progWrite=opts.progWrite||(()=>{});
    this.ram=new Uint8Array(opts.ramSize||64);
    this.a=0; this.timer=0; this.prescaler=0; this.pc=0; this.psw=0;
    this.p1=0xff; this.p2=0xff; this.dbbo=0xff; this.f1=false; this.a11=0;
    this.irqState=false; this.xirqEnabled=false; this.tirqEnabled=false;
    this.timecountEnabled=0; this.timerFlag=false; this.timerOverflow=false;
    this.irqInProgress=false; this.irqPolled=false; this.t1History=0;
    this.inReset=false; this.cycles=0; this._used=0;
    this.reset();
  }
  reset(){
    this.pc=0; this.psw&=(C_FLAG|A_FLAG); this.f1=false; this.a11=0;
    this.tirqEnabled=false; this.xirqEnabled=false; this.timecountEnabled=0;
    this.timerFlag=false; this.irqInProgress=false; this.timerOverflow=false; this.irqPolled=false;
    this.dbbo=0xff; this.p1=0xff; this.p2=0xff;
    this.busWrite(0xff); this.portWrite(1,this.p1); this.portWrite(2,this.p2);
  }
  setReset(asserted){const n=!!asserted;if(n===this.inReset)return;const was=this.inReset;this.inReset=n;if(was&&!n)this.reset();}
  setIRQ(asserted){this.irqState=!!asserted;}
  rbase(){return (this.psw&B_FLAG)?24:0;}
  r(n){return this.ram[(this.rbase()+n)&(this.ram.length-1)];}
  sr(n,v){this.ram[(this.rbase()+n)&(this.ram.length-1)]=v&0xff;}
  ramR(a){return this.ram[a&(this.ram.length-1)];}
  ramW(a,v){this.ram[a&(this.ram.length-1)]=v&0xff;}
  fetch(){const a=this.pc;this.pc=((this.pc+1)&0x7ff)|(this.pc&0x800);return this.programRead(a)&0xff;}
  arg(){return this.fetch();}
  burn(n){
    if(this.timecountEnabled){
      let over=false;
      if(this.timecountEnabled&TIMER_ENABLED){const old=this.timer;this.prescaler+=n;this.timer=(this.timer+(this.prescaler>>5))&0xff;this.prescaler&=0x1f;over=this.timer<old;}
      else if(this.timecountEnabled&COUNTER_ENABLED){for(let i=0;i<n;i++){this.t1History=((this.t1History<<1)|(this.testRead(1)&1))&3;if(this.t1History===2){this.timer=(this.timer+1)&0xff;if(this.timer===0)over=true;}}}
      if(over){this.timerFlag=true;if(this.tirqEnabled)this.timerOverflow=true;}
    }
    this._used+=n; this.cycles+=n;
  }
  push(){const sp=this.psw&7;this.ramW(8+2*sp,this.pc);this.ramW(9+2*sp,((this.pc>>8)&0x0f)|(this.psw&0xf0));this.psw=(this.psw&0xf0)|((sp+1)&7);}
  pull(pswToo){const sp=(this.psw-1)&7;let hi=this.ramR(9+2*sp),pc=this.ramR(8+2*sp)|(hi<<8);pc&=this.irqInProgress?0x7ff:0xfff;this.pc=pc;if(pswToo)this.psw=(hi&0xf0)|sp;else this.psw=(this.psw&0xf0)|sp;}
  jump(addr){this.pc=(addr|(this.irqInProgress?0:this.a11))&0xfff;}
  call(addr){this.push();this.jump(addr);}
  jcc(test){const pch=this.pc&0xf00,off=this.arg();if(test)this.pc=pch|off;}
  add(v,carry=false){const ci=carry?((this.psw&C_FLAG)?1:0):0,t=this.a+(v&255)+ci,t4=(this.a&15)+(v&15)+ci;this.psw&=~(C_FLAG|A_FLAG);this.psw|=(t4<<2)&A_FLAG;this.psw|=(t>>1)&C_FLAG;this.a=t&255;}
  portW(p,v){v&=255;if(p===1)this.p1=v;else if(p===2)this.p2=v;this.portWrite(p,v);}
  expander(op,p){
    this.portW(2,(this.p2&0xf0)|((op&3)<<2)|(p&3));this.progWrite(0);
    if(op!==0)this.portW(2,(this.p2&0xf0)|(this.a&15));else{this.portW(2,this.p2|15);this.a=this.portRead(2)&15;}
    this.progWrite(1);
  }
  checkIRQ(){
    if(this.irqInProgress)return;
    if(this.irqState&&this.xirqEnabled){this.burn(2);this.irqInProgress=true;this.call(0x03);}
    else if(this.timerOverflow&&this.tirqEnabled){this.burn(2);this.irqInProgress=true;this.call(0x07);this.timerOverflow=false;}
  }
  step(){
    if(this.inReset){this.cycles++;return 1;}
    this._used=0;this.checkIRQ();this.irqPolled=false;
    const op=this.fetch();this.exec(op);return this._used;
  }
  run(cycles){let used=0;while(used<cycles)used+=this.step();return used;}
  exec(op){
    if(op>=0x18&&op<=0x1f){this.burn(1);const n=op&7;this.sr(n,this.r(n)+1);return;}
    if(op>=0x28&&op<=0x2f){this.burn(1);const n=op&7,t=this.a;this.a=this.r(n);this.sr(n,t);return;}
    if(op>=0x48&&op<=0x4f){this.burn(1);this.a=(this.a|this.r(op&7))&255;return;}
    if(op>=0x58&&op<=0x5f){this.burn(1);this.a&=this.r(op&7);return;}
    if(op>=0x68&&op<=0x6f){this.burn(1);this.add(this.r(op&7));return;}
    if(op>=0x78&&op<=0x7f){this.burn(1);this.add(this.r(op&7),true);return;}
    if(op>=0xa8&&op<=0xaf){this.burn(1);this.sr(op&7,this.a);return;}
    if(op>=0xb8&&op<=0xbf){this.burn(2);this.sr(op&7,this.arg());return;}
    if(op>=0xc8&&op<=0xcf){this.burn(1);const n=op&7;this.sr(n,this.r(n)-1);return;}
    if(op>=0xd8&&op<=0xdf){this.burn(1);this.a=(this.a^this.r(op&7))&255;return;}
    if(op>=0xe8&&op<=0xef){this.burn(2);const n=op&7,v=(this.r(n)-1)&255;this.sr(n,v);this.jcc(v!==0);return;}
    if(op>=0xf8&&op<=0xff){this.burn(1);this.a=this.r(op&7);return;}
    if((op&0x1f)===0x04){this.burn(2);this.jump(this.arg()|(((op>>5)&7)<<8));return;}
    if((op&0x1f)===0x14){this.burn(2);this.call(this.arg()|(((op>>5)&7)<<8));return;}
    if((op&0x1f)===0x12){this.burn(2);this.jcc((this.a&(1<<((op>>5)&7)))!==0);return;}

    switch(op){
      case 0x00:this.burn(1);break;
      case 0x02:this.burn(2);this.dbbo=this.a;this.busWrite(this.a);break;
      case 0x03:this.burn(2);this.add(this.arg());break;
      case 0x05:this.burn(1);this.xirqEnabled=true;break;
      case 0x07:this.burn(1);this.a=(this.a-1)&255;break;
      case 0x08:this.burn(2);this.a=this.busRead()&255;break;
      case 0x09:this.burn(2);this.a=(this.portRead(1)&this.p1)&255;break;
      case 0x0a:this.burn(2);this.a=(this.portRead(2)&this.p2)&255;break;
      case 0x0c:case 0x0d:case 0x0e:case 0x0f:this.burn(2);this.expander(0,op&3);break;
      case 0x10:case 0x11:{this.burn(1);const n=op&1,a=this.r(n);this.ramW(a,this.ramR(a)+1);break;}
      case 0x13:this.burn(2);this.add(this.arg(),true);break;
      case 0x15:this.burn(1);this.xirqEnabled=false;break;
      case 0x16:this.burn(2);{const f=this.timerFlag;this.jcc(f);this.timerFlag=false;}break;
      case 0x17:this.burn(1);this.a=(this.a+1)&255;break;
      case 0x20:case 0x21:{this.burn(1);const n=op&1,a=this.r(n),t=this.a;this.a=this.ramR(a);this.ramW(a,t);break;}
      case 0x23:this.burn(2);this.a=this.arg();break;
      case 0x25:this.burn(1);this.tirqEnabled=true;break;
      case 0x26:this.burn(2);this.jcc((this.testRead(0)&1)===0);break;
      case 0x27:this.burn(1);this.a=0;break;
      case 0x30:case 0x31:{this.burn(1);const n=op&1,a=this.r(n),m=this.ramR(a);this.ramW(a,(m&0xf0)|(this.a&15));this.a=(this.a&0xf0)|(m&15);break;}
      case 0x35:this.burn(1);this.tirqEnabled=false;this.timerOverflow=false;break;
      case 0x36:this.burn(2);this.jcc((this.testRead(0)&1)!==0);break;
      case 0x37:this.burn(1);this.a^=255;break;
      case 0x39:this.burn(2);this.portW(1,this.a);break;
      case 0x3a:this.burn(2);this.portW(2,this.a);break;
      case 0x3c:case 0x3d:case 0x3e:case 0x3f:this.burn(2);this.expander(1,op&3);break;
      case 0x40:case 0x41:this.burn(1);this.a=(this.a|this.ramR(this.r(op&1)))&255;break;
      case 0x42:this.burn(1);this.a=this.timer;break;
      case 0x43:this.burn(2);this.a=(this.a|this.arg())&255;break;
      case 0x45:this.burn(1);if(!(this.timecountEnabled&COUNTER_ENABLED))this.t1History=this.testRead(1)&1;this.timecountEnabled=COUNTER_ENABLED;break;
      case 0x46:this.burn(2);this.jcc((this.testRead(1)&1)===0);break;
      case 0x47:this.burn(1);this.a=((this.a<<4)|(this.a>>4))&255;break;
      case 0x50:case 0x51:this.burn(1);this.a&=this.ramR(this.r(op&1));break;
      case 0x53:this.burn(2);this.a&=this.arg();break;
      case 0x55:this.burn(1);this.timecountEnabled=TIMER_ENABLED;this.prescaler=0;break;
      case 0x56:this.burn(2);this.jcc((this.testRead(1)&1)!==0);break;
      case 0x57:this.burn(1);if((this.a&15)>9||(this.psw&A_FLAG)){if(this.a>0xf9)this.psw|=C_FLAG;this.a=(this.a+6)&255;}if((this.a&0xf0)>0x90||(this.psw&C_FLAG)){this.a=(this.a+0x60)&255;this.psw|=C_FLAG;}break;
      case 0x60:case 0x61:this.burn(1);this.add(this.ramR(this.r(op&1)));break;
      case 0x62:this.burn(1);this.timer=this.a;break;
      case 0x65:this.burn(1);this.timecountEnabled=0;break;
      case 0x67:{this.burn(1);const nc=(this.a<<7)&C_FLAG;this.a=((this.a>>1)|(this.psw&C_FLAG))&255;this.psw=(this.psw&~C_FLAG)|nc;break;}
      case 0x70:case 0x71:this.burn(1);this.add(this.ramR(this.r(op&1)),true);break;
      case 0x75:this.burn(1);break;
      case 0x76:this.burn(2);this.jcc(this.f1);break;
      case 0x77:this.burn(1);this.a=((this.a>>1)|(this.a<<7))&255;break;
      case 0x80:case 0x81:this.burn(2);this.a=this.extRead(this.r(op&1))&255;break;
      case 0x83:this.burn(2);this.pull(false);break;
      case 0x85:this.burn(1);this.psw&=~F_FLAG;break;
      case 0x86:this.burn(2);this.jcc(this.irqState);break;
      case 0x88:{this.burn(2);const v=this.arg();this.busWrite((this.busRead()|v)&255);break;}
      case 0x89:{this.burn(2);this.portW(1,this.p1|this.arg());break;}
      case 0x8a:{this.burn(2);this.portW(2,this.p2|this.arg());break;}
      case 0x8c:case 0x8d:case 0x8e:case 0x8f:this.burn(2);this.expander(2,op&3);break;
      case 0x90:case 0x91:this.burn(2);this.extWrite(this.r(op&1),this.a);break;
      case 0x93:this.burn(2);this.irqInProgress=false;this.pull(true);break;
      case 0x95:this.burn(1);this.psw^=F_FLAG;break;
      case 0x96:this.burn(2);this.jcc(this.a!==0);break;
      case 0x97:this.burn(1);this.psw&=~C_FLAG;break;
      case 0x98:{this.burn(2);const v=this.arg();this.busWrite((this.busRead()&v)&255);break;}
      case 0x99:{this.burn(2);this.portW(1,this.p1&this.arg());break;}
      case 0x9a:{this.burn(2);this.portW(2,this.p2&this.arg());break;}
      case 0x9c:case 0x9d:case 0x9e:case 0x9f:this.burn(2);this.expander(3,op&3);break;
      case 0xa0:case 0xa1:this.burn(1);this.ramW(this.r(op&1),this.a);break;
      case 0xa3:this.burn(2);this.a=this.programRead((this.pc&0xf00)|this.a)&255;break;
      case 0xa5:this.burn(1);this.f1=false;break;
      case 0xa7:this.burn(1);this.psw^=C_FLAG;break;
      case 0xb0:case 0xb1:this.burn(2);this.ramW(this.r(op&1),this.arg());break;
      case 0xb3:this.burn(2);this.pc=(this.pc&0xf00)|(this.programRead((this.pc&0xf00)|this.a)&255);break;
      case 0xb5:this.burn(1);this.f1=!this.f1;break;
      case 0xb6:this.burn(2);this.jcc((this.psw&F_FLAG)!==0);break;
      case 0xc5:this.burn(1);this.psw&=~B_FLAG;break;
      case 0xc6:this.burn(2);this.jcc(this.a===0);break;
      case 0xc7:this.burn(1);this.a=this.psw|8;break;
      case 0xd0:case 0xd1:this.burn(1);this.a=(this.a^this.ramR(this.r(op&1)))&255;break;
      case 0xd3:this.burn(2);this.a=(this.a^this.arg())&255;break;
      case 0xd5:this.burn(1);this.psw|=B_FLAG;break;
      case 0xd7:this.burn(1);this.psw=this.a&~8;break;
      case 0xe3:this.burn(2);this.a=this.programRead(0x300|this.a)&255;break;
      case 0xe5:this.burn(1);this.a11=0;break;
      case 0xe6:this.burn(2);this.jcc((this.psw&C_FLAG)===0);break;
      case 0xe7:this.burn(1);this.a=((this.a<<1)|(this.a>>7))&255;break;
      case 0xf0:case 0xf1:this.burn(1);this.a=this.ramR(this.r(op&1));break;
      case 0xf5:this.burn(1);this.a11=0x800;break;
      case 0xf6:this.burn(2);this.jcc((this.psw&C_FLAG)!==0);break;
      case 0xf7:{this.burn(1);const nc=this.a&C_FLAG;this.a=((this.a<<1)|(this.psw>>7))&255;this.psw=(this.psw&~C_FLAG)|nc;break;}
      default:this.burn(1);break;
    }
  }
}
