// SPDX-License-Identifier: BSD-3-Clause
// POKEY audio path ported from MAME 0.289 pokey.cpp/pokey.h.
// Original copyright: Brad Oliver, Eric Smith, Juergen Buchmueller.
// Serial, keyboard and pot scanning are not connected on the Battlezone board.
export const POKEY_CLOCK=12096000/8;
function polynomial(size) {
 const mask=(1<<size)-1,out=new Uint32Array(mask);let s=size<9?0:mask;
 for(let i=0;i<mask;i++) {
  if(size<9)s=((s<<1)|(~((s>>2)^(s>>(size-1)))&1))&mask;
  else if(size===9)s=(s>>>1)|(((s^(s>>>5))&1)<<8);
  else s=((s>>>1)&0xff7f)|((((s>>>8)^(s>>>13))&1)<<7)|((s&1)<<16);
  out[i]=s;
 }
 return out;
}
const polys=[4,5,9,17].map(polynomial);
const conductance=new Float64Array(16);
for(let v=0;v<16;v++) {
 conductance[v]=1e-12;
 [90000,26500,8050,3400].forEach((r,i)=>conductance[v]+=1/((v&(1<<i))?r:8e6));
}
export class PokeyAudio {
 constructor() {
  this.reg=new Uint8Array(16);this.p=new Uint32Array(4);
  this.counter=new Uint8Array(4);this.borrow=new Uint8Array(4);
  this.out=new Uint8Array(4);this.filter=new Uint8Array(4);
  this.clk28=0;this.clk114=0;this.voltage=0;this.raw=-1;
 }
 resetChannel(ch){this.counter[ch]=this.reg[ch*2]^255;this.borrow[ch]=0;}
 write(r,d) {
  r&=15;d&=255;const old=this.reg[r];this.reg[r]=d;
  if(r===9)for(let ch=0;ch<4;ch++){this.resetChannel(ch);this.out[ch]=0;this.filter[ch]=ch<2?1:0;}
  if(r===15&&d!==old&&!(d&3)){this.p.fill(0);this.clk28=this.clk114=0;}
 }
 inc(ch,delay) {
  this.counter[ch]=(this.counter[ch]+1)&255;
  if(!this.counter[ch]&&!this.borrow[ch])this.borrow[ch]=delay;
 }
 check(ch){return this.borrow[ch]>0 && --this.borrow[ch]===0;}
 process(ch) {
  const c=this.reg[ch*2+1];
  if((c&128)||(polys[1][this.p[1]]&1)) {
   if(c&32)this.out[ch]^=1;
   else this.out[ch]=(c&64?polys[0][this.p[0]]:this.reg[8]&128?polys[2][this.p[2]]:polys[3][this.p[3]])&1;
  }
 }
 step() {
  const a=this.reg[8],sk=this.reg[15];
  if(sk&3) {
   for(let i=0;i<4;i++)if(++this.p[i]===polys[i].length)this.p[i]=0;
   let c28=false,c114=false;
   if(++this.clk28===28){this.clk28=0;c28=true;}
   if(++this.clk114===114){this.clk114=0;c114=true;}
   const base=a&1?c114:c28;
   if(a&64)this.inc(0,a&16?7:4);else if(base)this.inc(0,1);
   if(a&32)this.inc(2,a&8?7:4);else if(base)this.inc(2,1);
   if(base){if(!(a&16))this.inc(1,1);if(!(a&8))this.inc(3,1);}
  }
  // Borrow processing order is observable for joined counters and filters.
  if(this.check(2)) {
   if(a&8)this.inc(3,1);else this.resetChannel(2);
   this.process(2);this.filter[0]=a&4?this.out[0]:1;
  }
  if(this.check(3)) {
   if(a&8)this.resetChannel(2);
   this.resetChannel(3);this.process(3);this.filter[1]=a&2?this.out[1]:1;
  }
  if((sk&8)&&this.borrow[1]===1)this.resetChannel(0);
  if(this.check(0)) {
   if(a&16)this.inc(1,1);else {
    this.resetChannel(0);
    if((sk&8)&&!(sk&128))this.resetChannel(1);
   }
   this.process(0);
  }
  if(this.check(1)){if(a&16)this.resetChannel(0);this.resetChannel(1);this.process(1);}
  let raw=0;
  for(let ch=0;ch<4;ch++) {
   const c=this.reg[ch*2+1];
   if((this.out[ch]^this.filter[ch])||(c&16))raw|=(c&15)<<(ch*4);
  }
  if(raw!==this.raw) {
   this.raw=raw;let g=0;
   for(let ch=0;ch<4;ch++)g+=conductance[(raw>>>(4*ch))&15];
   const r=1/g;
   this.target=r/(r+10000)*5;
   this.alpha=1-Math.exp(-(r+10000)/(15e-9*10000*r*POKEY_CLOCK));
  }
  this.voltage+=(this.target-this.voltage)*this.alpha;
  return this.voltage;
 }
}
