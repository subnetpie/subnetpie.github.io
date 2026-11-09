import {mediaPattern,mimeType} from './pup-format.mjs';
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let bit=0;bit<8;bit++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0});
function crc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
// Read only the directory and configurations initially; inflate media on demand.
export async function openPupZip(file){
  if(file.size<22)return null;
  const start=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(start).arrayBuffer()),tv=new DataView(tail.buffer);let end=-1;
  for(let p=tail.length-22;p>=0;p--){if(tv.getUint32(p,true)===0x06054b50&&p+22+tv.getUint16(p+20,true)===tail.length){end=p;break}}
  if(end<0)return null;
  const count=tv.getUint16(end+10,true),size=tv.getUint32(end+12,true),offset=tv.getUint32(end+16,true);
  if(count===65535||offset===0xffffffff||size===0xffffffff)throw Error('ZIP64 PuP packs: extract the archive and use Add media folder.');
  if(tv.getUint16(end+4,true)||tv.getUint16(end+6,true))throw Error('Split ZIP files are not supported');
  if(count>20000||size>8*1024*1024||offset+size>file.size)throw Error('Invalid or oversized ZIP directory');
  const bytes=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),v=new DataView(bytes.buffer),entries=[];let pos=0;
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('Invalid ZIP directory');
    const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),packed=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
    if(pos+46+n+extra+comment>bytes.length)throw Error('Truncated ZIP entry');
    const path=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+n)).replaceAll('\\','/');pos+=46+n+extra+comment;
    if(!/\.pup$/i.test(path)&&!mediaPattern.test(path))continue;
    if(path.startsWith('__MACOSX/')||path.split('/').some(p=>p.startsWith('.')))continue;
    entries.push({path,name:path.split('/').pop(),size:length,getBlob:async()=>{
      if(flags&1)throw Error('Password-protected PuP ZIP files are not supported');
      if(length>512*1024*1024)throw Error('This ZIP clip exceeds 512 MB. Extract it and use Add media folder.');
      const localBytes=new Uint8Array(await file.slice(local,local+30).arrayBuffer());if(localBytes.length!==30)throw Error('Truncated ZIP local header');const lv=new DataView(localBytes.buffer);if(lv.getUint32(0,true)!==0x04034b50)throw Error('Invalid ZIP local header');
      const begin=local+30+lv.getUint16(26,true)+lv.getUint16(28,true);if(begin+packed>file.size)throw Error('Truncated ZIP media');let blob=file.slice(begin,begin+packed);
      if(method===8){const reader=blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>length){await reader.cancel();throw Error('ZIP entry exceeds declared length')}chunks.push(value)}blob=new Blob(chunks,{type:mimeType(path)})}else if(method!==0)throw Error('Unsupported ZIP compression method '+method);
      const data=new Uint8Array(await blob.arrayBuffer());if(data.length!==length||crc32(data)!==crc)throw Error('ZIP checksum failed: '+path);return new Blob([data],{type:mimeType(path)});
    }});
  }
  const configs=entries.filter(e=>/\.pup$/i.test(e.path));if(!configs.length)return null;
  if(configs.length>3||new Set(configs.map(e=>e.name.toLowerCase())).size!==configs.length)throw Error('This ZIP contains multiple PuP configurations. Open one pack folder at a time.');
  return entries;
}
