// Generic browser PCM sink for emulators.
// Hardware devices must not import this module.

const PROCESSOR = "emulator-pcm-sink";
const WORKLET_SOURCE = `
class EmulatorPcmSinkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = []; this.offset = 0; this.enabled = true;
    this.queuedSamples = 0; this.maxQueuedSamples = Math.round(sampleRate * 0.10);
    this.port.onmessage = ({data}) => {
      if (data.type === "pcm") {
        const block = new Float32Array(data.samples);
        // Keep browser latency bounded. Machine time remains authoritative;
        // stale browser PCM is preferable to drop rather than play late.
        while (this.queue.length && this.queuedSamples + block.length > this.maxQueuedSamples) {
          const stale = this.queue.shift();
          this.queuedSamples -= stale.length - this.offset;
          this.offset = 0;
        }
        this.queue.push(block); this.queuedSamples += block.length;
      }
      else if (data.type === "enabled") this.enabled = !!data.value;
      else if (data.type === "clear") { this.queue.length = 0; this.offset = 0; this.queuedSamples = 0; }
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
      dst += n; this.offset += n; this.queuedSamples -= n;
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

  push(samples, sourceSampleRate = null) {
    if (!this.ready || !(samples instanceof Float32Array) || !samples.length) return;

    const sourceRate = Number(sourceSampleRate) || this.context?.sampleRate || 0;
    const outputRate = this.context?.sampleRate || sourceRate;
    let copy;
    if (sourceRate > 0 && outputRate > 0 && sourceRate !== outputRate) {
      // Browser boundary only: convert deterministic machine-rate PCM to the
      // AudioContext rate. Hardware devices continue to run at their MAME rate.
      const outputLength = Math.max(1, Math.round(samples.length * outputRate / sourceRate));
      copy = new Float32Array(outputLength);
      const step = sourceRate / outputRate;
      for (let i = 0; i < outputLength; i++) {
        const position = i * step;
        const index = Math.floor(position);
        const fraction = position - index;
        const a = samples[Math.min(index, samples.length - 1)];
        const b = samples[Math.min(index + 1, samples.length - 1)];
        copy[i] = a + (b - a) * fraction;
      }
    } else {
      copy = samples.slice();
    }

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
