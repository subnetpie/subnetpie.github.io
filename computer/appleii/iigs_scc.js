// Zilog Z8530 SCC model used by the Apple IIgs serial ports.
class SCCChannel {
  constructor(parent,index){this.parent=parent;this.index=index;this.reg=new Uint8Array(16);this.rx=[];this.tx=[];this.reset();}
  reset(){this.reg.fill(0);this.pointer=0;this.expectPointer=false;this.rx.length=0;this.tx.length=0;this.txEmpty=true;}
  status(){
    // RR0: RX character available, TX buffer empty, DCD/CTS idle-high.
    return (this.rx.length?0x01:0)|(this.txEmpty?0x04:0)|0x28;
  }
  controlRead(){
    const p=this.pointer&15; this.pointer=0;
    if(p===0)return this.status();
    if(p===1)return this.parent.interruptStatus(this.index);
    return this.reg[p];
  }
  controlWrite(v){
    v&=255;
    if(this.expectPointer){this.pointer=v&15;this.expectPointer=false;return;}
    // WR0 low three bits select the following register. Zero is a command.
    const sel=v&7;
    if(sel){this.pointer=sel;this.expectPointer=true;return;}
    const cmd=(v>>>3)&7;
    if(cmd===3)this.parent.resetChannel(this.index);
    else if(cmd===5){this.txEmpty=true;this.parent.updateIRQ();}
    else if(cmd===7)this.parent.clearHighestIRQ();
  }
  dataRead(){const v=this.rx.length?this.rx.shift():0;this.parent.updateIRQ();return v;}
  dataWrite(v){this.tx.push(v&255);this.txEmpty=true;this.parent.updateIRQ();}
  inject(v){this.rx.push(v&255);this.parent.updateIRQ();}
}

export class IIgsSCC {
  constructor(irq=null){this.irq=irq;this.channels=[new SCCChannel(this,0),new SCCChannel(this,1)];this.reset();}
  reset(){for(const c of this.channels)c.reset();this.irqPending=false;this.updateIRQ();}
  resetChannel(n){this.channels[n].reset();this.updateIRQ();}
  interruptStatus(n){
    const c=this.channels[n];
    return (c.rx.length && (c.reg[1]&0x18)) ? 0x20 : 0;
  }
  pending(){
    return this.channels.some(c=>(c.rx.length && (c.reg[1]&0x18)) || (!c.txEmpty && (c.reg[1]&0x02)));
  }
  updateIRQ(){this.irqPending=this.pending();if(this.irq)this.irq(this.irqPending);}
  clearHighestIRQ(){this.irqPending=false;if(this.irq)this.irq(false);}
  read(port){
    const ch=(port&2)?0:1; // IIgs C038/39=B, C03A/3B=A
    return (port&1)?this.channels[ch].controlRead():this.channels[ch].dataRead();
  }
  write(port,v){
    const ch=(port&2)?0:1;
    if(port&1)this.channels[ch].controlWrite(v);else this.channels[ch].dataWrite(v);
  }
  inject(channel,v){this.channels[channel&1].inject(v);}
}
