export const includedGames=[
  {id:'popeye',title:'Popeye',filename:'Popeye.pac',path:'library/popeye.pac'},
  {id:'terminator-2',title:'Terminator 2',filename:'Terminator 2.pac',path:'library/terminator-2.pac'}
];
export async function fetchIncludedGame(id,{fetcher=fetch}={}){
  const game=includedGames.find(game=>game.id===id);if(!game)throw Error('Choose an included game first.');
  const response=await fetcher(new URL(game.path,import.meta.url),{cache:'no-cache'});
  if(!response.ok)throw Error('Could not download '+game.title+' (HTTP '+response.status+').');
  const bytes=await response.arrayBuffer();if(bytes.byteLength<5||bytes.byteLength>64*1024*1024)throw Error('Invalid included PAC file size.');
  return {game,file:new File([bytes],game.filename,{type:'application/octet-stream'})};
}
