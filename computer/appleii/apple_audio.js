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
        this.cpu_hz = khz * 1000;
        this.state = false;
        this.speakerPrevious = 0;
        this.speakerFiltered = 0;
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
        this.lastVisibleContextTime = 0;
        this.recovering = null;
        this.browserUnlocked = false;
    }

    init() {
        if(this.ac) return this.ac;
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        // Unlocking after a silent boot must not turn a held DC level into a pop.
        this.speakerPrevious = this.state ? this.level : 0;
        this.speakerFiltered = 0;
        this.docOutput = this.ac.createGain({channelCount:2, channelCountMode:"explicit", gain:1});
        this.docOutput.connect(this.ac.destination);
        void this.initDocWorklet();
        this.lastVisibleContextTime = this.ac.currentTime || 0;
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

    async unlock() {
        // IMPORTANT: AudioContext creation, resume(), and the first source.start()
        // must all be initiated by the user gesture on iPadOS. Do not suspend a
        // newly-created running context here: awaiting suspend() can consume the
        // Safari activation before resume() gets a chance to run.
        const ac=this.init();
        if(this.browserUnlocked && ac.state === "running") return ac;

        // Call resume immediately while the pointer/key event still owns user
        // activation. Keep its promise only so callers can observe completion.
        const resumePromise = ac.state === "running" ? null : ac.resume();

        // WebKit has historically needed a real source to start during the
        // gesture before it opens the hardware output route. One silent frame
        // is enough and is inaudible.
        try {
            const buffer=ac.createBuffer(1,1,ac.sampleRate);
            const source=ac.createBufferSource();
            source.buffer=buffer;
            source.connect(ac.destination);
            source.start(0);
            source.onended=()=>source.disconnect();
        } catch(err) {
            console.warn('[Apple audio] Safari output prime failed',err);
        }

        try {
            if(resumePromise) await resumePromise;
            this.browserUnlocked = ac.state === "running";
            if(this.browserUnlocked) {
                this.resetBrowserQueue();
                this.lastVisibleContextTime=ac.currentTime || 0;
            }
            return ac;
        } catch(err) {
            this.browserUnlocked=false;
            throw err;
        }
    }

    resetBrowserQueue() {
        if(!this.ac) return;
        for(const source of this.docSources) {
            try { source.stop(); } catch(_) {}
        }
        this.docSources.clear();
        this.docPcmCount=0;
        this.docQueueTime=this.ac.currentTime || 0;
        if(this.docWorklet) this.docWorklet.port.postMessage({type:'clear'});
    }

    async recoverAfterVisibility() {
        const ac=this.ac;
        if(!ac || document.hidden || this.recovering) return this.recovering || Promise.resolve();
        this.recovering=(async()=>{
            try {
                // iOS WebKit exposes the non-standard "interrupted" state.
                // Resume suspended/interrupted contexts. If it claims to be
                // running but the clock did not advance while hidden, perform
                // the suspend/resume cycle known to revive Safari audio.
                if(ac.state !== "running") {
                    await ac.resume();
                } else if(ac.currentTime <= this.lastVisibleContextTime) {
                    await ac.suspend();
                    await ac.resume();
                }
                this.resetBrowserQueue();
                this.lastVisibleContextTime=ac.currentTime || 0;
            } catch(err) {
                console.warn('[Apple audio] Safari resume deferred until next user gesture',err);
            } finally {
                this.recovering=null;
            }
        })();
        return this.recovering;
    }

    noteHidden() {
        if(this.ac) {
            this.lastVisibleContextTime=this.ac.currentTime || 0;
            this.browserUnlocked=false;
        }
    }

    diagnostics() {
        return {
            state:this.ac?.state || "not-created",
            time:this.ac ? Math.round(this.ac.currentTime*100)/100 : 0,
            sampleRate:this.ac?.sampleRate || 0,
            worklet:!!this.docWorklet,
            unlocked:this.browserUnlocked,
            queued:this.docSources.size,
            pcm:this.docPcmCount
        };
    }

    begin_segment(clock) {
        if(!this.ac) return;
        if(!this.docNextClock || this.docNextClock < clock - this.docStep)
            this.docNextClock = clock;
        this.docPcmCount = 0;
    }

    click(clock) {
        // C030 edges share the emulated PCM clock with DOC audio. Scheduling
        // AudioParam changes against currentTime each frame distorted the
        // boot tone whenever browser frames arrived late or unevenly.
        this.emitDocUntil(clock);
        this.state = !this.state;
    }

    emitDocUntil(clock) {
        if(!this.ac) return;
        while(this.docNextClock <= clock) {
            if(this.docPcmCount >= this.docPcmLeft.length) this.flushDocPcm();
            const n=this.docPcmCount++;
            const speaker=this.state ? this.level : 0;
            // AC coupling removes the held speaker's DC level after a beep.
            this.speakerFiltered=speaker-this.speakerPrevious+0.995*this.speakerFiltered;
            this.speakerPrevious=speaker;
            this.docPcmLeft[n]=this.docSignalLeft+this.speakerFiltered;
            this.docPcmRight[n]=this.docSignalRight+this.speakerFiltered;
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
        this.speakerPrevious=0;
        this.speakerFiltered=0;
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

