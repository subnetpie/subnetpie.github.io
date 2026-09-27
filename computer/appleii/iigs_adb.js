// Apple IIgs keyboard/mouse GLU command interface. Commands are processed
// synchronously; the response FIFO drives DATA_VALID in KMSTATUS.
export class IIgsADB {
 constructor(onIrq=null){this.ram=new Uint8Array(256);this.onIrq=onIrq;this.reset();}
 reset(){this.mode=0;this.config=[0x32,0,0x23];this.queue=[];this.command=0;this.args=[];this.remaining=0;this.control=0;
  // MAME key GLU state visible to the 65816 at C024/C025. Mouse data is
  // returned X then Y on alternating reads.
  this.mouseX=0;this.mouseY=0;this.mouseReadY=false;this.mouseFull=false;this.keyModifiers=0;
  this.keyStrobe=false;
  this.updateIrq();
 }
 updateIrq(){if(this.onIrq)this.onIrq(!!(((this.control&0x10)&&this.queue.length)||((this.control&0x40)&&this.mouseFull)||((this.control&0x04)&&this.keyStrobe)));}
 readMouseData(){const v=this.mouseReadY?this.mouseY:this.mouseX;if(this.mouseReadY)this.mouseFull=false;this.mouseReadY=!this.mouseReadY;this.updateIrq();return v&0xff;}
 readKeyModifiers(){return this.keyModifiers&0xff;}
 setMouseData(x,y){this.mouseX=x&0xff;this.mouseY=y&0xff;this.mouseReadY=false;this.mouseFull=true;this.updateIrq();}
 setKeyModifiers(value){this.keyModifiers=value&0xff;}
 readStatus(){return this.control|(this.mouseReadY?0x02:0)|(this.keyStrobe?0x08:0)|(this.queue.length?0x20:0)|(this.mouseFull?0x80:0);}
 readData(){const v=this.queue.shift()??0;this.updateIrq();return v;}
 writeStatus(value){this.control=(this.control&0xab)|(value&0x54);this.updateIrq();}
 writeData(value){
  if(this.remaining){this.args.push(value);if(--this.remaining===0)this.execute();return;}
  this.command=value;this.args=[];
  this.remaining=({4:1,5:1,6:3,7:8,8:2,9:2,0x11:1,0x12:2,0x13:2})[value]??((value&0xf0)===0xb0?2:0);
  if(!this.remaining)this.execute();
 }
 execute(){const a=this.args;switch(this.command){
  case 1:this.queue=[];break;
  case 4:this.mode|=a[0];break;case 5:this.mode&=~a[0];break;
  case 6:this.config=a.slice(0,3);break;
  case 7:this.mode=a[0];this.config=a.slice(1,4);this.extended=a.slice(4);break;
  case 8:this.ram[a[0]]=a[1];break;
  case 9:this.queue.push(this.ram[a[0]|a[1]<<8]??0);break;
  case 0x0a:this.queue.push(this.mode);break;
  case 0x0b:this.queue.push(0x82,...this.config);break;
  case 0x0d:this.queue.push(6);break;
  case 0x0e:this.queue.push(8,0);break;
  case 0x0f:this.queue.push(10,0);break;
  case 0x10:this.reset();break;
  default:
   if((this.command&0xf0)===0xf0){const dev=this.command&15;this.queue.push(...(dev===2||dev===3?[0x81,0x60|dev,dev===2?2:1]:[0]));}
   else if((this.command&0xf0)===0xc0)this.queue.push(0);
 }
 }
}
