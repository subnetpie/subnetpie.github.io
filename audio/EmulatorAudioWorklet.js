// Generic browser PCM sink for emulators.
// Hardware devices must not import this module.

const PROCESSOR = "emulator-pcm-sink";
const WORKLET_SOURCE = `
class EmulatorPcmSinkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = []; this.offset = 0; this.enabled = true;
    this.port.onmessage = ({data}) => {
      if (data.type === "pcm") this.queue.push(new Float32Array(data.samples));
      else if (data.type === "enabled") this.enabled = !!data.value;
      else if (data.type === "clear") { this.queue.length = 0; this.offset = 0; }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0]; if (!out) return true; out.fill(0);
    if (!this.enabled) return true;
    let dst = 0;
    while (dst < out.length && this.queue.length) {
      const src = this.queue[0];
      const n = Math.min(out.length - dst, src.length - this.offset);
      out.set(src.subarray(this.offset, this.offset + n), dst);
      dst += n; this.offset += n;
      if (this.offset === src.length) { this.queue.shift(); this.offset = 0; }
    }
    return true;
  }
}
registerProcessor("emulator-pcm-sink", EmulatorPcmSinkProcessor);
`;

export class EmulatorAudioWorklet {
  constructor({ gain = 0.85 } = {}) {
    this.gain = gain; this.context = null; this.node = null;
    this.gainNode = null; this.ready = false; this.enabled = true;
  }

  async unlock() {
    // Create AudioContext before yielding: callers can invoke unlock()
    // directly from an iOS/Safari user gesture.
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable");
      this.context = new AudioContextClass();
      this.gainNode = this.context.createGain();
      this.gainNode.gain.value = this.gain;
      this.gainNode.connect(this.context.destination);
      const url = "data:application/javascript;charset=utf-8," + encodeURIComponent(WORKLET_SOURCE);
      await this.context.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(this.context, PROCESSOR, {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1]
      });
      this.node.connect(this.gainNode);
      this.ready = true;
      this.node.port.postMessage({ type: "enabled", value: this.enabled });
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setEnabled(value) {
    this.enabled = !!value;
    this.node?.port.postMessage({ type: "enabled", value: this.enabled });
  }

  push(samples) {
    if (!this.ready || !(samples instanceof Float32Array) || !samples.length) return;
    const copy = samples.slice();
    this.node.port.postMessage({ type: "pcm", samples: copy.buffer }, [copy.buffer]);
  }

  clear() { this.node?.port.postMessage({ type: "clear" }); }
  async resume() { if (this.context?.state === "suspended") await this.context.resume(); }
  async suspend() { if (this.context?.state === "running") await this.context.suspend(); }
  async destroy() {
    this.ready = false; this.node?.disconnect(); this.gainNode?.disconnect();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.node = this.gainNode = this.context = null;
  }
}
