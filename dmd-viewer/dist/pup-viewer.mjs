import {csvRows,configKind,decodePupText,enabled,number,normalizePath,mediaCandidates,mediaPattern,mimeType,screenPosition,rootScreen,actionName,triggerCodes} from './pup-format.mjs';
import {openPupZip} from './pup-zip.mjs';

export function createPupViewer({onMode=()=>{}}={}){
  const $=id=>document.getElementById(id),config={screens:[],playlists:[],triggers:[]},media=new Map(),states=new Map(),counters=new Map(),cooldowns=new Map(),playlistIndices=new Map();
  let selected=null,screenRoot='2',epoch=0,mode='dmd',renderedLayout='';
  const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e};
  const status=text=>{$('pupStatus').textContent=text};
  const files=()=>[...media.values()];
  const candidates=row=>mediaCandidates(files(),row.PlayList,row.PlayFile);
  const playlist=row=>config.playlists.find(p=>normalizePath(p.Folder)===normalizePath(row.PlayList))||{};
  function setMode(value){mode=value;if($('romPanel'))$('romPanel').hidden=value!=='rom';$('romMode')?.setAttribute('aria-pressed',String(value==='rom'));$('dmdWorkspace').hidden=value!=='dmd';$('pupPanel').hidden=value!=='pup';$('dmdMode').setAttribute('aria-pressed',String(value==='dmd'));$('pupMode').setAttribute('aria-pressed',String(value==='pup'));if(value!=='pup')pauseAll();onMode(value)}
  function clean(state){state.token=(state.token||0)+1;if(state.element){state.element.pause?.();state.element.removeAttribute?.('src');state.element.load?.();state.element.remove?.();state.element=null}if(state.url){URL.revokeObjectURL(state.url);state.url=null}}
  function stopAll(){epoch++;for(const state of states.values())clean(state);states.clear();counters.clear();cooldowns.clear();$('pupStage').replaceChildren();renderedLayout='';renderStage();status('All PuP media stopped.')}
  function pauseAll(){for(const state of states.values())state.element?.pause?.()}
  function updateAudio(){for(const state of states.values()){const e=state.element;if(!e||e.tagName==='IMG')continue;e.muted=$('pupMute').checked;e.volume=Math.max(0,Math.min(1,(state.volume??100)/100*number($('pupVolume').value,100)/100));e.playbackRate=number($('pupSpeed').value,1)}}
  function renderStage(){
    const roots=config.screens.filter(s=>screenPosition(s).parent===null);
    $('pupRoot').replaceChildren(...roots.map(s=>new Option(s.ScreenDes+' · '+s.ScreenNum,s.ScreenNum)));
    if(!roots.some(s=>String(s.ScreenNum)===screenRoot))screenRoot=String(roots.find(s=>s.ScreenNum==='2')?.ScreenNum??roots[0]?.ScreenNum??'2');
    $('pupRoot').value=screenRoot;
    $('pupStage').style.aspectRatio=['0','1','5'].includes(screenRoot)?'4 / 1':'16 / 9';
    const signature=JSON.stringify(config.screens);
    if(signature!==renderedLayout){
      $('pupStage').replaceChildren();renderedLayout=signature;
      for(const root of roots){
        const group=node('div',undefined,'pup-root');group.id='pupRoot'+root.ScreenNum;group.dataset.root=root.ScreenNum;$('pupStage').append(group);
        const visible=config.screens.filter(s=>String(rootScreen(s.ScreenNum,config.screens))===String(root.ScreenNum));
        for(const screen of visible){
          const pos=screenPosition(screen),layer=node('div',undefined,'pup-layer');layer.dataset.screen=screen.ScreenNum;layer.id='pupScreen'+screen.ScreenNum;
          Object.assign(layer.style,{left:pos.x+'%',top:pos.y+'%',width:pos.width+'%',height:pos.height+'%',zIndex:pos.parent===null?'0':String(2+visible.indexOf(screen))});
          layer.dataset.baseZ=layer.style.zIndex;
          const label=node('span',screen.ScreenDes+' · '+screen.ScreenNum,'pup-layer-label'),empty=node('div',enabled(screen)?'No media playing':'Screen is off in pack configuration','pup-layer-empty');empty.id='pupEmpty'+screen.ScreenNum;
          layer.append(empty,label);group.append(layer);
        }
      }
      if(!roots.length)$('pupStage').append(node('div','Load screens.pup to preview the layout.','pup-empty'));
    }
    for(const root of roots)$('pupRoot'+root.ScreenNum).hidden=String(root.ScreenNum)!==screenRoot;
    for(const screen of config.screens){const layer=$('pupScreen'+screen.ScreenNum),empty=$('pupEmpty'+screen.ScreenNum),state=states.get(screen.ScreenNum);if(!layer)continue;empty.hidden=!!state?.element;if(state?.element&&!layer.contains(state.element))layer.append(state.element);layer.style.zIndex=state?.overlay?'30':layer.dataset.baseZ}
  }
  function updateMediaList(){
    const chosen=$('pupPlaylist').value;
    const folders=[...new Set([...config.playlists.map(p=>p.Folder),...files().map(f=>String(f.path||f.name).replaceAll('\\','/').split('/').at(-2)).filter(Boolean)])].sort();
    $('pupPlaylist').replaceChildren(new Option('All media',''),...folders.map(f=>new Option(f,f)));if(folders.includes(chosen))$('pupPlaylist').value=chosen;
    const available=$('pupPlaylist').value?mediaCandidates(files(),$('pupPlaylist').value):files();
    $('pupMedia').replaceChildren(...available.map(f=>new Option(f.path||f.name,f.path||f.name)));
    $('pupMediaCount').textContent=media.size+' media files';
  }
  function renderDetails(row){selected=row;$('pupDetails').replaceChildren();if(!row)return;const list=node('dl');for(const [title,value] of [['Event',row.Trigger],['Screen',row.ScreenNum],['Playlist',row.PlayList],['Media',row.PlayFile||'Next item in playlist'],['Action',row.Loop||'normal'],['Priority',row.Priority||playlist(row).Priority||'0'],['Cooldown',row.RestSeconds||playlist(row).RestSeconds||'0'],['Available',String(candidates(row).length)+' matching media file(s)']])list.append(node('dt',title),node('dd',value));$('pupDetails').append(node('strong',row.Descript||'Trigger '+row.ID),list);$('pupEvent').value=triggerCodes(row)[0]||''}
  function renderTriggers(){
    const q=$('pupSearch').value.toLowerCase(),includeOff=$('pupShowDisabled').checked;
    const rows=config.triggers.filter(r=>(includeOff||enabled(r))&&[r.ID,r.Descript,r.Trigger,r.PlayList,r.PlayFile,r.ScreenNum].join(' ').toLowerCase().includes(q));
    $('pupTriggerCount').textContent=rows.length+' / '+config.triggers.length;
    $('pupTriggers').replaceChildren(...rows.map(row=>{
      const button=node('button',undefined,'pup-trigger'+(row===selected?' selected':'')+(!enabled(row)?' disabled-trigger':''));button.type='button';button.setAttribute('aria-pressed',String(row===selected));
      const text=node('span'),name=node('strong',row.Descript||'Trigger '+row.ID),detail=node('small',(row.Trigger||'—')+' · Screen '+row.ScreenNum+' · '+(row.Loop||'normal'));text.append(name,detail);
      const badge=node('span',candidates(row).length?'Ready':'Missing media','pup-media-badge'+(candidates(row).length?' ready':''));button.append(text,badge);button.onclick=()=>{renderDetails(row);renderTriggers()};return button;
    }));
    if(!rows.length)$('pupTriggers').append(node('p',config.triggers.length?'No matching triggers.':'Load triggers.pup to browse events.','pup-empty'));
  }
  function render(){
    $('pupSummary').textContent=config.screens.length+' screens · '+config.playlists.length+' playlists · '+config.triggers.length+' triggers ('+config.triggers.filter(enabled).length+' enabled)';
    renderStage();updateMediaList();renderTriggers();if(selected)renderDetails(selected);
    $('pupMissing').hidden=media.size>0;$('pupMissing').textContent='Configuration loaded; videos, images, and audio are not included. Add the pack’s media folder, select media files, or open its complete ZIP.';
  }
  function chooseFile(row){const options=candidates(row);if(!options.length)return null;if(row.PlayFile)return options[0];const p=playlist(row);if(number(p.AlphaSort)===1)return options[Math.floor(Math.random()*options.length)];const key=normalizePath(row.PlayList),i=playlistIndices.get(key)||0;playlistIndices.set(key,i+1);return options[i%options.length]}
  async function show(row,file,{background=false}={}){
    const key=String(row.ScreenNum),state=states.get(key)||{token:0,queue:[]};states.set(key,state);clean(state);const token=state.token,version=epoch;
    state.current=row;state.volume=number(row.Volume,number(playlist(row).Volume,100));state.priority=number(row.Priority,number(playlist(row).Priority));state.overlay=/pupoverlays|pupalphas/i.test(row.PlayList||'');if(background)state.background={row,file};
    try{
      const blob=file.getBlob?await file.getBlob():file.slice(0,file.size,mimeType(file.name));if(version!==epoch||token!==state.token)return;
      const url=URL.createObjectURL(blob),kind=mimeType(file.name),element=node(kind.startsWith('image/')?'img':kind.startsWith('audio/')?'audio':'video');state.url=url;state.element=element;element.src=url;
      element.title=file.path||file.name;element.className='pup-media';
      if(element.tagName==='IMG')element.alt=row.Descript||file.name;
      else {element.controls=true;element.playsInline=true;element.loop=background||actionName(row)==='loop';element.muted=$('pupMute').checked;element.onended=async()=>{if(token!==state.token||version!==epoch)return;if(state.queue.length){const queued=state.queue.shift();await show(queued.row,queued.file)}else if(state.background){await show(state.background.row,state.background.file,{background:true})}else{clean(state);state.current=null;renderStage()}}}
      element.onerror=()=>{if(token===state.token)status('The browser could not decode '+file.name+'. Use a browser-compatible MP4, WebM, image, or audio format.')};
      renderStage();updateAudio();if(element.play)try{await element.play()}catch{status('Media loaded. Press play on the preview to allow playback in this browser.')}
    }catch(e){renderStage();status(e.message)}
  }
  async function fire(row,{preview=false}={}){
    const action=actionName(row),key=String(row.ScreenNum),state=states.get(key),respect=$('pupRespectRules').checked&&!preview;
    if(!config.screens.some(s=>s.ScreenNum===key)){status('Trigger '+row.ID+' references missing screen '+key);return false}
    if(!['normal','loop','setbg','skipsamepri','skipsamepriority','queuesamep','stopplayer','stopfile',''].includes(action)){status('Action '+row.Loop+' is not implemented in this manual preview.');return false}
    if(action==='stopplayer'||action==='stopfile'){if(state&&(action==='stopplayer'||!row.PlayFile||normalizePath(state.current?.PlayFile)===normalizePath(row.PlayFile))){clean(state);state.current=null;state.queue=[];renderStage()}return true}
    if(!candidates(row).length){status('Missing media: '+(row.PlayList||'')+'/'+(row.PlayFile||'[playlist]')+'. Add the pack’s media folder.');return false}
    const priority=number(row.Priority,number(playlist(row).Priority)),busy=state?.element&&!state.element.ended;
    if(respect){const now=Date.now(),counter=number(row.Counter,1),hits=(counters.get(row.ID)||0)+1;counters.set(row.ID,hits);if(counter>1&&hits%counter!==0){status('Trigger '+row.ID+' counter: '+hits+' / '+counter);return false}const cooldown=number(row.RestSeconds,number(playlist(row).RestSeconds))*1000;if(now-(cooldowns.get(row.ID)||0)<cooldown){status('Trigger '+row.ID+' is cooling down.');return false}if(busy&&(priority<state.priority||((action==='skipsamepri'||action==='skipsamepriority')&&priority===state.priority))){status('Trigger skipped by priority rules.');return false}if(busy&&action==='queuesamep'&&priority===state.priority){state.queue.push({row,file:chooseFile(row)});status('Trigger queued until the current clip ends.');return true}cooldowns.set(row.ID,now)}
    const file=chooseFile(row);screenRoot=String(rootScreen(key,config.screens));await show(row,file,{background:action==='setbg'});return true;
  }
  async function fireEvent(code){const rows=config.triggers.filter(r=>enabled(r)&&triggerCodes(r).some(t=>t===code.toUpperCase()||t===code.toUpperCase()+'=1'));if(!rows.length){status('No enabled trigger matches '+code);return}let played=0;for(const row of rows)if(await fire(row))played++;if(played)status('Fired '+code+' · '+played+' / '+rows.length+' trigger row(s). Volume above 100% is capped in this browser.')}
  async function accept(inputs){
    const remaining=[],entries=[];
    for(const file of inputs){if(/\.zip$/i.test(file.name)){const zip=await openPupZip(file);if(zip){entries.push(...zip);continue}}if(/\.pup$/i.test(file.name)||mediaPattern.test(file.name))entries.push(file);else remaining.push(file)}
    if(!entries.length)return remaining;
    let configs=0;
    for(const entry of entries){if(/\.pup$/i.test(entry.name)){if(entry.size>2*1024*1024)throw Error('PuP configuration exceeds 2 MB');const blob=entry.getBlob?await entry.getBlob():entry;const rows=csvRows(decodePupText(new Uint8Array(await blob.arrayBuffer())));config[configKind(rows)]=rows;configs++}else {const path=entry.path||entry.webkitRelativePath||entry.name;entry.path=path;media.set(normalizePath(path),entry)}}
    if(configs){stopAll();selected=null;playlistIndices.clear()}
    setMode('pup');render();if(!selected&&config.triggers.length){renderDetails(config.triggers.find(enabled)||config.triggers[0]);renderTriggers()}status('Loaded '+configs+' configuration file(s) · '+media.size+' media files. Select a trigger to inspect or preview.');return remaining;
  }
  $('dmdMode').onclick=()=>setMode('dmd');$('pupMode').onclick=()=>setMode('pup');
  $('pupFolder').onclick=()=>$('pupFolderInput').click();$('pupAddMedia').onclick=()=>$('pupMediaInput').click();
  for(const id of ['pupFolderInput','pupMediaInput'])$(id).onchange=async e=>{try{await accept([...e.target.files])}catch(error){status(error.message)}e.target.value=''};
  $('pupSearch').oninput=renderTriggers;$('pupShowDisabled').onchange=renderTriggers;
  $('pupRoot').onchange=()=>{screenRoot=$('pupRoot').value;renderStage()};$('pupPlaylist').onchange=updateMediaList;
  $('pupPreviewTrigger').onclick=async()=>{if(selected)await fire(selected,{preview:true});else status('Load and select a trigger first.')};
  $('pupFireEvent').onclick=()=>fireEvent($('pupEvent').value.trim());
  $('pupPreviewMedia').onclick=async()=>{if(!config.screens.length){status('Load screens.pup before previewing media.');return}const file=files().find(f=>(f.path||f.name)===$('pupMedia').value);if(file)await show({ScreenNum:screenRoot,Descript:file.name,Loop:'normal'},file);else status('Add media files first.')};
  $('pupStart').onclick=async()=>{stopAll();for(const screen of config.screens.filter(s=>enabled(s)&&s.PlayFile)){const row={ScreenNum:screen.ScreenNum,PlayList:screen.PlayList,PlayFile:screen.PlayFile,Descript:screen.ScreenDes,Loop:'SetBG'};const file=chooseFile(row);if(file)await show(row,file,{background:true})}await fireEvent('D0')};
  $('pupClear').onclick=()=>{stopAll();config.screens=[];config.playlists=[];config.triggers=[];media.clear();selected=null;playlistIndices.clear();render();$('pupDetails').textContent='Select a trigger to inspect.';status('Pack cleared. Open another pack’s configuration and media.')};
  $('pupStop').onclick=stopAll;$('pupPause').onclick=pauseAll;$('pupResume').onclick=()=>{for(const state of states.values())state.element?.play?.().catch(()=>status('Press play on the media preview.'))};
  for(const id of ['pupMute','pupVolume','pupSpeed'])$(id).oninput=updateAudio;
  globalThis.addEventListener?.('beforeunload',()=>{for(const state of states.values())clean(state)});
  setMode('dmd');
  return {accept,setMode,config,files,fireEvent};
}
