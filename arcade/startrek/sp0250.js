/*
BSD 3-Clause License
Copyright (c) Olivier Galibert. All rights reserved.
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
// Development module: uploaded MAME 0.289 sp0250.cpp/h non-PWM conversion.
// Not yet connected to Star Trek's speech CPU or browser audio.
// The scheduler must supply syncStream to advance synthesis before FIFO access.
const COEFS=[0,9,17,25,33,41,49,57,65,73,81,89,97,105,113,121,
129,137,145,153,161,169,177,185,193,201,209,217,225,233,241,249,
257,265,273,281,289,297,301,305,309,313,317,321,325,329,333,337,
341,345,349,353,357,361,365,369,373,377,381,385,389,393,397,401,
405,409,413,417,421,425,427,429,431,433,435,437,439,441,443,445,
447,449,451,453,455,457,459,461,463,465,467,469,471,473,475,477,
479,481,482,483,484,485,486,487,488,489,490,491,492,493,494,495,
496,497,498,499,500,501,502,503,504,505,506,507,508,509,510,511];
export class SP0250 {
  constructor({clock=3120000,drq=()=>{},syncStream=()=>{}}={}) {
    this.sampleRate=Math.trunc(Math.trunc(clock/2)/156);
    this.onDRQ=drq;this.syncStream=syncStream;
    this.fifo=new Uint8Array(15);this.fifoPos=0;
    this.filter=Array.from({length:6},()=>({F:0,B:0,z1:0,z2:0}));
    this.voiced=0;this.amp=0;this.lfsr=0x7fff;this.pitch=0;
    this.pcount=0;this.repeat=0;this.rcount=0;this.pwmCounts=0;
    this.overflows=0;this.onDRQ(true);this.reset();
  }
  static gain(v){return (v&31)<<(v>>>5);}
  static coefficient(v){return (v&128)?COEFS[v&127]:-COEFS[v&127];}
  reset(){this.loadValues();}
  loadValues(){
    const f=this.fifo,positions=[0,3,6,9,11,13];
    for(let i=0;i<6;i++){
      const a=this.filter[i];a.B=SP0250.coefficient(f[positions[i]]);
      a.F=SP0250.coefficient(f[positions[i]+1]);a.z1=a.z2=0;
    }
    this.amp=SP0250.gain(f[2]);this.pitch=f[5];
    this.repeat=f[8]&63;this.voiced=f[8]&64;
    this.fifoPos=0;this.onDRQ(true);this.pcount=this.rcount=0;
  }
  write(data){
    this.syncStream();
    if(this.fifoPos!==15){this.fifo[this.fifoPos++]=data&255;if(this.fifoPos===15)this.onDRQ(false);}
    else this.overflows++;
  }
  drq_r(){this.syncStream();return this.fifoPos===15?0:1;}
  next(){
    if(this.rcount>=this.repeat){
      if(this.fifoPos===15)this.loadValues();
      else{this.repeat=1;this.pcount=0;this.rcount=0;}
    }
    this.lfsr=(this.lfsr^((this.lfsr^(this.lfsr>>>1))<<15))&0xffff;
    this.lfsr>>>=1;
    let z=this.voiced?(this.pcount===0?this.amp:0):((this.lfsr&1)?this.amp:-this.amp);
    for(const f of this.filter){
      z=(z+((f.z1*f.F)>>8)+((f.z2*f.B)>>9))<<16>>16;
      f.z2=f.z1;f.z1=z;
    }
    const dac=Math.max(-64,Math.min(63,z>>6));
    this.pwmCounts=((((dac+71)>>2)<<0)+(((dac+69)>>2)<<8)+
      (((dac+70)>>2)<<16)+(((dac+68)>>2)<<24))>>>0;
    const old=this.pcount;this.pcount=(old+1)&255;
    if(old===this.pitch){this.pcount=0;this.rcount=(this.rcount+1)&255;}
    return dac;
  }
  render(count){
    const samples=new Float32Array(count);
    for(let i=0;i<count;i++)samples[i]=this.next()/128;
    return samples;
  }
}
