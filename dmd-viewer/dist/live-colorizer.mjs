// Browser PAC frame matching. Format references and limitations: emulator/README.md.
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0});
export function planeCrc(bytes,mask){let crc=0xffffffff;for(let i=0;i<bytes.length;i++)crc=(crc>>>8)^table[(crc^(mask?bytes[i]&mask[i]:bytes[i]))&255];return (crc^0xffffffff)>>>0}
export function splitPlanes(data,depth){const out=Array.from({length:depth},()=>new Uint8Array(Math.ceil(data.length/8)));for(let i=0;i<data.length;i++)for(let p=0;p<depth;p++)out[p][i>>3]|=((data[i]>>p)&1)<<(i&7);return out}
function paddedMask(mask,size){if(mask.length===size)return mask;if(mask.length===256&&size===512){const out=new Uint8Array(512);out.set(mask,128);return out}return null}
export class LiveColorizer {
  constructor(pac){
    this.pac=pac;this.mappings=new Map();for(const m of pac.mappings||[])if(!this.mappings.has(m.hash))this.mappings.set(m.hash,m);
    this.scenes=new Map(pac.scenes.map(s=>[s.offset+':'+s.mode+':'+s.paletteId,s]));
    this.defaultColors=(pac.palettes.find(p=>p.default)||pac.palettes[0])?.colors;
    this.reset();
  }
  reset(){this.colors=this.defaultColors;this.active=null;this.previous=null;this.resetAt=0;this.matches=0;this.lastMatch='Waiting for a PAC trigger';}
  activate(mapping,now){
    const active=this.active;
    if(active&&[5,7,8,9].includes(active.scene.mode)&&mapping.mode===active.scene.mode&&mapping.offset===active.scene.offset)return;
    this.colors=this.pac.palettes.find(p=>p.id===mapping.paletteId)?.colors||this.defaultColors;
    this.active=null;this.resetAt=mapping.mode===0&&mapping.duration?now+mapping.duration:0;
    this.matches++;this.lastMatch='Mode '+mapping.mode+' · palette '+mapping.paletteId;
    if(mapping.mode===0||mapping.mode===3)return;
    const scene=this.scenes.get(mapping.offset+':'+mapping.mode+':'+mapping.paletteId);
    if(!scene)return;
    this.active={scene,index:0,until:now+scene.frames[0].delay,buffer:new Uint8Array(scene.w*scene.h),mask:new Uint8Array(scene.w*scene.h)};
  }
  render(raw,w,h,depth,now,rawPlanes=[]){
    if(raw.length!==w*h)throw Error('Invalid live DMD dimensions');
    if(this.resetAt&&now>=this.resetAt){this.colors=this.defaultColors;this.resetAt=0;}
    const planeSignature=rawPlanes.length?rawPlanes.map(p=>planeCrc(p)).join(','):'';
    const changed=!this.previous||this.previous.length!==raw.length||raw.some((v,i)=>v!==this.previous[i])||planeSignature!==this.planeSignature;
    if(changed){
      this.previous=raw.slice();this.planeSignature=planeSignature;
      const planes=rawPlanes.length?rawPlanes:splitPlanes(raw,depth),checks=planes.map(plane=>({plane,hash:planeCrc(plane)}));
      let cleared=false,activated=false;
      for(const check of checks){
        let mapping=this.mappings.get(check.hash);
        if(!mapping||mapping.mode===3)for(const original of this.pac.masks||[]){const mask=paddedMask(original,check.plane.length);if(!mask)continue;const candidate=this.mappings.get(planeCrc(check.plane,mask));if(candidate&&candidate.mode!==3){mapping=candidate;break}}
        if(mapping&&mapping.mode!==3){this.activate(mapping,now);activated=true;if(![5,7].includes(this.active?.scene.mode))break;}
        const a=this.active;if(!a)continue;
        if([4,6].includes(a.scene.mode)){
          const hashes=new Set([check.hash,...(this.pac.masks||[]).map(m=>paddedMask(m,check.plane.length)).filter(Boolean).map(m=>planeCrc(check.plane,m))]);
          const index=a.scene.frames.findIndex(f=>hashes.has(f.hash));if(index>=0)a.index=index;
        }
        if([5,7].includes(a.scene.mode)){
          const hashes=new Set([check.hash,...(a.scene.masks||[]).map(m=>paddedMask(m,check.plane.length)).filter(Boolean).map(m=>planeCrc(check.plane,m))]);
          for(const frame of a.scene.frames)if(hashes.has(frame.hash)){
            if(!cleared){a.buffer.fill(0);a.mask.fill(0);cleared=true;}
            for(let i=0;i<a.buffer.length;i++){a.buffer[i]|=frame.data[i];if(frame.mask)a.mask[i]|=frame.mask[i];}
          }
        }
      }
      if(!activated&&this.active&&[2,9].includes(this.active.scene.mode)&&this.active.scene.frames.length>1)this.active.until=now;
    }
    let a=this.active;
    if(a&&a.scene.w===w&&a.scene.h===h){
      const {scene}=a;
      if([1,2,8,9].includes(scene.mode)){
        let budget=scene.frames.length+1;
        while(now>=a.until&&budget-->0){a.index++;if(a.index>=scene.frames.length){if(scene.mode===9)a.index=0;else{this.active=null;break}}a.until+=scene.frames[a.index].delay;}
      }
      if(this.active){
        const frame=scene.frames[a.index];let data;
        if([1,6,8].includes(scene.mode))data=frame.data;
        else if([2,4,5,9].includes(scene.mode)){
          const overlay=scene.mode===5?a.buffer:frame.data;
          const bits=Math.round(Math.log2(frame.levels)),baseBits=depth===bits?Math.max(0,bits-2):depth,mask=(1<<baseBits)-1;
          data=Uint8Array.from(raw,(v,i)=>(v&mask)|(overlay[i]&~mask));
        }else if(scene.mode===7){const low=(1<<depth)-1;data=Uint8Array.from(raw,(v,i)=>(a.mask[i]?a.buffer[i]:(v&low)|(a.buffer[i]&~low)));}
        if(data)return {data,colors:this.colors,levels:frame.levels};
      }
    }
    return {data:raw,colors:this.colors,levels:2**depth};
  }
}
