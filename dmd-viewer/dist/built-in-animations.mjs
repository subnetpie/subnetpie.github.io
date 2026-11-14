import {decodeAnimationFiles} from './animation-export.mjs?v=builtin-1';
const root=new URL('./library/learned/popeye/',import.meta.url);
export async function builtInCatalog(game){
 if(game!=='pop_lx5.zip:popeye.pac')return [];
 const response=await fetch(new URL('catalog.json',root));if(!response.ok)throw Error('Could not load built-in animation list.');
 const catalog=await response.json();if(catalog.format!=='dmd-built-in-catalog'||catalog.version!==1||catalog.game!==game)throw Error('Invalid built-in animation list.');
 return catalog.animations;
}
export async function builtInClip(entry){
 const url=new URL(entry.manifest,root),response=await fetch(url);if(!response.ok)throw Error('Could not load '+entry.label+'.');
 const item=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();if(item.id!==entry.id)throw Error('Built-in animation identity mismatch.');
 const files=await Promise.all([item.frameFile,item.audioFile].map(async name=>{const r=await fetch(new URL(name,url));if(!r.ok)throw Error('Could not load '+entry.label+' frames and sound.');return new Uint8Array(await r.arrayBuffer());}));
 return decodeAnimationFiles(item,...files);
}
