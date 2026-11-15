// Animation identities are scoped to the ROM. Palette suffixes are not new scenes.
// T2's Door4..Door8 static matches are stages of its eight-frame Door Opening scene.
export function animationIdentity(game,key,label){
 const original=String(label||'').trim();let name=original;
 if(game==='t2_l8'){
  name=name.replace(/_(?:UD72|84)$/i,'');
  if(/^Door(?:\s+Opening|[4-8])$/i.test(name))name='Door opening';
 }
 return {key:game+':animation:'+name.replace(/\s+/g,' ').toLowerCase(),label:name||String(key)};
}
