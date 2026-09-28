// 2IMG format: https://ciderpress2.com/formatdoc/TwoIMG-notes.html
import {unzipSync} from './vendor/fflate.js';
import {parse2MG} from './disk_2mg.js?v=20260927-v0';
export {parse2MG as parse2IMG} from './disk_2mg.js?v=20260927-v0';

const supported = /\.(2mg|2img|po|hdv|dsk|do|woz|nib|rom|bin)$/i;
const bytesOf = value => value instanceof Uint8Array ? value : new Uint8Array(value);
const hasMagic = (data, text) => [...text].every((c,i)=>data[i]===c.charCodeAt(0));
export const isZip = (name, data) => /\.zip$/i.test(name) || hasMagic(bytesOf(data),'PK\x03\x04');

export function readZipEntries(value) {
  let total=0;
  const files=unzipSync(bytesOf(value), {filter(entry) {
    const name=entry.name;
    if(!supported.test(name) || /(^|\/)(__MACOSX|\._[^/]*)(\/|$)/.test(name))return false;
    total+=entry.originalSize;
    if(entry.originalSize>64*1024*1024 || total>128*1024*1024)
      throw new Error('ZIP disk images exceed the 128 MB extraction limit');
    return true;
  }});
  const entries=Object.entries(files).map(([name,data])=>({name,data}));
  entries.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  if(!entries.length)throw new Error('ZIP contains no supported Apple II image');
  return entries;
}

// The same physical sectors appear in reverse logical order (1..14) in
// 16-sector DOS and ProDOS images; sectors 0 and 15 remain in place.
export function prodosToDOS(data) {
  if(data.length!==143360)throw new Error('ProDOS floppy must contain 35 tracks');
  const out=new Uint8Array(data.length);
  for(let track=0;track<35;track++)for(let sector=0;sector<16;sector++) {
    const source=sector===0||sector===15?sector:15-sector;
    const at=track*4096;
    out.set(data.subarray(at+source*256,at+(source+1)*256),at+sector*256);
  }
  return out;
}

export function decodeMedia(name,value) {
  let data=bytesOf(value),format,writeProtected=false,volume=254,physical=null;
  const lower=name.toLowerCase();
  if(hasMagic(data,'2IMG') || /\.(2mg|2img)$/.test(lower)) {
    const parsed=parse2MG(data);
    ({data,format,writeProtected,volume}=parsed);
    // A ProDOS-order 1600-block 2MG is the native 800K IIgs 3.5-inch
    // geometry. Keep using the block shim for sector transfers for now, but
    // preserve the physical-media identity so IWM 35SEL probes see a disk.
    if(format===1 && parsed.blocks===1600) physical='35';
  } else if(/\.(rom|bin)$/.test(lower) && [0x20000,0x40000].includes(data.length)) {
    return {kind:'rom',name,data};
  } else if(hasMagic(data,'WOZ1') || hasMagic(data,'WOZ2')) {
    return {kind:'floppy',format:'woz',name,data,writeProtected:true};
  } else if(/\.woz$/.test(lower))throw new Error('Invalid WOZ signature');
  else if(/\.(rom|bin)$/.test(lower))throw new Error('IIgs ROM must contain 128K or 256K');
  else if(/\.nib$/.test(lower))format=2;
  else if(/\.(dsk|do)$/.test(lower))format=0;
  else if(/\.(po|hdv)$/.test(lower) || data.length!==143360)format=1;
  else format=0;

  if(format===2) {
    if(data.length!==35*6656)throw new Error('NIB image must contain 35 tracks of 6656 bytes');
    return {kind:'floppy',format:'nib',name,data,writeProtected:true};
  }
  if(format===0 || (format===1 && data.length===143360 && !/\.hdv$/.test(lower))) {
    if(data.length!==143360)throw new Error('DOS-order floppy must contain 143360 bytes');
    if(format===1)data=prodosToDOS(data);
    return {kind:'floppy',format:'dsk',name,data,volume,writeProtected:true};
  }
  if(!data.length || data.length%512 || data.length/512>65535)
    throw new Error('Block image must contain 1–65535 blocks of 512 bytes');
  return {kind:'block',name,data,writeProtected,physical};
}

export function mountMedia(board, media, drive=0) {
  let ok;
  if(media.kind==='rom') {
    if(!board.iigsEnabled)throw new Error('IIgs ROM requires IIgs mode');
    board.loadIIgsROM(media.data);
    return true;
  }
  if(media.kind==='block') {
    ok=board.prodosBlock.load_image(media.name,media.data,media);
    if(board.iigsEnabled && board.memory)
      board.memory.floppy35Media=media.physical==='35' ? media : null;
    // A newly mounted block image owns the boot path. Do not leave a prior
    // Disk II image selected/active across the reset that follows loading.
    if(ok && board.floppy525?._disks) {
      for(const d of board.floppy525._disks) if(d) d.medium = null;
      board.floppy525._active_disk = board.floppy525._disks[0];
    }
  } else {
    ok=board.floppy525.load_image(drive,media.name,media.data,media);
    if(board.iigsEnabled && board.memory) board.memory.floppy35Media=null;
  }
  if(!ok)throw new Error('Unable to mount '+media.name);
  // Otherwise slot 7 keeps booting the previously selected hard disk.
  if(media.kind==='floppy')board.prodosBlock.eject();
  return true;
}
