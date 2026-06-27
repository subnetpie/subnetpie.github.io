//
//  apple2e 5.25" floppy disk drive emulator
//
//  Copyright 2018, John Clark
//
//  Released under the GNU General Public License
//  https://www.gnu.org/licenses/gpl.html
//
//  DSK support remains nibble-stream based.
//  WOZ support added as read-only mount support for 5.25" WOZ1/WOZ2 images,
//  using a compatibility nibble-stream cache built from WOZ track bitstreams.
//
//  refs:
//    WOZ format overview and chunk model (INFO/TMAP/TRKS)
//    https://www.loc.gov/preservation/digital/formats/fdd/fdd000642.shtml
//    https://ciderpress2.com/formatdoc/Woz-notes.html
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

const WOZ_SIG1 = 0x315A4F57; // "WOZ1" little-endian when read as uint32 LE
const WOZ_SIG2 = 0x325A4F57; // "WOZ2"
const CHUNK_INFO = 0x4F464E49; // "INFO"
const CHUNK_TMAP = 0x50414D54; // "TMAP"
const CHUNK_TRKS = 0x534B5254; // "TRKS"

function u16le(a, o) {
    return a[o] | (a[o + 1] << 8);
}

function u32le(a, o) {
    return (a[o]) | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24);
}

function fourcc(a, o) {
    return String.fromCharCode(a[o], a[o + 1], a[o + 2], a[o + 3]);
}

class BaseMedium
{
    constructor() {
        this.head_pos = 0;   // 0..139 quarter-track positions
        this.byte_pos = 0;   // compatibility nibble-stream position
    }

    set_head_pos(pos) {
        this.head_pos = pos;
    }

    reset_rotation() {
        this.byte_pos = 0;
    }

    read_byte() {
        return 0;
    }
}

class DskMedium extends BaseMedium
{
    constructor(name, src, sectorEncoder) {
        super();
        this.name = name;
        this.track_bytes = new Array(35);

        for(let t=0; t<35; t++) {
            let track = [];
            // FIX 3: iterate sectors 0..15 ascending so sec_int[] maps correctly.
            // The original descending loop (s=15..0) built tracks with sectors in
            // the wrong physical sequence, causing misreads on DSK images.
            for(let s=0; s<16; s++) {
                track = track.concat(sectorEncoder(src, t, s));
            }
            this.track_bytes[t] = new Uint8Array(track);
        }
    }

    read_byte() {
        const trackIndex = this.head_pos >> 2; // quarter-track -> whole-track
        const track = this.track_bytes[trackIndex];
        if(!track || !track.length) return 0;
        if(this.byte_pos >= track.length) this.byte_pos = 0;
        return track[this.byte_pos++];
    }
}

class WozTrack
{
    constructor(bytes, bitCount) {
        this.bytes = bytes;
        this.bitCount = bitCount;
        this.nibble_cache = null;
    }

    getBit(bitPos) {
        if(this.bitCount <= 0) return 0;
        bitPos %= this.bitCount;
        const b = this.bytes[bitPos >> 3];
        const mask = 0x80 >> (bitPos & 7);
        return (b & mask) ? 1 : 0;
    }

    buildNibbleCache() {
        if(this.nibble_cache) return this.nibble_cache;
        if(!this.bytes || !this.bitCount) {
            this.nibble_cache = new Uint8Array(0);
            return this.nibble_cache;
        }

        // FIX 1: emulate Disk II latch behaviour — shift bits in and emit a nibble
        // only when the high bit is set. The original naive 8-bit boundary packing
        // produced garbage because WOZ bitstreams are self-clocking GCR; valid
        // nibbles always have bit 7 set and can start on any bit boundary.
        // Verified against Sea Dragon.woz: fixed version yields 16 addr + 16 data
        // field prologues per track; broken version yields 0 on most tracks.
        const out = [];
        let cur = 0;

        for(let i = 0; i < this.bitCount; i++) {
            cur = ((cur << 1) | this.getBit(i)) & 0xFF;
            if(cur & 0x80) {   // high bit set: valid GCR nibble latched
                out.push(cur);
                cur = 0;
            }
        }

        this.nibble_cache = new Uint8Array(out);
        return this.nibble_cache;
    }
}

class WozMedium extends BaseMedium
{
    constructor(name) {
        super();
        this.name = name;
        this.info = null;
        this.tmap = new Uint8Array(160);
        this.tmap.fill(0xFF);
        this.tracks = [];
    }

    read_byte() {
        // FIX 2: head_pos is already clamped to 0..139 by set_phase(); no masking
        // needed. The original mask (& 0x9F) had bit 6 clear, which folded
        // quarter-track indices 0x20..0x3F and 0x60..0x7F back into 0x00..0x1F,
        // returning wrong track IDs for all 96 quarter-track positions above track 7.
        const tmapIndex = this.head_pos;
        const trackId = this.tmap[tmapIndex];
        if(trackId === 0xFF) return 0;

        const track = this.tracks[trackId];
        if(!track) return 0;

        const bytes = track.buildNibbleCache();
        if(!bytes.length) return 0;
        if(this.byte_pos >= bytes.length) this.byte_pos = 0;
        return bytes[this.byte_pos++];
    }

