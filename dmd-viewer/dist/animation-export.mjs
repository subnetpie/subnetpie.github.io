// Portable, versioned animation packs: manifest + indexed DMD pixels + exact PCM.
const encode=new TextEncoder(),decode=new TextDecoder();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0;}
async function gzip(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
async function gunzip(bytes){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
function zip(entries){
 const local=[],central=[];let offset=0;
 for(const {name,data} of entries){
  const path=encode.encode(name),crc=crc32(data),header=new Uint8Array(30+path.length),v=new DataView(header.buffer);
  if(offset+data.length+header.length>=0xffffffff)throw Error('Pack exceeds ZIP size limits. Export individual animations instead.');
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);header.set(path,30);local.push(header,data);
  const directory=new Uint8Array(46+path.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,path.length,true);d.setUint32(42,offset,true);directory.set(path,46);central.push(directory);offset+=header.length+data.length;
 }
 if(entries.length>=65535)throw Error('Too many files for one pack. Export individual animations instead.');
 const directorySize=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
 return new Blob([...local,...central,end],{type:'application/zip'});
}
function join(parts,size){const out=new Uint8Array(size);let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out;}
export async function createAnimationPack({game,clips,onProgress=()=>{}}){
 const manifest={format:'dmd-animation-pack',version:1,game,createdAt:new Date().toISOString(),timeUnit:'milliseconds',framesEncoding:'uint8 indexed pixels',audioEncoding:'float32-le interleaved PCM',animations:[]},files=[];
 let index=0;
 for await(const clip of clips){
  if(!clip?.frames?.length)throw Error('An animation has no recorded frames.');
  const directory='animations/'+String(++index).padStart(4,'0'),palettes=[],paletteIds=new Map(),frames=[],pixels=[];let pixelOffset=0;
  for(const frame of clip.frames){
   const key=JSON.stringify(frame.colors||null);let palette=paletteIds.get(key);if(palette===undefined){palette=palettes.length;palettes.push(frame.colors||null);paletteIds.set(key,palette)}
   frames.push({time:frame.time-clip.start,w:frame.w,h:frame.h,levels:frame.levels,palette,offset:pixelOffset,length:frame.data.length});pixels.push(frame.data);pixelOffset+=frame.data.length;
  }
  const audio=[],pcm=[];let audioOffset=0;
  for(const packet of clip.audio||[]){
   const bytes=new Uint8Array(packet.data.length*4),view=new DataView(bytes.buffer);for(let n=0;n<packet.data.length;n++)view.setFloat32(n*4,packet.data[n],true);
   audio.push({start:packet.start-clip.start,end:packet.start-clip.start+packet.data.length/packet.channels/packet.rate*1000,channels:packet.channels,rate:packet.rate,offset:audioOffset,length:bytes.length});pcm.push(bytes);audioOffset+=bytes.length;
  }
  const frameFile=directory+'/frames.u8.gz',audioFile=directory+'/audio.f32le.gz';
  files.push({name:frameFile,data:await gzip(join(pixels,pixelOffset))},{name:audioFile,data:await gzip(join(pcm,audioOffset))});
  manifest.animations.push({id:clip.id,label:clip.label,key:clip.key??null,sourceGame:clip.game||game,duration:clip.duration??clip.end-clip.start,switches:[...(clip.switches||[])],truncated:!!clip.truncated,palettes,frameFile,audioFile,frames,audio});
  onProgress(index);
 }
 if(!manifest.animations.length)throw Error('No learned animations to export yet.');
 files.unshift({name:'manifest.json',data:encode.encode(JSON.stringify(manifest,null,2))},{name:'README.txt',data:encode.encode('DMD Animation Pack v1\n\nSend this ZIP back to include the learned animations in DMD Viewer.\nmanifest.json contains labels, game identity, switch triggers, frame times, palettes, and audio timing. Each animation has gzip-compressed indexed pixels and exact float32 little-endian interleaved PCM audio. Offsets and lengths are bytes; all times are relative milliseconds. Frame data is row-major. No ROM or PAC source files are included.\n')});
 return {blob:zip(files),manifest,filename:(game||'dmd').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')+'-animations-'+new Date().toISOString().slice(0,10)+'.zip'};
}
// Used for validation and for loading exported packs into a future built-in library.
export async function readAnimationPack(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer),files=new Map();let at=0;
 while(at+30<=bytes.length&&v.getUint32(at,true)===0x04034b50){
  const size=v.getUint32(at+18,true),length=v.getUint16(at+26,true),extra=v.getUint16(at+28,true),start=at+30+length+extra;
  if(v.getUint16(at+8,true)!==0||start+size>bytes.length)throw Error('Unsupported or truncated animation pack');
  const name=decode.decode(bytes.subarray(at+30,at+30+length)),data=bytes.subarray(start,start+size);if(crc32(data)!==v.getUint32(at+14,true))throw Error('Animation pack checksum failed');files.set(name,data);at=start+size;
 }
 if(!files.has('manifest.json'))throw Error('Missing animation manifest');
 const manifest=JSON.parse(decode.decode(files.get('manifest.json')));if(manifest.format!=='dmd-animation-pack'||manifest.version!==1)throw Error('Unsupported animation pack version');
 const clips=[];
 for(const item of manifest.animations){
  if(!files.has(item.frameFile)||!files.has(item.audioFile))throw Error('Missing animation data');
  const pixels=await gunzip(files.get(item.frameFile)),pcm=await gunzip(files.get(item.audioFile)),view=new DataView(pcm.buffer,pcm.byteOffset,pcm.byteLength);
  const frames=item.frames.map(f=>{if(f.offset<0||f.offset+f.length>pixels.length||f.length!==f.w*f.h)throw Error('Invalid DMD frame range');return {...f,data:pixels.slice(f.offset,f.offset+f.length),colors:item.palettes[f.palette]};});
  const audio=item.audio.map(a=>{if(a.offset<0||a.length%4||a.offset+a.length>pcm.length)throw Error('Invalid PCM audio range');const data=new Float32Array(a.length/4);for(let i=0;i<data.length;i++)data[i]=view.getFloat32(a.offset+i*4,true);return {...a,data};});
  clips.push({...item,start:0,end:item.duration,frames,audio});
 }
 return {manifest,clips};
}
