import {Reader,parsePal,parseVni} from './formats.mjs';
import {parsePalMappings,parseFsq} from './fsq.mjs';

async function gunzip(data){
  // PAC AES-CBC uses zero padding. Try the possible 0–15 padding lengths;
  // keep the gzip trailer intact and let the decompressor validate it.
  for(let padding=0;padding<16;padding++){
    if(padding&&data[data.length-padding]!==0)break;
    try{
      const stream=new Blob([data.subarray(0,data.length-padding)]).stream().pipeThrough(new DecompressionStream('gzip'));
      const reader=stream.getReader(),chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64*1024*1024){await reader.cancel();throw Error('PAC decompressed chunk exceeds 64 MB')}chunks.push(value)}
      const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out;
    }catch(e){if(e.message.includes('64 MB'))throw e}
  }
  throw Error('PAC could not be decoded. Check the decoding key.');
}
export async function parsePac(bytes,keyHex){
  const r=new Reader(bytes);if(r.text(4)!=='PAC ')throw Error('Not a PAC file');
  const version=r.u8();if(version!==1&&version!==2)throw Error('Unsupported PAC version '+version);
  keyHex=keyHex.trim();if(!/^[a-fA-F0-9]{32}$/.test(keyHex))throw Error('Enter the 32 hexadecimal character PAC key (vni.key) in Format guide.');
  const rawKey=Uint8Array.from(keyHex.match(/../g),s=>parseInt(s,16));
  const key=await crypto.subtle.importKey('raw',rawKey,'AES-CBC',false,['encrypt','decrypt']);
  let pal=null,animations=null;
  while(r.p<bytes.length){
    const type=r.u16(),length=r.u32();if(![1,2].includes(type)||!length||length%16)throw Error('Invalid PAC chunk');
    let encrypted=r.bytes(length).slice();
    if(version===2){const reverse=b=>{b=((b&0xf0)>>4)|((b&15)<<4);b=((b&0xcc)>>2)|((b&51)<<2);return ((b&170)>>1)|((b&85)<<1)};for(let i=0;i<encrypted.length;i+=4){const word=encrypted.slice(i,i+4);for(let j=0;j<4;j++)encrypted[i+j]=reverse(word[3-j])}}
    // WebCrypto validates PKCS#7. Append one encrypted padding block so the
    // original zero-padded plaintext is preserved during standard decryption.
    const suffix=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:encrypted.slice(-16)},key,new Uint8Array()));
    const padded=new Uint8Array(length+16);padded.set(encrypted);padded.set(suffix,length);
    const decoded=new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:rawKey},key,padded));
    const content=await gunzip(decoded);
    if(type===1)pal=parsePalMappings(content);else animations=content;
  }
  if(!pal)throw Error('PAC contains no palette chunk');
  let scenes=[];
  if(animations){scenes=new TextDecoder().decode(animations.subarray(0,4))==='VPIN'?parseVni(animations):parseFsq(animations,pal)}
  return {version,palettes:pal.palettes,scenes};
}
