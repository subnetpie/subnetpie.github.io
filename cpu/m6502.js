// NMOS 6502 core for Atari vector hardware.
export class M6502 {
  constructor(read,write){this.read=read;this.write=write;this.reset()}
  reset(){this.a=0;this.x=0;this.y=0;this.s=0xfd;this.p=0x24;this.cycles=0;this.pc=this.r16(0xfffc)}
  r(a){return this.read(a&0xffff)&255} w(a,v){this.write(a&0xffff,v&255)}
  r16(a){let l=this.r(a);return l|(this.r(a+1)<<8)}
  push(v){this.w(0x100|this.s,v);this.s=(this.s-1)&255} pop(){this.s=(this.s+1)&255;return this.r(0x100|this.s)}
  nz(v){v&=255;this.p=(this.p&0x7d)|(v?0:2)|(v&0x80);return v}
  set(f,b){this.p=b?this.p|f:this.p&~f}
  adc(v){let a=this.a,c=this.p&1,s=a+v+c,r=s&255;this.set(1,s>255);this.set(0x40,(~(a^v)&(a^r)&0x80)!==0);this.a=this.nz(r)}
  sbc(v){this.adc(v^255)}
  cmp(a,v){let q=(a-v)&0x1ff;this.set(1,a>=v);this.nz(q)}
  branch(ok){let d=this.r(this.pc++);if(d&0x80)d-=256;if(ok){this.pc=(this.pc+d)&0xffff;return 3}return 2}
  nmi(){this.push(this.pc>>8);this.push(this.pc);this.push((this.p&~0x10)|0x20);this.p|=4;this.pc=this.r16(0xfffa);this.cycles+=7}
  irq(){if(this.p&4)return false;this.push(this.pc>>8);this.push(this.pc);this.push((this.p&~0x10)|0x20);this.p|=4;this.pc=this.r16(0xfffe);this.cycles+=7;return true}
  step(){
    const op=this.r(this.pc++),imm=()=>this.r(this.pc++),zp=()=>imm(),zpx=()=>((imm()+this.x)&255),zpy=()=>((imm()+this.y)&255),
      abs=()=>{let l=imm();return l|(imm()<<8)},abx=()=>((abs()+this.x)&65535),aby=()=>((abs()+this.y)&65535),
      izx=()=>{let z=(imm()+this.x)&255;return this.r(z)|(this.r((z+1)&255)<<8)},izy=()=>{let z=imm();return ((this.r(z)|(this.r((z+1)&255)<<8))+this.y)&65535},
      ind=()=>{let a=abs(),l=this.r(a),h=this.r((a&0xff00)|((a+1)&255));return l|(h<<8)};
    let a,v,c=2;
    switch(op){
      case 0x00:this.pc++;this.push(this.pc>>8);this.push(this.pc);this.push(this.p|0x30);this.p|=4;this.pc=this.r16(0xfffe);c=7;break;
      case 0x40:this.p=(this.pop()&0xef)|0x20;this.pc=this.pop()|(this.pop()<<8);c=6;break;
      case 0x60:this.pc=((this.pop()|(this.pop()<<8))+1)&65535;c=6;break;
      case 0x20:a=abs();v=(this.pc-1)&65535;this.push(v>>8);this.push(v);this.pc=a;c=6;break;
      case 0x4c:this.pc=abs();c=3;break; case 0x6c:this.pc=ind();c=5;break;
      case 0x10:c=this.branch(!(this.p&0x80));break;case 0x30:c=this.branch(this.p&0x80);break;case 0x50:c=this.branch(!(this.p&0x40));break;case 0x70:c=this.branch(this.p&0x40);break;
      case 0x90:c=this.branch(!(this.p&1));break;case 0xb0:c=this.branch(this.p&1);break;case 0xd0:c=this.branch(!(this.p&2));break;case 0xf0:c=this.branch(this.p&2);break;
      case 0x18:this.p&=~1;break;case 0x38:this.p|=1;break;case 0x58:this.p&=~4;break;case 0x78:this.p|=4;break;case 0xb8:this.p&=~0x40;break;case 0xd8:this.p&=~8;break;case 0xf8:this.p|=8;break;
      case 0x48:this.push(this.a);c=3;break;case 0x68:this.a=this.nz(this.pop());c=4;break;case 0x08:this.push(this.p|0x30);c=3;break;case 0x28:this.p=(this.pop()&0xef)|0x20;c=4;break;
      case 0xaa:this.x=this.nz(this.a);break;case 0x8a:this.a=this.nz(this.x);break;case 0xa8:this.y=this.nz(this.a);break;case 0x98:this.a=this.nz(this.y);break;case 0xba:this.x=this.nz(this.s);break;case 0x9a:this.s=this.x;break;
      case 0xe8:this.x=this.nz(this.x+1);break;case 0xca:this.x=this.nz(this.x-1);break;case 0xc8:this.y=this.nz(this.y+1);break;case 0x88:this.y=this.nz(this.y-1);break;
      case 0xea:break;
      // LDA
      case 0xa9:this.a=this.nz(imm());break;case 0xa5:this.a=this.nz(this.r(zp()));c=3;break;case 0xb5:this.a=this.nz(this.r(zpx()));c=4;break;case 0xad:this.a=this.nz(this.r(abs()));c=4;break;case 0xbd:this.a=this.nz(this.r(abx()));c=4;break;case 0xb9:this.a=this.nz(this.r(aby()));c=4;break;case 0xa1:this.a=this.nz(this.r(izx()));c=6;break;case 0xb1:this.a=this.nz(this.r(izy()));c=5;break;
      // LDX
      case 0xa2:this.x=this.nz(imm());break;case 0xa6:this.x=this.nz(this.r(zp()));c=3;break;case 0xb6:this.x=this.nz(this.r(zpy()));c=4;break;case 0xae:this.x=this.nz(this.r(abs()));c=4;break;case 0xbe:this.x=this.nz(this.r(aby()));c=4;break;
      // LDY
      case 0xa0:this.y=this.nz(imm());break;case 0xa4:this.y=this.nz(this.r(zp()));c=3;break;case 0xb4:this.y=this.nz(this.r(zpx()));c=4;break;case 0xac:this.y=this.nz(this.r(abs()));c=4;break;case 0xbc:this.y=this.nz(this.r(abx()));c=4;break;
      // STA/STX/STY
      case 0x85:this.w(zp(),this.a);c=3;break;case 0x95:this.w(zpx(),this.a);c=4;break;case 0x8d:this.w(abs(),this.a);c=4;break;case 0x9d:this.w(abx(),this.a);c=5;break;case 0x99:this.w(aby(),this.a);c=5;break;case 0x81:this.w(izx(),this.a);c=6;break;case 0x91:this.w(izy(),this.a);c=6;break;
      case 0x86:this.w(zp(),this.x);c=3;break;case 0x96:this.w(zpy(),this.x);c=4;break;case 0x8e:this.w(abs(),this.x);c=4;break;
      case 0x84:this.w(zp(),this.y);c=3;break;case 0x94:this.w(zpx(),this.y);c=4;break;case 0x8c:this.w(abs(),this.y);c=4;break;
      // ORA
      case 0x09:this.a=this.nz(this.a|imm());break;case 0x05:this.a=this.nz(this.a|this.r(zp()));c=3;break;case 0x15:this.a=this.nz(this.a|this.r(zpx()));c=4;break;case 0x0d:this.a=this.nz(this.a|this.r(abs()));c=4;break;case 0x1d:this.a=this.nz(this.a|this.r(abx()));c=4;break;case 0x19:this.a=this.nz(this.a|this.r(aby()));c=4;break;case 0x01:this.a=this.nz(this.a|this.r(izx()));c=6;break;case 0x11:this.a=this.nz(this.a|this.r(izy()));c=5;break;
      // AND
      case 0x29:this.a=this.nz(this.a&imm());break;case 0x25:this.a=this.nz(this.a&this.r(zp()));c=3;break;case 0x35:this.a=this.nz(this.a&this.r(zpx()));c=4;break;case 0x2d:this.a=this.nz(this.a&this.r(abs()));c=4;break;case 0x3d:this.a=this.nz(this.a&this.r(abx()));c=4;break;case 0x39:this.a=this.nz(this.a&this.r(aby()));c=4;break;case 0x21:this.a=this.nz(this.a&this.r(izx()));c=6;break;case 0x31:this.a=this.nz(this.a&this.r(izy()));c=5;break;
      // EOR
      case 0x49:this.a=this.nz(this.a^imm());break;case 0x45:this.a=this.nz(this.a^this.r(zp()));c=3;break;case 0x55:this.a=this.nz(this.a^this.r(zpx()));c=4;break;case 0x4d:this.a=this.nz(this.a^this.r(abs()));c=4;break;case 0x5d:this.a=this.nz(this.a^this.r(abx()));c=4;break;case 0x59:this.a=this.nz(this.a^this.r(aby()));c=4;break;case 0x41:this.a=this.nz(this.a^this.r(izx()));c=6;break;case 0x51:this.a=this.nz(this.a^this.r(izy()));c=5;break;
      // ADC/SBC
      case 0x69:this.adc(imm());break;case 0x65:this.adc(this.r(zp()));c=3;break;case 0x75:this.adc(this.r(zpx()));c=4;break;case 0x6d:this.adc(this.r(abs()));c=4;break;case 0x7d:this.adc(this.r(abx()));c=4;break;case 0x79:this.adc(this.r(aby()));c=4;break;case 0x61:this.adc(this.r(izx()));c=6;break;case 0x71:this.adc(this.r(izy()));c=5;break;
      case 0xe9:case 0xeb:this.sbc(imm());break;case 0xe5:this.sbc(this.r(zp()));c=3;break;case 0xf5:this.sbc(this.r(zpx()));c=4;break;case 0xed:this.sbc(this.r(abs()));c=4;break;case 0xfd:this.sbc(this.r(abx()));c=4;break;case 0xf9:this.sbc(this.r(aby()));c=4;break;case 0xe1:this.sbc(this.r(izx()));c=6;break;case 0xf1:this.sbc(this.r(izy()));c=5;break;
      // CMP/CPX/CPY
      case 0xc9:this.cmp(this.a,imm());break;case 0xc5:this.cmp(this.a,this.r(zp()));c=3;break;case 0xd5:this.cmp(this.a,this.r(zpx()));c=4;break;case 0xcd:this.cmp(this.a,this.r(abs()));c=4;break;case 0xdd:this.cmp(this.a,this.r(abx()));c=4;break;case 0xd9:this.cmp(this.a,this.r(aby()));c=4;break;case 0xc1:this.cmp(this.a,this.r(izx()));c=6;break;case 0xd1:this.cmp(this.a,this.r(izy()));c=5;break;
      case 0xe0:this.cmp(this.x,imm());break;case 0xe4:this.cmp(this.x,this.r(zp()));c=3;break;case 0xec:this.cmp(this.x,this.r(abs()));c=4;break;
      case 0xc0:this.cmp(this.y,imm());break;case 0xc4:this.cmp(this.y,this.r(zp()));c=3;break;case 0xcc:this.cmp(this.y,this.r(abs()));c=4;break;
      // BIT
      case 0x24:v=this.r(zp());this.set(2,(this.a&v)===0);this.p=(this.p&0x3f)|(v&0xc0);c=3;break;case 0x2c:v=this.r(abs());this.set(2,(this.a&v)===0);this.p=(this.p&0x3f)|(v&0xc0);c=4;break;
      // INC/DEC
      case 0xe6:a=zp();this.w(a,this.nz(this.r(a)+1));c=5;break;case 0xf6:a=zpx();this.w(a,this.nz(this.r(a)+1));c=6;break;case 0xee:a=abs();this.w(a,this.nz(this.r(a)+1));c=6;break;case 0xfe:a=abx();this.w(a,this.nz(this.r(a)+1));c=7;break;
      case 0xc6:a=zp();this.w(a,this.nz(this.r(a)-1));c=5;break;case 0xd6:a=zpx();this.w(a,this.nz(this.r(a)-1));c=6;break;case 0xce:a=abs();this.w(a,this.nz(this.r(a)-1));c=6;break;case 0xde:a=abx();this.w(a,this.nz(this.r(a)-1));c=7;break;
      // shifts accumulator
      case 0x0a:this.set(1,this.a&0x80);this.a=this.nz(this.a<<1);break;case 0x4a:this.set(1,this.a&1);this.a=this.nz(this.a>>>1);break;
      case 0x2a:v=(this.a<<1)|(this.p&1);this.set(1,this.a&0x80);this.a=this.nz(v);break;case 0x6a:v=(this.a>>>1)|((this.p&1)<<7);this.set(1,this.a&1);this.a=this.nz(v);break;
      // shifts memory
      case 0x06:a=zp();v=this.r(a);this.set(1,v&0x80);this.w(a,this.nz(v<<1));c=5;break;case 0x16:a=zpx();v=this.r(a);this.set(1,v&0x80);this.w(a,this.nz(v<<1));c=6;break;case 0x0e:a=abs();v=this.r(a);this.set(1,v&0x80);this.w(a,this.nz(v<<1));c=6;break;case 0x1e:a=abx();v=this.r(a);this.set(1,v&0x80);this.w(a,this.nz(v<<1));c=7;break;
      case 0x46:a=zp();v=this.r(a);this.set(1,v&1);this.w(a,this.nz(v>>>1));c=5;break;case 0x56:a=zpx();v=this.r(a);this.set(1,v&1);this.w(a,this.nz(v>>>1));c=6;break;case 0x4e:a=abs();v=this.r(a);this.set(1,v&1);this.w(a,this.nz(v>>>1));c=6;break;case 0x5e:a=abx();v=this.r(a);this.set(1,v&1);this.w(a,this.nz(v>>>1));c=7;break;
      case 0x26:a=zp();v=this.r(a);{let q=(v<<1)|(this.p&1);this.set(1,v&0x80);this.w(a,this.nz(q))}c=5;break;case 0x36:a=zpx();v=this.r(a);{let q=(v<<1)|(this.p&1);this.set(1,v&0x80);this.w(a,this.nz(q))}c=6;break;case 0x2e:a=abs();v=this.r(a);{let q=(v<<1)|(this.p&1);this.set(1,v&0x80);this.w(a,this.nz(q))}c=6;break;case 0x3e:a=abx();v=this.r(a);{let q=(v<<1)|(this.p&1);this.set(1,v&0x80);this.w(a,this.nz(q))}c=7;break;
      case 0x66:a=zp();v=this.r(a);{let q=(v>>>1)|((this.p&1)<<7);this.set(1,v&1);this.w(a,this.nz(q))}c=5;break;case 0x76:a=zpx();v=this.r(a);{let q=(v>>>1)|((this.p&1)<<7);this.set(1,v&1);this.w(a,this.nz(q))}c=6;break;case 0x6e:a=abs();v=this.r(a);{let q=(v>>>1)|((this.p&1)<<7);this.set(1,v&1);this.w(a,this.nz(q))}c=6;break;case 0x7e:a=abx();v=this.r(a);{let q=(v>>>1)|((this.p&1)<<7);this.set(1,v&1);this.w(a,this.nz(q))}c=7;break;
      default:
        // Common NMOS undocumented NOPs: consume their operands so diagnostics keep alignment.
        if([0x04,0x44,0x64].includes(op)){imm();c=3}
        else if([0x0c].includes(op)){abs();c=4}
        else if([0x14,0x34,0x54,0x74,0xd4,0xf4].includes(op)){imm();c=4}
        else if([0x1c,0x3c,0x5c,0x7c,0xdc,0xfc].includes(op)){abs();c=4}
        else if([0x80,0x82,0x89,0xc2,0xe2].includes(op)){imm()}
        break;
    }
    this.cycles+=c;return c
  }
}