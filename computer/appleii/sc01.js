// Votrax SC-01A compatibility model for the Mockingboard speech path.
// Bus/handshake timing follows MAME 0.289 votrax.cpp/a2mockingboard.cpp.
// Audio uses the existing recorded phoneme corpus as a browser-friendly
// approximation; the SC-01A's transistor/filter network is not reproduced.
import {phonemeInfo,phonemePCM} from './vendor/ssi263-phonemes.js';

export const SC01_CLOCK=1022727;

// MAME 0.289 SC-01A phone order.
export const SC01_PHONES=[
  'EH3','EH2','EH1','PA0','DT','A1','A2','ZH',
  'AH2','I3','I2','I1','M','N','B','V',
  'CH','SH','Z','AW1','NG','AH1','OO1','OO',
  'L','K','J','H','G','F','D','S',
  'A','AY','Y1','UH3','AH','P','O','I',
  'U','Y','T','R','E','W','AE','AE1',
  'AW2','UH2','UH1','UH','O2','O1','IU','U1',
  'THV','TH','ER','EH','E1','AW','PA1','STOP'
];

// Recorded SSI-263 corpus indices (SSI phone code minus 2) chosen by closest
// phonetic equivalent. -1 denotes a pause/stop phone. This affects timbre only;
// handshake, strobe and A/R timing are SC-01A-compatible.
const SAMPLE=[
   9, 8, 9,-1,35, 6,10,45,
  13, 5, 5, 5,53,54,34,49,
  48,48,45,16,55,12,17,17,
  30,39,47,40,39,50,35,46,
   6, 3, 1,25,12,37,15, 5,
  20, 1,38,27,60,14,10,11,
  16,24,23,22,15,15,18,21,
  51,52,26, 8,60,16,-1,-1
];

export class SC01A {
  constructor({hostHz=1020500,ar=()=>{}}={}) {
    this.hostHz=hostHz;
    this.ar=ar;
    this.reset();
  }
  reset() {
    this.phone=0x3f;
    this.inflection=0;
    this.arState=true;
    this.commitClock=Infinity;
    this.endClock=Infinity;
    this.sampleStart=Infinity;
    this.sampleEnd=Infinity;
    this.sampleIndex=-1;
    this.ar(true);
  }
  setAR(state) {
    state=!!state;
    if(this.arState===state)return;
    this.arState=state;
    this.ar(state);
  }
  inflection_w(data) { this.inflection=data&3; }
  write(data,clock) {
    this.sync(clock);
    this.phone=data&0x3f;
    // MAME drops A/R immediately on STB and commits the new phone 72 SC-01
    // master clocks later.
    this.setAR(false);
    this.commitClock=clock+72*(this.hostHz/SC01_CLOCK);
    this.endClock=Infinity;
    this.sampleStart=Infinity;
    this.sampleEnd=Infinity;
    this.sampleIndex=SAMPLE[this.phone];
  }
  phoneSeconds() {
    const idx=this.sampleIndex;
    if(idx<0)return 0.045;
    const length=phonemeInfo[idx]?.[1]||992;
    // Recorded corpus lengths are close to SC-01 phone timing and preserve the
    // long-vowel/short-consonant distinction needed for intelligible speech.
    return Math.max(0.035,Math.min(0.180,length/22050));
  }
  commit(clock) {
    this.sampleStart=this.commitClock;
    const seconds=this.phoneSeconds();
    this.sampleEnd=this.sampleStart+seconds*this.hostHz;
    this.endClock=this.sampleEnd;
    this.commitClock=Infinity;
  }
  sync(clock) {
    if(clock>=this.commitClock)this.commit(clock);
    if(clock>=this.endClock) {
      this.endClock=Infinity;
      this.sampleEnd=Infinity;
      this.setAR(true);
    }
  }
  sample(clock) {
    this.sync(clock);
    const idx=this.sampleIndex;
    if(idx<0 || !Number.isFinite(this.sampleStart) || clock<this.sampleStart || clock>=this.sampleEnd)return 0;
    const [offset,length]=phonemeInfo[idx];
    const duration=Math.max(1,this.sampleEnd-this.sampleStart);
    const phase=(clock-this.sampleStart)/duration;
    // Inflection on the SC-01A is a two-bit pitch input. Keep duration fixed as
    // the hardware does, and make a small local read-position perturbation so
    // the four inflection states are audible without altering A/R timing.
    const pitch=[0.88,0.96,1.04,1.12][this.inflection];
    const center=phase*(length-1);
    const wobble=(pitch-1)*32*Math.sin(phase*Math.PI*8);
    const pos=Math.max(0,Math.min(length-1,center+wobble));
    const i=Math.floor(pos),f=pos-i;
    const a=phonemePCM[offset+i]||0;
    const b=phonemePCM[offset+Math.min(i+1,length-1)]||0;
    return ((a*(1-f)+b*f)/32768)*0.55;
  }
}
