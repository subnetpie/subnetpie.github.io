import {assetStyle,PALETTE} from './assets.js?v=20261001-styles';
const clamp=v=>Math.max(0,Math.min(1,v));
function colorValue(name) {
 const value=PALETTE[name]??name;
 if(typeof value!=='string')return PALETTE.green;
 // CSS.supports accepts named/hex/rgb/hsl colors in browsers. Explicit fallback
 // prevents invalid settings from accidentally reusing the previous asset's ink.
 if(globalThis.CSS?.supports)return CSS.supports('color',value)?value:PALETTE.green;
 return PALETTE[name]??(/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)?value:PALETTE.green);
}
export function vectorStyle(vector,settings={},colorized=true) {
 const style=assetStyle(vector[8]?.asset,vector[4],settings,colorized);
 return {...style,ink:colorValue(style.color),alpha:style.displayIntensity/15*style.brightness,
   width:.75+style.displayIntensity/20};
}
function hull(points) {
 const unique=new Map();for(const p of points)unique.set(p.join(','),p);
 const p=[...unique.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(p.length<3)return [];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const lo=[],hi=[];
 for(const q of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),q)<=0)hi.pop();hi.push(q);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
export function renderVectors(ctx,vectors,{width=580,height=400,colorized=true,settings={}}={}) {
 // Resolve settings once per frame. Cached AVG tuple style fields are diagnostic
 // snapshots only: edits take effect even while emulation is paused.
 const prepared=[];
 for(const v of vectors) {
  if(v[4]<=0||!v.slice(0,4).every(Number.isFinite))continue;
  const style=vectorStyle(v,settings,colorized);
  if(style.alpha>0)prepared.push({v,style});
 }
 ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);ctx.lineCap='round';
 const groups=new Map();
 for(const {v,style} of prepared) {
  if(style.fillOpacity<=0||v[8]?.id==null)continue;
  const key=style.asset+':'+v[8].id;
  if(!groups.has(key))groups.set(key,{points:[],style,alpha:0});
  const group=groups.get(key);group.points.push([v[0],v[1]],[v[2],v[3]]);group.alpha=Math.max(group.alpha,style.alpha);
 }
 for(const {points,style,alpha} of groups.values()) {
  const polygon=hull(points);if(polygon.length<3)continue;
  ctx.fillStyle=style.ink;ctx.globalAlpha=clamp(alpha*style.fillOpacity);
  ctx.beginPath();ctx.moveTo(...polygon[0]);for(const p of polygon.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();
 }
 ctx.globalCompositeOperation='lighter';
 for(const [spread,gain] of [[7,.035],[4,.09],[2,.24],[1,1]]) {
  for(const {v,style:s} of prepared) {
   const halo=spread>1;if(halo&&s.glow===0)continue;
   ctx.globalAlpha=clamp(s.alpha*gain*(halo?s.glow/.35:1));
   ctx.strokeStyle=ctx.fillStyle=s.ink;
   ctx.lineWidth=s.width*spread*(halo?.65+s.glow:1);
   ctx.beginPath();
   if(v[0]===v[2]&&v[1]===v[3]){ctx.arc(v[0],v[1],ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
   else {ctx.moveTo(v[0],v[1]);ctx.lineTo(v[2],v[3]);ctx.stroke();}
  }
 }
 // The same resolved ink/alpha/glow controls endpoint dwell and point bloom.
 for(const {v,style:s} of prepared) {
  const points=v[0]===v[2]&&v[1]===v[3]?[[v[0],v[1]]]:[[v[0],v[1]],[v[2],v[3]]];
  for(const halo of [true,false]) {
   if(halo&&s.glow===0)continue;
   ctx.fillStyle=s.ink;ctx.globalAlpha=clamp(s.alpha*(halo?.12*s.glow/.35:.65));
   const radius=s.width/2*(halo?1+2*s.glow:1.1);
   for(const p of points){ctx.beginPath();ctx.arc(...p,radius,0,Math.PI*2);ctx.fill();}
  }
 }
 ctx.restore();
}
