// Namco WSG shared sound device.
// Behavior follows MAME 0.289 src/devices/sound/namco.cpp.
// Supports the PROM-based 3-voice mono WSG and Pole Position 8-voice/4-output WSG.

class NamcoWSGVoice {
  constructor() { this.volume=new Uint8Array(4); this.reset(); }
  reset(){ this.frequency=0; this.waveformSelect=0; this.counter=0; this.volume.fill(0); }
}

export class NamcoWSG {
  static VARIANT_3_VOICE = "3voice";
  static VARIANT_POLEPOS = "polepos";
  static INTERNAL_RATE = 192000;

  constructor({variant=NamcoWSG.VARIANT_3_VOICE, clock, sampleRate=48000, waveformProm}={}) {
    if (!(waveformProm instanceof Uint8Array) || waveformProm.length < 0x100)
      throw new TypeError("NamcoWSG requires a 0x100-byte waveform PROM");
    this.variant=variant;
    this.voiceCount=variant===NamcoWSG.VARIANT_POLEPOS?8:3;
    this.outputCount=variant===NamcoWSG.VARIANT_POLEPOS?4:1;
    this.clock=clock ?? (variant===NamcoWSG.VARIANT_POLEPOS?24000:96000);
    this.sampleRate=sampleRate;
    this.prom=waveformProm;
    this.regs=new Uint8Array(variant===NamcoWSG.VARIANT_POLEPOS?0x40:0x20);
    this.voices=Array.from({length:this.voiceCount},()=>new NamcoWSGVoice());
    this.soundEnabled=true;
    this._configureClock();
  }

  _configureClock(){
    let c=this.clock, multiple=0;
    while(c<NamcoWSG.INTERNAL_RATE){c*=2;multiple++;}
    this.namcoClock=c;
    this.fracBits=multiple+15;
  }

  reset(){ this.regs.fill(0); for(const v of this.voices)v.reset(); this.soundEnabled=true; }
  soundEnable(state){ this.soundEnabled=!!state; }
  read(offset){ return this.regs[offset&(this.regs.length-1)]; }

  write(offset,data){
    return this.variant===NamcoWSG.VARIANT_POLEPOS?
      this.poleposSoundWrite(offset,data):this.pacmanSoundWrite(offset,data);
  }

  pacmanSoundWrite(offset,data){
    offset&=0x1f; data&=0x0f;
    if(this.regs[offset]===data)return;
    this.regs[offset]=data;
    let ch=offset<0x10?Math.trunc((offset-5)/5):(offset===0x10?0:Math.trunc((offset-0x11)/5));
    if(ch<0||ch>=3)return;
    const v=this.voices[ch], key=offset-ch*5;
    if(key===0x05)v.waveformSelect=data&7;
    else if(key>=0x10&&key<=0x14){
      v.frequency=(ch===0?this.regs[0x10]:0)+(this.regs[ch*5+0x11]<<4)+(this.regs[ch*5+0x12]<<8)+(this.regs[ch*5+0x13]<<12)+(this.regs[ch*5+0x14]<<16);
    } else if(key===0x15)v.volume[0]=data;
  }

  poleposSoundWrite(offset,data){
    offset&=0x3f; data&=0xff;
    if(this.regs[offset]===data)return;
    this.regs[offset]=data;
    const ch=(offset&0x1f)>>2, v=this.voices[ch];
    switch(offset&0x23){
      case 0x00: case 0x01:
        v.frequency=this.regs[ch*4]|(this.regs[ch*4+1]<<8); break;
      case 0x23:
        v.waveformSelect=data&7;
        // fall through
      case 0x02: case 0x03:
        v.volume[0]=this.regs[ch*4+3]>>4;
        v.volume[1]=this.regs[ch*4+3]&15;
        v.volume[2]=this.regs[ch*4+0x23]>>4;
        v.volume[3]=this.regs[ch*4+2]>>4;
        if(this.regs[ch*4+0x23]&8)v.volume.fill(0);
        break;
    }
  }

  _wave(pos){ return (this.prom[pos&0xff]&15)-8; }

  renderMono(out,enabled=this.soundEnabled){
    out.fill(0); if(!enabled)return out;
    const scale=Math.pow(2,this.fracBits), ratio=this.namcoClock/this.sampleRate;
    for(const v of this.voices){
      const vol=v.volume[0]; if(!vol)continue;
      for(let i=0;i<out.length;i++){
        out[i]+=this._wave((v.waveformSelect<<5)+((v.counter>>>this.fracBits)&31))*vol/128;
        v.counter=(v.counter+v.frequency*ratio)%(scale*32);
      }
    }
    return out;
  }

  render(out,enabled=this.soundEnabled){
    if(this.variant!==NamcoWSG.VARIANT_POLEPOS)return this.renderMono(out,enabled);
    out.fill(0); if(!enabled)return out;
    const scale=Math.pow(2,this.fracBits), ratio=this.namcoClock/this.sampleRate;
    for(const v of this.voices){
      const vol=(v.volume[0]+v.volume[1]+v.volume[2]+v.volume[3])/4;
      if(!vol)continue;
      for(let i=0;i<out.length;i++){
        out[i]+=this._wave((v.waveformSelect<<5)+((v.counter>>>this.fracBits)&31))*vol/128;
        v.counter=(v.counter+v.frequency*ratio)%(scale*32);
      }
    }
    return out;
  }
}

export class PolePositionWSG extends NamcoWSG {
  constructor(sampleRate,waveformProm,clock=24000){
    super({variant:NamcoWSG.VARIANT_POLEPOS,clock,sampleRate,waveformProm});
  }
}
