// A bounded, in-memory recording of rendered game frames and original PCM audio.
export class RomHistory {
  constructor({maxDuration=60000,maxBytes=48*1024*1024,boundaryDelay=600}={}){
    Object.assign(this,{maxDuration,maxBytes,boundaryDelay});this.clear();
  }
  clear(){this.frames=[];this.audio=[];this.clips=[];this.bytes=0;this.end=0;this.serial=0;this.pending=null;}
  recordFrame(time,frame,key,label){
    const last=this.frames.at(-1);if(last&&time-last.time<32)return;
    const item={...frame,data:frame.data.slice(),time};this.frames.push(item);this.bytes+=item.data.byteLength;
    let clip=this.clips.at(-1);
    if(!clip){clip={id:++this.serial,key,label,start:time,end:time};this.clips.push(clip)}
    // Palette changes and unrecognized interstitial frames do not end a scene.
    // Confirm a different animation before moving the boundary back to its first frame.
    if(key&&key!==clip.key){
      if(this.pending?.key!==key)this.pending={key,label,start:time};
      if(time-this.pending.start>=this.boundaryDelay){
        const next=this.pending;clip.end=next.start;
        clip={id:++this.serial,...next,end:time};this.clips.push(clip);this.pending=null;
      }
    }else if(key===clip.key)this.pending=null;
    this.end=Math.max(this.end,time);this.clips.at(-1).end=this.end;this.trim();
  }
  recordAudio(end,{data,channels,rate}){
    // Several worker packets can arrive in one display frame. Place PCM blocks
    // consecutively by sample duration rather than overlapping arrival times.
    const duration=data.length/channels/rate*1000,previous=this.audio.at(-1);
    const start=previous&&Math.abs(end-previous.end)<250?previous.end:Math.max(0,end-duration);
    const item={data:data.slice(),channels,rate,start,end:start+duration};
    this.audio.push(item);this.bytes+=item.data.byteLength;this.end=Math.max(this.end,item.end);
    if(this.clips.length)this.clips.at(-1).end=this.end;this.trim();
  }
  trim(){
    const cutoff=this.end-this.maxDuration;
    // Evict completed recordings as whole animations, rather than keeping short tails.
    while(this.clips.length>1&&(this.clips[0].start<cutoff||this.bytes>this.maxBytes)){
      const start=this.clips[1].start;this.clips.shift();
      while(this.frames.length&&this.frames[0].time<start)this.bytes-=this.frames.shift().data.byteLength;
      while(this.audio.length&&this.audio[0].end<=start)this.bytes-=this.audio.shift().data.byteLength;
    }
    while(this.frames.length>1&&(this.frames[1].time<cutoff||this.bytes>this.maxBytes)){
      this.bytes-=this.frames.shift().data.byteLength;
      const start=this.frames[0].time;
      while(this.audio.length&&this.audio[0].end<=start)this.bytes-=this.audio.shift().data.byteLength;
      while(this.clips.length>1&&this.clips[1].start<=start)this.clips.shift();
      if(this.clips.length&&start>this.clips[0].start){this.clips[0].start=start;this.clips[0].truncated=true;}
    }
    while(this.audio.length&&(this.audio[0].end<cutoff||this.bytes>this.maxBytes))this.bytes-=this.audio.shift().data.byteLength;
  }
  clip(id){
    const clip=this.clips.find(c=>c.id===id);if(!clip)return null;
    const end=clip.end;
    const frames=this.frames.filter(f=>f.time>=clip.start&&(f.time<end||clip.start===end));
    if(!frames.length)return null;
    const audio=this.audio.filter(a=>a.end>clip.start&&a.start<clip.end).map(a=>{
      const first=Math.max(0,Math.ceil((clip.start-a.start)*a.rate/1000)),last=Math.min(a.data.length/a.channels,Math.floor((clip.end-a.start)*a.rate/1000));
      return {...a,start:Math.max(clip.start,a.start),data:a.data.subarray(first*a.channels,Math.max(first,last)*a.channels)};
    }).filter(a=>a.data.length);
    return {...clip,frames,audio,duration:Math.max(1,clip.end-clip.start)};
  }
}
