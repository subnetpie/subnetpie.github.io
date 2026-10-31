// Sega/Gremlin Star Trek (1982) — Sega G80 vector hardware.
// Behavioral reference: MAME 0.289 segag80v.cpp / segag80v_v.cpp.
import { Z80 } from '../../cpu/z80.js';
import { StarTrekAudio } from './audio.js';

const VIDEO_CLOCK = 15468480;
const CPU_HZ = VIDEO_CLOCK / 4;
const U34_HZ = VIDEO_CLOCK / 3;
const VCL_HZ = U34_HZ / 2;
const U51_HZ = VCL_HZ / 16;
const FRAME_HZ = U34_HZ / 0x1f788;
const CYCLES_PER_FRAME = CPU_HZ / FRAME_HZ;
const VIEW_W = 1024;
const VIEW_H = 832;

const MAIN_ROMS = [
  '1873.cpu-u25','1848.prom-u1','1849.prom-u2','1850.prom-u3','1851.prom-u4','1852.prom-u5',
  '1853.prom-u6','1854.prom-u7','1855.prom-u8','1856.prom-u9','1857.prom-u10','1858.prom-u11',
  '1859.prom-u12','1860.prom-u13','1861.prom-u14','1862.prom-u15','1863.prom-u16','1864.prom-u17',
  '1865.prom-u18','1866.prom-u19','1867.prom-u20','1868.prom-u21','1869.prom-u22','1870.prom-u23'
];
const MAIN_CRC = [
  0xbe46f5d9,0x65e3baf3,0x8169fd3d,0x78fd68dc,0x3f55ab86,0x2542ecfb,0x75c2526a,0x096d75d0,
  0xbc7b9a12,0xed9fe2fb,0x28699d45,0x3a7593cb,0x5b11886b,0x62eb96e6,0x99852d1d,0x76ce27b2,
  0xdd92d187,0xe37d3a1e,0xb2ec8125,0x6f188354,0xb0a3eae8,0x8b4e2e07,0xe5663070,0x4340616d
];
const SOUND_ROMS = {
  '1607.speech-u7': [0x800, 0xb779884b],
  '6331.speech-u30': [0x20, 0xadcb81d0],
  '1871.speech-u6': [0x1000, 0x03713920],
  '1872.speech-u5': [0x1000, 0xebb5c3a9]
};

function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function verify(name,b,expected){const got=crc32(b);if(got!==expected)throw new Error(`${name}: CRC ${got.toString(16).padStart(8,'0')} != MAME ${expected.toString(16).padStart(8,'0')}`);}

function decrypt64(pc,b){
  switch(pc&3){
    case 0:return b;
    case 1:return((b&3)|((b&0x80)>>1)|((b&0x60)>>3)|((~b)&0x10)|((b&8)<<2)|((b&4)<<5))&0xff;
    case 2:return((b&3)|((b&0x80)>>4)|(((~b)&0x40)>>1)|((b&0x20)>>1)|((b&0x10)>>2)|((b&8)<<3)|((b&4)<<5))&0xff;
    case 3:return((b&0x23)|((b&0xc0)>>4)|((b&0x10)<<2)|((b&8)<<1)|(((~b)&4)<<5))&0xff;
  }
  return b;
}

