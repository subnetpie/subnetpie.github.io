// Zilog Z8530 SCC model used by the Apple IIgs serial ports.
class SCCChannel {
  constructor(parent,index){this.parent=parent;this.index=index;this.reg=new Uint8Array(16);this.rx=[];this.tx=[];this.reset();}
  reset(){this.reg.fill(0);this.pointer=0;this.expectPointer=false;this.rx.length=0;this.tx.length=0;this.txEmpty=true;this.txCycles=0;this.txByte=-1;}
  status(){
    // RR0: RX character available, TX buffer empty, DCD/CTS idle-high.
    return (this.rx.length?0x01:0)|(this.txEmpty?0x04:0)|0x28;
  }
  controlRead(){
    const p=this.pointer&15; this.pointer=0; this.expectPointer=false;
    if(p===0)return this.status();
    if(p===1)return this.parent.interruptStatus(this.index);
    if(p===3)return this.index===0 ? this.parent.pendingBits() : 0;
    return this.reg[p];
  }
  controlWrite(v){
    v&=255;
    if(this.expectPointer){
      const p=this.pointer&15; this.reg[p]=v; this.pointer=0; this.expectPointer=false;
      this.parent.updateIRQ(); return;
    }
    // WR0 low three bits select the following register. Zero is a command.
    const sel=(v&7)|(((v>>>3)&7)===1?8:0);
    if(sel){this.pointer=sel;this.expectPointer=true;return;}
    const cmd=(v>>>3)&7;
    if(cmd===3)this.parent.resetChannel(this.index);
    else if(cmd===5){this.txEmpty=true;this.parent.updateIRQ();}
    else if(cmd===7)this.parent.clearHighestIRQ();
  }
  dataRead(){const v=this.rx.length?this.rx.shift():0;this.parent.updateIRQ();return v;}
  dataWrite(v){
    this.tx.push(v&255); this.txEmpty=false;
    if(this.txByte<0)this.startTransmit();
    this.parent.updateIRQ();
  }
  baudDivisor(){
    const timeConstant = (this.reg[13] << 8) | this.reg[12];
    const divisor = (timeConstant + 2) * 2;
    return divisor || 4;
  }
  bitsPerCharacter(){
    const bits=[5,7,6,8][(this.reg[5]>>>5)&3];
    return 1+bits+((this.reg[4]&0x0c)?1:0)+((this.reg[4]&3)===3?2:1);
  }
  startTransmit(){
    if(!this.tx.length){this.txByte=-1;this.txEmpty=true;return;}
    this.txByte=this.tx.shift(); this.txEmpty=false;
    this.txCycles=this.baudDivisor()*this.bitsPerCharacter();
  }
  tick(cycles){
    if(this.txByte<0)return;
    this.txCycles-=cycles;
    while(this.txByte>=0 && this.txCycles<=0){
      const carry=this.txCycles; this.parent.transmitted(this.index,this.txByte);
      this.startTransmit(); if(this.txByte>=0)this.txCycles+=carry;
    }
    this.parent.updateIRQ();
  }
  inject(v){this.rx.push(v&255);this.parent.updateIRQ();}
}

export class IIgsSCC {
  constructor(irq=null){this.irq=irq;this.onTransmit=null;this.channels=[new SCCChannel(this,0),new SCCChannel(this,1)];this.reset();}
  reset(){for(const c of this.channels)c.reset();this.irqPending=false;this.updateIRQ();}
  resetChannel(n){this.channels[n].reset();this.updateIRQ();}
  interruptStatus(n){
    const c=this.channels[n];
    return (c.rx.length && (c.reg[1]&0x18)) ? 0x20 : 0;
  }
  pendingBits(){
    let bits=0;
    for(const c of this.channels) {
      const shift=c.index===0?3:0;
      if(c.rx.length && (c.reg[1]&0x18))bits|=4<<shift;
      if(c.txEmpty && (c.reg[1]&2))bits|=2<<shift;
    }
    return bits;
  }
  pending(){
    return this.channels.some(c=>(c.rx.length && (c.reg[1]&0x18)) || (c.txEmpty && (c.reg[1]&0x02)));
  }
  updateIRQ(){this.irqPending=this.pending();if(this.irq)this.irq(this.irqPending);}
  clearHighestIRQ(){this.irqPending=false;if(this.irq)this.irq(false);}
  read(port){
    const ch=(port&1)?0:1; // C038/39 = B/A control, C03A/3B = B/A data
    return (port&2)?this.channels[ch].dataRead():this.channels[ch].controlRead();
  }
  write(port,v){
    const ch=(port&1)?0:1;
    if(port&2)this.channels[ch].dataWrite(v);else this.channels[ch].controlWrite(v);
  }
  inject(channel,v){this.channels[channel&1].inject(v);}
  transmitted(channel,v){if(this.onTransmit)this.onTransmit(channel,v);}
  tick(cycles){for(const c of this.channels)c.tick(cycles);}
}