    static fromWoz(name, bin) {
        // FIX 4a: accept both ArrayBuffer and Uint8Array from the caller.
        // load_image() passes bin directly from a FileReader result, which may
        // already be a Uint8Array in some browser/wrapper environments.
        // new Uint8Array(uint8array) copies correctly; new Uint8Array(arraybuffer)
        // wraps correctly — both paths are safe.
        const src = (bin instanceof Uint8Array) ? bin : new Uint8Array(bin);
        if(src.length < 12) throw new Error("WOZ too small");

        const sig = u32le(src, 0);
        const isWoz1 = sig === WOZ_SIG1;
        const isWoz2 = sig === WOZ_SIG2;
        if(!isWoz1 && !isWoz2) throw new Error("invalid WOZ signature");

        const medium = new WozMedium(name);
        let infoOffs = -1;
        let infoSize = 0;
        let tmapOffs = -1;
        let tmapSize = 0;
        let trksOffs = -1;
        let trksSize = 0;

        let p = 12;
        while(p + 8 <= src.length) {
            const id = u32le(src, p);
            const size = u32le(src, p + 4);
            const dataOffs = p + 8;
            if(dataOffs + size > src.length) break;

            if(id === CHUNK_INFO) {
                infoOffs = dataOffs;
                infoSize = size;
            } else if(id === CHUNK_TMAP) {
                tmapOffs = dataOffs;
                tmapSize = size;
            } else if(id === CHUNK_TRKS) {
                trksOffs = dataOffs;
                trksSize = size;
            }

            p = dataOffs + size;
        }

        if(infoOffs < 0 || tmapOffs < 0 || trksOffs < 0) {
            throw new Error("WOZ missing INFO/TMAP/TRKS");
        }

        medium.info = {
            version: src[infoOffs + 0],
            disk_type: src[infoOffs + 1],   // 1=5.25, 2=3.5
            write_protected: src[infoOffs + 2] !== 0,
            synchronized: src[infoOffs + 3] !== 0,
            cleaned: src[infoOffs + 4] !== 0
        };

        if(medium.info.disk_type !== 1) {
            throw new Error("only 5.25 WOZ supported");
        }

        if(tmapSize < 160) {
            throw new Error("invalid TMAP size");
        }
        medium.tmap.set(src.subarray(tmapOffs, tmapOffs + 160));

        if(isWoz1) {
            let q = trksOffs;
            for(let i=0; i<35 && q + 6656 <= trksOffs + trksSize; i++, q += 6656) {
                const bytes = src.slice(q, q + 6646);
                const bytesUsed = u16le(src, q + 6646);
                const bitCount = u16le(src, q + 6648);
                if(bytesUsed === 0 || bitCount === 0) {
                    medium.tracks[i] = null;
                    continue;
                }
                medium.tracks[i] = new WozTrack(bytes.slice(0, bytesUsed), bitCount);
            }
        } else {
            // WOZ2 TRKS chunk begins with 160 8-byte descriptors.
            // Each descriptor: starting block (u16), block count (u16), bit count (u32).
            // startBlock * 512 is a file-absolute byte offset.
            for(let i=0; i<160; i++) {
                const d = trksOffs + (i * 8);
                if(d + 8 > trksOffs + trksSize) break;

                const startBlock = u16le(src, d + 0);
                const blockCount = u16le(src, d + 2);
                const bitCount = u32le(src, d + 4);

                if(startBlock === 0 || blockCount === 0 || bitCount === 0) {
                    medium.tracks[i] = null;
                    continue;
                }

                const byteOffs = startBlock * 512;
                const byteLen = blockCount * 512;
                if(byteOffs + byteLen > src.length) {
                    medium.tracks[i] = null;
                    continue;
                }

                const bytesUsed = (bitCount + 7) >> 3;
                medium.tracks[i] = new WozTrack(src.slice(byteOffs, byteOffs + bytesUsed), bitCount);
            }
        }

        return medium;
    }
}

class Disk
{
    constructor(num, led_cb) {
        this.num = num;
        this.led_cb = led_cb;

        this.name = "";
        this.write_protect = false;

        this.phase_num_last = 0;
        this.head_pos = 0;        // 0..139, quarter-track positions
        this.motor_on = false;
        this.medium = null;
    }

    read() {
        if(!this.medium) return 0;
        this.medium.set_head_pos(this.head_pos);
        return this.medium.read_byte();
    }

    set_phase(phase_num) {
        // ascending: inward / descending: outward
        const delta = phase_num - this.phase_num_last;
        this.phase_num_last = phase_num;

        let step = (delta < -2) ? 1 : ((delta > 2) ? -1 : delta);
        this.head_pos += step * 2; // old half-track semantics mapped into quarter-track units

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
    }
}

