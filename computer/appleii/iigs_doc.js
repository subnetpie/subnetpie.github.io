// Ensoniq ES5503 DOC core for the Apple IIgs.
// Behavioral reference: MAME 0.289 src/devices/sound/es5503.cpp
// (BSD-3-Clause, R. Belmont). Clock, phase, modes and channel selection
// follow that core; the output API retains the emulator's signed 128 scale.
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
    this.address=0; this.control=0; this.irqPending=false; this.irqQueue=[];
    this.systemVolume=0; this.readLatch=0; this.irqStatus=0xff;
    this.enabledOscillators=1; this.masterAccum=0; this.lastSample=0;
    this.lastLeft=0; this.lastRight=0;
    this.cpuHz=2800000; this.masterHz=7159090;
    for(const o of this.osc) {
      o.data=0x80; o.freq=0; o.volume=0; o.wave=0; o.control=1; o.size=0; o.accumulator=0;
    }
    this.updateIRQ();
  }
  updateIRQ(){ if(this.irq) this.irq(this.irqPending); }
  setAddressLow(v){this.address=(this.address&0xff00)|(v&255);}
  setAddressHigh(v){this.address=(this.address&255)|((v&255)<<8);}
  addressLow(){return this.address&255;} addressHigh(){return this.address>>>8;}
  setControl(v){this.control=v&0x7f;this.systemVolume=v&0x0f;if(!(v&0x40))this.address&=0xff;}
  getControl(){return this.control|0x1f;}
  getVolume(){return this.systemVolume;}
  // SOUNDCTL bit 5 selects automatic address increment after DOC data access.
  advance(){if(this.control&0x20)this.address=(this.address+1)&0xffff;}

  decodeRegister(a) {
    // ES5503 oscillator registers occupy seven 32-byte pages.
    if(a<0||a>=0xe0)return null;
    const page=(a>>>5)&7, n=a&31;
    if(page<=6) return {page,n};
    return null;
  }
  readRegister(a) {
    const r=this.decodeRegister(a);
    if(!r) {
      if((a&0xffff)===0xe2)return 0x80;
      if((a&0xffff)===0xe1) return ((this.enabledOscillators-1)<<1)&0x3e;
      if((a&0xffff)===0xe0) {
        // Hardware acknowledges the lowest-numbered enabled pending voice.
        const n=this.irqQueue.filter(n=>n<this.enabledOscillators).sort((a,b)=>a-b)[0]??-1;
        if(n>=0)this.irqQueue.splice(this.irqQueue.indexOf(n),1);
        this.irqPending=this.irqQueue.some(n=>n<this.enabledOscillators); this.updateIRQ();
        const status=n<0 ? this.irqStatus : n<<1;
        if(n>=0)this.irqStatus=status|0x80;
        return status|0x41;
      }
      return 0;
    }
    const o=this.osc[r.n];
    return [o.freq&255,o.freq>>>8,o.volume,o.data??0,o.wave,o.control,o.size][r.page]&255;
  }
  writeRegister(a,v) {
    v&=255; const r=this.decodeRegister(a);
    if(!r) {
      if((a&0xffff)===0xe1){this.enabledOscillators=Math.min(32,((v&0x3e)>>>1)+1);return;}
      return;
    }
    const o=this.osc[r.n];
    if(r.page===0)o.freq=(o.freq&0xff00)|v;
    else if(r.page===1)o.freq=(o.freq&255)|(v<<8);
    else if(r.page===2)o.volume=v;
    else if(r.page===3)return; // sample-data register is read-only
    else if(r.page===4)o.wave=v;
    else if(r.page===5){
      const old=o.control;
      if((old&1)&&!(v&1))o.accumulator=0;
      if(!(old&1)&&(v&1)&&(v&2))this.finish(r.n,o,false,v);
      o.control=v;
    }
    else o.size=v;
  }
  readData(){const v=this.readLatch;this.readLatch=(this.control&0x40)?this.ram[this.address]:this.readRegister(this.address);this.advance();return v;}
  writeData(v){if(this.control&0x40)this.ram[this.address]=v&255;else this.writeRegister(this.address,v);this.advance();}

  finish(n,o,zero=false,newControl=o.control) {
    let mode=(o.control>>>1)&3;
    const partner=this.osc[n^1];
    const shift=9+(o.size&7)-((o.size>>>3)&7);
    const end=(0x100<<((o.size>>>3)&7))-1;
    if(mode===2) {
      // Even sync voices reset the preceding odd voice. Odd AM voices
      // modulate the following voice's volume instead of entering the mix.
      if(!(n&1)&&n>0&&!(this.osc[n-1].control&1))this.osc[n-1].accumulator=0;
      mode=0;
    }
    if(mode!==0||zero)o.control|=1;
    else o.accumulator=(o.accumulator-end*2**shift)>>>0;
    if(mode===3) {
      partner.control&=~1;
      partner.accumulator=0;
    } else if(!(n&1)&&((partner.control>>>1)&3)===3) {
      // One-shot even / swap odd pairs retrigger the even oscillator.
      o.control&=~1;
      o.accumulator=(o.accumulator-end*2**shift)>>>0;
    }
    if((o.control&8)&&(zero||(newControl&8))) {
      if(!this.irqQueue.includes(n))this.irqQueue.push(n);
      this.irqPending=true;this.updateIRQ();
    }
  }

  renderSample() {
    let left=0,right=0;
    for(let n=0;n<this.enabledOscillators;n++) {
      const o=this.osc[n];if(o.control&1)continue;
      const tableSize=(o.size>>>3)&7;
      const length=0x100<<tableSize;
      const shift=9+(o.size&7)-tableSize;
      const index=o.accumulator>>>shift;
      const base=(o.wave<<8)&~(length-1);
      const sample=this.ram[(base+(index&(length-1)))&0xffff];
      o.data=sample;
      o.accumulator=(o.accumulator+o.freq)>>>0;
      if(sample===0){this.finish(n,o,true);continue;}
      if(((o.control>>>1)&3)===2&&(n&1)) {
        if(n<31&&!(this.osc[n+1].control&1))this.osc[n+1].volume=sample;
      } else {
        // Fixed mixer gain: starting/stopping one voice must not change
        // the volume of the others. The last enabled voice contributes 3x.
        const value=(sample-128)*o.volume*(n===this.enabledOscillators-1?3:1);
        if(o.control&0x10)right+=value;else left+=value;
      }
      if(index>=length-1)this.finish(n,o,false);
    }
    this.lastLeft=left/2048;
    this.lastRight=right/2048;
    this.lastSample=(this.lastLeft+this.lastRight)/2;
    return this.lastSample;
  }

  tick(cycles, cpuHz=this.cpuHz) {
    // One DOC scan includes the enabled oscillators plus two overhead slots.
    // Preserve fractional master clocks across 65C816 instructions so timing
    // does not depend on instruction boundaries.
    this.masterAccum += cycles*this.masterHz;
    const threshold = cpuHz*8*(this.enabledOscillators+2);
    let samples=0;
    while(this.masterAccum >= threshold) {
      this.masterAccum -= threshold;
      this.renderSample();
      // Remaining CPU clocks locate every DAC update within this tick.
      // Deliver all updates, including when one instruction spans a scan.
      if(this.onSample)this.onSample(this.lastLeft,this.lastRight,this.masterAccum/this.masterHz);
      samples++;
    }
    return samples;
  }
}
