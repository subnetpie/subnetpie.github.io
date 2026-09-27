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
    }

    init() {
        if(this.ac) return;
        this.ac = new (window.AudioContext || window.webkitAudioContext)();
        const osc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const ws = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        ws.curve = new Float32Array([-1, -1]);
        this.gn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});

        osc.connect(ws);
        ws.connect(this.gn);
        this.gn.connect(this.ac.destination);
        this.docLeftGn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});
        this.docRightGn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});
        const docLeftOsc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const docRightOsc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const docLeftShape = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        const docRightShape = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        docLeftShape.curve = new Float32Array([1,1]);
        docRightShape.curve = new Float32Array([1,1]);
        const merger = this.ac.createChannelMerger(2);
        docLeftOsc.connect(docLeftShape); docLeftShape.connect(this.docLeftGn); this.docLeftGn.connect(merger,0,0);
        docRightOsc.connect(docRightShape); docRightShape.connect(this.docRightGn); this.docRightGn.connect(merger,0,1);
        merger.connect(this.ac.destination);
        osc.start(); docLeftOsc.start(); docRightOsc.start();
    }

    begin_segment(clock) {
        if((this.level == 0) || !this.ac) return;
        this.seg_time = this.ac.currentTime + 0.08; // gameplay is in the future
        this.seg_clock = clock;
    }

    click(clock) {
        if((this.level == 0) || !this.gn) return;
        this.state = !this.state;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        this.gn.gain.setValueAtTime(this.state ? this.level : 0, time + this.seg_time);
    }

    doc_sample(clock, left, right = left, systemVolume = 15) {
        if(!this.docLeftGn || !this.docRightGn || !this.ac) return;
        const master = (systemVolume & 15) / 15;
        const l = Math.max(-1, Math.min(1, left / 128)) * this.level * master;
        const r = Math.max(-1, Math.min(1, right / 128)) * this.level * master;
        const time = (clock - this.seg_clock) / this.cpu_hz + this.seg_time;
        if(Math.abs(l - this.docLastLeft) >= 0.002) {
            this.docLeftGn.gain.setValueAtTime(l, time); this.docLastLeft = l;
        }
        if(Math.abs(r - this.docLastRight) >= 0.002) {
            this.docRightGn.gain.setValueAtTime(r, time); this.docLastRight = r;
        }
    }

    reset() {
        if(!this.gn) return;
        this.state = false;
        this.gn.gain.cancelScheduledValues(0);
        this.gn.gain.value = 0;
        if(this.docLeftGn) { this.docLeftGn.gain.cancelScheduledValues(0); this.docLeftGn.gain.value=0; }
        if(this.docRightGn) { this.docRightGn.gain.cancelScheduledValues(0); this.docRightGn.gain.value=0; }
        this.docLastLeft=this.docLastRight=0;
    }
}

