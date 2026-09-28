import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IIgsVideo} from './video_iigs.js';
function video(){return new IIgsVideo({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})})});}
function pixel(v,x,y,rgb){v.putPixel(v.image.data,x,y,rgb);}
function rgb(v,x,y=0){return [...v.image.data.slice((y*640+x)*4,(y*640+x)*4+3)];}
test('640-mode blue/white dither becomes a uniform blended color, including row edges',()=>{
 const v=video();for(let x=0;x<640;x++)pixel(v,x,0,x%2?[255,255,255]:[0,0,255]);
 v.blend640Line(0,v.image.data);
 for(let x=0;x<640;x++)assert.deepEqual(rgb(v,x),[128,128,255]);
});
test('monochrome text and isolated color edges stay sharp',()=>{
 const v=video();for(let x=0;x<640;x++)pixel(v,x,0,x%2?[255,255,255]:[0,0,0]);
 pixel(v,20,0,[255,0,0]);const before=v.image.data.slice();
 v.blend640Line(0,v.image.data);assert.deepEqual(v.image.data,before);
});
test('mixed SHR frames blend only 640-mode scanlines and leave video RAM unchanged',()=>{
 const v=video();v.writeNewVideo(0xc1);
 v.writeBankE1(0x9d00,0x80);v.writeBankE1(0x9d01,0);
 for(let i=0;i<16;i++){
  const color=(i>=4&&i<8)||(i>=12)?0xfff:0x00f;
  v.writeBankE1(0x9e00+i*2,color&255);v.writeBankE1(0x9e01+i*2,color>>8);
 }
 const ram=v.bankE1.slice();
 v.context={save(){},restore(){},fillRect(){},drawImage(){}};
 globalThis.document={createElement:()=>({getContext:()=>({putImageData(){}})})};
 try{v.refresh();}finally{delete globalThis.document;}
 assert.deepEqual(rgb(v,0,0),[128,128,255]);
 assert.deepEqual(rgb(v,1,0),[128,128,255]);
 assert.deepEqual(rgb(v,0,1),[0,0,255]);
 assert.deepEqual(v.bankE1,ram);
});