class VectorGenerator {
  constructor(sineProm){this.sin=sineProm;this.points=[];}
  adjust(rawX,rawY){
    let x=(rawX&0x7ff)^0x200,y=(rawY&0x7ff)^0x200,clipped=false;
    if((x&0x600)===0x200){x=0;clipped=true;}else if((x&0x600)===0x400){x=0x3ff;clipped=true;}else x&=0x3ff;
    if((y&0x600)===0x200){y=0;clipped=true;}else if((y&0x600)===0x400){y=0x3ff;clipped=true;}else y&=0x3ff;
    return{x,y:y-96,clipped};
  }
  color222(v){const r=((v>>4)&3)*85,g=((v>>2)&3)*85,b=(v&3)*85;return`rgb(${r},${g},${b})`;}
  generate(ram){
    const points=this.points;points.length=0;let time=1/FRAME_HZ,symAddr=0;
    while(time>0){
      const draw=ram[symAddr++&0xfff];
      let curX=ram[symAddr++&0xfff];curX|=(ram[symAddr++&0xfff]&7)<<8;curX|=(curX<<1)&0x800;
      let curY=ram[symAddr++&0xfff];curY|=(ram[symAddr++&0xfff]&7)<<8;curY|=(curY<<1)&0x800;
      let vecAddr=ram[symAddr++&0xfff];vecAddr|=(ram[symAddr++&0xfff]&0x0f)<<8;
      let symAngle=ram[symAddr++&0xfff];symAngle|=(ram[symAddr++&0xfff]&3)<<8;
      const scale=ram[symAddr++&0xfff];time-=10/U51_HZ;
      if(draw&1){
        let p=this.adjust(curX,curY);if(!p.clipped)points.push({x:p.x,y:p.y,color:null});
        while(time>0){
          const attrib=ram[vecAddr++&0xfff];let length=(ram[vecAddr++&0xfff]*scale)>>7;
          let vecAngle=ram[vecAddr++&0xfff];vecAngle|=(ram[vecAddr++&0xfff]&3)<<8;
          const sum=vecAngle+symAngle,dx=this.sin[((sum&0x1ff)<<1)&0x3ff],dy=this.sin[(((sum+0x100)&0x1ff)<<1)&0x3ff];
          time-=4/U51_HZ;
          const colorBits=(attrib>>1)&0x3f,color=(attrib&1)&&colorBits?this.color222(colorBits):null;
          let clipped=this.adjust(curX,curY).clipped,xAccum=0,yAccum=0;
          while(length--!==0&&time>0){
            xAccum+=dx+(dx>>7);if((sum&0x200)===0)curX=(curX+(xAccum>>8))&0xffff;else curX=(curX-(xAccum>>8))&0xffff;xAccum&=0xff;
            yAccum+=dy+(dy>>7);if(((sum+0x100)&0x200)===0)curY=(curY+(yAccum>>8))&0xffff;else curY=(curY-(yAccum>>8))&0xffff;yAccum&=0xff;
            const np=this.adjust(curX,curY);if(np.clipped!==clipped)points.push({x:np.x,y:np.y,color:np.clipped?color:null});clipped=np.clipped;p=np;time-=1/VCL_HZ;
          }
          if(!clipped)points.push({x:p.x,y:p.y,color});if(attrib&0x80)break;
        }
      }
      if(draw&0x80)break;
    }
    return Math.max(0,((1/FRAME_HZ)-time)*CPU_HZ);
  }
}