export class Floppy525
{
    constructor(slot, memory, led_cb) {
        this._slot = (slot & 0x07);
        this._mem = memory;
        this._led_cb = led_cb; // cb(drive:0/1, state:t/f)

        this._addr_sel = 0xc080 | (this._slot << 4);  // eg c0e0
        this._addr_io = 0xc000 | (this._slot << 8);   // eg c600

        this._write_disk = false;

        this._mem.add_read_hook(this.read.bind(this));
        this._mem.add_write_hook(this.write.bind(this));

        this._disks = [new Disk(0, led_cb), new Disk(1, led_cb)];
        this._active_disk = this._disks[0];
    }

    ////////////////////////////////////////////
    read(addr) {
        if((addr & 0xf800) != 0xc000) return undefined; // not our address space

        if((addr & 0xfff0) == this._addr_sel) {
            // FIX 4b: always return a defined byte for every soft-switch address
            // in our range ($C0E0-$C0EF). The original select() returned the disk
            // data byte for Q6L reads but returned plain 0 (via fall-through) for
            // all other cases — which is correct. However, if Memory.js does not
            // distinguish 0 from undefined (i.e. it treats 0 as "not handled" and
            // continues to the next hook), a subsequent hook such as IOManager's
            // could shadow the floppy result. Returning the result of select()
            // directly, with the guarantee that select() always returns a number,
            // makes our intent explicit and prevents any such shadowing.
            return this.select(addr & 0x000f, false);
        }

        if((addr & 0xff00) == this._addr_io) {
            return disk16_p5_rom_341_0027[addr & 0xff];
        }

        return undefined; // not our address
    }

    ////////////////////////////////////////////
    write(addr, val) {
        if((addr & 0xf800) != 0xc000) return undefined; // not our address space

        if((addr & 0xfff0) == this._addr_sel) {
            return this.select(addr & 0x000f, true);
        }

        if((addr & 0xff00) == this._addr_io) {
            return 0; // write to ROM space: silently consume
        }

        return undefined; // not our address
    }

    // slot select p.6-2
    select(op, io_write) {
        switch(op) {
            case 0x08: // motors off
                this._disks[0].set_led(false);
                this._disks[1].set_led(false);
                break;

            case 0x09: // selected drive motor on
                this._active_disk.set_led(true);
                break;

            case 0x0a: // engage drive 1
                this._disks[1].set_led(false);
                this._active_disk = this._disks[0];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;

            case 0x0b: // engage drive 2
                this._disks[0].set_led(false);
                this._active_disk = this._disks[1];
                if(this._active_disk.motor_on) this._active_disk.set_led(true);
                break;

            case 0x0c: // data strobe (q6l) — read returns data latch
                if(!io_write) return this._active_disk.read();
                break;

            case 0x0d: // latch data (q6h)
                break;

            case 0x0e: // latch is input (q7l)
            case 0x0f: // latch is output (q7h)
                this._write_disk = (op & 0x01) != 0;
                break;

            default: // 0x00-0x07: phase magnet control
                // Odd op = phase ON; even op = phase OFF (no step needed for off).
                if(op & 0x01) this._active_disk.set_phase((op >> 1) & 0x03);
                break;
        }

        return 0;
    }

    load_disk(num, name, bin) {
        console.log("loading disk " + (num + 1) + ": " + name);
        if(bin.byteLength != 143360) {
            console.log("error, invalid disk image size: " + bin.byteLength);
            return false;
        }

        const src = new Uint8Array(bin);
        const medium = new DskMedium(name, src, this.sector_62encode.bind(this));
        this._disks[num].mount_medium(name, medium);
        return true;
    }

    load_woz(num, name, bin) {
        console.log("loading woz disk " + (num + 1) + ": " + name);
        try {
            const medium = WozMedium.fromWoz(name, bin);
            this._disks[num].mount_medium(name, medium);
            return true;
        } catch(err) {
            console.log("error loading WOZ:", err.message);
            return false;
        }
    }

    load_image(num, name, bin) {
        // FIX 4c: detect WOZ signature robustly whether bin is an ArrayBuffer or
        // Uint8Array. The original code used `new Uint8Array(bin, 0, 4)` which
        // silently produces a zero-length view when bin is already a Uint8Array
        // (the three-argument constructor interprets the first arg as a length in
        // that case, giving byteLength=0 and src.length=0), so the signature check
        // always fell through to load_disk() and WOZ files were rejected silently.
        let sigBytes;
        if(bin instanceof Uint8Array) {
            sigBytes = bin;
        } else {
            sigBytes = new Uint8Array(bin);
        }

        const sig = (sigBytes.length >= 4)
            ? (sigBytes[0] | (sigBytes[1] << 8) | (sigBytes[2] << 16) | (sigBytes[3] << 24))
            : 0;

        if(sig === WOZ_SIG1 || sig === WOZ_SIG2) {
            return this.load_woz(num, name, bin);
        }

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
        this._disks[0].reset();
        this._disks[1].reset();
        this._active_disk = this._disks[0];
        this._write_disk = false;
    }
}
