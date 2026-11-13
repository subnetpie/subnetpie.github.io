export const includedGames=[
  {id:'popeye',title:'Popeye',filename:'Popeye.pac',path:'library/popeye.pac',rom:{filename:'pop_lx5.zip',path:'library/pop_lx5.zip',description:'LX5 game ROM and all six L2 sound ROMs'}},
  {id:'terminator-2',title:'Terminator 2',filename:'Terminator 2.pac',path:'library/terminator-2.pac',rom:{filename:'t2_l8.zip',path:'library/t2_l8-complete.zip',description:'L8 game ROM and all three L3 sound ROMs'}}
];
export async function fetchIncludedGame(id,{fetcher=fetch}={}){
  const game=includedGames.find(game=>game.id===id);if(!game)throw Error('Choose an included game first.');
  const response=await fetcher(new URL(game.path,import.meta.url),{cache:'no-cache'});
  if(!response.ok)throw Error('Could not download '+game.title+' (HTTP '+response.status+').');
  const bytes=await response.arrayBuffer();if(bytes.byteLength<5||bytes.byteLength>64*1024*1024)throw Error('Invalid included PAC file size.');
  return {game,file:new File([bytes],game.filename,{type:'application/octet-stream'})};
}

export async function fetchIncludedRomGame(id,{fetcher=fetch}={}){
  const game=includedGames.find(game=>game.id===id);
  if(!game)throw Error('Choose an included game first.');
  if(!game.rom)throw Error(game.romUnavailable);
  const [{file},response]=await Promise.all([fetchIncludedGame(id,{fetcher}),fetcher(new URL(game.rom.path,import.meta.url),{cache:'no-cache'})]);
  if(!response.ok)throw Error('Could not download '+game.title+' ROMs (HTTP '+response.status+').');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<5||bytes.byteLength>64*1024*1024)throw Error('Invalid included ROM ZIP size.');
  return {game,files:[new File([bytes],game.rom.filename,{type:'application/zip'}),file]};
}
