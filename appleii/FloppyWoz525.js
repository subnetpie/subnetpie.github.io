//
//  apple2e 5.25" floppy disk drive emulator
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  DIAGNOSTIC BUILD — console.log instrumentation active.
//  Open the browser console before loading a WOZ image and pressing Run.
//  The output will identify exactly which stage fails.
//  Remove all lines marked //[DIAG] once the root cause is confirmed.
//

import {disk16_p5_rom_341_0027} from "https://subnetpie.github.io/appleii/rom/disk16-p5_341-0027.js";

// ProDOS_2_4_2.dsk 8596-85d6
const write_62 = [
    0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,
    0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,
    0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,
    0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff
];

// ProDOS_2_4_2.dsk 8d2b-8d3b
const sec_int = [0x00,0x0d,0x0b,0x09,0x07,0x05,0x03,0x01,0x0e,0x0c,0x0a,0x08,0x06,0x04,0x02,0x0f];

const WOZ_SIG1 = 0x315A4F57;
const WOZ_SIG2 = 0x325A4F57;
const CHUNK_INFO = 0x4F464E49;
const CHUNK_TMAP = 0x50414D54;
const CHUNK_TRKS = 0x534B5254;

function u16le(a, o) { return a[o] | (a[o+1] << 8); }
function u32le(a, o) { return (a[o]) | (a[o+1] << 8) | (a[o+2] << 16) | (a[o+3] << 24); }
function fourcc(a, o) { return String.fromCharCode(a[o], a[o+1], a[o+2], a[o+3]); }

// [DIAG] lightweight ring-buffer so we can dump the last N select() ops
// and read_byte() results without flooding the console.
const _diagLog = [];
const _diagMax = 2000;
function _diagPush(s) { if(_diagLog.length >= _diagMax) _diagLog.shift(); _diagLog.push(s); }
// Call window.__floppyDiag() in the console to see the log at any time.  [DIAG]
if(typeof window !== 'undefined') {                                        //[DIAG]
    window.__floppyDiag = () => {                                          //[DIAG]
        console.log("=== floppy diag dump ===");                          //[DIAG]
        _diagLog.forEach(s => console.log(s));                            //[DIAG]
        console.log("=== end diag dump ===");                             //[DIAG]
    };                                                                     //[DIAG]
}                                                                          //[DIAG]

class BaseMedium {
    constructor() { this.head_pos = 0; this.byte_pos = 0; }
    set_head_pos(pos) { this.head_pos = pos; }
    reset_rotation() { this.byte_pos = 0; }
    read_byte() { return 0; }
}

class DskMedium extends BaseMedium {
    constructor(name, src, sectorEncoder) {
        super();
        this.name = name;
        this.track_bytes = new Array(35);
        for(let t=0; t<35; t++) {
            let track = [];
            for(let s=0; s<16; s++) track = track.concat(sectorEncoder(src, t, s));
            this.track_bytes[t] = new Uint8Array(track);
        }
    }
    read_byte() {
        const trackIndex = this.head_pos >> 2;
        const track = this.track_bytes[trackIndex];
        if(!track || !track.length) return 0;
        if(this.byte_pos >= track.length) this.byte_pos = 0;
        return track[this.byte_pos++];
    }
}

class WozTrack {
    constructor(bytes, bitCount) {
        this.bytes = bytes;
        this.bitCount = bitCount;
        this.nibble_cache = null;
    }

    getBit(bitPos) {
        if(this.bitCount <= 0) return 0;
        bitPos %= this.bitCount;
        return (this.bytes[bitPos >> 3] & (0x80 >> (bitPos & 7))) ? 1 : 0;
    }

    buildNibbleCache() {
        if(this.nibble_cache) return this.nibble_cache;
        if(!this.bytes || !this.bitCount) {
            this.nibble_cache = new Uint8Array(0);
            return this.nibble_cache;
        }
        const out = [];
        let cur = 0;
        for(let i=0; i<this.bitCount; i++) {
            cur = ((cur << 1) | this.getBit(i)) & 0xFF;
            if(cur & 0x80) { out.push(cur); cur = 0; }
        }
        this.nibble_cache = new Uint8Array(out);
        return this.nibble_cache;
    }
}

class WozMedium extends BaseMedium {
    constructor(name) {
        super();
        this.name = name;
        this.info = null;
        this.tmap = new Uint8Array(160);
        this.tmap.fill(0xFF);
        this.tracks = [];
        this._readCount = 0;   //[DIAG]
        this._prologCount = 0; //[DIAG]
        this._lastThree = [0,0,0]; //[DIAG]
    }

