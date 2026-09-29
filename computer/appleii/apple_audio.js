//
//  apple2e audio output device
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  ref: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
//       https://github.com/WebKit/webkit/tree/master/Source/WebCore/Modules/webaudio
//


export class AppleAudio
{
    constructor(khz) {
        this.ac;
        this.gn;
        this.cpu_hz = khz * 1000;
        this.seg_time = 0;
        this.seg_clock = 0;
        this.state = false;
        this.level = 0.6;
        this.docLastLeft = 0;
        this.docLastRight = 0;
        // Render DOC to bounded PCM blocks instead of AudioParam automation.
        // Safari retains large automation timelines poorly; the old path could
        // enqueue events at nearly 65816 instruction rate and slow continuously.
        this.docRate = 22050;
        this.docStep = this.cpu_hz / this.docRate;
        this.docNextClock = 0;
        this.docSignalLeft = 0;
        this.docSignalRight = 0;
        this.docPcmLeft = new Float32Array(2048);
        this.docPcmRight = new Float32Array(2048);
        this.docInterleaved = new Float32Array(4096);
        this.docPcmCount = 0;
        this.docQueueTime = 0;
        this.docWorklet = null;
        this.docWorkletStarting = false;
        this.docSources = new Set();
    }

    init() {
        if(this.ac) {
            if(this.ac.state === "suspended") void this.ac.resume();
            return this.ac;
        }
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const ws = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        ws.curve = new Float32Array([-1, -1]);
        this.gn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});

        this.gn.gain.value = 0;
        osc.frequency.value = 0;
        osc.connect(ws);
        ws.connect(this.gn);
        this.gn.connect(this.ac.destination);
        this.docOutput = this.ac.createGain({channelCount:2, channelCountMode:"explicit", gain:1});
        this.docOutput.connect(this.ac.destination);
        osc.start();
        void this.initDocWorklet();
        if(this.ac.state === "suspended") void this.ac.resume();
        return this.ac;
    }

    async initDocWorklet() {
        if(this.docWorklet || this.docWorkletStarting || !this.ac?.audioWorklet ||
           typeof AudioWorkletNode === "undefined") return;
        this.docWorkletStarting=true;
        try {
            await this.ac.audioWorklet.addModule(new URL('./doc_audio_worklet.js?v=20260929-docfix',import.meta.url));
            const node=new AudioWorkletNode(this.ac,'iigs-doc-ring',{
                numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]
            });
            node.connect(this.ac.destination);
            this.docWorklet=node;
            for(const source of this.docSources)source.stop();
            this.docSources.clear();
        } catch(err) {
            console.warn('[IIgs audio] AudioWorklet unavailable; using buffer fallback',err);
        } finally {
            this.docWorkletStarting=false;
        }
    }

    unlock() {
        const ac=this.init();
        if(ac && ac.state === "suspended") return ac.resume();
        return Promise.resolve();
    }

    begin_segment(clock) {
        if((this.level == 0) || !this.ac) return;
        this.seg_time = this.ac.currentTime + 0.04;
        this.seg_clock = clock;
        if(!this.docNextClock || this.docNextClock < clock - this.docStep)
            this.docNextClock = clock;
        this.docPcmCount = 0;
    }

    click(clock) {
        if((this.level == 0) || !this.gn) return;
        this.state = !this.state;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        this.gn.gain.setValueAtTime(this.state ? this.level : 0, time + this.seg_time);
    }

    emitDocUntil(clock) {
        if(!this.ac) return;
        while(this.docNextClock <= clock) {
            if(this.docPcmCount >= this.docPcmLeft.length) this.flushDocPcm();
            const n=this.docPcmCount++;
            this.docPcmLeft[n]=this.docSignalLeft;
            this.docPcmRight[n]=this.docSignalRight;
            this.docNextClock += this.docStep;
        }
    }

    doc_sample(clock, left, right = left, systemVolume = 15) {
        if(!this.ac) return;
        const master = (systemVolume & 15) / 15;
        const nextLeft = Math.max(-1, Math.min(1, left / 128)) * this.level * master;
        const nextRight = Math.max(-1, Math.min(1, right / 128)) * this.level * master;
        // Most DOC updates leave the held DAC level unchanged. end_segment()
        // fills that constant run, so avoid walking the PCM clock here.
        if(Math.abs(nextLeft-this.docSignalLeft)<0.00001 &&
           Math.abs(nextRight-this.docSignalRight)<0.00001) return;
        // Emit the previous DAC level up to this exact emulated clock, then
        // change the held level. This preserves DOC timing without creating
        // thousands of WebAudio automation events.
        this.emitDocUntil(clock);
        this.docSignalLeft = nextLeft;
        this.docSignalRight = nextRight;
        this.docLastLeft = nextLeft;
        this.docLastRight = nextRight;
    }

    end_segment(clock) {
        if(!this.ac) return;
        this.emitDocUntil(clock);
        this.flushDocPcm();
    }

    flushDocPcm() {
        const n=this.docPcmCount;
        if(!n || !this.ac) return;
        if(this.ac.state !== "running") {
            this.docPcmCount=0;
            this.docQueueTime=this.ac.currentTime;
            return;
        }

        if(this.docWorklet) {
            const samples=this.docInterleaved;
            for(let i=0;i<n;i++) {
                samples[i*2]=this.docPcmLeft[i];
                samples[i*2+1]=this.docPcmRight[i];
            }
            // Structured clone copies into the audio thread immediately, so
            // this fixed staging array can be reused without AudioBuffer or
            // BufferSource allocation on every emulation slice.
            this.docWorklet.port.postMessage({type:'samples',samples,count:n});
            this.docPcmCount=0;
            return;
        }

        // Startup/fallback path for browsers without AudioWorklet.
        if(!this.docOutput) return;
        const buffer=this.ac.createBuffer(2,n,this.docRate);
        buffer.getChannelData(0).set(this.docPcmLeft.subarray(0,n));
        buffer.getChannelData(1).set(this.docPcmRight.subarray(0,n));
        const source=this.ac.createBufferSource();
        source.buffer=buffer;
        source.connect(this.docOutput);
        const now=this.ac.currentTime;
        if(this.docQueueTime < now + 0.025 || this.docQueueTime > now + 0.15)
            this.docQueueTime = now + 0.04;
        this.docSources.add(source);
        source.start(this.docQueueTime);
        this.docQueueTime += n / this.docRate;
        source.onended=()=>{source.disconnect();this.docSources.delete(source);};
        this.docPcmCount=0;
    }

    reset() {
        this.state = false;
        if(this.gn) {
            this.gn.gain.cancelScheduledValues(0);
            this.gn.gain.value = 0;
        }
        for(const source of this.docSources)source.stop();
        this.docSources.clear();
        this.docSignalLeft=this.docSignalRight=0;
        this.docLastLeft=this.docLastRight=0;
        this.docNextClock=0;
        this.docPcmCount=0;
        this.docQueueTime=this.ac ? this.ac.currentTime : 0;
        if(this.docWorklet) this.docWorklet.port.postMessage({type:'clear'});
    }
}

