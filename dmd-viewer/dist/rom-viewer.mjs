import {playfieldArtwork,artworkPosition} from './color-playfield.mjs?v=color-playfield-1';
import {parsePac} from './pac.mjs';
import {LiveColorizer} from './live-colorizer.mjs';
import {deleteStoredRecordings} from './recording-cleanup.mjs';
import {recipesForGame} from './trigger-recipes.mjs?v=animation-import-1';
import {RecipeEventList} from './recipe-event-list.mjs?v=animation-import-1';
import {SwitchRecipeLearner} from './switch-recipe-learner.mjs?v=switch-learning-1';
import {animationGroups} from './animation-groups.mjs';
import {popeyeSwitchByNumber,popeyeColumnColors} from './popeye-matrix.mjs';
import {t2SwitchByNumber} from './t2-matrix.mjs?v=t2-table-1';
import {popeyeLamps,popeyeHotspots} from './popeye-playfield.mjs?v=flippers-1';
import {t2Lamps,t2Hotspots,t2OtherInputs} from './t2-playfield.mjs';

export class RomAudio {
  constructor(){this.context=null;this.nodes=new Set();this.next=0;this.volume=0.7;this.muted=false;}
  async unlock(){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('This browser does not support Web Audio.');this.context??=new Audio({latencyHint:'interactive'});await this.context.resume();}
  clear(){for(const node of this.nodes){try{node.stop()}catch{}}this.nodes.clear();this.next=0;}
  play({data,channels,rate},scheduled){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||!data.length)return;
    if(scheduled===undefined&&this.next-ctx.currentTime>0.3)this.clear();
    const count=data.length/channels,buffer=ctx.createBuffer(channels,count,rate);
    for(let c=0;c<channels;c++){const out=buffer.getChannelData(c);for(let i=0;i<count;i++)out[i]=data[i*channels+c];}
    const source=ctx.createBufferSource();source.buffer=buffer;
    if(!this.gain){this.gain=ctx.createGain();this.gain.connect(ctx.destination);}this.gain.gain.value=this.muted?0:this.volume;source.connect(this.gain);
    const when=scheduled??Math.max(this.next,ctx.currentTime+0.03);source.start(when);this.next=when+buffer.duration;
    this.nodes.add(source);source.onended=()=>{this.nodes.delete(source);source.disconnect()};
  }
  update(){if(this.gain)this.gain.gain.value=this.muted?0:this.volume;}
}

