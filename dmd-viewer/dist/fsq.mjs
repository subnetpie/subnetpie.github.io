import {Reader,parsePal} from './formats.mjs';
export const modeNames=['Palette','Replace','Color mask','Event','Follow','Layered color mask','Follow replace','Masked replace','Replace without retrigger','Looping color mask'];
export function parsePalMappings(data){
  const pal=parsePal(data),r=new Reader(data);r.bytes(3+pal.palettes.reduce((n,p)=>n+5+p.colors.length*3,0));
  const mappings=[];if(r.p<data.length){const count=r.u16();for(let i=0;i<count;i++){const hash=r.u32(),mode=r.u8(),paletteId=r.u16(),value=r.u32();mappings.push({hash,mode,paletteId,offset:mode===0?0:value,duration:mode===0?value:0})}}
  const masks=[];
  if(r.p<data.length){const count=r.u8(),size=count?(data.length-r.p)/count:0;if(count&&[256,512,1536,2048].includes(size))for(let i=0;i<count;i++)masks.push(r.bytes(size));}
  return {...pal,mappings,masks};
}
export function parseFsq(data,pal){
  if(!pal?.mappings)throw Error('Open the matching PAL file before its FSQ file.');
  const header=new TextDecoder().decode(data.subarray(0,4)),version=header==='FSQ '?data[4]:0;
  if(version>3)throw Error('Unsupported FSQ version '+version);
  const scenes=[],cache=new Map(),seen=new Set();let pixelBudget=0;
  for(const mapping of pal.mappings){
    const {offset,mode,paletteId}=mapping;if(mode===0||mode===3)continue;
    const variant=offset+':'+mode+':'+paletteId;if(seen.has(variant))continue;seen.add(variant);
    const key=offset+':'+mode;let decoded=cache.get(key);
    if(!decoded){
      if(offset<0||offset>=data.length)throw Error('PAL animation offset is outside the FSQ file: '+offset);
      const r=new Reader(data);r.p=offset;const count=r.u16();if(count>20000)throw Error('FSQ scene has too many frames');
      const stored=[];
      for(let i=0;i<count;i++){
        const delay=r.u32(),depth=r.u16(),size=r.u16(),hash=version>=2?r.u32():0;
        if(![256,512,1536,2048].includes(size)||depth<1||depth>256)throw Error('Invalid FSQ frame at byte '+(r.p-12));
        const planes=[];let hasMask=false,mask=null;
        for(let p=0;p<depth;p++){const marker=version>=2?r.u8():0,plane=r.bytes(size);if(marker===1){hasMask=true;mask=plane}else planes.push(plane)}
        stored.push({delay,hash,size,planes,hasMask,mask});
      }
      let sceneMasks=[];
      if(version>=3&&[4,6].includes(mode)&&stored.length){const bytes=stored[0].planes[0];if(bytes&&stored.length*4<=bytes.length){const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);stored.forEach((f,i)=>f.hash=view.getUint32(i*4,true));}}
      if(version>=2&&stored.length>=2&&[5,7].includes(mode)&&stored[0].delay===0&&stored[0].hash===0&&!stored[0].hasMask){
        const metadata=stored.shift();let count=metadata.planes.length;
        if(version>=3){count=Math.max(0,count-Math.ceil(stored.length/(metadata.size/4)));const table=new Uint8Array((metadata.planes.length-count)*metadata.size);metadata.planes.slice(count).forEach((p,i)=>table.set(p,i*metadata.size));const view=new DataView(table.buffer);stored.forEach((f,i)=>{if(i*4+4<=table.length)f.hash=view.getUint32(i*4,true)});}
        sceneMasks=metadata.planes.slice(0,count);
      }
      const frames=[];let w=128,h=32;
      for(const f of stored){
        w=f.size===1536?192:f.size===2048?256:128;h=f.size>=1536?64:32;
        const colorMask=[2,4,5,9].includes(mode),shift=colorMask&&f.size!==2048?2:0,depth=f.planes.length+shift;
        if(depth>8)throw Error('FSQ scene contains too many display planes');
        pixelBudget+=w*h;if(pixelBudget>128e6)throw Error('FSQ exceeds the 128 million pixel session limit');
        const pixels=new Uint8Array(w*h),pad=f.size===256?128:0;
        f.planes.forEach((plane,p)=>{for(let b=0;b<plane.length;b++)for(let bit=0;bit<8;bit++)pixels[(b+pad)*8+bit]|=((plane[b]>>bit)&1)<<(p+shift)});
        const unpack=plane=>{if(!plane)return null;const out=new Uint8Array(w*h);for(let b=0;b<plane.length;b++)for(let bit=0;bit<8;bit++)out[(b+pad)*8+bit]=(plane[b]>>bit)&1;return out};
        frames.push({data:pixels,delay:Math.max(1,f.delay),storedDelay:f.delay,levels:2**depth,hash:f.hash,mask:unpack(f.mask)});
      }
      decoded={w,h,frames,masks:sceneMasks};cache.set(key,decoded);
    }
    if(!decoded.frames.length)continue;
    const colors=pal.palettes.find(p=>p.id===paletteId)?.colors;
    scenes.push({...decoded,name:'Scene '+String(scenes.length+1).padStart(3,'0')+' · '+(modeNames[mode]||'Mode '+mode),paletteId,colors,mode,offset,partial:[2,4,5,7,9].includes(mode),sourceType:'FSQ'});
  }
  if(!scenes.length)throw Error('No animations referenced by this PAL file');
  return scenes;
}
