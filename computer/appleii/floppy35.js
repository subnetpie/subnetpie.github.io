// Read-only Apple IIgs 3.5-inch 400/800K GCR media.
// Track geometry and GCR6 encoding follow MAME 0.289 ap_dsk35.cpp/flopimg.cpp.
const GCR6=Uint8Array.from([
  0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,
  0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,
  0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,
  0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff
]);

function gcr6(va,vb,vc) {
  return [
    GCR6[((va>>>2)&0x30)|((vb>>>4)&0x0c)|((vc>>>6)&3)],
    GCR6[va&0x3f],GCR6[vb&0x3f],GCR6[vc&0x3f]
  ];
}

export class Floppy35 {
  constructor() { this.eject(); }
  eject() {
    this.media=null; this.track=0; this.subtrack=0; this.head=0; this.phases=0;
    this.pos=0; this.cacheKey=''; this.cache=null;
  }
  mount(media) {
    if(!media?.data || media.data.length!==1600*512) return false;
    this.media=media; this.track=0; this.subtrack=0; this.head=0; this.phases=0;
    this.pos=0; this.cacheKey=''; this.cache=null; return true;
  }
  get writeProtected() { return !this.media || !!this.media.writeProtected; }
  setHead(head) { head=head?1:0; if(head!==this.head){this.head=head;this.pos=0;this.cacheKey='';} }
  setPhase(mask) {
    // MAME floppy_image_device::seek_phase_w(): phase combinations select one
    // of eight quarter-track positions. Opposite phases do not move the head.
    this.phases=mask&0x0f;
    const req=({1:0,3:1,2:2,6:3,4:4,12:5,8:6,9:7})[this.phases];
    if(req===undefined)return;
    const cur=(this.track<<2)|this.subtrack;
    if(((cur^req)&7)===4)return;
    let next=(cur&~7)|req;
    if(next<cur-4)next+=8;
    else if(next>cur+4)next-=8;
    next=Math.max(0,Math.min(79*4,next));
    if(next===cur)return;
    this.track=next>>>2; this.subtrack=next&3;
    this.pos=0; this.cacheKey='';
  }
  sectorCount(track=this.track){return 12-Math.min(4,track>>>4);}
  sectorOffset(track,head,sector) {
    let n=0;
    for(let t=0;t<track;t++) n+=(12-Math.min(4,t>>>4))*2;
    n+=head*this.sectorCount(track)+sector;
    return n*512;
  }
  buildTrack() {
    if(!this.media)return new Uint8Array([0xff]);
    const key=this.track+':'+this.head;
    if(key===this.cacheKey&&this.cache)return this.cache;
    const out=[], ns=this.sectorCount(), order=[];
    let si=0; for(let i=0;i<ns;i++){order.push(si);si=(si+2)%ns;if(si===0)si++;}
    const sync=()=>{for(let i=0;i<16;i++)out.push(0xff);};
    for(let oi=0;oi<ns;oi++) {
      const s=order[oi], side=this.head?0x20:0, fmt=0x00;
      sync(); out.push(0xd5,0xaa,0x96,
        GCR6[this.track&0x3f],GCR6[s&0x3f],
        GCR6[((this.track&0x40)?1:0)|side],
        GCR6[fmt],GCR6[(this.track^s^((this.track&0x40)?1:0)^side^fmt)&0x3f],
        0xde,0xaa,0xff,0xff,0xff,0xff,0xff,0xff,0xd5,0xaa,0xad,GCR6[s&0x3f]);
      const src=this.media.data.subarray(this.sectorOffset(this.track,this.head,s),
        this.sectorOffset(this.track,this.head,s)+512);
      const tag=new Uint8Array(12), all=new Uint8Array(524); all.set(tag); all.set(src,12);
      let ca=0,cb=0,cc=0;
      for(let i=0;i<175;i++) {
        const p=i*3, va0=all[p], vb0=all[p+1], vc0=i!==174?all[p+2]:0;
        cc=((cc<<1)|(cc>>>7))&0xff;
        const suma=ca+va0+(cc&1); ca=suma&0xff; const va=va0^cc;
        const sumb=cb+vb0+(suma>>>8); cb=sumb&0xff; const vb=vb0^ca;
        if(i!==174)cc=(cc+vc0+(sumb>>>8))&0xff;
        const vc=vc0^cb, enc=gcr6(va,vb,vc);
        out.push(enc[0],enc[1],enc[2]); if(i!==174)out.push(enc[3]);
      }
      out.push(...gcr6(ca,cb,cc),0xde,0xaa,0xff,0xff);
    }
    this.cacheKey=key; this.cache=Uint8Array.from(out); return this.cache;
  }
  read() {
    const t=this.buildTrack(), v=t[this.pos%t.length]; this.pos=(this.pos+1)%t.length; return v;
  }
}