export function createRomViewer({setMode,onSoundChange=()=>{}}){
  const $=id=>document.getElementById(id),panel=$('romPanel');
  let matrixGame='pop_lx5',currentMatrix=popeyeSwitchByNumber,inputView='table',inputGame='';
  const pressedFlippers=new Set();
  let playfieldGame='pop_lx5',currentLamps=popeyeLamps;
  const matrixCell=number=>{const item=currentMatrix.get(number);return `<button data-popeye-switch="${number}" class="matrix-switch${item.opto?' matrix-opto':''}${item.managed?' matrix-auto':''}${item.unused?' matrix-unused':''}" aria-pressed="false" aria-label="${item.code||number}: ${item.label}${item.opto?', opto':''}${item.managed?', automatic':''}" disabled><strong>${item.code||number}</strong><span>${item.label}</span><small>${item.unused?'UNUSED':number===24?'FIXED':item.managed?'AUTO':item.toggle?'TOGGLE':item.opto?'OPTO':''}</small></button>`};
  const matrixRows=()=>Array.from({length:8},(_,row)=>`<tr><td>${matrixCell(row+1)}</td><th scope="row">${row+1}</th>${Array.from({length:8},(_,col)=>{const n=(col+1)*10+row+1;return `<td class="${currentMatrix.get(n).bank?'matrix-target-bank':''}${n===71&&currentMatrix.get(n).bank?' bank-top':''}${n===75&&currentMatrix.get(n).bank?' bank-bottom':''}">${matrixCell(n)}</td>`}).join('')}${matrixGame==='pop_lx5'?`<td>${matrixCell(111+row)}</td>`:''}</tr>`).join('');
  const playfieldButton=(h,map,game)=>{const sw=map.get(h.number),caption=game==='t2_l8'?(h.number===11?'RIGHT':'LEFT'):sw.managed?'EOS':h.number===112||h.number===116?'RIGHT':'LEFT';return `<button class="${h.extra?'playfield-extra-switch':'playfield-switch'}${h.flipper?' playfield-flipper':''}${h.flipper&&!sw.managed?' playfield-flipper-input':''}" data-playfield-switch="${h.number}" ${h.extra?'':`style="left:${h.x}%;top:${h.y}%"`} aria-label="${sw.code||h.number}: ${sw.label}${sw.managed?', automatic':''}" title="${sw.code||h.number}: ${sw.label}${sw.managed?' (automatic)':''}" aria-pressed="false" disabled>${h.extra?`${sw.code||h.number} ${sw.label}`:sw.code||h.number}${h.flipper?`<small>${caption}</small>`:''}</button>`;};
  const board=(area,game='pop_lx5')=>{const t2=game==='t2_l8',lamps=t2?t2Lamps:popeyeLamps,hotspots=t2?t2Hotspots:popeyeHotspots,map=t2?t2SwitchByNumber:popeyeSwitchByNumber;return `<div class="playfield-scroll"><div class="playfield-diagram playfield-artwork ${area}" style="--zoom:1"><img src="${new URL('./playfield/'+playfieldArtwork[t2?'t2':'popeye'][area],import.meta.url).href}" alt="${t2?'Terminator 2 full-color playfield':'Popeye '+area+' full-color playfield'}" draggable="false">${lamps.filter(l=>l.area===area&&!l.unused).flatMap(l=>[l,...(l.extra||[])].map(original=>{const point=artworkPosition({...original,area,number:l.number},game,'lamp');return `<span class="playfield-lamp" data-lamp="${l.number}" style="left:${point.x}%;top:${point.y}%" aria-hidden="true" title="Lamp ${l.number}: ${l.name}"></span>`})).join('')}${hotspots.filter(h=>h.area===area).map(h=>playfieldButton({...h,...artworkPosition(h,game)},map,game)).join('')}</div></div>`;};
  const playfieldBoards=(game='pop_lx5')=>{const t2=game==='t2_l8',lamps=t2?t2Lamps:popeyeLamps;return `<div><h3>Main playfield</h3>${board('main',game)}</div><div>${t2?'':`<h3>Upper playfield</h3>${board('upper',game)}`}<div class="playfield-backbox">${lamps.filter(l=>t2?l.area==='head':l.area==='backbox').map(l=>`<span class="backbox-lamp" data-lamp="${l.number}"><i></i>${l.number} ${l.name}${t2?' (in head)':''}</span>`).join('')}</div>${t2?`<h3>Other switches</h3><div class="playfield-extra-inputs">${t2OtherInputs.map(number=>playfieldButton({number,extra:true},t2SwitchByNumber,game)).join('')}</div><p class="matrix-hint">Cabinet inputs and switches without a marked location in the manual are listed here. Lamp 18 is unused.</p>`:''}<div id="romPlayfieldStatus" class="playfield-status" role="status">Start the game to illuminate lamps and enable touch controls.</div><p class="matrix-hint">Blue switch markers support Pulse or Hold / release. Hold ${t2?'11/12 for the right/left flippers':'F2/F4 for lower flippers and F6/F8 for upper flippers'}. Ball-handling inputs ${t2?'':'and flipper EOS '}are automatic. Use zoom for closely spaced switches.</p><p class="playfield-source">Artwork: ${t2?'<a href="https://vpuniverse.com/forums/topic/6095-new-vp10-alert-terminator-2-williams-1991-g5k/" target="_blank" rel="noreferrer">Terminator 2 · g5k / VPUniverse</a>':'<a href="https://vpuniverse.com/files/file/16143-popeye-saves-the-earth-bally-1994/" target="_blank" rel="noreferrer">Popeye · TastyWasps and contributors / VPUniverse</a> · <a href="https://www.pinballrebel.com/game/pins/popeye/popeye_pinball.htm" target="_blank" rel="noreferrer">Upper playfield photo · Russ N. / Pinball Rebel</a>'}. Switch identities: ${t2?'Terminator 2 Operations Manual: lamp locations p. 2-35; switch locations p. 2-37.':'Popeye Operators Handbook: lamp locations p. 3; switch locations p. 5.'}</p></div>`;};
  panel.innerHTML=`<div class="panel rom-loader"><div><h2>ROM + PAC emulator</h2><p>Load a game’s ROM ZIP and matching PAC together. Everything runs on this device.</p></div><button id="romOpen" class="primary">＋ Load ROM + PAC</button><input id="romFiles" type="file" multiple hidden></div>
  <p id="romIsolation" class="rom-notice" hidden>Browser emulation needs an isolated page. <button id="romEnable">Enable browser emulation</button> This reloads the page. Published selections reload automatically; choose local files again.</p>
  <div class="panel rom-selection"><label>ROM set <select id="romGame"><option value="">Choose ROM + PAC files first</option></select></label><span id="romPair">No ROM/PAC pair loaded</span><button id="romStart" class="primary" disabled>Start ROM</button></div>
  <div class="panel display-panel"><div class="display-top"><span id="romTitle">Choose a game above</span><span id="romSourceBadge" class="badge">LIVE COLOR + SOUND</span></div><div class="screen-wrap" id="romScreen"><canvas id="romDmd" width="1024" height="256" aria-label="Live ROM dot matrix display"></canvas><div class="screen-label"><span id="romDimensions">128 × 32</span><span>LIVE DMD</span></div></div><div class="display-bottom"><span id="romState">STOPPED</span><span id="romMatch">Live color DMD</span></div></div>
  <section class="panel rom-input-picker"><div class="rom-input-start"><button id="romCoinStart" disabled>Coin + start game</button><button id="romQuickLaunch" disabled>Launch ball</button><div id="romStartKeys"><button data-rom-key="31">Coin · 5</button><button data-rom-key="27">Start · 1</button></div></div><p id="romBallState" role="status">Choose a game to enable input controls.</p><div class="rom-input-views" role="group" aria-label="Input controls"><button data-input-view="table" aria-controls="romPlayfield" aria-pressed="true">Color playfield</button><button data-input-view="matrix" aria-controls="romMatrix" aria-pressed="false">Switch matrix</button><button data-input-view="service" aria-controls="romManualInputs" aria-pressed="false">Service buttons</button></div></section>
  <section id="romRecipes" class="panel rom-events"><div class="panel-heading"><h2>Trigger recipes</h2></div><div class="rom-event-buttons"><select id="romRecipe" aria-label="Trigger recipe" disabled></select><button id="romRunRecipe" disabled>Run recipe</button><button id="romCancelRecipe" disabled>Cancel recipe</button></div><p id="romRecipeHint">Start a game to run its built-in switch sequences.</p><p id="romRecipeStatus" role="status">Recipes use the live emulator’s DMD and sound.</p><div class="recipe-learning-controls"><label><input id="romLearnInputs" type="checkbox" checked> Learn switch inputs</label><button id="romFinishLearned" disabled>Finish recipe</button><button id="romExportLearnedRecipes" disabled>Export learned recipes</button><span id="romLearnedCount">0 learned</span></div><p id="romLearnStatus" role="status">Nearby inputs form a recipe after a 1.5-second pause. Release held switches before finishing.</p><details><summary>Unique recipe events <span id="romRecipeListCount">0</span></summary><ul id="romRecipeList"></ul><button id="romExportRecipeList" disabled>Download recipe list</button><p>Only recipes, event names, and sound activity are saved. Sound plays live from the emulator.</p></details></section>
  <section id="romPlayfield" class="panel rom-playfield" hidden><div class="matrix-heading"><div><h2 id="romPlayfieldTitle">Popeye playfield</h2><p>Touch a numbered switch to trigger the ROM. Lamps follow the game. Hide switch markers for a clear view of the artwork. Markers for mechanisms beneath ramps or the upper deck are approximate; use Switch matrix for the full input list.</p></div><div class="playfield-options"><label>Touch <select id="romPlayfieldMode"><option value="pulse">Pulse</option><option value="hold">Hold / release</option></select></label><button id="romPlayfieldRelease" disabled>Release held</button><label>Zoom <input id="romPlayfieldZoom" type="range" min="100" max="250" step="25" value="100"><output id="romPlayfieldZoomValue">100%</output></label><label><input id="romShowSwitches" type="checkbox" checked> Switch markers</label></div></div><div id="romPlayfieldBoards" class="playfield-boards">${playfieldBoards()}</div></section>
  <section id="romMatrix" class="panel rom-matrix" hidden><div class="matrix-heading"><div><h2 id="romMatrixTitle">Popeye switch matrix</h2><p>Choose a switch to trigger the game’s DMD and sound.</p></div><div class="matrix-actions"><label>Input <select id="romMatrixMode"><option value="pulse">Pulse</option><option value="hold">Hold / release</option></select></label><button id="romMatrixRelease" disabled>Release held switches</button></div></div><div class="matrix-key"><span><i class="matrix-key-opto"></i> Opto, typically closed</span><span><i class="matrix-key-active"></i> Active input</span><span>AUTO · ball simulator / flipper EOS</span></div><div class="matrix-scroll" tabindex="0" role="region" aria-label="Popeye switch matrix; scroll horizontally for all columns"><table class="popeye-matrix"><caption>Columns across, rows down. Switch number = column × 10 + row.</caption><thead><tr><th scope="col">Dedicated<br>grounded</th><th scope="col">Row</th>${popeyeColumnColors.map((color,i)=>`<th scope="col"><strong>${i+1}</strong><span>${color}</span></th>`).join('')}<th id="romMatrixFlipperHeader" scope="col">Flipper<br>grounded</th></tr></thead><tbody id="romMatrixRows">${matrixRows()}</tbody></table></div><p id="romMatrixHint" class="matrix-hint">Pulse briefly activates a switch. Hold / release toggles it until released. Trough, shooter, and end-of-stroke inputs are automatic; switch 24 stays closed. Pause or leaving the player releases held inputs.</p></section>
  <div id="romManualInputs" class="panel rom-inputs" hidden><h2>Service and manual controls</h2><div class="rom-buttons"><button id="romDoor" aria-pressed="false">Coin door · closed</button></div><section class="service-panel" aria-label="Coin-door service buttons"><div class="service-heading"><h3>Service buttons</h3><span>COIN DOOR PANEL</span></div><div class="service-assembly"><i class="service-screw screw-left" aria-hidden="true"></i><i class="service-screw screw-right" aria-hidden="true"></i><div class="service-legend" aria-hidden="true"><span>SERVICE<br>CREDITS</span><span class="service-volume">VOLUME</span><span>BEGIN<br>TEST</span></div><div class="service-switches">${[
    [33,'black','Service credits / Escape','7'],[34,'red','Volume down / Test minus','8'],[35,'red','Volume up / Test plus','9'],[26,'black','Begin test / Enter','0']
  ].map(([code,color,label,shortcut])=>`<button class="service-button service-${color}" data-rom-key="${code}" aria-label="${label} · ${shortcut}" title="${label} (keyboard ${shortcut})"><span class="service-hardware" aria-hidden="true"><span class="service-bezel"></span><span class="service-cap"></span></span></button>`).join('')}</div><div class="service-functions" aria-hidden="true"><span>ESCAPE</span><span>−</span><span>+</span><span>ENTER</span></div><div class="service-function-caption" aria-hidden="true"><span>TEST MODE FUNCTION</span></div></div></section><div class="rom-switch"><label>Switch number <input id="romSwitch" type="number" min="1" max="1023" value="13"></label><button id="romPulse">Pulse switch</button><button id="romHold" aria-pressed="false">Hold switch</button></div><p>Use the game’s service menus to test animations and sound. Switch numbers depend on the game. This is a ROM test bench; ball movement is controlled manually. Live PAC colorization is experimental until checked with your ROM/PAC pair.</p></div>
  <div class="panel rom-controls"><button id="romPause" disabled>Ⅱ Pause</button><button id="romReset" disabled>↶ Reset ROM</button><button id="romStop" disabled>■ Stop</button><label><input id="romSound" type="checkbox" checked> Sound on</label><label>Volume <input id="romVolume" type="range" min="0" max="100" value="70" aria-label="ROM audio volume"></label><button id="romFullscreen">⛶ Fullscreen</button></div>
  <p id="romStatus" role="status" class="status">Select a game above to run its ROMs with color DMD and sound.</p><details class="panel rom-log"><summary>Emulator log</summary><pre id="romLog"></pre></details>`;
  let files=[],pac=null,colorizer=null,worker=null,active=false,running=false,busy=false,paused=false,raw=null,frameCount=0,tick=0,hold=null,door=false,generation=0;
  const audio=new RomAudio(),pressed=new Set(),timers=new Set();
  let machineState=null,recipeRunning=false,recipeGame='',sceneGroups=new Map(),previousMatch=0;
  const recipeStorage='dmd-trigger-event-list-v1';
  const eventList=new RecipeEventList(data=>{try{globalThis.localStorage?.setItem(recipeStorage,JSON.stringify(data));}catch{status('Recipe list is available for download; browser storage is full.',true);}recipeListControls();if(!recipeRunning)$('romRecipeStatus').textContent='Recipe event list updated. Run a recipe to hear its live ROM sound.';eventControls();});
  try{const saved=globalThis.localStorage?.getItem(recipeStorage);if(saved)eventList.load(JSON.parse(saved));}catch{}
  fetch(new URL('./recipe-events.json',import.meta.url),{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(data=>{eventList.load(data);recipeListControls();}).catch(()=>{});
  const learner=new SwitchRecipeLearner({
    onBegin:(game,recipe,now)=>{eventList.beginManual(game,recipe,now);eventControls();},
    onFinish:(_recipe,now)=>eventList.finishManual(now),
    onCancel:reason=>{if(eventList.active?.kind==='manual')eventList.cancel();if(reason)$('romLearnStatus').textContent=reason;},
    onPending:(steps,held)=>{$('romFinishLearned').disabled=!steps||!!held;$('romLearnStatus').textContent=steps?'Learning '+steps+' switch activation'+(steps===1?'':'s')+(held?' · release held switches to finish.':' · saves after a 1.5-second pause, or choose Finish recipe.'):$('romLearnInputs').checked?'Switch learning is on. Nearby inputs group until a 1.5-second pause.':'Switch learning is off.';}
  });
  $('romLearnInputs').onchange=()=>{learner.cancel();learner.enabled=$('romLearnInputs').checked;$('romLearnStatus').textContent=learner.enabled?'Switch learning is on. Nearby inputs group until a 1.5-second pause.':'Switch learning is off.';eventControls();};
  $('romFinishLearned').onclick=()=>{if(!learner.finish(tick))$('romLearnStatus').textContent='Release held switches before finishing.';};
  addEventListener('pagehide',()=>learner.finish(tick,true));
  const canvas=$('romDmd'),ctx=canvas.getContext('2d');
  function pinDmd(){
    document.body?.classList.toggle('rom-dmd-pinned',active);
    const height=panel.querySelector('.display-panel')?.getBoundingClientRect?.().height;
    if(active&&height)document.documentElement?.style.setProperty('--pinned-dmd-height',Math.ceil(height)+'px');
    else if(!active)document.documentElement?.style.removeProperty('--pinned-dmd-height');
  }
  if(globalThis.ResizeObserver)new ResizeObserver(pinDmd).observe(panel.querySelector('.display-panel'));
  addEventListener('resize',pinDmd);
  function status(text,error=false){$('romStatus').textContent=text;$('romStatus').classList.toggle('error',error);}
  function appendLog(text){$('romLog').textContent=($('romLog').textContent+'\n'+text).slice(-20000);}
  function send(data){
    if(['event','matrix','key','switch'].includes(data.type)&&running&&!paused){if(eventList.active?.kind!=='manual')eventList.cancel();recipeRunning=false;learner.command($('romGame').value,data,tick,machineState||{});}
    if(data.type==='cancel-recipe'){learner.cancel();eventList.cancel();}
    if(['reset','stop'].includes(data.type)||(data.type==='pause'&&data.paused)){learner.finish(tick,true);eventList.cancel();}
    worker?.postMessage(data);
  }
  function controls(){eventControls();$('romSourceBadge').textContent='LIVE COLOR + SOUND';for(const id of ['romPause','romReset','romStop','romPulse','romHold','romDoor'])$(id).disabled=id==='romStop'?!(running||busy):id==='romPause'?!running:!running;panel.querySelectorAll('[data-rom-key]').forEach(b=>b.disabled=!running);$('romStart').disabled=busy||running||!pac||!files.length||!globalThis.crossOriginIsolated;$('romGame').disabled=busy||running;$('romOpen').disabled=busy||running;$('romIsolation').hidden=!!globalThis.crossOriginIsolated;$('romPause').textContent=paused?'▶ Resume':'Ⅱ Pause';}
  function release(){if(recipeRunning){send({type:'cancel-recipe'});recipeRunning=false;$('romRecipeStatus').textContent='Recipe cancelled.';}for(const code of pressed)send({type:'key',code,state:0});pressed.clear();if(hold!==null)send({type:'switch',number:hold,state:0});hold=null;$('romHold').setAttribute('aria-pressed','false');}
  function stop(){pressedFlippers.clear();machineState=null;generation++;release();for(const timer of timers)clearTimeout(timer);timers.clear();send({type:'stop'});worker?.terminate();worker=null;audio.clear();running=false;busy=false;paused=false;door=false;$('romDoor').setAttribute('aria-pressed','false');$('romDoor').textContent='Coin door · closed';$('romState').textContent='STOPPED';controls();}
  function pause(value){if(value)pressedFlippers.clear();if(!running)return;release();paused=value;send({type:'pause',paused});audio.clear();$('romState').textContent=paused?'PAUSED':'RUNNING';controls();}
  function drawFrame(f){
    const {w,h}=f;
    if(canvas.width!==w*8||canvas.height!==h*8){canvas.width=w*8;canvas.height=h*8;}
    ctx.fillStyle='#080b0c';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<f.data.length;i++){const value=f.data[i],c=f.colors?.[value]||[Math.round(255*value/(f.levels-1)),Math.round(135*value/(f.levels-1)),Math.round(36*value/(f.levels-1))];ctx.fillStyle='rgb('+c.join(',')+')';ctx.beginPath();ctx.arc((i%w)*8+4,Math.floor(i/w)*8+4,3,0,Math.PI*2);ctx.fill();}
  }
  function recipeListControls(){
    const entries=eventList.export().entries,game=$('romGame').value,visible=entries.filter(e=>e.game===game);$('romRecipeListCount').textContent=String(visible.length);$('romExportRecipeList').disabled=!entries.length;$('romExportLearnedRecipes').disabled=!entries.some(e=>e.learned);$('romLearnedCount').textContent=visible.filter(e=>e.learned).length+' learned';$('romRecipeList').replaceChildren(...visible.map(e=>{const row=document.createElement('li');row.textContent=e.label+(e.learned?' · learned ×'+e.learnedRuns:'')+' — '+(e.soundObserved?'sound observed':'no audible sound observed')+(e.events.length?' · '+e.events.map(v=>v.label).join(', '):' · live ROM response');return row;}));
  }
  function downloadRecipeList(learnedOnly=false){learner.finish(tick);const data=eventList.export({learnedOnly});if(!data.entries.length)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=learnedOnly?'dmd-learned-trigger-recipes.json':'dmd-trigger-events.json';link.click();const timer=setTimeout(()=>URL.revokeObjectURL(url),1000);timer.unref?.();}
  $('romExportRecipeList').onclick=()=>downloadRecipeList();
  $('romExportLearnedRecipes').onclick=()=>downloadRecipeList(true);
  function render(){
    if(!raw)return;
    const f={...colorizer.render(raw.data,raw.w,raw.h,raw.depth,tick,raw.planes),w:raw.w,h:raw.h};drawFrame(f);
    if(colorizer.matches!==previousMatch){previousMatch=colorizer.matches;const scene=colorizer.active?.scene,group=sceneGroups.get(scene);eventList.observeEvent(scene?(group?.key||'scene:'+scene.offset):'palette:'+colorizer.lastMatch,group?.label||scene?.name||colorizer.lastMatch,tick);}
    $('romMatch').textContent=colorizer.matches+' triggers · '+colorizer.lastMatch;
  }
  let lastTime=0;
  function loop(time){const delta=lastTime?Math.min(100,time-lastTime):0;lastTime=time;if(running&&!paused){tick+=delta;if(raw)render();learner.advance(tick);eventList.advance(tick);}requestAnimationFrame(loop)}requestAnimationFrame(loop);
  async function accept(incoming){
    const selected=Array.from(incoming),roms=selected.filter(f=>/\.zip$/i.test(f.name)),pacs=selected.filter(f=>/\.pac$/i.test(f.name));
    if(!roms.length||pacs.length!==1){status('Choose at least one ROM ZIP and exactly one matching PAC together.',true);return false;}
    if(selected.some(f=>f.size>64*1024*1024)||roms.reduce((n,f)=>n+f.size,0)>128*1024*1024){status('ROM selection exceeds the 128 MB session limit (64 MB per ZIP).',true);return false;}
    stop();const session=generation;setMode();busy=true;controls();status('Decoding PAC and preparing the ROM pair…');
    try{const decoded=await parsePac(new Uint8Array(await pacs[0].arrayBuffer()),$('pacKey')?.value||'');if(session!==generation)return false;if(!decoded.mappings?.length)throw Error('This PAC contains no live frame mappings.');
      files=roms;pac=pacs[0];colorizer=new LiveColorizer(decoded);sceneGroups=animationGroups(decoded.scenes);previousMatch=0;$('romGame').replaceChildren(...files.map(f=>new Option(f.name.replace(/\.zip$/i,''),f.name.replace(/\.zip$/i,'').toLowerCase())));$('romPair').textContent=pac.name+' · '+decoded.mappings.length+' mappings';status('ROM/PAC pair ready. Select the game ROM set, then Start ROM.');return true;
    }catch(error){files=[];pac=null;colorizer=null;status(error.message,true);return false;}finally{busy=false;controls();}
  }
  async function start({background=false}={}){
    if(!pac||!files.length||busy||running)return;
    if(!globalThis.crossOriginIsolated){status('Enable browser emulation, then select the files again.',true);return;}
    const session=++generation;busy=true;controls();$('romState').textContent='STARTING';status('Loading the browser emulator and checking ROM files…');$('romLog').textContent='';raw=null;tick=0;frameCount=0;colorizer.reset();previousMatch=0;
    try{
      if(!background&&!audio.muted)await audio.unlock();
      const payload=await Promise.all(files.map(async file=>({name:file.name,bytes:await file.arrayBuffer()})));
      if(session!==generation)return;worker=new Worker(new URL('./rom-worker.mjs?v=animation-import-1',import.meta.url),{type:'module'});const currentWorker=worker;
      worker.onerror=e=>{if(worker!==currentWorker)return;appendLog(e.message);stop();status('Emulator error: '+e.message,true)};
      worker.onmessage=({data})=>{if(worker!==currentWorker)return;
        if(data.type==='started'){busy=false;running=true;paused=false;$('romTitle').textContent=data.info.split('\n')[0];$('romState').textContent='RUNNING';controls();if(!active)pause(true);status('ROM running. Use game controls or the service menus to test DMD animations and sound.');}
        if(data.type==='machine'){machineState=data;eventControls();}
        if(data.type==='event-status')status(data.text,!!data.error);
        if(data.type==='recipe-status'){if(eventList.active?.kind!=='manual'){if(data.phase==='running'&&data.stage==='inputs'&&running&&!paused)eventList.begin($('romGame').value,data.id,tick);else if(data.phase==='completed')eventList.complete(tick);else if(data.phase!=='running')eventList.cancel();}recipeRunning=data.phase==='running';$('romRecipeStatus').textContent=data.phase==='completed'&&eventList.active?data.text+' · finishing event and sound observation…':data.text;$('romRecipeStatus').classList.toggle('error',data.phase==='error');eventControls();}
        if(data.type==='frame'){raw=data;frameCount++;$('romDimensions').textContent=data.w+' × '+data.h;}
        if(data.type==='audio'&&!paused){eventList.observeAudio(data.data,tick);audio.play(data);}
        if(data.type==='log')appendLog(data.text);
        if(data.type==='error'){appendLog(data.message);stop();status(data.message,true);}
        if(data.type==='stopped'){stop();status('ROM stopped. Check the emulator log if it stopped during startup.');}
      };
      worker.postMessage({type:'start',files:payload,game:$('romGame').value},payload.map(f=>f.bytes));
    }catch(error){stop();status(error.message,true);}
  }
  panel.querySelectorAll('[data-input-view]').forEach(b=>{b.onclick=()=>{if(b.disabled)return;pressedFlippers.clear();if(running)send({type:'matrix',release:true});inputView=b.dataset.inputView;eventControls();};});
  $('romQuickLaunch').onclick=()=>{if(!$('romQuickLaunch').disabled)send($('romGame').value==='pop_lx5'?{type:'event',id:'launch'}:{type:'matrix',number:34,hold:false});};
  function updatePlayfield(enabled,active,held){
    const lamps=new Set(machineState?.lamps||[]);$('romPlayfieldMode').disabled=!enabled||!machineState;$('romPlayfieldRelease').disabled=!enabled||!held.size;
    panel.querySelectorAll('[data-lamp]').forEach(e=>e.classList.toggle('lamp-on',lamps.has(+e.dataset.lamp)));
    panel.querySelectorAll('[data-playfield-switch]').forEach(b=>{const n=+b.dataset.playfieldSwitch;b.disabled=!enabled||!machineState||currentMatrix.get(n).managed||currentMatrix.get(n).unused;b.setAttribute('aria-pressed',String(active.has(n)));b.classList.toggle('switch-held',held.has(n));});
    $('romPlayfieldStatus').textContent=machineState?lamps.size+' / '+currentLamps.filter(l=>!l.unused).length+' lamps on · '+machineState.event:'Start the selected game to illuminate lamps and enable touch controls.';
  }
  function bindPlayfieldButtons(){
  panel.querySelectorAll('[data-playfield-switch]').forEach(b=>{b.onclick=()=>{if(!b.disabled)send({type:'matrix',number:+b.dataset.playfieldSwitch,hold:$('romMatrixMode').value==='hold'});};});
  function pressFlipper(button,pressed){
    const n=+button.dataset.playfieldSwitch;if(pressed){if(button.disabled||pressedFlippers.has(n))return;pressedFlippers.add(n)}else{if(!pressedFlippers.has(n))return;pressedFlippers.delete(n)}send({type:'matrix',number:n,pressed});
  }
  panel.querySelectorAll('.playfield-flipper-input').forEach(button=>{
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);pressFlipper(button,true)});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>pressFlipper(button,false));
    button.addEventListener('keydown',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();pressFlipper(button,true)}});
    button.addEventListener('blur',()=>pressFlipper(button,false));
    button.addEventListener('keyup',event=>{if(['Space','Enter'].includes(event.code)){event.preventDefault();pressFlipper(button,false)}});
    button.onclick=event=>{if(event.detail===0&&!button.disabled){pressFlipper(button,true);const timer=setTimeout(()=>{pressFlipper(button,false);timers.delete(timer)},120);timers.add(timer)}};
  });
  }
  bindPlayfieldButtons();
  $('romPlayfieldZoom').oninput=()=>{const value=+$('romPlayfieldZoom').value;$('romPlayfieldZoomValue').textContent=value+'%';panel.querySelectorAll('.playfield-diagram').forEach(e=>e.style.setProperty('--zoom',value/100));};
  $('romPlayfieldMode').onchange=()=>{$('romMatrixMode').value=$('romPlayfieldMode').value;pressedFlippers.clear();send({type:'matrix',release:true});};
  $('romPlayfieldRelease').onclick=()=>send({type:'matrix',release:true});
  $('romShowSwitches').onchange=()=>$('romPlayfield').classList.toggle('hide-switches',!$('romShowSwitches').checked);
  function eventControls(){
    const game=$('romGame').value,popeye=game==='pop_lx5',t2=game==='t2_l8',enabled=(popeye||t2)&&running&&!paused;
    const recipes=recipesForGame(game);$('romRecipes').hidden=!recipes.length;
    if(recipeGame!==game){recipeGame=game;$('romRecipe').replaceChildren(...recipes.map(r=>new Option(r.label,r.id)));$('romRecipeStatus').textContent='Recipes use the live emulator’s DMD and sound.';}
    $('romRecipe').disabled=!enabled||recipeRunning||!!eventList.active;$('romRunRecipe').disabled=!enabled||!machineState||recipeRunning||!!eventList.active;$('romCancelRecipe').disabled=!recipeRunning&&!eventList.active;
    recipeHint();recipeListControls();
    if((popeye||t2)&&game!==matrixGame){matrixGame=game;currentMatrix=popeye?popeyeSwitchByNumber:t2SwitchByNumber;$('romMatrixRows').innerHTML=matrixRows();$('romMatrixTitle').textContent=popeye?'Popeye switch matrix':'Terminator 2 switch matrix';$('romMatrixFlipperHeader').hidden=t2;$('romMatrixHint').textContent=popeye?'Pulse activates a switch; Hold / release toggles it. Ball-handling switches and flipper EOS are automatic.':'Pulse activates a switch; Hold / release toggles it. Red outlines mark targets 71–75. Unused positions are disabled; trough and shooter follow the ball simulator.';bindMatrixButtons();}
    if(game!==inputGame){inputGame=game;inputView=(popeye||t2)?'table':'service';}
    if((popeye||t2)&&playfieldGame!==game){playfieldGame=game;currentLamps=t2?t2Lamps:popeyeLamps;$('romPlayfieldTitle').textContent=t2?'Terminator 2 playfield':'Popeye playfield';$('romPlayfieldBoards').innerHTML=playfieldBoards(game);bindPlayfieldButtons();$('romPlayfieldZoom').oninput();}
    $('romPlayfield').hidden=!((popeye||t2)&&inputView==='table');$('romMatrix').hidden=!((popeye||t2)&&inputView==='matrix');$('romManualInputs').hidden=inputView!=='service';
    panel.querySelectorAll('[data-input-view]').forEach(b=>{const v=b.dataset.inputView;b.disabled=(v==='table'||v==='matrix')?!(popeye||t2):false;b.setAttribute('aria-pressed',String(v===inputView));});
    $('romCoinStart').hidden=!popeye;$('romStartKeys').hidden=popeye;$('romQuickLaunch').hidden=!(popeye||t2);$('romQuickLaunch').textContent=t2?'Grip trigger / launch':'Launch ball';$('romQuickLaunch').disabled=!enabled||!machineState?.shooter||!!machineState?.busy;
    const active=new Set(machineState?.active||[]),held=new Set(machineState?.held||[]);
    $('romMatrixMode').disabled=!enabled||!machineState;$('romMatrixRelease').disabled=!enabled||!held.size;
    panel.querySelectorAll('[data-popeye-switch]').forEach(button=>{const n=+button.dataset.popeyeSwitch;button.disabled=!enabled||!machineState||(currentMatrix.get(n).managed||currentMatrix.get(n).unused);button.setAttribute('aria-pressed',String(active.has(n)));button.classList.toggle('matrix-held',held.has(n));});$('romCoinStart').disabled=!enabled||!machineState||machineState.starting;
    updatePlayfield(enabled,active,held);
    if(machineState)$('romBallState').textContent='Trough: '+machineState.trough+' / '+(popeye?6:3)+' · Shooter: '+(machineState.shooter?'ball ready':'empty')+' · In play: '+machineState.playfield+' · '+machineState.event;
    else $('romBallState').textContent='Start the selected game to enable input controls.';
  }
  function recipeHint(){const recipe=recipesForGame($('romGame').value).find(r=>r.id===$('romRecipe').value);$('romRecipeHint').textContent=recipe?(recipe.expectedAnimations?.length?recipe.precondition+' Observed animation: '+recipe.expectedAnimations.join(', ')+'.':recipe.id.endsWith('light-start')?'Begin with Credits and start, wait for the ball, then run Ball launch.':recipe.id.endsWith('light-attract')?'Run while idle. Reset the ROM first if a game is in progress.':recipe.id.endsWith('light-launch')?'Wait for a ball in the shooter lane.':'Run after starting a game and launching a ball.')+' Results depend on the current game mode.':'Start a game to run its built-in switch sequences.';}
  $('romRecipe').onchange=recipeHint;
  $('romRunRecipe').onclick=async()=>{try{if($('romRunRecipe').disabled)return;eventList.cancel();if(!audio.muted)await audio.unlock();if(!running||paused||recipeRunning)return;recipeRunning=true;send({type:'recipe',id:$('romRecipe').value});$('romRecipeStatus').textContent='Starting recipe…';eventControls();}catch(error){status(error.message,true);}};
  $('romCancelRecipe').onclick=()=>{send({type:'cancel-recipe'});eventControls();};
  function bindMatrixButtons(){panel.querySelectorAll('[data-popeye-switch]').forEach(button=>{button.onclick=()=>{if(!button.disabled)send({type:'matrix',number:+button.dataset.popeyeSwitch,hold:$('romMatrixMode').value==='hold'});};});}
  bindMatrixButtons();
  $('romMatrixRelease').onclick=()=>send({type:'matrix',release:true});
  $('romMatrixMode').onchange=()=>{$('romPlayfieldMode').value=$('romMatrixMode').value;pressedFlippers.clear();send({type:'matrix',release:true});};
  $('romCoinStart').onclick=async()=>{
    try{if(!audio.muted)await audio.unlock();if(!running||paused )return;
      send({type:'event',id:'begin-game'});
      status('Adding credit and pressing Start. The ROM will serve a ball when ready.');
    }catch(error){status(error.message,true)}
  };
  function key(code,state){if(!running||paused)return;if(state)pressed.add(code);else pressed.delete(code);send({type:'key',code,state});}
  const keyCodes={Digit0:26,Digit1:27,Digit2:28,Digit3:29,Digit4:30,Digit5:31,Digit6:32,Digit7:33,Digit8:34,Digit9:35,Enter:66,ArrowLeft:81,ArrowRight:82,ArrowUp:83,ArrowDown:84,ShiftLeft:93,ShiftRight:94,ControlLeft:95,ControlRight:96};
  function inputFocused(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable||!!document.activeElement?.closest?.('#romMatrix,#romPlayfield');}
  document.addEventListener('keydown',event=>{if(!active||!running||inputFocused()||event.ctrlKey||event.metaKey)return;if(event.code==='Space'){event.preventDefault();if(!event.repeat)pause(!paused);return}if(keyCodes[event.code]!==undefined){event.preventDefault();key(keyCodes[event.code],1)}});
  document.addEventListener('keyup',event=>{if(keyCodes[event.code]!==undefined&&pressed.has(keyCodes[event.code])){event.preventDefault();key(keyCodes[event.code],0)}});
  globalThis.addEventListener?.('blur',()=>{release();if(running&&!paused)pause(true)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pause(true)});
  panel.querySelectorAll('[data-rom-key]').forEach(button=>{
    const code=+button.dataset.romKey;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);key(code,1)});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>key(code,0));
    button.onclick=event=>{if(event.detail===0){key(code,1);const timer=setTimeout(()=>{key(code,0);timers.delete(timer)},120);timers.add(timer)}};
  });
  $('romOpen').onclick=()=>$('romFiles').click();$('romFiles').onchange=async event=>{await accept(event.target.files);event.target.value=''};$('romStart').onclick=start;
  $('romPause').onclick=async()=>{try{if(!audio.muted)await audio.unlock();pause(!paused)}catch(error){status(error.message,true)}};$('romReset').onclick=()=>{pressedFlippers.clear();machineState=null;pause(false);release();audio.clear();colorizer.reset();raw=null;tick=0;send({type:'reset'});};$('romStop').onclick=()=>{stop();status('ROM stopped. Your selected ROM/PAC pair is ready to start again.')};
  async function setSound(enabled){audio.muted=!enabled;audio.update();audio.clear();$('romSound').checked=enabled;onSoundChange(enabled);if(enabled&&running){try{await audio.unlock()}catch(error){audio.muted=true;audio.update();$('romSound').checked=false;onSoundChange(false);status(error.message,true)}}}
  $('romSound').oninput=()=>setSound($('romSound').checked);$('romVolume').oninput=()=>{audio.volume=+$('romVolume').value/100;audio.update()};
  $('romFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('romScreen').requestFullscreen()}catch{status('Fullscreen is unavailable in this browser.',true)}};
  $('romDoor').onclick=()=>{key(78,1);const timer=setTimeout(()=>{key(78,0);timers.delete(timer)},120);timers.add(timer);door=!door;$('romDoor').setAttribute('aria-pressed',String(door));$('romDoor').textContent='Coin door · '+(door?'open':'closed')};
  const switchNumber=()=>{const n=+$('romSwitch').value;if(!Number.isInteger(n)||n<1||n>1023)throw Error('Enter a switch number from 1 to 1023.');return n};
  $('romPulse').onclick=()=>{try{if(!running||paused)return;const number=switchNumber();send({type:'switch',number,state:1});const timer=setTimeout(()=>{send({type:'switch',number,state:0});timers.delete(timer)},120);timers.add(timer)}catch(error){status(error.message,true)}};
  $('romHold').onclick=()=>{try{if(!running||paused)return;if(hold!==null){send({type:'switch',number:hold,state:0});hold=null}else{hold=switchNumber();send({type:'switch',number:hold,state:1})}$('romHold').setAttribute('aria-pressed',String(hold!==null))}catch(error){status(error.message,true)}};
  $('romEnable').onclick=async()=>{try{if(!isSecureContext||!navigator.serviceWorker)throw Error('Browser emulation needs HTTPS and service-worker support.');status('Enabling browser emulation. The page will reload once…');if($('includedGame')?.value){const url=new URL(location.href);url.searchParams.set('game',$('includedGame').value);url.searchParams.set('playback','rom');globalThis.history.replaceState(null,'',url);}await navigator.serviceWorker.register(new URL('coi-serviceworker.js',location.href),{scope:new URL('./',location.href).pathname});await navigator.serviceWorker.ready;if(navigator.serviceWorker.controller)location.reload();else navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true})}catch(error){status(error.message,true)}};
  for(const type of ['pointerdown','keydown'])addEventListener(type,()=>{if(!audio.muted&&audio.context?.state!=='running')audio.unlock().catch(error=>status(error.message,true));});
  deleteStoredRecordings(()=>status('Close other DMD Viewer tabs to finish removing saved recordings.')).catch(error=>status('Could not remove old recordings: '+error.message,true));
  controls();return {accept,start,stop,setSound,prepareAudio:()=>audio.muted?Promise.resolve():audio.unlock(),setActive(value){active=value;pinDmd();if(!value&&running&&!paused)pause(true);},get running(){return running}};
}
