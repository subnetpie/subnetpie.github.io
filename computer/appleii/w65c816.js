// WDC 65C816 execution core for the Apple IIgs path.
//
// Separate from W65C02S so the IIe core remains regression-stable. Addresses
// are always masked to 24 bits; PB and DB are real bank registers. The core
// starts in emulation mode exactly as the hardware does.

import {W65C816Addressing} from './w65c816_addressing.js';

const N=0x80,V=0x40,M=0x20,X=0x10,D=0x08,I=0x04,Z=0x02,C=0x01;

export class W65C816 {
  constructor(memory) {
    this.mem=memory;
    this.addressing=new W65C816Addressing(this);
    this.trace=null;
    this.reset();
  }
  setTrace(fn){this.trace=fn;}
  get register(){return this.r;}

  reset(){
    this.r={a:0,x:0,y:0,d:0,s:0x01ff,pc:0,pb:0,db:0,p:M|X|I,e:true};
    this.waiting=false; this.stopped=false; this.irqLine=false;
    this.r.pc=this.mem.read_word(0x00fffc);
  }

  addr(){return ((this.r.pb<<16)|this.r.pc)&0xffffff;}
  fetch8(){const v=this.mem.read(this.addr());this.r.pc=(this.r.pc+1)&0xffff;return v;}
  fetch16(){const l=this.fetch8(),h=this.fetch8();return l|(h<<8);}
  fetch24(){return this.fetch16()|(this.fetch8()<<16);}
  m8(){return this.r.e || !!(this.r.p&M);}
  x8(){return this.r.e || !!(this.r.p&X);}
  maskM(){return this.m8()?0xff:0xffff;}
  maskX(){return this.x8()?0xff:0xffff;}
  setNZ(v,bits){const mask=bits===8?0xff:0xffff,sign=bits===8?0x80:0x8000;v&=mask;this.r.p=(this.r.p&~(N|Z))|(v===0?Z:0)|(v&sign?N:0);}
  readM(a){return this.m8()?this.addressing.read8(a):this.addressing.read16(a);}
  writeM(a,v){if(this.m8())this.addressing.write8(a,v);else this.addressing.write16(a,v);}
  readX(a){return this.x8()?this.addressing.read8(a):this.addressing.read16(a);}
  readDirectM(a){return this.m8()?this.addressing.read8Direct(a):this.addressing.read16Direct(a);}
  writeDirectM(a,v){if(this.m8())this.addressing.write8Direct(a,v);else this.addressing.write16Direct(a,v);}
  push8(v){this.mem.write(this.r.s&0xffff,v);this.r.s=this.r.e?(0x100|((this.r.s-1)&0xff)):((this.r.s-1)&0xffff);}
  pull8(){this.r.s=this.r.e?(0x100|((this.r.s+1)&0xff)):((this.r.s+1)&0xffff);return this.mem.read(this.r.s);}
  push16(v){this.push8(v>>8);this.push8(v);}
  pull16(){const l=this.pull8();return l|(this.pull8()<<8);}
  dpAddr(){return this.addressing.D();}
  absAddr(){return this.addressing.A();}
  branch(test){const d=this.fetch8();if(test)this.r.pc=(this.r.pc+(d&0x80?d-256:d))&0xffff;return test?3:2;}

  irq(state=true){this.irqLine=!!state;if(state)this.waiting=false;}
  serviceIRQ(){
    if(!this.irqLine || (this.r.p&I))return 0;
    if(!this.r.e)this.push8(this.r.pb);
    this.push16(this.r.pc);this.push8(this.r.p);
    this.r.p|=I;this.r.p&=~D;this.r.pb=0;
    this.r.pc=this.mem.read_word(this.r.e?0x00fffe:0x00ffee);
    return this.r.e?7:8;
  }

