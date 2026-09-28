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
    this.pos=0; this.cellPos=0; this.cellFrac=0; this.rawBits=[]; this.cacheKey=''; this.cache=null; this.cellCacheKey=''; this.cellCache=null; this.cellCacheKey=''; this.cellCache=null;
  }
  mount(media) {
    if(!media?.data || media.data.length!==1600*512) return false;
    this.media=media; this.track=0; this.subtrack=0; this.head=0; this.phases=0;
    this.pos=0; this.cellPos=0; this.cellFrac=0; this.rawBits=[]; this.cacheKey=''; this.cache=null; this.cellCacheKey=''; this.cellCache=null; return true;
  }
  reset() {
    this.track=0; this.subtrack=0; this.head=0; this.phases=0;
    this.pos=0; this.cellPos=0; this.cellFrac=0; this.rawBits=[];
    this.cacheKey=''; this.cache=null;
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
    // MAME apple_gcr_format::load consumes raw 800K data as
    // track -> head -> logical sector. Each head owns one contiguous ns*512
    // region; heads are not interleaved sector-by-sector.
    let n=0;
    for(let t=0;t<track;t++) n+=this.sectorCount(t)*2;
    n+=(head?this.sectorCount(track):0)+sector;
    return n*512;
  }
  buildTrack() {
    if(!this.media)return new Uint8Array([0xff]);
    const key=this.track+':'+this.head;
    if(key===this.cacheKey&&this.cache)return this.cache;
    const out=[], ns=this.sectorCount(), physical=new Array(ns);
    let si=0; for(let i=0;i<ns;i++){physical[si]=i;si=(si+2)%ns;if(si===0)si++;}
    const sync=()=>{for(let i=0;i<16;i++)out.push(0xff);};
    for(let slot=0;slot<ns;slot++) {
      const s=physical[slot], side=this.head?0x20:0, fmt=0x22;
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
  static decodeGcrByte(v) { return GCR6.indexOf(v); }
  decodeSectorField(bytes, start) {
    let p=start, ca=0,cb=0,cc=0; const out=new Uint8Array(524);
    const dec=v=>Floppy35.decodeGcrByte(v);
    for(let i=0;i<175;i++) {
      const e0=dec(bytes[p++]),e1=dec(bytes[p++]),e2=dec(bytes[p++]);
      const e3=i<174?dec(bytes[p++]):0;
      if(e0<0||e1<0||e2<0||e3<0)return null;
      let va=((e0&0x30)<<2)|e1, vb=((e0&0x0c)<<4)|e2, vc=((e0&3)<<6)|e3;
      cc=((cc<<1)|(cc>>>7))&0xff;
      va^=cc; const suma=ca+va+(cc&1); ca=suma&0xff;
      vb^=ca; const sumb=cb+vb+(suma>>>8); cb=sumb&0xff;
      vc^=cb;
      out[3*i]=va; out[3*i+1]=vb;
      if(i!==174){cc=(cc+vc+(sumb>>>8))&0xff;out[3*i+2]=vc;}
    }
    const chk0=dec(bytes[p++]),chk1=dec(bytes[p++]),chk2=dec(bytes[p++]),chk3=dec(bytes[p++]);
    if(chk0<0||chk1<0||chk2<0||chk3<0)return null;
    const cva=((chk0&0x30)<<2)|chk1, cvb=((chk0&0x0c)<<4)|chk2, cvc=((chk0&3)<<6)|chk3;
    if(cva!==ca||cvb!==cb||cvc!==cc||bytes[p++]!==0xde||bytes[p++]!==0xaa)return null;
    return out;
  }
  rpm(track=this.track) { return [394,429,472,525,590][Math.min(4,track>>>4)]; }
  cellCount(track=this.track) {
    return Math.floor(30318342/this.rpm(track));
  }
  trackCells() {
    const key=this.track+':'+this.head;
    if(key===this.cellCacheKey && this.cellCache)return this.cellCache;
    if(!this.media)return [1,1,1,1,1,1,1,1];

    // Build flux cells directly. Sync bytes are a physical 48-cell pattern;
    // ordinary encoded $FF bytes remain ordinary eight-cell data. Inferring
    // sync from byte value corrupts valid GCR fields.
    const cells=[], ns=this.sectorCount(), physical=new Array(ns);
    const syncPat=[1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,0,0,1,1,1,1,0,0,
                   1,1,1,1,0,0,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1];
    const byte=v=>{for(let b=7;b>=0;b--)cells.push((v>>>b)&1);};
    const sync=(count)=>{for(let i=0;i<count;i++)cells.push(...syncPat);};
    let si=0; for(let i=0;i<ns;i++){physical[si]=i;si=(si+2)%ns;if(si===0)si++;}
    // MAME build_mac_track_gcr: each sector consumes 6208 cells. The
    // remainder is a pregap at the index, followed by 8 self-sync units per
    // sector. Keep the partial pregap bit-exact as the leading slice of the
    // same 48-cell sync pattern.
    const target=this.cellCount();
    const pregap=target-6208*ns;
    const partial=pregap%48;
    if(partial)cells.push(...syncPat.slice(48-partial));
    sync(Math.floor(pregap/48));
    for(let slot=0;slot<ns;slot++) {
      const s=physical[slot];
      const side=this.head?0x20:0, fmt=0x22;
      sync(8);
      [0xd5,0xaa,0x96,GCR6[this.track&0x3f],GCR6[s&0x3f],
       GCR6[((this.track&0x40)?1:0)|side],GCR6[fmt],
       GCR6[(this.track^s^((this.track&0x40)?1:0)^side^fmt)&0x3f],
       0xde,0xaa,0xff,0xff,0xff,0xff,0xff,0xff,0xd5,0xaa,0xad,GCR6[s&0x3f]].forEach(byte);
      const start=this.sectorOffset(this.track,this.head,s);
      const src=this.media.data.subarray(start,start+512);
      const all=new Uint8Array(524); all.set(src,12);
      let ca=0,cb=0,cc=0;
      for(let i=0;i<175;i++) {
        const p=i*3,va0=all[p],vb0=all[p+1],vc0=i!==174?all[p+2]:0;
        cc=((cc<<1)|(cc>>>7))&0xff;
        const suma=ca+va0+(cc&1);ca=suma&0xff;const va=va0^cc;
        const sumb=cb+vb0+(suma>>>8);cb=sumb&0xff;const vb=vb0^ca;
        if(i!==174)cc=(cc+vc0+(sumb>>>8))&0xff;
        const vc=vc0^cb;
        const enc=gcr6(va,vb,vc);byte(enc[0]);byte(enc[1]);byte(enc[2]);if(i!==174)byte(enc[3]);
      }
      gcr6(ca,cb,cc).forEach(byte); byte(0xde);byte(0xaa);byte(0xff);byte(0xff);
    }
    this.cellCacheKey=key; this.cellCache=cells.slice(0,target);
    return this.cellCache;
  }

  tick(seconds) {
    if(!this.media || seconds<=0)return;
    const cells=this.trackCells();
    // MAME's 3.5 GCR cell time is 1.979 us. RPM changes the number of cells
    // per revolution rather than the cell cadence.
    this.cellFrac += seconds/1.979e-6;
    const n=this.cellFrac|0; if(!n)return; this.cellFrac-=n;
    for(let k=0;k<n;k++) {
      this.rawBits.push(cells[this.cellPos%cells.length]);
      this.cellPos=(this.cellPos+1)%cells.length;
    }
  }
  takeBits() { const b=this.rawBits; this.rawBits=[]; return b; }
  takeTransitions() {
    const bits=this.takeBits(), out=[];
    for(let i=0;i<bits.length;i++) if(bits[i]) out.push(i);
    return {cells:bits.length,transitions:out};
  }
  read() { const t=this.buildTrack(); return t[this.pos%t.length]; }

}
