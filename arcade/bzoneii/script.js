import { M6502 } from "../../cpu/m6502.js";
import { AssetTrace, ASSETS } from "./assets.js";
import { PokeyRandom } from "./pokey-random.js";
const CPU_CLOCK=12096000/8,IRQ_HZ=(12096000/4096)/12,FPS=IRQ_HZ/6,W=580,H=400;
const s16=v=>((v&65535)^32768)-32768,sign13=v=>(v&4096)?v-8192:v;
class Mathbox{
 constructor(){this.r=new Int16Array(16);this.result=0}
 set(i,v){this.r[i]=s16(v);return this.r[i]}
 go(o,d){let r=this.r;o&=31;d&=255;const lo=i=>this.set(i,(r[i]&0xff00)|d),hi=i=>this.set(i,(r[i]&255)|(d<<8));
  switch(o){case 0:case 2:case 4:case 6:case 8:this.result=lo(o>>1);return;case 1:case 3:case 5:case 7:case 9:this.result=hi(o>>1);return;
  case 10:this.result=lo(5);return;case 12:this.result=this.set(6,d);return;case 21:this.result=lo(7);return;case 22:this.result=hi(7);return;
  case 26:this.result=lo(8);return;case 27:this.result=hi(8);return;case 13:this.result=lo(10);return;case 14:this.result=hi(10);return;
  case 15:this.result=lo(11);return;case 16:this.result=hi(11);return;case 23:this.result=r[7];return;case 25:this.result=r[8];return;case 24:this.result=r[9];return;
  case 11:hi(5);this.set(15,-1);this.set(4,r[4]-r[2]);this.set(5,r[5]-r[3]);this.mulA();return;
  case 17:hi(5);this.set(15,0);this.mulA();return;case 18:this.mulB();return;case 19:this.divide(r[9],r[8]);return;case 20:this.divide(r[10],r[11]);return;
  case 28:hi(5);do{this.set(14,(r[4]+r[7])>>1);this.set(15,(r[5]+r[8])>>1);if(r[11]<r[14]&&r[15]<r[14]&&s16(r[14]+r[15])>=0){this.set(7,r[14]);this.set(8,r[15])}else{this.set(4,r[14]);this.set(5,r[15])}}while(this.set(6,r[6]-1)>=0);this.result=r[8];return;
  case 29:hi(3);this.set(2,r[2]-r[0]);if(r[2]<0)this.set(2,-r[2]);this.set(3,r[3]-r[1]);if(r[3]<0)this.set(3,-r[3]);
  case 30:if(r[3]>=r[2]){this.set(12,r[2]);this.set(13,r[3])}else{this.set(13,r[2]);this.set(12,r[3])}this.set(12,r[12]>>2);this.set(13,r[13]+r[12]);this.set(12,r[12]>>1);this.result=this.set(13,r[12]+r[13]);return}}
 mulA(){let r=this.r,t,q;t=(r[0]*r[4])|0;this.set(12,t>>16);this.set(14,t);t=(-r[1]*r[5])|0;this.set(7,t>>16);q=s16(t);this.set(7,r[7]+r[12]);this.set(14,(r[14]>>1)&32767);this.set(12,(q>>1)&32767);q=s16(r[12]+r[14]);if(q<0)this.set(7,r[7]+1);this.result=r[7];if(r[15]<0)return;this.set(7,r[7]+r[2]);this.mulB()}
 mulB(){let r=this.r,t,q;t=(r[1]*r[4])|0;this.set(12,t>>16);this.set(9,t);t=(r[0]*r[5])|0;this.set(8,t>>16);q=s16(t);this.set(8,r[8]+r[12]);this.set(9,(r[9]>>1)&32767);this.set(12,(q>>1)&32767);this.set(9,r[9]+r[12]);if(r[9]<0)this.set(8,r[8]+1);this.set(9,r[9]<<1);this.result=r[8];if(r[15]<0)return;this.set(8,r[8]+r[3]);this.set(9,r[9]&0xff00);this.divide(r[9],r[8])}
 divide(c,q){let r=this.r,qq=s16(q);this.set(14,r[7]^qq);this.set(13,qq);if(qq>=0)qq=s16(c);else{this.set(13,-qq-1);qq=s16(-c-1);if(qq<0&&s16(qq+1)<0)this.set(13,r[13]+1);qq=s16(qq+1)}this.set(12,r[7]>=0?r[7]:-r[7]);this.set(15,r[6]);do{this.set(13,r[13]-r[12]);let msb=qq&32768;qq=s16(qq<<1);if(r[13]>=0)qq=s16(qq+1);else this.set(13,r[13]+r[12]);this.set(13,r[13]<<1);this.set(13,r[13]+(msb?1:0))}while(this.set(15,r[15]-1)>=0);this.result=s16(r[14]>=0?qq:-qq)}
 lo(){return this.result&255}hi(){return(this.result>>8)&255}}