    read_byte() {
        const tmapIndex = this.head_pos;
        const trackId = this.tmap[tmapIndex];
        if(trackId === 0xFF) {
            //[DIAG]
            if(this._readCount < 20) _diagPush(`WozMedium.read_byte: head_pos=${this.head_pos} tmap=0xFF (no track)`);
            this._readCount++;
            return 0;
        }

        const track = this.tracks[trackId];
        if(!track) {
            if(this._readCount < 20) _diagPush(`WozMedium.read_byte: head_pos=${this.head_pos} trackId=${trackId} track=null`); //[DIAG]
            this._readCount++;                                                                                                   //[DIAG]
            return 0;
        }

        const bytes = track.buildNibbleCache();
        if(!bytes.length) {
            if(this._readCount < 20) _diagPush(`WozMedium.read_byte: trackId=${trackId} cache empty`); //[DIAG]
            this._readCount++;                                                                          //[DIAG]
            return 0;
        }
        if(this.byte_pos >= bytes.length) this.byte_pos = 0;
        const val = bytes[this.byte_pos++];

        //[DIAG] — track first 50 reads and watch for D5 AA 96 / D5 AA AD
        this._readCount++;
        if(this._readCount <= 50) {
            _diagPush(`WozMedium read #${this._readCount}: head=${this.head_pos} tid=${trackId} bpos=${this.byte_pos-1} val=0x${val.toString(16).padStart(2,'0')}`);
        }
        this._lastThree = [this._lastThree[1], this._lastThree[2], val]; //[DIAG]
        if(this._lastThree[0]===0xD5 && this._lastThree[1]===0xAA) {    //[DIAG]
            if(this._lastThree[2]===0x96 || this._lastThree[2]===0xAD) { //[DIAG]
                this._prologCount++;                                       //[DIAG]
                if(this._prologCount <= 5) {                               //[DIAG]
                    _diagPush(`*** PROLOGUE D5 AA ${this._lastThree[2].toString(16)} found at read #${this._readCount} (head=${this.head_pos} tid=${trackId} bpos=${this.byte_pos-1})`); //[DIAG]
                }                                                          //[DIAG]
            }                                                              //[DIAG]
        }                                                                  //[DIAG]

        return val;
    }

    static fromWoz(name, bin) {
        const src = (bin instanceof Uint8Array) ? bin : new Uint8Array(bin);
        if(src.length < 12) throw new Error("WOZ too small");

        const sig = u32le(src, 0);
        const isWoz1 = sig === WOZ_SIG1;
        const isWoz2 = sig === WOZ_SIG2;
        if(!isWoz1 && !isWoz2) throw new Error("invalid WOZ signature");

        console.log(`[floppy] fromWoz: ${name}, ${isWoz1?'WOZ1':'WOZ2'}, ${src.length} bytes`); //[DIAG]

        const medium = new WozMedium(name);
        let infoOffs=-1, infoSize=0, tmapOffs=-1, tmapSize=0, trksOffs=-1, trksSize=0;

        let p = 12;
        while(p + 8 <= src.length) {
            const id = u32le(src, p);
            const size = u32le(src, p+4);
            const dataOffs = p + 8;
            if(dataOffs + size > src.length) break;
            if(id === CHUNK_INFO)      { infoOffs=dataOffs; infoSize=size; }
            else if(id === CHUNK_TMAP) { tmapOffs=dataOffs; tmapSize=size; }
            else if(id === CHUNK_TRKS) { trksOffs=dataOffs; trksSize=size; }
            p = dataOffs + size;
        }

        if(infoOffs<0 || tmapOffs<0 || trksOffs<0) throw new Error("WOZ missing INFO/TMAP/TRKS");

        medium.info = {
            version: src[infoOffs+0],
            disk_type: src[infoOffs+1],
            write_protected: src[infoOffs+2] !== 0,
            synchronized: src[infoOffs+3] !== 0,
            cleaned: src[infoOffs+4] !== 0
        };

        if(medium.info.disk_type !== 1) throw new Error("only 5.25 WOZ supported");

        if(tmapSize < 160) throw new Error("invalid TMAP size");
        medium.tmap.set(src.subarray(tmapOffs, tmapOffs+160));

        let trackCount = 0; //[DIAG]

        if(isWoz1) {
            let q = trksOffs;
            for(let i=0; i<35 && q+6656 <= trksOffs+trksSize; i++, q+=6656) {
                const bytesUsed = u16le(src, q+6646);
                const bitCount  = u16le(src, q+6648);
                if(bytesUsed===0 || bitCount===0) { medium.tracks[i]=null; continue; }
                const bytes = src.slice(q, q+bytesUsed);
                medium.tracks[i] = new WozTrack(bytes, bitCount);
                trackCount++; //[DIAG]
            }
        } else {
            for(let i=0; i<160; i++) {
                const d = trksOffs + (i*8);
                if(d+8 > trksOffs+trksSize) break;
                const startBlock = u16le(src, d+0);
                const blockCount = u16le(src, d+2);
                const bitCount   = u32le(src, d+4);
                if(startBlock===0 || blockCount===0 || bitCount===0) { medium.tracks[i]=null; continue; }
                const byteOffs = startBlock * 512;
                const byteLen  = blockCount * 512;
                if(byteOffs+byteLen > src.length) { medium.tracks[i]=null; continue; }
                const bytesUsed = (bitCount+7) >> 3;
                medium.tracks[i] = new WozTrack(src.slice(byteOffs, byteOffs+bytesUsed), bitCount);
                trackCount++; //[DIAG]
            }
        }

        console.log(`[floppy] fromWoz: parsed ${trackCount} tracks, tmap[0]=${medium.tmap[0]}`); //[DIAG]

        // [DIAG] pre-build track 0 cache and report prologue count
        if(medium.tracks[0]) {                                                  //[DIAG]
            const c = medium.tracks[0].buildNibbleCache();                      //[DIAG]
            let ap=0, dp=0;                                                     //[DIAG]
            for(let i=0;i<c.length-2;i++) {                                    //[DIAG]
                if(c[i]===0xD5&&c[i+1]===0xAA) {                              //[DIAG]
                    if(c[i+2]===0x96) ap++;                                    //[DIAG]
                    else if(c[i+2]===0xAD) dp++;                               //[DIAG]
                }                                                               //[DIAG]
            }                                                                   //[DIAG]
            console.log(`[floppy] track 0 cache: ${c.length} nibbles, ${ap} addr prologues, ${dp} data prologues`); //[DIAG]
            console.log(`[floppy] track 0 first 8 nibbles: ${Array.from(c.slice(0,8)).map(x=>x.toString(16).padStart(2,'0')).join(' ')}`); //[DIAG]
        }                                                                       //[DIAG]

        return medium;
    }
}

