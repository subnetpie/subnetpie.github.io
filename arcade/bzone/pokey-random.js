// MAME 0.289 pokey.cpp: poly_init_9_17, RANDOM_C, SKCTL_C.
// Battlezone clocks both the CPU and POKEY at BZONE_MASTER_CLOCK / 8.
function polynomial(size) {
  const mask=(1<<size)-1, bytes=new Uint8Array(mask);
  let state=mask;
  for(let i=0;i<mask;i++) {
    if(size===17) {
      const bit7=((state>>>8)^(state>>>13))&1, bit16=state&1;
      state=(((state>>>1)&0xff7f)|(bit7<<7)|(bit16<<16))&mask;
      bytes[i]=(state>>>8)&255;
    } else {
      state=((state>>>1)|(((state^(state>>>5))&1)<<8))&mask;
      bytes[i]=state&255;
    }
  }
  return bytes;
}
const POLY9=polynomial(9), POLY17=polynomial(17);

export class PokeyRandom {
  constructor() {this.p9=0;this.p17=0;this.lastCycle=0;this.skctl=0;this.audctl=0;}
  sync(cycle) {
    const elapsed=Math.max(0,cycle-this.lastCycle);
    this.lastCycle=cycle;
    if(this.skctl&3) {
      this.p9=(this.p9+elapsed)%511;
      this.p17=(this.p17+elapsed)%131071;
    }
  }
  read(cycle) {
    this.sync(cycle);
    return this.audctl&0x80?POLY9[this.p9]:POLY17[this.p17];
  }
  write(register,data,cycle) {
    this.sync(cycle);
    if(register===8) this.audctl=data&255;
    if(register===15) {
      this.skctl=data&255;
      if(!(this.skctl&3)) this.p9=this.p17=0;
    }
  }
}
