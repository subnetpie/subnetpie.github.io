// WDC 65C816 instruction-level core. All 256 opcodes, native/emulation modes.
// Bus callbacks use 24-bit addresses. Cycle totals are returned to the machine;
// this is not a pin-by-pin bus sequencer.
const N=128,V=64,M=32,X=16,D=8,I=4,Z=2,C=1;
const rows = [
'BRK:sig ORA:ix COP:sig ORA:sr TSB:dp ORA:dp ASL:dp ORA:il PHP:i ORA:im ASL:a PHD:i TSB:ab ORA:ab ASL:ab ORA:al',
'BPL:rel ORA:iy ORA:ind ORA:sy TRB:dp ORA:dx ASL:dx ORA:ily CLC:i ORA:ay INC:a TCS:i TRB:ab ORA:ax ASL:ax ORA:alx',
'JSR:jump AND:ix JSL:long AND:sr BIT:dp AND:dp ROL:dp AND:il PLP:i AND:im ROL:a PLD:i BIT:ab AND:ab ROL:ab AND:al',
'BMI:rel AND:iy AND:ind AND:sy BIT:dx AND:dx ROL:dx AND:ily SEC:i AND:ay DEC:a TSC:i BIT:ax AND:ax ROL:ax AND:alx',
'RTI:i EOR:ix WDM:sig EOR:sr MVP:move EOR:dp LSR:dp EOR:il PHA:i EOR:im LSR:a PHK:i JMP:jump EOR:ab LSR:ab EOR:al',
'BVC:rel EOR:iy EOR:ind EOR:sy MVN:move EOR:dx LSR:dx EOR:ily CLI:i EOR:ay PHY:i TCD:i JML:long EOR:ax LSR:ax EOR:alx',
'RTS:i ADC:ix PER:rell ADC:sr STZ:dp ADC:dp ROR:dp ADC:il PLA:i ADC:im ROR:a RTL:i JMP:ji ADC:ab ROR:ab ADC:al',
'BVS:rel ADC:iy ADC:ind ADC:sy STZ:dx ADC:dx ROR:dx ADC:ily SEI:i ADC:ay PLY:i TDC:i JMP:jix ADC:ax ROR:ax ADC:alx',
'BRA:rel STA:ix BRL:rell STA:sr STY:dp STA:dp STX:dp STA:il DEY:i BIT:im TXA:i PHB:i STY:ab STA:ab STX:ab STA:al',
'BCC:rel STA:iy STA:ind STA:sy STY:dx STA:dx STX:dy STA:ily TYA:i STA:ay TXS:i TXY:i STZ:ab STA:ax STZ:ax STA:alx',
'LDY:im LDA:ix LDX:im LDA:sr LDY:dp LDA:dp LDX:dp LDA:il TAY:i LDA:im TAX:i PLB:i LDY:ab LDA:ab LDX:ab LDA:al',
'BCS:rel LDA:iy LDA:ind LDA:sy LDY:dx LDA:dx LDX:dy LDA:ily CLV:i LDA:ay TSX:i TYX:i LDY:ax LDA:ax LDX:ay LDA:alx',
'CPY:im CMP:ix REP:byte CMP:sr CPY:dp CMP:dp DEC:dp CMP:il INY:i CMP:im DEX:i WAI:i CPY:ab CMP:ab DEC:ab CMP:al',
'BNE:rel CMP:iy CMP:ind CMP:sy PEI:dp CMP:dx DEC:dx CMP:ily CLD:i CMP:ay PHX:i STP:i JMP:jil CMP:ax DEC:ax CMP:alx',
'CPX:im SBC:ix SEP:byte SBC:sr CPX:dp SBC:dp INC:dp SBC:il INX:i SBC:im NOP:i XBA:i CPX:ab SBC:ab INC:ab SBC:al',
'BEQ:rel SBC:iy SBC:ind SBC:sy PEA:word SBC:dx INC:dx SBC:ily SED:i SBC:ay PLX:i XCE:i JSR:jix SBC:ax INC:ax SBC:alx'];
const ops=rows.flatMap(r=>r.split(' ').map(s=>s.split(':')));
const cycles=[
[7,6,7,4,5,3,5,6,3,2,2,4,6,4,6,5], [2,5,5,7,5,4,6,6,2,4,2,2,6,4,7,5],
[6,6,8,4,3,3,5,6,4,2,2,5,4,4,6,5], [2,5,5,7,4,4,6,6,2,4,2,2,4,4,7,5],
[6,6,2,4,7,3,5,6,3,2,2,3,3,4,6,5], [2,5,5,7,7,4,6,6,2,4,3,2,4,4,7,5],
[6,6,6,4,3,3,5,6,4,2,2,6,5,4,6,5], [2,5,5,7,4,4,6,6,2,4,4,2,6,4,7,5],
[2,6,4,4,3,3,3,6,2,2,2,3,4,4,4,5], [2,6,5,7,4,4,4,6,2,5,2,2,4,5,5,5],
[2,6,2,4,3,3,3,6,2,2,2,4,4,4,4,5], [2,5,5,7,4,4,4,6,2,4,2,2,4,4,4,5],
[2,6,3,4,3,3,5,6,2,2,2,3,4,4,6,5], [2,5,5,7,6,4,6,6,2,4,3,3,6,4,7,5],
[2,6,3,4,3,3,5,6,2,2,2,3,4,4,6,5], [2,5,5,7,5,4,6,6,2,4,4,2,8,4,7,5]].flat();
const indexOps=new Set(['LDX','LDY','STX','STY','CPX','CPY']);
const reads=new Set(['ORA','AND','EOR','ADC','SBC','CMP','CPX','CPY','LDA','LDX','LDY','BIT']);
const rmws=new Set(['ASL','LSR','ROL','ROR','INC','DEC','TSB','TRB']);
export class W65C816 {
 constructor(memory){this.mem=memory;this.trace=null;this.reset();}
 setTrace(fn){this.trace=fn;}
 get register(){return this.r;}
 reset(){this.r={a:0,x:0,y:0,d:0,s:511,pc:0,pb:0,db:0,p:M|X|I,e:true};this.waiting=false;this.stopped=false;this.irqLine=false;this.nmiPending=false;this.r.pc=this.mem.read_word(0xfffc);}
 addr(){return (this.r.pb<<16)|this.r.pc;}
 fetch8(){const v=this.mem.read(this.addr())&255;this.r.pc=(this.r.pc+1)&65535;return v;}
 fetch16(){const l=this.fetch8();return l|(this.fetch8()<<8);}
 fetch24(){const w=this.fetch16();return w|(this.fetch8()<<16);}
 m8(){return this.r.e||!!(this.r.p&M);}
 x8(){return this.r.e||!!(this.r.p&X);}
 maskM(){return this.m8()?255:65535;}
 maskX(){return this.x8()?255:65535;}
 setNZ(v,bits){const mask=bits===8?255:65535,sign=bits===8?128:32768;v&=mask;this.r.p=(this.r.p&~(N|Z))|(v===0?Z:0)|(v&sign?N:0);}
 setP(p){this.r.p=(p|(this.r.e?M|X:0))&255;if(this.x8()){this.r.x&=255;this.r.y&=255;}}
 push8(v){this.mem.write(this.r.s,v&255);this.r.s=this.r.e?(256|((this.r.s-1)&255)):((this.r.s-1)&65535);}
 pull8(){this.r.s=this.r.e?(256|((this.r.s+1)&255)):((this.r.s+1)&65535);return this.mem.read(this.r.s);}
 pushNew8(v){this.mem.write(this.r.s,v&255);this.r.s=(this.r.s-1)&65535;}
 pullNew8(){this.r.s=(this.r.s+1)&65535;return this.mem.read(this.r.s);}
 pushNew16(v){this.pushNew8(v>>8);this.pushNew8(v);if(this.r.e)this.r.s=256|(this.r.s&255);}
 push16(v){this.push8(v>>8);this.push8(v);}
 pull16(){const l=this.pull8();return l|(this.pull8()<<8);}
 word(a,wrap=0xffffff){return this.mem.read(a)|(this.mem.read((a&~wrap)|((a+1)&wrap))<<8);}
 dp(n,index=0){return this.r.e&&!(this.r.d&255)?(this.r.d|((n+index)&255)):((this.r.d+n+index)&65535);}
 ptr(a,long=false){const wrap=this.r.e&&!(this.r.d&255)&&!long?255:65535;return this.word(a,wrap)|(long?this.mem.read((a+2)&65535)<<16:0);}
 irq(s=true){this.irqLine=!!s;if(s)this.waiting=false;}
 nmi(){this.nmiPending=true;this.waiting=false;}
 interrupt(vector,software=false){if(!this.r.e)this.push8(this.r.pb);this.push16(this.r.pc);this.push8(this.r.e?((this.r.p&~16)|(software?16:0)):this.r.p);this.r.p=(this.r.p|I)&~D;this.r.pb=0;this.r.pc=this.mem.read_word(vector);return this.r.e?7:8;}
 arithmetic(v,subtract,bits){
  const mask=bits===8?255:65535,sign=bits===8?128:32768,a=this.r.a&mask,c=this.r.p&C?1:0;
  let result=a+(subtract?(v^mask):v)+c;
  let overflow=(subtract?((a^v)&(a^result)):(~(a^v)&(a^result)))&sign;
  if(this.r.p&D){
   if(!subtract){
    result=(a&15)+(v&15)+c;if(result>9)result+=6;
    for(let shift=4;shift<bits;shift+=4){result=(a&((15)<<shift))+(v&(15<<shift))+(result&((1<<shift)-1))+(result>(1<<shift)-1?1<<shift:0);
      if(shift===bits-4)overflow=(~(a^v)&(a^result))&sign;
      if(result>(9<<shift)+((1<<shift)-1))result+=6<<shift;
    }
   }else{
    let borrow=1-c;result=0;
    for(let shift=0;shift<bits;shift+=4){let digit=((a>>shift)&15)-((v>>shift)&15)-borrow;borrow=digit<0?1:0;if(borrow)digit-=6;result|=(digit&15)<<shift;}
    if(!borrow)result|=mask+1;
   }
  }
  this.r.p=(this.r.p&~(C|V))|(result>mask?C:0)|(overflow?V:0);
  this.r.a=(this.r.a&~mask)|(result&mask);this.setNZ(result,bits);
 }
 step(){
  if(this.stopped)return 1;
  if(this.nmiPending){this.nmiPending=false;return this.interrupt(this.r.e?0xfffa:0xffea);}
  if(this.irqLine&&!(this.r.p&I))return this.interrupt(this.r.e?0xfffe:0xffee);
  if(this.waiting)return 1;
  const pc=this.addr(),opcode=this.fetch8(),[op,mode]=ops[opcode];if(this.trace)this.trace({pc,op:opcode,r:{...this.r}});
  const r=this.r,wide=indexOps.has(op)?!this.x8():!this.m8(),bits=wide?16:8,mask=wide?65535:255;
  let cy=cycles[opcode],a=0,v=0,base=0,wrap=0xffffff,n,t;
  switch(mode){
   case 'sig': case 'byte':v=this.fetch8();break;
   case 'word':v=this.fetch16();break;
   case 'im':v=wide?this.fetch16():this.fetch8();if(wide)cy++;break;
   case 'dp':case 'dx':case 'dy': n=this.fetch8();a=this.dp(n,mode==='dx'?r.x:mode==='dy'?r.y:0);wrap=65535;break;
   case 'ix':n=this.fetch8();a=(r.db<<16)|this.ptr(this.dp(n,r.x));break;
   case 'ind':case 'iy':n=this.fetch8();base=(r.db<<16)|this.ptr(this.dp(n));a=(base+(mode==='iy'?r.y:0))&0xffffff;break;
   case 'il':case 'ily':n=this.fetch8();a=(this.ptr((r.d+n)&65535,true)+(mode==='ily'?r.y:0))&0xffffff;break;
   case 'sr':a=(r.s+this.fetch8())&65535;wrap=65535;break;
   case 'sy':base=this.word((r.s+this.fetch8())&65535,65535);a=((r.db<<16)+base+r.y)&0xffffff;break;
   case 'ab':case 'ax':case 'ay':base=(r.db<<16)|this.fetch16();a=(base+(mode==='ax'?r.x:mode==='ay'?r.y:0))&0xffffff;break;
   case 'al':case 'alx':a=(this.fetch24()+(mode==='alx'?r.x:0))&0xffffff;break;
   case 'jump':a=this.fetch16();break;
   case 'long':a=this.fetch24();break;
   case 'ji':a=this.word(this.fetch16(),65535);break;
   case 'jix':a=this.word((r.pb<<16)|((this.fetch16()+r.x)&65535),65535);break;
   case 'jil':n=this.fetch16();a=this.word(n,65535)|(this.mem.read((n+2)&65535)<<16);break;
   case 'rel':v=this.fetch8();v=v&128?v-256:v;break;
   case 'rell':v=this.fetch16();v=v&32768?v-65536:v;break;
   case 'move':a=this.fetch8();v=this.fetch8();break;
  }
  if(['dp','dx','dy','ix','ind','iy','il','ily'].includes(mode)&&r.d&255)cy++;
  if(reads.has(op)&&['ax','ay','iy'].includes(mode)&&(!this.x8()||((base^a)&0xff00)))cy++;
  const next=(a&~wrap)|((a+1)&wrap);
  const read=()=>this.mem.read(a)|(wide?this.mem.read(next)<<8:0);
  const write=value=>{this.mem.write(a,value&255);if(wide)this.mem.write(next,(value>>8)&255);};
  if(mode!=='im'&&reads.has(op)){v=read();if(wide)cy++;}
  if(rmws.has(op)){v=mode==='a'?r.a&mask:read();if(mode!=='a'&&wide)cy+=2;}
  switch(op){
   case 'LDA':r.a=(r.a&~mask)|v;this.setNZ(v,bits);break;
   case 'LDX':r.x=v;this.setNZ(v,bits);break;case 'LDY':r.y=v;this.setNZ(v,bits);break;
   case 'STA':write(r.a);if(wide)cy++;break;case 'STX':write(r.x);if(wide)cy++;break;case 'STY':write(r.y);if(wide)cy++;break;case 'STZ':write(0);if(wide)cy++;break;
   case 'ORA':case 'AND':case 'EOR':v=op==='ORA'?r.a|v:op==='AND'?r.a&v:r.a^v;r.a=(r.a&~mask)|(v&mask);this.setNZ(v,bits);break;
   case 'ADC':case 'SBC':this.arithmetic(v,op==='SBC',bits);break;
   case 'CMP':case 'CPX':case 'CPY':t=(op==='CMP'?r.a&mask:op==='CPX'?r.x:r.y)-v;r.p=(r.p&~C)|(t>=0?C:0);this.setNZ(t,bits);break;
   case 'BIT':r.p=(r.p&~Z)|((r.a&v&mask)===0?Z:0);if(mode!=='im')r.p=(r.p&~(N|V))|((v>>(wide?8:0))&(N|V));break;
   case 'TSB':case 'TRB':r.p=(r.p&~Z)|((r.a&v&mask)===0?Z:0);write(op==='TSB'?v|r.a:v&~r.a);break;
   case 'ASL':case 'LSR':case 'ROL':case 'ROR':
    t=r.p&C?1:0;r.p=(r.p&~C)|((op==='ASL'||op==='ROL')?(v&(wide?32768:128)?C:0):(v&1));
    v=op==='ASL'?v<<1:op==='LSR'?v>>>1:op==='ROL'?(v<<1)|t:(v>>>1)|(t<<(bits-1));
    if(mode==='a')r.a=(r.a&~mask)|(v&mask);else write(v);this.setNZ(v,bits);break;
   case 'INC':case 'DEC':v=(v+(op==='INC'?1:-1))&mask;if(mode==='a')r.a=(r.a&~mask)|v;else write(v);this.setNZ(v,bits);break;
   case 'INX':case 'DEX':r.x=(r.x+(op==='INX'?1:-1))&this.maskX();this.setNZ(r.x,this.x8()?8:16);break;
   case 'INY':case 'DEY':r.y=(r.y+(op==='INY'?1:-1))&this.maskX();this.setNZ(r.y,this.x8()?8:16);break;
   case 'CLC':r.p&=~C;break;case 'SEC':r.p|=C;break;case 'CLI':r.p&=~I;break;case 'SEI':r.p|=I;break;case 'CLD':r.p&=~D;break;case 'SED':r.p|=D;break;case 'CLV':r.p&=~V;break;
   case 'REP':this.setP(r.p&~v);break;case 'SEP':this.setP(r.p|v);break;
   case 'XCE':t=!!(r.p&C);r.p=(r.p&~C)|(r.e?C:0);r.e=t;if(r.e){r.s=256|(r.s&255);this.setP(r.p);}break;
   case 'XBA':r.a=((r.a&255)<<8)|(r.a>>8);this.setNZ(r.a&255,8);break;
   case 'TAX':case 'TAY':case 'TSX':case 'TXY':case 'TYX':v=op==='TSX'?r.s:op==='TXY'?r.x:op==='TYX'?r.y:r.a;v&=this.maskX();if(op==='TAY'||op==='TXY')r.y=v;else r.x=v;this.setNZ(v,this.x8()?8:16);break;
   case 'TXA':case 'TYA':v=(op==='TXA'?r.x:r.y)&this.maskM();r.a=(r.a&~this.maskM())|v;this.setNZ(v,this.m8()?8:16);break;
   case 'TXS':case 'TCS':v=op==='TXS'?r.x:r.a;r.s=r.e?(256|(v&255)):v;break;
   case 'TSC':case 'TDC':r.a=op==='TSC'?r.s:r.d;this.setNZ(r.a,16);break;case 'TCD':r.d=r.a;this.setNZ(r.d,16);break;
   case 'PHA':if(!this.m8()){this.push8(r.a>>8);cy++;}this.push8(r.a);break;
   case 'PHX':case 'PHY':v=op==='PHX'?r.x:r.y;if(!this.x8()){this.push8(v>>8);cy++;}this.push8(v);break;
   case 'PHP':this.push8(r.p);break;case 'PHB':this.push8(r.db);break;case 'PHK':this.push8(r.pb);break;case 'PHD':this.pushNew16(r.d);break;
   case 'PLA':v=this.pull8();if(!this.m8()){v|=this.pull8()<<8;cy++;}r.a=(r.a&~this.maskM())|v;this.setNZ(v,this.m8()?8:16);break;
   case 'PLX':case 'PLY':v=this.pull8();if(!this.x8()){v|=this.pull8()<<8;cy++;}if(op==='PLX')r.x=v;else r.y=v;this.setNZ(v,this.x8()?8:16);break;
   case 'PLP':this.setP(this.pull8());break;case 'PLB':r.db=this.pull8();this.setNZ(r.db,8);break;case 'PLD':r.d=this.pullNew8()|(this.pullNew8()<<8);if(r.e)r.s=256|(r.s&255);this.setNZ(r.d,16);break;
   case 'PEA':this.pushNew16(v);break;case 'PER':this.pushNew16((r.pc+v)&65535);break;case 'PEI':this.pushNew16(this.ptr(a));break;
   case 'JMP':r.pc=a&65535;if(mode==='jil')r.pb=a>>>16;break;case 'JML':r.pc=a&65535;r.pb=a>>>16;break;
   case 'JSR':this.push16((r.pc-1)&65535);r.pc=a;break;case 'JSL':this.pushNew8(r.pb);this.pushNew8(((r.pc-1)&65535)>>8);this.pushNew8((r.pc-1)&255);if(r.e)r.s=256|(r.s&255);r.pc=a&65535;r.pb=a>>>16;break;
   case 'RTS':r.pc=(this.pull16()+1)&65535;break;case 'RTL':r.pc=(this.pull16()+1)&65535;r.pb=this.pull8();break;
   case 'RTI':this.setP(this.pull8());r.pc=this.pull16();if(!r.e){r.pb=this.pull8();cy++;}break;
   case 'BRK':case 'COP':cy=this.interrupt(r.e?(op==='BRK'?0xfffe:0xfff4):(op==='BRK'?0xffe6:0xffe4),true);break;
   case 'BRA':case 'BRL':case 'BPL':case 'BMI':case 'BVC':case 'BVS':case 'BCC':case 'BCS':case 'BNE':case 'BEQ':
    t={BRA:true,BRL:true,BPL:!(r.p&N),BMI:!!(r.p&N),BVC:!(r.p&V),BVS:!!(r.p&V),BCC:!(r.p&C),BCS:!!(r.p&C),BNE:!(r.p&Z),BEQ:!!(r.p&Z)}[op];
    if(t){base=r.pc;r.pc=(r.pc+v)&65535;if(op!=='BRL'){cy++;if(r.e&&((base^r.pc)&0xff00))cy++;}}break;
   case 'MVN':case 'MVP':r.db=a;this.mem.write((a<<16)|r.y,this.mem.read((v<<16)|r.x));t=op==='MVN'?1:-1;r.x=(r.x+t)&this.maskX();r.y=(r.y+t)&this.maskX();r.a=(r.a-1)&65535;if(r.a!==65535)r.pc=(r.pc-3)&65535;break;
   case 'WAI':this.waiting=true;break;case 'STP':this.stopped=true;break;case 'WDM':case 'NOP':break;
   default:throw new Error('Invalid opcode table entry '+op);
  }
  return cy;
 }
}
