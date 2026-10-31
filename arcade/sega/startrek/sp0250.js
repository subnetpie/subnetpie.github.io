// GI SP0250 LPC synthesizer, ported from MAME 0.289 sp0250.cpp.
const COEFS=[0,9,17,25,33,41,49,57,65,73,81,89,97,105,113,121,129,137,145,153,161,169,177,185,193,201,209,217,225,233,241,249,257,265,273,281,289,297,301,305,309,313,317,321,325,329,333,337,341,345,349,353,357,361,365,369,373,377,381,385,389,393,397,401,405,409,413,417,421,425,427,429,431,433,435,437,439,441,443,445,447,449,451,453,455,457,459,461,463,465,467,469,471,473,475,477,479,481,482,483,484,485,486,487,488,489,490,491,492,493,494,495,496,497,498,499,500,501,502,503,504,505,506,507,508,509,510,511];
const s16=v=>((v&0xffff)^0x8000)-0x8000;
const gc=v=>s16((v&0x80)?COEFS[v&0x7f]:-COEFS[v&0x7f]);
const ga=v=>(v&0x1f)<<(v>>5);

export class SP0250 {
  constructor(onDrq=()=>{}){
    this.onDrq=onDrq;this.fifo=new Uint8Array(15);this.filters=Array.from({length:6},()=>({F:0,B:0,z1:0,z2:0}));
    this.fifoPos=0;this.voiced=false;this.amp=0;this.lfsr=0x7fff;this.pitch=0;this.pcount=0;this.repeat=0;this.rcount=0;
    this.onDrq(1);this.loadValues();
  }
  drq(){return this.fifoPos===15?0:1;}
  write(data){if(this.fifoPos!==15){this.fifo[this.fifoPos++]=data&255;if(this.fifoPos===15)this.onDrq(0);}}
  loadValues(){
    const q=this.fifo,f=this.filters;
    f[0].B=gc(q[0]);f[0].F=gc(q[1]);this.amp=ga(q[2]);
    f[1].B=gc(q[3]);f[1].F=gc(q[4]);this.pitch=q[5];
    f[2].B=gc(q[6]);f[2].F=gc(q[7]);this.repeat=q[8]&0x3f;this.voiced=!!(q[8]&0x40);
    f[3].B=gc(q[9]);f[3].F=gc(q[10]);f[4].B=gc(q[11]);f[4].F=gc(q[12]);f[5].B=gc(q[13]);f[5].F=gc(q[14]);
    this.fifoPos=0;this.onDrq(1);this.pcount=0;this.rcount=0;for(const x of f)x.z1=x.z2=0;
  }
  next(){
    if(this.rcount>=this.repeat){if(this.fifoPos===15)this.loadValues();else{this.repeat=1;this.pcount=0;this.rcount=0;}}
    this.lfsr=(this.lfsr^(((this.lfsr^(this.lfsr>>>1))<<15)&0xffff))&0xffff;this.lfsr>>>=1;
    let z0=this.voiced?(this.pcount===0?this.amp:0):((this.lfsr&1)?this.amp:-this.amp);
    z0=s16(z0);
    for(const f of this.filters){const n=s16(z0+((f.z1*f.F)>>8)+((f.z2*f.B)>>9));f.z2=f.z1;f.z1=n;z0=n;}
    let dac=z0>>6;if(dac<-64)dac=-64;else if(dac>63)dac=63;
    if(this.pcount++===this.pitch){this.pcount=0;this.rcount=(this.rcount+1)&255;}
    return dac/128;
  }
}