class StarTrekMachine {
  constructor(mainRom,sineProm,audio){
    this.rom=mainRom;this.ram=new Uint8Array(0x800);this.vectorRam=new Uint8Array(0x1000);
    this.audio=audio;this.usb=audio.usb;this.speech=audio.speech;this.vector=new VectorGenerator(sineProm);
    this.mult=new Uint8Array(2);this.product=0;this.spinnerSelect=0;this.spinnerSign=0;this.spinnerCount=0;this.spinnerDelta=0;
    this.coinFF=0;this.coinLast=0x07;this.edgeFF=0;this.scrambledPC=0xffff;this.wait=0;this.elapsed=0;this.drawEnd=0;this.nextFrame=CYCLES_PER_FRAME;
    this.input={D7D6:0xdf,D5D4:0xff,D3D2:0x8d,D1D0:0x33,FC:0};
    this.cpu=new Z80(a=>this.memRead(a),(a,v)=>this.memWrite(a,v),p=>this.ioRead(p),(p,v)=>this.ioWrite(p,v));
    this.cpu.setInstructionReaders(a=>this.opcodeRead(a),a=>this.memRead(a));
    this.cpu.onIrqAcknowledge=()=>{this.coinFF=0;this.edgeFF=0;this.updateIRQ();return 0xff;};
  }
  memRead(a){a&=0xffff;this.wait+=2;if(a<0xc000)return this.rom[a];if(a>=0xc800&&a<0xd000)return this.ram[a-0xc800];if(a>=0xd000&&a<0xe000)return this.usb.readRam(a-0xd000);if(a>=0xe000&&a<0xf000)return this.vectorRam[a-0xe000];return 0xff;}
  opcodeRead(a){this.wait+=2;const op=this.memRead(a);this.scrambledPC=op===0x32?(a&0xffff):0xffff;return op;}
  decryptOffset(offset){if(this.scrambledPC===0xffff)return offset;const pc=this.scrambledPC;this.scrambledPC=0xffff;return(offset&0xff00)|decrypt64(pc,offset&0xff);}
  memWrite(a,v){a&=0xffff;v&=0xff;this.wait+=2;if(a>=0xc800&&a<0xd000)this.ram[this.decryptOffset(a-0xc800)]=v;else if(a>=0xd000&&a<0xe000)this.usb.writeRam(this.decryptOffset(a-0xd000),v);else if(a>=0xe000&&a<0xf000)this.vectorRam[this.decryptOffset(a-0xe000)]=v;}
  mangledPort(offset){const d7d6=(this.input.D7D6&~0x20)|(this.elapsed<this.drawEnd?0x20:0),vals=[d7d6,this.input.D5D4,this.input.D3D2,this.input.D1D0];offset&=3;let r=0;for(let n=0;n<4;n++){r|=((vals[n]>>offset)&1)<<(7-n*2);r|=((vals[n]>>(offset+4))&1)<<(6-n*2);}return r;}
  spinnerRead(){if(this.spinnerSelect&1)return this.input.FC;const delta=Math.max(-127,Math.min(127,this.spinnerDelta|0));this.spinnerDelta=0;if(delta){this.spinnerSign=(delta>>7)&1;this.spinnerCount=(this.spinnerCount+Math.abs(delta))&0xff;}return(~((this.spinnerCount<<1)|this.spinnerSign))&0xff;}
  ioRead(p){
    p&=0xff;
    if(p===0x3f){this.wait+=200;return this.usb.status();}
    if(p===0xbe){const r=this.product&0xff;this.product>>>=8;return r;}
    if(p>=0xf8&&p<=0xfb)return this.mangledPort(p&3);
    if(p===0xfc)return this.spinnerRead();
    return 0xff;
  }
  ioWrite(p,v){
    p&=0xff;v&=0xff;
    if(p===0x38)this.speech.dataWrite(v);
    else if(p===0x3b)this.speech.controlWrite(v);
    else if(p===0x3f)this.usb.dataWrite(v);
    else if(p===0xbd||p===0xbe){this.mult[p-0xbd]=v;if(p===0xbe)this.product=this.mult[0]*this.mult[1];}
    else if(p===0xf8)this.spinnerSelect=v;
    else if(p===0xf9||p===0xfd){/* coin counters */}
  }
  updateIRQ(){this.cpu.setIrqLine(!!(this.coinFF||this.edgeFF),0xff);this.coinFF&=~0x04;}
  coinLine(index,state){const mask=1<<index;if(state===0&&(this.coinLast&mask))this.coinFF|=mask;else this.coinFF&=~mask;if(state)this.coinLast|=mask;else this.coinLast&=~mask;this.updateIRQ();}
  setControl(name,down){switch(name){case'coin':this.input.D7D6=down?(this.input.D7D6&~1):(this.input.D7D6|1);this.coinLine(0,down?0:1);break;case'start':this.input.FC=down?(this.input.FC|1):(this.input.FC&~1);break;case'photon':this.input.FC=down?(this.input.FC|4):(this.input.FC&~4);break;case'fire':this.input.FC=down?(this.input.FC|8):(this.input.FC&~8);break;case'shield':this.input.FC=down?(this.input.FC|0x10):(this.input.FC&~0x10);break;case'warp':this.input.FC=down?(this.input.FC|0x20):(this.input.FC&~0x20);break;}}
  step(){this.wait=0;const base=this.cpu.step(),used=base+this.wait;this.cpu.cycles+=this.wait;this.elapsed+=used;this.audio.advanceMainCycles(used,CPU_HZ);return used;}
  runFrame(){const target=this.nextFrame;while(this.elapsed<target)this.step();this.edgeFF=1;this.updateIRQ();const drawCycles=this.vector.generate(this.vectorRam);this.drawEnd=this.elapsed+drawCycles;this.nextFrame+=CYCLES_PER_FRAME;return this.vector.points;}
}