  step(){
    this.addressing.begin();
    if(this.stopped)return 1;
    const irq=this.serviceIRQ();if(irq)return irq;
    if(this.waiting)return 1;
    const pc=this.addr(),op=this.fetch8();
    if(this.trace)this.trace({pc,op,r:{...this.r}});
    const m8=this.m8(),x8=this.x8(),mb=m8?8:16,xb=x8?8:16;
    let a,v,t,cy=2;
    switch(op){
      case 0xea: break; // NOP
      case 0xf4:this.push16(this.fetch16());cy=5;break; // PEA
      case 0x04: // TSB dp
      case 0x0c: { // TSB abs
        a=op===0x04?this.dpAddr():((this.r.db<<16)|this.fetch16())&0xffffff;
        v=op===0x04?this.readDirectM(a):this.readM(a); t=this.r.a&this.maskM();
        this.r.p=(this.r.p&~Z)|((v&t)===0?Z:0);
        if(op===0x04)this.writeDirectM(a,v|t);else this.writeM(a,v|t);
        cy=op===0x04?5:6; break;
      }
      case 0x14: // TRB dp
      case 0x1c: { // TRB abs
        a=op===0x14?this.dpAddr():((this.r.db<<16)|this.fetch16())&0xffffff;
        v=op===0x14?this.readDirectM(a):this.readM(a); t=this.r.a&this.maskM();
        this.r.p=(this.r.p&~Z)|((v&t)===0?Z:0);
        if(op===0x14)this.writeDirectM(a,v&~t);else this.writeM(a,v&~t);
        cy=op===0x14?5:6; break;
      }
      case 0x09:v=m8?this.fetch8():this.fetch16();this.r.a=(this.r.a&~this.maskM())|((this.r.a|v)&this.maskM());this.setNZ(this.r.a,mb);cy=m8?2:3;break;
      case 0x29:v=m8?this.fetch8():this.fetch16();this.r.a=(this.r.a&~this.maskM())|((this.r.a&v)&this.maskM());this.setNZ(this.r.a,mb);cy=m8?2:3;break;
      case 0x49:v=m8?this.fetch8():this.fetch16();this.r.a=(this.r.a&~this.maskM())|((this.r.a^v)&this.maskM());this.setNZ(this.r.a,mb);cy=m8?2:3;break;
      case 0xc9:v=m8?this.fetch8():this.fetch16();t=(this.r.a&this.maskM())-v;this.r.p=(this.r.p&~C)|(t>=0?C:0);this.setNZ(t,mb);cy=m8?2:3;break;
      case 0xe0:v=x8?this.fetch8():this.fetch16();t=this.r.x-v;this.r.p=(this.r.p&~C)|(t>=0?C:0);this.setNZ(t,xb);cy=x8?2:3;break;
      case 0xc0:v=x8?this.fetch8():this.fetch16();t=this.r.y-v;this.r.p=(this.r.p&~C)|(t>=0?C:0);this.setNZ(t,xb);cy=x8?2:3;break;
      case 0x89:v=m8?this.fetch8():this.fetch16();this.r.p=(this.r.p&~Z)|(((this.r.a&v)&this.maskM())===0?Z:0);cy=m8?2:3;break;
      case 0x69:
        v=m8?this.fetch8():this.fetch16();a=this.r.a&this.maskM();t=a+v+(this.r.p&C?1:0);
        this.r.p=(this.r.p&~(C|V))|(t>this.maskM()?C:0)|((~(a^v)&(a^t)&(m8?0x80:0x8000))?V:0);
        this.r.a=(this.r.a&~this.maskM())|(t&this.maskM());this.setNZ(t,mb);cy=m8?2:3;break;
      case 0xe9:
        v=m8?this.fetch8():this.fetch16();a=this.r.a&this.maskM();t=a-v-(this.r.p&C?0:1);
        this.r.p=(this.r.p&~(C|V))|(t>=0?C:0)|(((a^v)&(a^t)&(m8?0x80:0x8000))?V:0);
        this.r.a=(this.r.a&~this.maskM())|(t&this.maskM());this.setNZ(t,mb);cy=m8?2:3;break;
      case 0x0a:a=this.r.a&this.maskM();this.r.p=(this.r.p&~C)|((a&(m8?0x80:0x8000))?C:0);a=(a<<1)&this.maskM();this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x4a:a=this.r.a&this.maskM();this.r.p=(this.r.p&~C)|(a&1?C:0);a>>>=1;this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x2a:a=this.r.a&this.maskM();t=this.r.p&C?1:0;this.r.p=(this.r.p&~C)|((a&(m8?0x80:0x8000))?C:0);a=((a<<1)|t)&this.maskM();this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x6a:a=this.r.a&this.maskM();t=this.r.p&C?(m8?0x80:0x8000):0;this.r.p=(this.r.p&~C)|(a&1?C:0);a=(a>>>1)|t;this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x1a:a=((this.r.a&this.maskM())+1)&this.maskM();this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x3a:a=((this.r.a&this.maskM())-1)&this.maskM();this.r.a=(this.r.a&~this.maskM())|a;this.setNZ(a,mb);break;
      case 0x18:this.r.p&=~C;break; case 0x38:this.r.p|=C;break;
      case 0x58:this.r.p&=~I;break; case 0x78:this.r.p|=I;break;
      case 0xd8:this.r.p&=~D;break; case 0xf8:this.r.p|=D;break;
      case 0xb8:this.r.p&=~V;break;
      case 0xfb: // XCE
        t=!!(this.r.p&C); this.r.p=(this.r.p&~C)|(this.r.e?C:0); this.r.e=t;
        if(this.r.e){this.r.p|=M|X;this.r.s=0x100|(this.r.s&0xff);this.r.x&=0xff;this.r.y&=0xff;} break;
      case 0xc2: v=this.fetch8();this.r.p&=~v;if(this.r.e)this.r.p|=M|X;cy=3;break; // REP
      case 0xe2: v=this.fetch8();this.r.p|=v;if(this.x8()){this.r.x&=0xff;this.r.y&=0xff;}cy=3;break; // SEP
      case 0xa9:v=m8?this.fetch8():this.fetch16();this.r.a=(this.r.a&(~this.maskM()))|(v&this.maskM());this.setNZ(v,mb);cy=m8?2:3;break;
      case 0xa2:v=x8?this.fetch8():this.fetch16();this.r.x=v&this.maskX();this.setNZ(v,xb);cy=x8?2:3;break;
      case 0xa0:v=x8?this.fetch8():this.fetch16();this.r.y=v&this.maskX();this.setNZ(v,xb);cy=x8?2:3;break;
      case 0xad:a=this.absAddr();v=this.readM(a);this.r.a=(this.r.a&(~this.maskM()))|v;this.setNZ(v,mb);cy=4;break;
      case 0xaf:a=this.fetch24();v=this.readM(a);this.r.a=(this.r.a&(~this.maskM()))|v;this.setNZ(v,mb);cy=5;break;
      case 0xbf: // LDA absolute long,X
        a=this.addressing.ALX();
        v=this.readM(a);this.r.a=(this.r.a&~this.maskM())|(v&this.maskM());
        this.setNZ(v,mb);cy=m8?5:6;break;
      case 0xa5:a=this.dpAddr();v=this.readDirectM(a);this.r.a=(this.r.a&(~this.maskM()))|v;this.setNZ(v,mb);cy=3;break;
      case 0x8d:a=this.absAddr();this.writeM(a,this.r.a);cy=4;break;
      case 0x8f:a=this.fetch24();this.writeM(a,this.r.a);cy=5;break;
      case 0x85:a=this.dpAddr();this.writeDirectM(a,this.r.a);cy=3;break;
      case 0x8e:a=this.absAddr();this.mem.write(a,this.r.x);if(!x8)this.mem.write(a+1,this.r.x>>8);cy=4;break;
      case 0x8c:a=this.absAddr();this.mem.write(a,this.r.y);if(!x8)this.mem.write(a+1,this.r.y>>8);cy=4;break;
      case 0x9c:a=this.absAddr();this.writeM(a,0);cy=4;break;
      case 0xaa:this.r.x=this.r.a&this.maskX();this.setNZ(this.r.x,xb);break;
      case 0xa8:this.r.y=this.r.a&this.maskX();this.setNZ(this.r.y,xb);break;
      case 0x8a:v=this.r.x&this.maskM();this.r.a=(this.r.a&~this.maskM())|v;this.setNZ(v,mb);break;
      case 0x98:v=this.r.y&this.maskM();this.r.a=(this.r.a&~this.maskM())|v;this.setNZ(v,mb);break;
      case 0x9a:this.r.s=this.r.e?(0x100|(this.r.x&0xff)):(this.r.x&0xffff);break;
      case 0x9b:this.r.y=this.r.x&this.maskX();this.setNZ(this.r.y,xb);break; // TXY
      case 0xbb:this.r.x=this.r.y&this.maskX();this.setNZ(this.r.x,xb);break; // TYX
      case 0xba:this.r.x=this.r.s&this.maskX();this.setNZ(this.r.x,xb);break;
      case 0x5b:this.r.d=this.r.a&0xffff;this.setNZ(this.r.d,16);break; // TCD
      case 0x7b:this.r.a=this.r.d;this.setNZ(this.r.a,16);break; // TDC
      case 0x1b:this.r.s=this.r.a&0xffff;break; // TCS
      case 0x3b:this.r.a=this.r.s;this.setNZ(this.r.a,16);break; // TSC
      case 0xeb:this.r.a=((this.r.a&0xff)<<8)|((this.r.a>>8)&0xff);this.setNZ(this.r.a&0xff,8);cy=3;break;
      case 0xe8:this.r.x=(this.r.x+1)&this.maskX();this.setNZ(this.r.x,xb);break;
      case 0xca:this.r.x=(this.r.x-1)&this.maskX();this.setNZ(this.r.x,xb);break;
      case 0xc8:this.r.y=(this.r.y+1)&this.maskX();this.setNZ(this.r.y,xb);break;
      case 0x88:this.r.y=(this.r.y-1)&this.maskX();this.setNZ(this.r.y,xb);break;
      case 0x4c:this.r.pc=this.fetch16();cy=3;break;
      case 0x5c:a=this.fetch24();this.r.pb=a>>>16;this.r.pc=a&0xffff;cy=4;break;
      case 0x20:a=this.fetch16();this.push16((this.r.pc-1)&0xffff);this.r.pc=a;cy=6;break;
      case 0x22:a=this.fetch24();this.push8(this.r.pb);this.push16((this.r.pc-1)&0xffff);this.r.pb=a>>>16;this.r.pc=a&0xffff;cy=8;break;
      case 0x60:this.r.pc=(this.pull16()+1)&0xffff;cy=6;break;
      case 0x6b:this.r.pc=(this.pull16()+1)&0xffff;this.r.pb=this.pull8();cy=6;break;
      case 0x80:cy=this.branch(true);break; case 0x90:cy=this.branch(!(this.r.p&C));break;
      case 0xb0:cy=this.branch(!!(this.r.p&C));break; case 0xd0:cy=this.branch(!(this.r.p&Z));break;
      case 0xf0:cy=this.branch(!!(this.r.p&Z));break; case 0x10:cy=this.branch(!(this.r.p&N));break;
      case 0x30:cy=this.branch(!!(this.r.p&N));break; case 0x50:cy=this.branch(!(this.r.p&V));break;
      case 0x70:cy=this.branch(!!(this.r.p&V));break;
      case 0x48:this.push8(this.r.a>>8);if(m8)this.r.s=this.r.e?(0x100|((this.r.s+1)&0xff)):((this.r.s+1)&0xffff);this.push8(this.r.a);cy=m8?3:4;break;
      case 0x68:v=this.pull8();if(!m8)v|=this.pull8()<<8;this.r.a=(this.r.a&~this.maskM())|v;this.setNZ(v,mb);cy=m8?4:5;break;
      case 0x08:this.push8(this.r.p|(this.r.e?0x30:0));cy=3;break;
      case 0x28:this.r.p=this.pull8();if(this.r.e)this.r.p|=M|X;if(this.x8()){this.r.x&=255;this.r.y&=255;}cy=4;break;
      case 0xcb:this.waiting=true;cy=3;break;
      case 0xdb:this.stopped=true;cy=3;break;
      case 0x00: // BRK
        this.fetch8(); if(!this.r.e)this.push8(this.r.pb);this.push16(this.r.pc);this.push8(this.r.p|(this.r.e?0x10:0));
        this.r.p|=I;this.r.p&=~D;this.r.pb=0;this.r.pc=this.mem.read_word(this.r.e?0x00fffe:0x00ffe6);cy=this.r.e?7:8;break;
      case 0x40:
        this.r.p=this.pull8();this.r.pc=this.pull16();if(!this.r.e)this.r.pb=this.pull8();if(this.r.e)this.r.p|=M|X;cy=this.r.e?6:7;break;
      default:
        throw new Error("W65C816 unimplemented opcode $"+op.toString(16).padStart(2,"0")+" at $"+pc.toString(16).padStart(6,"0"));
    }
    return cy+this.addressing.extraCycles;
  }
}
