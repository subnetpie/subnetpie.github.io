// PAC authors often store one animation as separately numbered color scenes.
// Only combine a named family when the file contains consecutive part numbers.
export function animationGroups(scenes){
  const candidates=new Map(),groups=new Map();
  for(const scene of scenes){
    const match=/^(.*?[^\d])(\d+)$/.exec(scene.name||'');
    if(!match)continue;
    const name=match[1].replace(/[\s_.-]+$/,'');
    if(!name||/^Scene$/i.test(name))continue;
    const key=scene.w+':'+scene.h+':'+name.toLowerCase();
    if(!candidates.has(key))candidates.set(key,[]);
    candidates.get(key).push({scene,name,part:Number(match[2])});
  }
  for(const [key,parts] of candidates){
    const numbers=[...new Set(parts.map(p=>p.part))].sort((a,b)=>a-b);
    if(!numbers.some((n,i)=>i&&n===numbers[i-1]+1))continue;
    for(const p of parts)groups.set(p.scene,{key,label:p.name,part:p.part});
  }
  return groups;
}
export function joinAnimationParts(scenes){
  const groups=animationGroups(scenes),result=[],joined=new Map();
  for(const scene of scenes){
    const group=groups.get(scene);
    if(!group){result.push(scene);continue}
    let item=joined.get(group.key);
    if(!item){item={...scene,name:group.label,parts:[],frames:[]};joined.set(group.key,item);result.push(item)}
    item.parts.push({scene,part:group.part});
  }
  for(const item of joined.values()){
    item.parts.sort((a,b)=>a.part-b.part);
    // Multiple mappings may reference the same stored part with another palette.
    const seen=new Set();item.frames=item.parts.flatMap(({scene,part})=>{
      const id=part+':'+scene.offset;if(seen.has(id))return [];seen.add(id);
      return scene.frames.map(frame=>({...frame,colors:scene.colors}));
    });
    item.partial=item.parts.some(p=>p.scene.partial);
  }
  return result;
}
