// Read a ZIP in memory. Only display assets are returned; no files are written.
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
export async function extractDmdZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const need=(offset,size)=>{if(offset<0||offset+size>bytes.length)throw Error('Truncated ZIP file')};
  const u16=o=>{need(o,2);return view.getUint16(o,true)},u32=o=>{need(o,4);return view.getUint32(o,true)};
  let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(u32(p)===0x06054b50&&p+22+u16(p+20)===bytes.length){end=p;break}}
  if(end<0)throw Error('Not a supported ZIP file');
  if(u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw Error('Split ZIP archives are not supported');
  const count=u16(end+10);let offset=u32(end+16),totalSize=0;
  if(count===65535||offset===0xffffffff)throw Error('ZIP64 archives are not supported');
  if(count>10000)throw Error('ZIP contains too many entries');
  const entries=[];
  for(let i=0;i<count;i++){
    need(offset,46);if(u32(offset)!==0x02014b50)throw Error('Invalid ZIP directory');
    const flags=u16(offset+8),method=u16(offset+10),crc=u32(offset+16),packed=u32(offset+20),size=u32(offset+24),nameLength=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),local=u32(offset+42);
    need(offset+46,nameLength+extra+comment);
    const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength)).replaceAll('\\','/');
    offset+=46+nameLength+extra+comment;
    if(!/\.(pal|fsq|vni)$/i.test(name)||name.startsWith('__MACOSX/')||name.split('/').some(n=>n.startsWith('.')))continue;
    if(flags&1)throw Error('Password-protected ZIP files are not supported');
    totalSize+=size;if(size>64*1024*1024||totalSize>128*1024*1024)throw Error('ZIP display assets exceed the memory limit');
    entries.push({name,method,crc,packed,size,local});
  }
  if(!entries.length)throw Error('ZIP contains no PAL, FSQ, or VNI display files');
  // Keep a matching pair together. Multiple pairs require explicit selection.
  if(entries.filter(e=>/\.pal$/i.test(e.name)).length>1||entries.filter(e=>/\.(fsq|vni)$/i.test(e.name)).length>1)throw Error('ZIP contains multiple display sets. Extract it and open one matching PAL/FSQ or PAL/VNI pair.');
  const files=[];
  for(const entry of entries){
    const {local,packed,method,size,crc,name}=entry;need(local,30);if(u32(local)!==0x04034b50)throw Error('Invalid ZIP local header');
    const start=local+30+u16(local+26)+u16(local+28);need(start,packed);
    let data=bytes.slice(start,start+packed);
    if(method===8){
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size){await reader.cancel();throw Error('ZIP entry exceeds its declared size')}chunks.push(value)}
      data=new Uint8Array(length);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length}
    }else if(method!==0)throw Error('Unsupported ZIP compression method '+method);
    if(data.length!==size||crc32(data)!==crc)throw Error('ZIP checksum failed for '+name);
    files.push({name:name.split('/').pop(),data});
  }
  return files;
}