class Disk {
    constructor(num, led_cb) {
        this.num = num;
        this.led_cb = led_cb;
        this.name = "";
        this.write_protect = false;
        this.phase_num_last = 0;
        this.head_pos = 0;
        this.motor_on = false;
        this.medium = null;
    }

    read() {
        if(!this.medium) return 0;
        this.medium.set_head_pos(this.head_pos);
        return this.medium.read_byte();
    }

    set_phase(phase_num) {
        const delta = phase_num - this.phase_num_last;
        this.phase_num_last = phase_num;
        let step = (delta < -2) ? 1 : ((delta > 2) ? -1 : delta);
        this.head_pos += step * 2;
        if(this.head_pos < 0) this.head_pos = 0;
        else if(this.head_pos > 139) this.head_pos = 139;
        if(this.medium) this.medium.set_head_pos(this.head_pos);
    }

    set_led(state) {
        this.motor_on = state != 0;
        this.led_cb(this.num, this.motor_on);
    }

    mount_medium(name, medium) {
        this.name = name;
        this.medium = medium;
        this.write_protect = medium && medium.info ? !!medium.info.write_protected : false;
        if(this.medium) {
            this.medium.set_head_pos(this.head_pos);
            this.medium.reset_rotation();
        }
        console.log(`[floppy] disk ${this.num} mount: "${name}" head_pos=${this.head_pos}`); //[DIAG]
    }

    reset() {
        this.motor_on = false;
        this.phase_num_last = 0;
        this.head_pos = 0;
        if(this.medium) {
            this.medium.set_head_pos(this.head_pos);
            this.medium.reset_rotation();
        }
        this.led_cb(this.num, false);
        console.log(`[floppy] disk ${this.num} reset, medium=${this.medium?this.medium.name:'none'}`); //[DIAG]
    }
}

