// Star Trek diagnostic CPU integration, reference: uploaded MAME 0.289.
// Not a complete or playable emulator. Missing sound devices fail explicitly.
import { Z80 } from '../../cpu/z80.js';
export const CPU_HZ = 15468480 / 4;
export function decrypt64(pc,b) {
  switch(pc & 3) {
    case 0:return b;
    case 1:return ((b&3)+((b&128)>>1)+((b&96)>>3)+((~b)&16)+((b&8)<<2)+((b&4)<<5))&255;
    case 2:return ((b&3)+((b&128)>>4)+(((~b)&64)>>1)+((b&32)>>1)+((b&16)>>2)+((b&8)<<3)+((b&4)<<5))&255;
    case 3:return ((b&35)+((b&192)>>4)+((b&16)<<2)+((b&8)<<1)+(((~b)&4)<<5))&255;
  }
}
export class StarTrekMachine {
  constructor(rom, options={}) {
    if(rom.length!==0xc000)throw Error('Main ROM region must be 0xc000 bytes');
    this.rom=rom;this.ram=new Uint8Array(0x800);this.vectorRAM=new Uint8Array(0x1000);
    this.usb=options.usb;this.speech=options.speech;
    this.readInputs=options.readInputs;this.vectorUpdate=options.vectorUpdate;
    this.scrambledPC=0xffff;this.wait=0;this.elapsed=0;this.drawEnd=0;
    this.mult=new Uint8Array(2);this.product=0;this.spinnerSelect=0;this.spinnerSign=0;this.spinnerCount=0;
    this.coinFF=0;this.coinLast=0;this.edgeFF=0;this.coinOutputs=0;
    this.cpu=new Z80(a=>this.memRead(a),(a,v)=>this.memWrite(a,v),p=>this.ioRead(p),(p,v)=>this.ioWrite(p,v));
    this.cpu.setInstructionReaders(a=>this.opcodeRead(a),a=>this.memRead(a));
    this.cpu.onIrqAcknowledge=()=>{this.coinFF=0;this.edgeFF=0;this.updateIRQ();return 0xff;};
  }
  device(name,method,...args) {
    const d=this[name];
    if(!d||typeof d[method]!=='function')throw Error(`Unimplemented ${name}.${method}; PC=${this.cpu.PC.toString(16)}`);
    return d[method](...args);
  }
  memRead(a) {
    a&=0xffff;this.wait+=2;
    if(a<0xc000)return this.rom[a];
    if(a>=0xc800&&a<0xd000)return this.ram[a-0xc800];
    if(a>=0xd000&&a<0xe000)return this.device('usb','ram_r',a-0xd000)&255;
    if(a>=0xe000&&a<0xf000)return this.vectorRAM[a-0xe000];
    return 255;
  }
  opcodeRead(a) {
    this.wait+=2; // AS_OPCODES tap, plus AS_PROGRAM read inside opcode_r.
    const op=this.memRead(a);this.scrambledPC=op===0x32?a:0xffff;return op;
  }
  decryptOffset(a) {
    if(this.scrambledPC===0xffff)return a;
    const pc=this.scrambledPC;this.scrambledPC=0xffff;
    return (a&0xff00)|decrypt64(pc,a&255);
  }
  memWrite(a,v) {
    a&=0xffff;v&=255;this.wait+=2;
    // MAME decrypts the handler-relative offset, after selecting its region.
    if(a>=0xc800&&a<0xd000)this.ram[this.decryptOffset(a-0xc800)]=v;
    else if(a>=0xd000&&a<0xe000)this.device('usb','ram_w',this.decryptOffset(a-0xd000),v);
    else if(a>=0xe000&&a<0xf000)this.vectorRAM[this.decryptOffset(a-0xe000)]=v;
  }
  inputs() {
    if(!this.readInputs)throw Error('Input provider not integrated; refusing fabricated defaults');
    return this.readInputs(this);
  }
  ioRead(p) {
    p&=255;
    if(p===0x3f)return this.device('usb','status_r')&255;
    if(p===0xbe){const v=this.product&255;this.product>>>=8;return v;}
    if(p>=0xf8&&p<=0xfb){
      const i=this.inputs(),o=p&3;
      const d7=(i.D7D6&~0x20)|(this.elapsed<this.drawEnd?0x20:0);
      const values=[d7,i.D5D4,i.D3D2,i.D1D0];let result=0;
      values.forEach((v,n)=>{result|=((v>>>o)&1)<<(7-n*2);result|=((v>>>(o+4))&1)<<(6-n*2);});
      return result;
    }
    if(p===0xfc){
      const i=this.inputs();if(this.spinnerSelect&1)return i.FC&255;
      const delta=((i.spinnerDelta&255)<<24)>>24;
      if(delta){this.spinnerSign=(delta>>7)&1;this.spinnerCount=(this.spinnerCount+Math.abs(delta))&255;}
      return (~((this.spinnerCount<<1)|this.spinnerSign))&255;
    }
    return 255;
  }
  ioWrite(p,v) {
    p&=255;v&=255;
    if(p===0x38)this.device('speech','data_w',v);
    else if(p===0x3b)this.device('speech','control_w',v);
    else if(p===0x3f)this.device('usb','data_w',v);
    else if(p===0xbd||p===0xbe){this.mult[p-0xbd]=v;if(p===0xbe)this.product=this.mult[0]*v;}
    else if(p===0xf8)this.spinnerSelect=v;
    else if(p===0xf9||p===0xfd)this.coinOutputs=v&0xc0;
    // 0xbf is the driver's logging-only unknown_w, not an IRQ enable latch.
  }
  updateIRQ(){this.cpu.setIrqLine(!!(this.coinFF||this.edgeFF));this.coinFF&=~4;}
  coinLine(index,state){
    const mask=1<<index;
    if(!state&&(this.coinLast&mask))this.coinFF|=mask;else this.coinFF&=~mask;
    if(state)this.coinLast|=mask;else this.coinLast&=~mask;
    this.updateIRQ();
  }
  serviceSwitch(pressed){if(pressed)this.cpu.pulseNmi();}
  step(){
    this.wait=0;
    const base=this.cpu.step(),wait=this.wait;
    this.cpu.cycles+=wait;this.elapsed+=base+wait;
    return base+wait;
  }
  videoEvent(){
    if(!this.vectorUpdate)throw Error('Vector callback not integrated');
    this.edgeFF=1;this.updateIRQ();
    const drawSeconds=this.vectorUpdate(this.vectorRAM);
    if(!Number.isFinite(drawSeconds)||drawSeconds<0)throw Error('Invalid vector draw duration');
    this.drawEnd=this.elapsed+drawSeconds*CPU_HZ;
  }
}
export function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0');}
const CRC=["be46f5d9", "65e3baf3", "8169fd3d", "78fd68dc", "3f55ab86", "2542ecfb", "75c2526a", "096d75d0", "bc7b9a12", "ed9fe2fb", "28699d45", "3a7593cb", "5b11886b", "62eb96e6", "99852d1d", "76ce27b2", "dd92d187", "e37d3a1e", "b2ec8125"];
export const MAIN_ROMS=['1873.cpu-u25',...Array.from({length:23},(_,i)=>`${1848+i}.prom-u${i+1}`)];
if(typeof document!=='undefined'){
  const log=document.querySelector('#log'),status=document.querySelector('#status');let machine;
  const write=s=>{log.textContent+=s+'\n';};
  const report=()=>write(`PC=${machine.cpu.PC.toString(16).padStart(4,'0')} SP=${machine.cpu.SP.toString(16).padStart(4,'0')} cycles=${machine.elapsed}`);
  document.querySelector('#load').onclick=async()=>{
    document.querySelector('#step').disabled=true;log.textContent='';status.textContent='Loading program ROMs…';
    try{
      const rom=new Uint8Array(0xc000);
      for(let i=0;i<MAIN_ROMS.length;i++){
        const r=await fetch(new URL('./roms/'+MAIN_ROMS[i],import.meta.url));if(!r.ok)throw Error(MAIN_ROMS[i]+': HTTP '+r.status);
        const b=new Uint8Array(await r.arrayBuffer());if(b.length!==0x800)throw Error(MAIN_ROMS[i]+': wrong size');
        const c=crc32(b);if(CRC[i]&&CRC[i]!==c)throw Error(MAIN_ROMS[i]+': CRC mismatch');
        rom.set(b,i*0x800);write(MAIN_ROMS[i]+': '+c+(CRC[i]?' verified':' reference CRC pending'));
      }
      machine=new StarTrekMachine(rom);window.startrek=machine;
      document.querySelector('#step').disabled=false;
      status.textContent='Diagnostic stepping ready. Stops at first unimplemented input/sound access. No game rendering or audio.';report();
    }catch(e){status.textContent=e.message;write(e.stack);}
  };
  document.querySelector('#step').onclick=()=>{
    try{machine.step();report();}catch(e){status.textContent='Stopped: '+e.message;write(e.stack);document.querySelector('#step').disabled=true;}
  };
}
