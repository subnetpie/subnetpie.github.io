class IIgsDocRingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity=32768;
    this.left=new Float32Array(this.capacity);
    this.right=new Float32Array(this.capacity);
    this.read=0; this.write=0; this.count=0;
    this.sourceRate=22050;
    this.phase=0;
    this.currentLeft=0; this.currentRight=0;
    this.haveCurrent=false;
    this.port.onmessage=e=>{
      const m=e.data||{};
      if(m.type==='clear'){
        this.read=this.write=this.count=0; this.phase=0; this.haveCurrent=false;
        return;
      }
      if(m.type!=='samples'||!m.samples)return;
      const src=m.samples, frames=Math.min(m.count|0,src.length>>>1);
      for(let i=0;i<frames;i++) {
        if(this.count===this.capacity) {
          this.read=(this.read+1)%this.capacity;
          this.count--;
        }
        this.left[this.write]=src[i*2];
        this.right[this.write]=src[i*2+1];
        this.write=(this.write+1)%this.capacity;
        this.count++;
      }
    };
  }
  pullSource() {
    if(!this.count) {
      this.currentLeft=0; this.currentRight=0; this.haveCurrent=false;
      return;
    }
    this.currentLeft=this.left[this.read];
    this.currentRight=this.right[this.read];
    this.read=(this.read+1)%this.capacity;
    this.count--;
    this.haveCurrent=true;
  }
  process(inputs,outputs) {
    const out=outputs[0], l=out[0], r=out[1]||out[0];
    const step=this.sourceRate/sampleRate;
    if(!this.haveCurrent) this.pullSource();
    for(let i=0;i<l.length;i++) {
      l[i]=this.haveCurrent?this.currentLeft:0;
      r[i]=this.haveCurrent?this.currentRight:0;
      this.phase += step;
      while(this.phase>=1) {
        this.phase-=1;
        this.pullSource();
      }
    }
    return true;
  }
}
registerProcessor('iigs-doc-ring',IIgsDocRingProcessor);