async function fetchBytes(name,size){const r=await fetch(new URL(`./roms/${name}`,import.meta.url));if(!r.ok)throw new Error(`${name}: HTTP ${r.status}`);const b=new Uint8Array(await r.arrayBuffer());if(size!=null&&b.length!==size)throw new Error(`${name}: expected ${size} bytes, got ${b.length}`);return b;}
async function fetchVerified(name,size,crc){const b=await fetchBytes(name,size);verify(name,b,crc);return b;}
async function loadMachine(){
  const rom=new Uint8Array(0xc000);
  for(let i=0;i<MAIN_ROMS.length;i++){const b=await fetchVerified(MAIN_ROMS[i],0x800,MAIN_CRC[i]);rom.set(b,i*0x800);}
  const sine=await fetchVerified('s-c.xyt-u39',0x400,0x56484d19);
  const speechCpu=await fetchVerified('1607.speech-u7',...SOUND_ROMS['1607.speech-u7']);
  await fetchVerified('6331.speech-u30',...SOUND_ROMS['6331.speech-u30']);
  const speechData=new Uint8Array(0x4000);
  speechData.set(await fetchVerified('1871.speech-u6',...SOUND_ROMS['1871.speech-u6']),0);
  speechData.set(await fetchVerified('1872.speech-u5',...SOUND_ROMS['1872.speech-u5']),0x1000);
  return new StarTrekMachine(rom,sine,new StarTrekAudio(speechCpu,speechData));
}

function installControls(machine){
  const held=new Set();
  const keyMap=new Map([['ArrowLeft','left'],['KeyA','left'],['ArrowRight','right'],['KeyD','right'],['Space','fire'],['KeyF','fire'],['KeyP','photon'],['KeyS','shield'],['KeyW','warp'],['Digit1','start'],['Digit5','coin']]);
  const set=(name,down)=>{if(down)held.add(name);else held.delete(name);if(!['left','right'].includes(name))machine.setControl(name,down);document.querySelector(`[data-key="${name}"]`)?.classList.toggle('active',down);};
  addEventListener('keydown',e=>{machine.audio.unlock();const k=keyMap.get(e.code);if(!k)return;e.preventDefault();if(!e.repeat)set(k,true);});
  addEventListener('keyup',e=>{const k=keyMap.get(e.code);if(!k)return;e.preventDefault();set(k,false);});
  document.querySelectorAll('[data-key]').forEach(btn=>{const name=btn.dataset.key;const down=e=>{e.preventDefault();machine.audio.unlock();btn.setPointerCapture?.(e.pointerId);set(name,true);};const up=e=>{e.preventDefault();set(name,false);};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('contextmenu',e=>e.preventDefault());});
  return()=>{if(held.has('left'))machine.spinnerDelta-=10;if(held.has('right'))machine.spinnerDelta+=10;};
}

function render(ctx,points){ctx.fillStyle='#000';ctx.fillRect(0,0,VIEW_W,VIEW_H);ctx.lineWidth=1.4;ctx.lineCap='round';let px=0,py=0,have=false;for(const p of points){const x=p.x,y=VIEW_H-1-p.y;if(p.color&&have){ctx.strokeStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();}px=x;py=y;have=true;}ctx.shadowBlur=0;}

const canvas=document.querySelector('#screen'),ctx=canvas.getContext('2d',{alpha:false}),status=document.querySelector('#status'),pauseButton=document.querySelector('#pause');
let machine=null,paused=false,controlsTick=null,accumulator=0,previous=performance.now();const frameMs=1000/FRAME_HZ;
function animate(now){const dt=Math.min(100,now-previous);previous=now;if(!paused&&machine){accumulator+=dt;let frames=0;while(accumulator>=frameMs&&frames<4){controlsTick();render(ctx,machine.runFrame());accumulator-=frameMs;frames++;}}requestAnimationFrame(animate);}
pauseButton.addEventListener('click',()=>{machine?.audio.unlock();paused=!paused;pauseButton.textContent=paused?'Run':'Pause';});
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});

(async()=>{try{machine=await loadMachine();window.startrek=machine;controlsTick=installControls(machine);status.textContent='MAME 0.289 core + USB/SP0250 audio · tap/click once to enable sound · ←/→ turn · Space fire · P photon · S shield · W warp · 5 coin · 1 start';previous=performance.now();requestAnimationFrame(animate);}catch(e){console.error(e);status.textContent=`Star Trek failed: ${e.message}`;}})();