class BzoneAudio{
 constructor(){this.ctx=null;this.node=null;this.gain=null;this.reg=new Uint8Array(16);this.latch=0;this.haveControl=false;this.phase=new Float64Array(4);this.enginePhase=0;this.engineCount4=4;this.engineCount6=6;this.engineLP=0;this.fxLP=0;this.noise=1;this.noisePhase=0;this.envShell=0;this.envExplosion=0}
 start(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});this.node=this.ctx.createScriptProcessor(1024,0,1);this.node.onaudioprocess=e=>this.render(e.outputBuffer.getChannelData(0));this.gain=this.ctx.createGain();this.gain.gain.value=.9;this.node.connect(this.gain);this.gain.connect(this.ctx.destination)}if(this.ctx.state!=="running")this.ctx.resume()}
 read(r){r&=15;if(r===8)return window.battlezone?window.battlezone.in3():0;return this.reg[r]}
 write(r,d){this.start();this.reg[r&15]=d&255}
 control(d){this.start();d&=255;let old=this.latch;this.latch=d;this.haveControl=true;if((d&4)&&!(old&4))this.envShell=1;if((d&1)&&!(old&1))this.envExplosion=1}
 render(out){const sr=this.ctx.sampleRate,enabled=!this.haveControl||(this.latch&32)!==0,motor=(this.latch&128)!==0,rev=(this.latch&16)!==0;for(let i=0;i<out.length;i++){let s=0;
  if(enabled){
   for(let ch=0;ch<4;ch++){let f=this.reg[ch*2],au=this.reg[ch*2+1],vol=au&15;if(!vol)continue;let audctl=this.reg[8],div=(audctl&1)?114:28;if((ch===0&&(audctl&0x40))||(ch===2&&(audctl&0x20)))div=1;let n=f+(div===1?4:1),hz=CPU_CLOCK/(2*div*n);if(au&0x10){s+=(vol/15)*.035;continue}this.phase[ch]=(this.phase[ch]+hz/sr)%1;if(au&0x20)s+=(this.phase[ch]<.5?1:-1)*(vol/15)*.060;else{let gate=((Math.floor(this.phase[ch]*31)*13+ch*7)&16)?1:-1;s+=gate*(vol/15)*.035}}
   this.noisePhase+=6000/sr;if(this.noisePhase>=1){this.noisePhase-=1;let b=((this.noise>>3)^(this.noise>>14))&1;this.noise=((this.noise<<1)|((b^1)&1))&65535}
   let n=(this.noise&0x8000)?1:-1;
   let fx=0;
   if(this.envShell>.0005){fx+=n*this.envShell*((this.latch&8)?.48:.24);this.envShell*=.99915}
   if(this.envExplosion>.0005){fx+=n*this.envExplosion*((this.latch&2)?.62:.31);this.envExplosion*=.99955}
   this.fxLP+=.11*(fx-this.fxLP);s+=this.fxLP;
   if(motor){
    /* The recording's engine fundamental sits around 38-45 Hz.  Battlezone's
       discrete board derives the motor from a VCO feeding binary counters,
       not a sawtooth oscillator.  Recreate that divided, stepped waveform. */
    /* MAME 0.289 bzone_a.cpp: the 555 VCO clocks two counters.
       The audible engine taps are counter states, so the engine pitch is
       divided down from the VCO rather than being the VCO frequency itself. */
    let vco=rev?430:300;
    this.enginePhase+=vco/sr;
    if(this.enginePhase>=1){
      this.enginePhase-=1;
      /* MAME DISCRETE_COUNTER nodes 65/68 count one step per 555 edge.
         The previous code incorrectly swept 60 counter states PER VCO cycle,
         creating the measured 430/860/1290/1720 Hz whistle. */
      this.engineCount4++;if(this.engineCount4>15)this.engineCount4=4;
      this.engineCount6++;if(this.engineCount6>15)this.engineCount6=6;
    }
    let a=this.engineCount4,b=this.engineCount6;
    let raw=((a>7)?1:-1)*.55+((a===15)?1:-1)*.28+
            ((b>7)?1:-1)*.12+((b===15)?1:-1)*.08;
    this.engineLP+=.025*(raw-this.engineLP);s+=this.engineLP*.0825
   }
  }out[i]=Math.max(-.65,Math.min(.65,s))}
 }}
