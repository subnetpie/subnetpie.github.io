import {
  Z80 } from "../../cpu/z80.js";

const MC=3072000,SC=14318181/8,FPS=60,W=224,H=256;

class TP{
  constructor(){
    this.cv=document.querySelector("#gameCanvas");
    this.cx=this.cv.getContext("2d");
    this.cv.width=W;
    this.cv.height=H;
    this.im=this.cx.createImageData(W,H);
    this.m=new Uint8Array(65536);
    this.sm=new Uint8Array(65536);
    this.sr=new Uint8Array(1024);
    this.i={
      left:0,right:0,up:0,down:0,fire:0,coin1:0,start1:0};
    this.nmi=0;
    this.flip=0;
    this.video=0;
    this.latch=0;
    this.irqLine=0;
    this.irq=false;
    this.bind()}
  async f(n){
    let r=await fetch("./roms/"+n);
    if(!r.ok)throw Error("ROM "+n);
    return new Uint8Array(await r.arrayBuffer())}
  async init(){
    let n=["tm1","tm2","tm3","tm4","tm5","tm6","tm7","timeplt.b4","timeplt.b5","timeplt.e9","timeplt.e12"],a=Object.fromEntries(await Promise.all(n.map(async n=>[n,await this.f(n)])));
    this.m.set(a.tm1);
    this.m.set(a.tm2,8192);
    this.m.set(a.tm3,16384);
    this.sm.set(a.tm7);
    this.t=a.tm6;
    this.s=new Uint8Array(16384);
    this.s.set(a.tm4);
    this.s.set(a.tm5,8192);
    this.p=new Uint8Array(576);
    this.p.set(a["timeplt.b4"]);
    this.p.set(a["timeplt.b5"],32);
    this.p.set(a["timeplt.e9"],64);
    this.p.set(a["timeplt.e12"],320);
    this.palette();
    this.c=new Z80(x=>this.r(x),(x,d)=>this.w(x,d),()=>255,()=>{
    });
    this.c.reset();
    this.c.IM=1;
    this.ac=new Z80(x=>this.ar(x),(x,d)=>this.aw(x,d),()=>255,()=>{
    });
    this.ac.reset();
    this.ac.IM=1}
  palette(){
    let b=[];
    for(let i=0;
    i<32;
    i++){
      let x=this.p[i],y=this.p[i+32],q=[25,36,53,64,77],r=0,g=0,z=0;
      for(let k=0;
      k<5;
      k++)r+=q[k]*((y>>(k+1))&1);
      g=q[0]*((y>>6)&1)+q[1]*((y>>7)&1)+q[2]*(x&1)+q[3]*((x>>1)&1)+q[4]*((x>>2)&1);
      for(let k=0;
      k<5;
      k++)z+=q[k]*((x>>(k+3))&1);
      b.push([r,g,z])}
    this.pal=[];
    for(let i=0;
    i<128;
    i++)this.pal[i]=b[(this.p[320+i]&15)+16];
    for(let i=0;
    i<256;
    i++)this.pal[128+i]=b[this.p[64+i]&15]}
  in0(){
    let v=255;
    if(this.i.coin1)v&=254;
    if(this.i.start1)v&=247;
    return v}
  in1(){
    let v=255;
    if(this.i.left)v&=254;
    if(this.i.right)v&=253;
    if(this.i.up)v&=251;
    if(this.i.down)v&=247;
    if(this.i.fire)v&=239;
    return v}
  r(a){
    a&=65535;
    if(a<=24575||a>=40960&&a<=49151)return this.m[a];
    let q=a&1023;
    if((a&61440)===49152){
      if(q===0)return (this.scan||0)&255;
      if(q===512)return 0x4b;
      if(q===768)return this.in0();
      if(q===800)return this.in1();
      if(q===832)return 255;
      if(q===864)return 255}
    return 255}
  w(a,d){
    a&=65535;
    d&=255;
    if(a>=40960&&a<=49151){
      this.m[a]=d;
      return}
    if((a&61440)!==49152)return;
    let q=a&1023;
    if(q===0){
      this.latch=d;
      return}
    if(q>=768&&q<=783){
      let b=(q>>1)&7,v=d&1;
      if(b===0)this.nmi=v;
      if(b===1)this.flip=!v;
      if(b===2){
        if(!this.irqLine&&v)this.irq=true;
        this.irqLine=v}
      if(b===4)this.video=v}}
  ar(a){
    a&=65535;
    if(a<12288)return this.sm[a];
    if(a>=12288&&a<16384)return this.sr[a&1023];
    return 255}
  aw(a,d){
    a&=65535;
    if(a>=12288&&a<16384)this.sr[a&1023]=d}
  run(){
    let last=0,loop=t=>{
      if(t-last>15.6){
        last=t;
        this.frame()}
      requestAnimationFrame(loop)};
    requestAnimationFrame(loop)}
  frame(){
    const mainPerLine=MC/FPS/256;

    const soundPerLine=SC/FPS/256;

    for(let line=0;
    line<256;
    line++){
      this.scan=line;

      let n=0;

      while(n<mainPerLine)n+=this.c.step();

      n=0;

      while(n<soundPerLine){
        if(this.irq){
          this.ac.requestIrq(255);

          this.irq=false;

        }
        n+=this.ac.step();

      }
      if(line===240&&this.nmi)this.c.pulseNmi();

    }
    this.draw();

  }
  px(x,y,c){
    if(y<16||y>=240)return;
    if(this.flip){
      x=255-x;
      y=255-y}
    let X=239-y,Y=x;
    if(X<0||X>=W||Y<0||Y>=H)return;
    let o=(Y*W+X)*4,v=this.pal[c]||[0,0,0];
    this.im.data[o]=v[0];
    this.im.data[o+1]=v[1];
    this.im.data[o+2]=v[2];
    this.im.data[o+3]=255}
  gp(rom,code,x,y,sprite=false){
    let xb=sprite?(x<4?x:x<8?64+x-4:x<12?128+x-8:192+x-12):(x<4?x:64+x-4),yb=sprite?(y<8?y*8:256+(y-8)*8):y*8,bit=xb+yb,sz=sprite?64:16,o=code*sz+(bit>>3),sh=7-(bit&7);
    return ((rom[o]>>sh)&1)|(((rom[o]>>(sh>=4?sh-4:sh+4))&1)<<1)}
  tile(code,col,X,Y,fx,fy){
    for(let y=0;
    y<8;
    y++)for(let x=0;
    x<8;
    x++){
      let p=this.gp(this.t,code,fx?7-x:x,fy?7-y:y);
      this.px(X+x,Y+y,col*4+p)}}
  sprites(){
    for(let o=62;
    o>=16;
    o-=2){
      let X=this.m[45056+o],Y=241-this.m[46080+o+1],code=this.m[45056+o+1],a=this.m[46080+o],col=a&63,fx=!(a&64),fy=!!(a&128);
      for(let y=0;
      y<16;
      y++)for(let x=0;
      x<16;
      x++){
        let p=this.gp(this.s,code,fx?15-x:x,fy?15-y:y,true);
        if(p)this.px(X+x,Y+y,128+col*4+p)}}}
  draw(){
    this.im.data.fill(0);
    if(this.video)for(let cat=0;
    cat<2;
    cat++){
      if(cat)this.sprites();
      for(let j=0;
      j<1024;
      j++){
        let a=this.m[40960+j];
        if(((a>>4)&1)!==cat)continue;
        this.tile((this.m[41984+j]+8*(a&32))&511,a&31,(j&31)*8,(j>>5)*8,!!(a&64),!!(a&128))}}
    this.cx.putImageData(this.im,0,0)}
  bind(){
    let set=(n,v)=>this.i[n]=v,pulse=n=>{
      set(n,1);
      setTimeout(()=>set(n,0),150)},map={
      ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",Space:"fire"};
    addEventListener("keydown",e=>{
      if(map[e.code])set(map[e.code],1);
      if(e.code==="Digit1")pulse("start1");
      if(e.code==="Digit5")pulse("coin1")});
    addEventListener("keyup",e=>map[e.code]&&set(map[e.code],0));
    document.querySelectorAll("[data-btn]").forEach(e=>{
      let n=e.dataset.btn;
      e.onpointerdown=x=>{
        x.preventDefault();
        n==="coin1"||n==="start1"?pulse(n):set(n,1)};
      e.onpointerup=()=>set(n,0)});
    let d=document.querySelector("#dpad"),mv=e=>{
      let r=d.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
      ["left","right","up","down"].forEach(n=>set(n,0));
      if(Math.hypot(x,y)>15)set(Math.abs(x)>Math.abs(y)?x<0?"left":"right":y<0?"up":"down",1)};
    d.onpointerdown=e=>{
      d.setPointerCapture(e.pointerId);
      mv(e)};
    d.onpointermove=e=>d.hasPointerCapture(e.pointerId)&&mv(e);
    d.onpointerup=()=>["left","right","up","down"].forEach(n=>set(n,0))}
}
const e=new TP;
await e.init();
e.run();
window.timePilot=e;

