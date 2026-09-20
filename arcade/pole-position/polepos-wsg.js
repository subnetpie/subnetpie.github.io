// MAME 0.289 src/devices/sound/namco.cpp, polepos_wsg_device register map.
// Eight voices / four cabinet speakers, folded into mono for this browser host.
export class PolePositionWSG {
  constructor(sampleRate, prom) { this.sampleRate=sampleRate;this.prom=prom;this.reset(); }
  reset(){this.regs=new Uint8Array(64);this.phase=new Float64Array(8);}
  write(offset,value){this.regs[offset&63]=value&255;}
  render(out,enabled=true){
    out.fill(0);if(!enabled)return;
    for(let ch=0;ch<8;ch++){
      const r=ch*4, wave=this.regs[r+35]&7;
      if(this.regs[r+35]&8)continue; // external 52XX/54XX selected
      const vol=((this.regs[r+3]>>4)+(this.regs[r+3]&15)+(this.regs[r+35]>>4)+(this.regs[r+2]>>4))/4;
      if(!vol)continue;
      const frequency=this.regs[r]|(this.regs[r+1]<<8), step=frequency*48000/this.sampleRate;
      for(let i=0;i<out.length;i++){
        out[i]+=((this.prom[wave*32+((Math.floor(this.phase[ch]/32768))&31)]&15)-8)*vol/1024;
        this.phase[ch]=(this.phase[ch]+step)%1048576;
      }
    }
  }
}