class Battlezone{
 constructor(){this.cv=document.querySelector("#gameCanvas");this.cx=this.cv.getContext("2d");this.cv.width=W;this.cv.height=H;this.mem=new Uint8Array(32768);this.math=new Mathbox();this.pokeyRandom=new PokeyRandom();this.i={coin1:0,start1:0,fire:0,lu:0,ld:0,ru:0,rd:0};this.sound=0;this.audio=new BzoneAudio();this.avgDone=1;this.vectors=[];this.colorized=true;this.bind()}
 async rom(n){const r=await fetch("../bzone/roms/"+n);if(!r.ok)throw Error("ROM "+n);return new Uint8Array(await r.arrayBuffer())}
 async init(){const files=["036408-01.k7","036414-02.e1","036413-01.h1","036412-01.j1","036411-01.k1","036410-01.lm1","036409-01.n1","036422-01.bc3","036421-01.a3"],a=Object.fromEntries(await Promise.all(files.map(async n=>[n,await this.rom(n)])));[["036414-02.e1",20480],["036413-01.h1",22528],["036412-01.j1",24576],["036411-01.k1",26624],["036410-01.lm1",28672],["036409-01.n1",30720],["036422-01.bc3",12288],["036421-01.a3",14336]].forEach(([n,o])=>this.mem.set(a[n],o));this.avgProm=a["036408-01.k7"];this.assetTrace=new AssetTrace(this.mem);this.cpu=new M6502(x=>this.read(x),(x,d)=>this.write(x,d));this.cpu.reset();console.log("[BZONE] reset PC",this.cpu.pc.toString(16),"vector",this.read(0x7ffc).toString(16),this.read(0x7ffd).toString(16))}
 in0(){let v=255;if(this.i.coin1)v&=254;if(this.avgDone)v|=64;else v&=191;if(this.cpu.cycles&256)v|=128;else v&=127;return v}
 in3(){let v=0;if(this.i.rd)v|=1;if(this.i.ru)v|=2;if(this.i.ld)v|=4;if(this.i.lu)v|=8;if(this.i.fire)v|=16;if(this.i.start1)v|=32;return v}
 read(a){a&=32767;if(a<1024)return this.mem[a];if(a===2048)return this.in0();if(a===2560)return 0x15;if(a===3072)return 0x03;if(a===6144)return 0;if(a===6160)return this.math.lo();if(a===6168)return this.math.hi();if(a===0x182a)return this.pokeyRandom.read(this.cpu?.cycles??0);if(a>=6176&&a<=6191)return this.audio.read(a&15);if(a>=8192)return this.mem[a];return 255}
 write(a,d){a&=32767;d&=255;if(a<1024){this.mem[a]=d;return}if(a===4608){this.runAVG();return}if(a===5632){this.avgDone=1;return}if(a>=6176&&a<=6191){this.pokeyRandom.write(a&15,d,this.cpu?.cycles??0);this.audio.write(a&15,d);return}if(a===6208){this.sound=d;this.audio.control(d);return}if(a>=6240&&a<=6271){this.math.go(a-6240,d);return}if(a>=8192&&a<12288){this.mem[a]=d;this.assetTrace?.write(a)}}
 word(pc){const a=8192+(pc&8191);return this.mem[a]|(this.mem[(a+1)&32767]<<8)}
 runAVG(){
  this.avgDone=0;
  let pc=0,sp=0,dvx=0,dvy=0,data=0,state=0,scale=0,intensity=0,op=0,dvy12=0,timer=0,intLatch=0,binScale=0,halt=0;
  let x=290<<16,y=200<<16,hst=0,lst=0,clip=[0,0,W<<16,H<<16],steps=0,out=[],stack=new Uint16Array(4);
  const bit=(n)=> (op>>n)&1;
  const rd=()=>this.mem[0x2000+(pc^1)];
  let origin=null,callOrigin=null,instructionPC=0;
  const originStack=new Array(4).fill(null);
  const point=(nx,ny,z)=>{let x1=x/65536,y1=y/65536,x2=nx/65536,y2=ny/65536;
   if(z>0)out.push([x1,y1,x2,y2,z,clip.slice(),ASSETS[origin?.asset??"unclassified"].color,instructionPC,origin]);
   x=nx;y=ny};
  while(steps++<200000&&!halt){
    state=(state&0x10)|(this.avgProm[(((state>>4)^1)<<7)|(op<<4)|(state&15)]&15);
    if(state&8){
      data=rd();
      switch(state&7){
        case 0:dvy=(dvy&0x1f00)|data;pc=(pc+1)&0x1fff;break;
        case 1:
          instructionPC=pc;origin=this.assetTrace.instruction(pc,callOrigin);
          if(!hst){clip[2]=x;clip[1]=y} if(!lst){clip[0]=x;clip[3]=y} lst=hst=1;
          dvy12=(data>>4)&1;op=data>>5;intLatch=0;dvy=(dvy12<<12)|((data&15)<<8);dvx=0;pc=(pc+1)&0x1fff;break;
        case 2:dvx=(dvx&0x1f00)|data;pc=(pc+1)&0x1fff;break;
        case 3:intLatch=data>>4;dvx=((intLatch&1)<<12)|((data&15)<<8)|(dvx&255);pc=(pc+1)&0x1fff;break;
        case 4:
          if(bit(0)){stack[sp&3]=pc;originStack[sp&3]=callOrigin;}
          else{let i=0;while((((dvy^(dvy<<1))&0x1000)===0)&&(((dvx^(dvx<<1))&0x1000)===0)&&(i++<16)){dvy=(dvy&0x1000)|((dvy<<1)&0x1fff);dvx=(dvx&0x1000)|((dvx<<1)&0x1fff);timer=(timer>>>1)|0x4000|(bit(1)<<7)}if(bit(1))timer&=255}break;
        case 5:
          if(!bit(2)){for(let i=binScale;i>0;i--)timer=(timer>>>1)|0x4000|(bit(1)<<7);if(bit(1))timer&=255}
          if(bit(2))sp=(sp+(bit(1)?15:1))&15;break;
        case 6:
          if(!bit(2)&&!dvy12){intensity=(dvy>>4)&15;if(!(dvy&0x400)){lst=dvy&0x200;hst=lst^0x200}}
          if(bit(2)){if(bit(0)){pc=(dvy<<1)&0x1fff;callOrigin=origin}else{pc=stack[sp&3];callOrigin=originStack[sp&3]}}
          else if(dvy12){scale=dvy&255;binScale=(dvy>>8)&7}break;
        case 7:{
          halt=bit(0);
          if(!bit(0)&&!bit(2)){
            let cycles=bit(1)?0x100-(timer&255):0x8000-timer;timer=0;
            let nx=x+Math.trunc(((((dvx>>3)^0x200)-0x200)*cycles*(scale^255))/16);
            let ny=y-Math.trunc(((((dvy>>3)^0x200)-0x200)*cycles*(scale^255))/16);
            let z=(((intLatch>>1)===1)?intensity:(intLatch&14));
            point(nx,ny,z);x=nx;y=ny;
          }else if(bit(2)){timer=0;x=290<<16;y=200<<16}
          break;}
      }
    }
    state=(halt<<4)|(state&15);
  }
  this.vectors=out;
  if(this.debugObjectColors){
   const seen=new Map();for(const v of out){const k=v[8]?.asset??"unclassified";seen.set(k,(seen.get(k)||0)+1)}
   console.table([...seen].sort((a,b)=>b[1]-a[1]).map(([asset,count])=>({asset,vectors:count})));
  }
  this.avgDone=1;this.draw();
 }
 draw(){const c=this.cx;c.save();c.globalCompositeOperation="source-over";c.fillStyle="#000";c.fillRect(0,0,W,H);c.lineCap="round";
  // Fill the projected obstacle silhouette.  The previous face-cycle search
  // walked every graph cycle each frame and could explode combinatorially,
  // stalling the emulator.  A convex hull is bounded and follows the actual
  // projected AVG object, so the fill remains object-bound rather than regional.
  if(this.colorized){
   const groups=new Map();
   for(const v of this.vectors){
    if(v[8]?.asset!=="obstacle")continue;
    const id=v[8]?.id??"obstacle";
    if(!groups.has(id))groups.set(id,[]);
    const g=groups.get(id);
    if(Number.isFinite(v[0]+v[1]))g.push([v[0],v[1]]);
    if(Number.isFinite(v[2]+v[3]))g.push([v[2],v[3]]);
   }
   c.save();c.globalCompositeOperation="source-over";c.fillStyle="rgba(255,145,35,.16)";
   for(const points of groups.values()){
    const uniq=[...new Map(points.map(p=>[p[0].toFixed(2)+","+p[1].toFixed(2),p])).values()];
    if(uniq.length<3)continue;
    uniq.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lo=[];for(const p of uniq){while(lo.length>=2&&cross(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
    const hi=[];for(let i=uniq.length-1;i>=0;i--){const p=uniq[i];while(hi.length>=2&&cross(hi[hi.length-2],hi[hi.length-1],p)<=0)hi.pop();hi.push(p)}
    const hull=lo.slice(0,-1).concat(hi.slice(0,-1));if(hull.length<3)continue;
    c.beginPath();c.moveTo(hull[0][0],hull[0][1]);for(let i=1;i<hull.length;i++)c.lineTo(hull[i][0],hull[i][1]);c.closePath();c.fill();
   }
   c.restore();
  }
  /* Render only the color carried by each emitted AVG vector. There are no
     coordinate, region, shape, or screen-overlay color rules here. */
  const rgb={green:"80,255,80",purple:"190,70,255",darkPurple:"95,30,140",orange:"255,145,35",lightOrange:"255,190,105",red:"255,45,45",blue:"70,135,255"};
  // Additive, concentric strokes approximate phosphor bloom around a sharp beam.
  // Draw all halos before the cores so intersections accumulate light naturally.
  c.globalCompositeOperation="lighter";
  const layers=[[7,.035],[4,.09],[2,.24],[1,1]];
  for(const [spread,gain] of layers){
  for(const v of this.vectors){
   const x1=v[0],y1=v[1],x2=v[2],y2=v[3],z=ASSETS[v[8]?.asset]?.displayIntensity??v[4];if(!Number.isFinite(x1+y1+x2+y2))continue;
   const asset=v[8]?.asset,originalRed=asset==="hudRadar"||asset==="score"||asset==="highScore"||asset==="enemyInRange"||asset==="enemyDirection"||asset==="motionBlocked"||asset==="tank";
   const alpha=Math.min(1,Math.max(.18,z/15)),color=this.colorized?(rgb[v[6]]||rgb.green):(originalRed?rgb.red:rgb.green);
   const ink="rgba("+color+","+(alpha*gain)+")";
   c.strokeStyle=ink;c.lineWidth=(.75+z/20)*spread;
   c.beginPath();
   // AVG points (including lava sparks) need a disk, even with identical endpoints.
   if(x1===x2&&y1===y2){c.fillStyle=ink;c.arc(x1,y1,c.lineWidth/2,0,Math.PI*2);c.fill()}
   else{c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke()}
  }}
  // Simulate extra beam dwell at endpoints. Shared corners receive light from
  // both adjoining vectors; keep the bloom compact so straight edges stay crisp.
  for(const v of this.vectors){
   const x1=v[0],y1=v[1],x2=v[2],y2=v[3];if(!Number.isFinite(x1+y1+x2+y2))continue;
   const z=ASSETS[v[8]?.asset]?.displayIntensity??v[4];
   const asset=v[8]?.asset,originalRed=asset==="hudRadar"||asset==="score"||asset==="highScore"||asset==="enemyInRange"||asset==="enemyDirection"||asset==="motionBlocked"||asset==="tank";
   const alpha=Math.min(1,Math.max(.18,z/15)),color=this.colorized?(rgb[v[6]]||rgb.green):(originalRed?rgb.red:rgb.green);
   const radius=(.75+z/20)/2;
   const endpoints=x1===x2&&y1===y2?[[x1,y1]]:[[x1,y1],[x2,y2]];
   for(const [spread,gain] of [[3,.12],[1.1,.65]]){
    c.fillStyle="rgba("+color+","+(alpha*gain)+")";
    for(const [px,py] of endpoints){c.beginPath();c.arc(px,py,radius*spread,0,Math.PI*2);c.fill()}
   }
  }
  c.restore();}
  frame(){let per=CPU_CLOCK/FPS/6;for(let n=0;n<6;n++){let left=per;while(left>0){this.assetTrace.beforeStep(this.cpu);let pc=this.cpu.pc,used=this.cpu.step();left-=used;if(this.cpu.pc===pc){console.error("[BZONE] CPU stalled",pc.toString(16));break}}this.cpu.nmi()}if(!this.vectors.length)this.draw()}
 run(){let last=0,loop=t=>{if(t-last>=1000/FPS){last=t;this.frame()}requestAnimationFrame(loop)};requestAnimationFrame(loop)}
 bind(){const colorToggle=document.querySelector("#colorToggle");if(colorToggle){colorToggle.onclick=e=>{e.preventDefault();this.colorized=!this.colorized;colorToggle.textContent=this.colorized?"COLORIZED":"ORIGINAL";this.draw()}}let lastTouch=0;document.addEventListener("touchend",e=>{if(!e.target.closest("#top,.tank-controls"))return;const now=Date.now();if(now-lastTouch<350)e.preventDefault();lastTouch=now},{passive:false});const unlock=()=>this.audio.start();addEventListener("pointerdown",unlock,{passive:true});addEventListener("touchstart",unlock,{passive:true});addEventListener("keydown",unlock);const set=(n,v)=>this.i[n]=v,pulse=n=>{set(n,1);setTimeout(()=>set(n,0),140)},km={KeyQ:"lu",KeyA:"ld",KeyE:"ru",KeyD:"rd",Space:"fire"};addEventListener("keydown",e=>{if(km[e.code])set(km[e.code],1);if(e.code==="Digit1")pulse("start1");if(e.code==="Digit5")pulse("coin1")});addEventListener("keyup",e=>km[e.code]&&set(km[e.code],0));document.querySelectorAll("[data-btn]").forEach(el=>{let n=el.dataset.btn;el.onpointerdown=e=>{e.preventDefault();this.audio.start();n==="coin1"||n==="start1"?pulse(n):set(n,1)};el.onpointerup=()=>set(n,0)});this.cv.onpointerdown=e=>{e.preventDefault();this.audio.start();this.cv.setPointerCapture(e.pointerId);set("fire",1)};const releaseFire=e=>{if(this.cv.hasPointerCapture?.(e.pointerId))this.cv.releasePointerCapture(e.pointerId);set("fire",0)};this.cv.onpointerup=releaseFire;this.cv.onpointercancel=releaseFire;const stick=(id,up,down)=>{let el=document.querySelector(id),knob=el.querySelector(".stick-knob"),move=e=>{let r=el.getBoundingClientRect(),half=r.height/2,y=e.clientY-r.top-half,max=half-knob.offsetHeight/2-6,pos=Math.max(-max,Math.min(max,y));knob.style.transition="none";knob.style.transform="translateY(calc(-50% + "+pos+"px))";set(up,y<-12);set(down,y>12)},release=()=>{set(up,0);set(down,0);knob.style.transition="transform .12s ease-out";knob.style.transform="translateY(-50%)"};el.onpointerdown=e=>{e.preventDefault();this.audio.start();el.setPointerCapture(e.pointerId);move(e)};el.onpointermove=e=>el.hasPointerCapture(e.pointerId)&&move(e);el.onpointerup=release;el.onpointercancel=release};stick("#leftStick","lu","ld");stick("#rightStick","ru","rd")}}
const game=new Battlezone();await game.init();game.run();window.battlezone=game;
