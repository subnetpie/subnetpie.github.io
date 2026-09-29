class IIgsDocRingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceRate=22050;
    this.capacity=8192;
    this.prebuffer=Math.ceil(this.sourceRate*0.04);
    this.maxQueue=Math.ceil(this.sourceRate*0.15);
    this.left=new Float32Array(this.capacity);
    this.right=new Float32Array(this.capacity);
    this.clear();
    this.port.onmessage=e=>{
      const m=e.data||{};
      if(m.type==='clear'){this.clear();return;}
      if(m.type!=='samples'||!m.samples)return;
      const src=m.samples,frames=Math.max(0,Math.min(m.count|0,src.length>>>1));
      for(let i=0;i<frames;i++) {
        if(this.count===this.capacity){this.read=(this.read+1)%this.capacity;this.count--;}
        this.left[this.write]=src[i*2];this.right[this.write]=src[i*2+1];
        this.write=(this.write+1)%this.capacity;this.count++;
      }
      // A stalled tab must not play seconds of stale audio when it resumes.
      if(this.count>this.maxQueue) {
        this.read=(this.write-this.prebuffer+this.capacity)%this.capacity;
        this.count=this.prebuffer;this.phase=0;this.fade=0;
      }
    };
  }
  clear() {
    this.read=this.write=this.count=0;this.phase=0;
    this.primed=false;this.fade=0;this.lastLeft=this.lastRight=0;
  }
  process(inputs,outputs) {
    const out=outputs[0];if(!out?.length)return true;
    const l=out[0],r=out[1]||out[0],step=this.sourceRate/sampleRate;
    if(!this.primed&&this.count>=this.prebuffer){this.primed=true;this.phase=0;this.fade=0;}
    for(let i=0;i<l.length;i++) {
      if(this.primed&&this.count>=2) {
        const next=(this.read+1)%this.capacity;
        this.fade=Math.min(1,this.fade+1/128);
        this.lastLeft=(this.left[this.read]*(1-this.phase)+this.left[next]*this.phase)*this.fade;
        this.lastRight=(this.right[this.read]*(1-this.phase)+this.right[next]*this.phase)*this.fade;
        this.phase+=step;
        const consumed=Math.min(Math.floor(this.phase),this.count);
        this.phase-=consumed;this.read=(this.read+consumed)%this.capacity;this.count-=consumed;
      } else {
        this.primed=false;
        // Ramp down on a true underrun, then wait for another complete buffer.
        this.lastLeft*=0.97;this.lastRight*=0.97;
      }
      l[i]=this.lastLeft;r[i]=this.lastRight;
    }
    return true;
  }
}
registerProcessor('iigs-doc-ring',IIgsDocRingProcessor);
