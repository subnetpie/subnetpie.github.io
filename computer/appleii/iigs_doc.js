// Ensoniq ES5503 DOC core for the Apple IIgs.
export class IIgsDOC {
  constructor(irq = null) {
    this.ram = new Uint8Array(0x10000);
    this.irq = irq;
    this.osc = Array.from({length:32}, () => ({
      freq:0, volume:0, wave:0, control:1, size:0, accumulator:0
    }));
    this.reset();
  }

  reset() {
    this.address=0; this.control=0; this.dummyRead=0; this.irqPending=false; this.irqQueue=[];
    this.systemVolume=0;
    this.enabledOscillators=1; this.masterAccum=0; this.lastSample=0;
    this.lastLeft=0; this.lastRight=0;
    this.cpuHz=2800000; this.masterHz=7159090;
    for(const o of this.osc) {
      o.freq=0; o.volume=0; o.wave=0; o.control=1; o.size=0; o.accumulator=0;
    }
    this.updateIRQ();
  }
  updateIRQ(){ if(this.irq) this.irq(this.irqPending); }
  setAddressLow(v){this.address=(this.address&0xff00)|(v&255);}
  setAddressHigh(v){this.address=(this.address&255)|((v&255)<<8);}
  addressLow(){return this.address&255;} addressHigh(){return this.address>>>8;}
  setControl(v){this.control=v&0x7f;this.systemVolume=v&0x0f;if(!(this.control&0x40))this.address&=0x00ff;}
  getControl(){return this.control;}
  getVolume(){return this.systemVolume;}
  // SOUNDCTL bit 5 selects automatic address increment after DOC data access.
  advance(){if(this.control&0x20)this.address=(this.address+1)&0xffff;}

  decodeRegister(a) {
    // ES5503 oscillator registers occupy eight 32-byte pages.
    const page=(a>>>5)&7, n=a&31;
    if(page<=5) return {page,n};
    return null;
  }
  readRegister(a) {
    const r=this.decodeRegister(a);
    if(!r) {
      if((a&0xffff)===0xe0) return ((this.enabledOscillators-1)<<1)&0x3e;
      if((a&0xffff)===0xe1) {
        const n=this.irqQueue.length ? this.irqQueue.shift() : -1;
        this.irqPending=this.irqQueue.length>0; this.updateIRQ();
        return n<0 ? 0xff : ((n<<1)&0x3e);
      }
      return this.ram[a&0xffff];
    }
    const o=this.osc[r.n];
    return [o.freq&255,o.freq>>>8,o.volume,o.wave,o.control,o.size][r.page]&255;
  }
  writeRegister(a,v) {
    v&=255; const r=this.decodeRegister(a);
    if(!r) {
      if((a&0xffff)===0xe0){this.enabledOscillators=Math.min(32,((v&0x3e)>>>1)+1);return;}
      this.ram[a&0xffff]=v; return;
    }
    const o=this.osc[r.n];
    if(r.page===0)o.freq=(o.freq&0xff00)|v;
    else if(r.page===1)o.freq=(o.freq&255)|(v<<8);
    else if(r.page===2)o.volume=v;
    else if(r.page===3)o.wave=v;
    else if(r.page===4){o.control=v;if(!(v&1))o.accumulator=0;}
    else o.size=v;
  }
  readData(){const v=this.dummyRead;this.dummyRead=(this.control&0x40)?this.ram[this.address]:this.readRegister(this.address);this.advance();return v;}
  writeData(v){if(this.control&0x40)this.ram[this.address]=v&0xff;else this.writeRegister(this.address,v);this.advance();}

  finish(n,o) {
    const mode=(o.control>>>1)&3;
    if(o.control&0x08) {
      if(!this.irqQueue.includes(n)) this.irqQueue.push(n);
      this.irqPending=true; this.updateIRQ();
    }
    if(mode===0) o.control|=1;                // free: zero terminator halts
    else if(mode===1) o.accumulator=0;     // one-shot: restart at wave base
    else if(mode===3) o.control|=1;        // sync/AM partner terminates
    else {                                 // swap: halt this, start paired oscillator
      o.control|=1;
      const p=n^1; if(p<this.enabledOscillators){this.osc[p].control&=~1;this.osc[p].accumulator=0;}
    }
  }

  renderSample() {
    let left=0, right=0, leftCount=0, rightCount=0;
    for(let n=0;n<this.enabledOscillators;n++) {
      const o=this.osc[n]; if(o.control&1) continue;
      o.accumulator=(o.accumulator + o.freq)>>>0;
      // Resolution bits select 256/512/1K/2K/4K/8K/16K/32K-byte
      // wave tables. Wave pointer supplies the high byte; mask the base so
      // larger tables remain naturally aligned.
      const resolution=o.size&7;
      const length=0x100<<resolution;
      const base=((o.wave<<8)&~(length-1))&0xffff;
      const index=(o.accumulator>>>8)&(length-1);
      const sample=this.ram[(base+index)&0xffff];
      if(sample===0){this.finish(n,o);continue;}
      const value=((sample-128)*o.volume)/255;
      // IIgs DOC channels are selected by oscillator number: even voices feed
      // the left bus and odd voices the right bus.
      if(n&1){right+=value;rightCount++;}else{left+=value;leftCount++;}
    }
    this.lastLeft=leftCount ? left/leftCount : 0;
    this.lastRight=rightCount ? right/rightCount : 0;
    this.lastSample=(this.lastLeft+this.lastRight)/2;
    return this.lastSample;
  }

  tick(cycles, cpuHz=this.cpuHz) {
    // One DOC output update consumes 8 master clocks per enabled oscillator.
    // Preserve fractional master clocks across 65C816 instructions so timing
    // does not depend on instruction boundaries.
    this.masterAccum += cycles*this.masterHz;
    const threshold = cpuHz*8*this.enabledOscillators;
    let samples=0;
    while(this.masterAccum >= threshold) {
      this.masterAccum -= threshold;
      this.renderSample();
      samples++;
    }
    return samples;
  }
}
