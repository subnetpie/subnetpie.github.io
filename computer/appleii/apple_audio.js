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
        this.docLevel = 0;
        this.docLastLevel = 0;
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
        this.docGn = this.ac.createGain({channelCount:1, channelCountMode:"explicit", gain:0});
        const docOsc = this.ac.createOscillator({channelCount:1, channelCountMode:"explicit", frequency:0});
        const docShape = this.ac.createWaveShaper({channelCount:1, channelCountMode:"explicit"});
        docShape.curve = new Float32Array([1,1]);
        docOsc.connect(docShape); docShape.connect(this.docGn); this.docGn.connect(this.ac.destination);
        osc.start(); docOsc.start();
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

    doc_sample(clock, sample) {
        if(!this.docGn || !this.ac) return;
        const level = Math.max(-1, Math.min(1, sample / 128)) * this.level;
        if(Math.abs(level - this.docLastLevel) < 0.002) return;
        const time = (clock - this.seg_clock) / this.cpu_hz;
        this.docGn.gain.setValueAtTime(level, time + this.seg_time);
        this.docLastLevel = level;
    }

    reset() {
        if(!this.gn) return;
        this.state = false;
        this.gn.gain.cancelScheduledValues(0);
        this.gn.gain.value = 0;
        if(this.docGn) { this.docGn.gain.cancelScheduledValues(0); this.docGn.gain.value=0; }
        this.docLastLevel=0;
    }
}

