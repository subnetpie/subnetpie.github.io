import {register} from 'node:module';
import {readFileSync} from 'node:fs';
register('./url-loader.mjs', import.meta.url);
const {Motherboard} = await import('../motherboard.js');

export function createMachine(machine = 'iigs') {
  const pixels = new Uint8ClampedArray(564 * 390 * 4);
  const context = {
    fillStyle: '#000',
    createImageData: (width,height) => ({width,height,data:new Uint8ClampedArray(width*height*4)}),
    putImageData(im, dx, dy, sx=0, sy=0, sw=im.width, sh=im.height) {
      for(let y=sy;y<sy+sh;y++) for(let x=sx;x<sx+sw;x++) {
        const tx=x+dx,ty=y+dy;
        if(tx<0||tx>=564||ty<0||ty>=390) continue;
        pixels.set(im.data.subarray((y*im.width+x)*4,(y*im.width+x)*4+4),(ty*564+tx)*4);
      }
    },
    fillRect(x,y,w,h) {
      let s=this.fillStyle.slice(1); if(s.length===3)s=[...s].map(c=>c+c).join('');
      const rgb=parseInt(s,16), color=[rgb>>16&255,rgb>>8&255,rgb&255,255];
      for(let yy=Math.max(0,y);yy<Math.min(390,y+h);yy++)
        for(let xx=Math.max(0,x);xx<Math.min(564,x+w);xx++)pixels.set(color,(yy*564+xx)*4);
    },
    save(){}, restore(){}, drawImage(){}
  };
  const canvas={getContext:()=>context};
  globalThis.document={createElement:()=>canvas};
  const joystick={axis0:127,axis1:127,axis2:127,axis3:127,button0:false,button1:false};
  const board=new Motherboard(machine==='iigs'?2800:1020.5,canvas,joystick,()=>{},machine);
  if(machine==='iigs') {
    const lo=readFileSync(new URL('../rom/341-0728',import.meta.url));
    const hi=readFileSync(new URL('../rom/341-0748',import.meta.url));
    const rom=new Uint8Array(0x40000);
    rom.set(lo);rom.set(hi.subarray(0x10000),0x20000);rom.set(hi.subarray(0,0x10000),0x30000);
    board.loadIIgsROM(rom);
  }
  board.reset();
  return {board,pixels,joystick};
}