export class Floppy525 {
    constructor(slot, memory, led_cb) {
        this._slot = (slot & 0x07);
        this._mem = memory;
        this._led_cb = led_cb;
        this._addr_sel = 0xc080 | (this._slot << 4);
        this._addr_io  = 0xc000 | (this._slot << 8);
        this._write_disk = false;
        this._selectLog = 0; //[DIAG]

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));

        this._disks = [new Disk(0, led_cb), new Disk(1, led_cb)];
        this._active_disk = this._disks[0];

        console.log(`[floppy] Floppy525 constructed: slot=${slot} addr_sel=0x${this._addr_sel.toString(16)} addr_io=0x${this._addr_io.toString(16)}`); //[DIAG]
    }

    read(addr) {
        if((addr & 0xf800) != 0xc000) return undefined;

        if((addr & 0xfff0) == this._addr_sel) {
            const op = addr & 0x000f;
            //[DIAG] log first 30 select calls to confirm hook is firing
            if(this._selectLog < 30) {
                _diagPush(`select read: addr=0x${addr.toString(16)} op=0x${op.toString(16)}`);
                this._selectLog++;
                if(this._selectLog === 30) _diagPush('(select logging capped at 30; call window.__floppyDiag() to see)');
            }
            return this.select(op, false);
        }

        if((addr & 0xff00) == this._addr_io) {
            return disk16_p5_rom_341_0027[addr & 0xff];
        }

        return undefined;
    }

    write(addr, val) {
        if((addr & 0xf800) != 0xc000) return undefined;
        if((addr & 0xfff0) == this._addr_sel) return this.select(addr & 0x000f, true);
        if((addr & 0xff00) == this._addr_io)  return 0;
        return undefined;
    }

    select(op, io_write) {
        switch(op) {
            case 0x08:
                this._disks[0].set_led(false);
                this._disks[1].set_led(false);
                break;
            case 0x09:
                this._active_disk.set_led(true);
                break;
            case 0x0a:
                this._disks[1].set_led(false);
                this._active_disk = this._disks[0];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;
            case 0x0b:
                this._disks[0].set_led(false);
                this._active_disk = this._disks[1];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;
            case 0x0c:
                if(!io_write) return this._active_disk.read();
                break;
            case 0x0d:
                break;
            case 0x0e:
            case 0x0f:
                this._write_disk = (op & 0x01) != 0;
                break;
            default:
                if(op & 0x01) this._active_disk.set_phase((op >> 1) & 0x03);
                break;
        }
        return 0;
    }

    load_disk(num, name, bin) {
        console.log(`[floppy] load_disk ${num+1}: ${name}, ${bin.byteLength} bytes`); //[DIAG]
        if(bin.byteLength != 143360) {
            console.log(`[floppy] error: invalid disk image size ${bin.byteLength}`);
            return false;
        }
        const src = new Uint8Array(bin);
        const medium = new DskMedium(name, src, this.sector_62encode.bind(this));
        this._disks[num].mount_medium(name, medium);
        return true;
    }

    load_woz(num, name, bin) {
        console.log(`[floppy] load_woz ${num+1}: ${name}`); //[DIAG]
        try {
            const medium = WozMedium.fromWoz(name, bin);
            this._disks[num].mount_medium(name, medium);
            return true;
        } catch(err) {
            console.log("[floppy] error loading WOZ:", err.message);
            return false;
        }
    }

    load_image(num, name, bin) {
        // Accept ArrayBuffer or Uint8Array from the caller.
        const sigBytes = (bin instanceof Uint8Array) ? bin : new Uint8Array(bin);

        const sig = (sigBytes.length >= 4)
            ? (sigBytes[0] | (sigBytes[1] << 8) | (sigBytes[2] << 16) | (sigBytes[3] << 24))
            : 0;

        console.log(`[floppy] load_image: "${name}", byteLength=${bin.byteLength ?? bin.length}, sig=0x${(sig>>>0).toString(16)}, isWoz=${sig===WOZ_SIG1||sig===WOZ_SIG2}`); //[DIAG]

        if(sig === WOZ_SIG1 || sig === WOZ_SIG2) return this.load_woz(num, name, bin);
        return this.load_disk(num, name, bin);
    }

    sector_62encode(src, trk, sec_ni) {
        let res = [0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc];
        const vol = 0xfe;
        const sec = sec_int[sec_ni];
        const csum = vol ^ trk ^ sec;
        res = res.concat([0xd5,0xaa,0x96]);
        res = res.concat([(vol>>1)|0xaa, vol|0xaa]);
        res = res.concat([(trk>>1)|0xaa, trk|0xaa]);
        res = res.concat([(sec>>1)|0xaa, sec|0xaa]);
        res = res.concat([(csum>>1)|0xaa, csum|0xaa]);
        res = res.concat([0xde,0xaa,0xeb]);
        res = res.concat([0xff,0x3f,0xcf,0xf3,0xfc,0xff,0x3f,0xcf,0xf3,0xfc]);
        res = res.concat([0xd5,0xaa,0xad]);
        const data62 = [];
        const offs = (trk << 12) | (sec_ni << 8);
        for(let i=255, i2=83; i>=0; i--, i2=i%86) {
            const val = src[i + offs];
            data62[i+86] = val >> 2;
            data62[i2] = (data62[i2] << 2) | ((val & 0x01) << 1) | ((val & 0x02) >> 1);
        }
        let last_val = 0;
        for(let i=0; i<342; i++) {
            const val = data62[i];
            res.push(write_62[val ^ last_val]);
            last_val = val;
        }
        res.push(write_62[last_val]);
        res = res.concat([0xde,0xaa,0xeb]);
        return res;
    }

    reset() {
        console.log("[floppy] Floppy525.reset()"); //[DIAG]
        this._disks[0].reset();
        this._disks[1].reset();
        this._active_disk = this._disks[0];
        this._write_disk = false;
    }
}