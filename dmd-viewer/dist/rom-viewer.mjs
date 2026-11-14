import {parsePac} from './pac.mjs';
import {LiveColorizer} from './live-colorizer.mjs';
import {RomHistory} from './rom-history.mjs';
import {popeyeEvents} from './popeye-events.mjs?v=matrix-1';
import {popeyeSwitchByNumber,popeyeColumnColors} from './popeye-matrix.mjs';

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
  const matrixCell=number=>{const item=popeyeSwitchByNumber.get(number);return `<button data-popeye-switch="${number}" class="matrix-switch${item.opto?' matrix-opto':''}${item.managed?' matrix-auto':''}" aria-pressed="false" aria-label="${item.code||number}: ${item.label}${item.opto?', opto':''}${item.managed?', automatic':''}" disabled><strong>${item.code||number}</strong><span>${item.label}</span><small>${number===24?'FIXED':item.managed?'AUTO':item.opto?'OPTO':''}</small></button>`};
  const matrixRows=Array.from({length:8},(_,row)=>`<tr><td>${matrixCell(row+1)}</td><th scope="row">${row+1}</th>${Array.from({length:8},(_,col)=>`<td>${matrixCell((col+1)*10+row+1)}</td>`).join('')}<td>${matrixCell(111+row)}</td></tr>`).join('');
  panel.innerHTML=`<div class="panel rom-loader"><div><h2>ROM + PAC emulator</h2><p>Load a game’s ROM ZIP and matching PAC together. Everything runs on this device.</p></div><button id="romOpen" class="primary">＋ Load ROM + PAC</button><input id="romFiles" type="file" multiple hidden></div>
  <p id="romIsolation" class="rom-notice" hidden>Browser emulation needs an isolated page. <button id="romEnable">Enable browser emulation</button> This reloads the page. Published selections reload automatically; choose local files again.</p>
  <div class="panel rom-selection"><label>ROM set <select id="romGame"><option value="">Choose ROM + PAC files first</option></select></label><span id="romPair">No ROM/PAC pair loaded</span><button id="romStart" class="primary" disabled>Start ROM</button></div>
  <div class="panel display-panel"><div class="display-top"><span id="romTitle">Choose a game above</span><span id="romSourceBadge" class="badge">LIVE COLOR + SOUND</span></div><div class="screen-wrap" id="romScreen"><canvas id="romDmd" width="1024" height="256" aria-label="Live ROM dot matrix display"></canvas><div class="screen-label"><span id="romDimensions">128 × 32</span><span>LIVE DMD</span></div></div><div class="display-bottom"><span id="romState">STOPPED</span><span id="romMatch">Live color DMD</span></div></div>
  <div class="panel rom-history"><div class="rom-history-buttons"><button id="romPreviousAnimation" disabled>← Previous animation</button><select id="romAnimation" aria-label="Captured animation" disabled><option value="">Live game</option></select><button id="romNextAnimation" disabled>Next animation →</button><button id="romReplayAnimation" disabled>↶ Replay animation</button><button id="romLive" disabled>Return to live</button></div><p id="romHistoryInfo" role="status">Animations and their sound are captured while the game runs. Up to 60 seconds are kept.</p></div>
  <div class="panel rom-controls"><button id="romPause" disabled>Ⅱ Pause</button><button id="romReset" disabled>↶ Reset ROM</button><button id="romStop" disabled>■ Stop</button><label><input id="romSound" type="checkbox" checked> Sound on</label><label>Volume <input id="romVolume" type="range" min="0" max="100" value="70" aria-label="ROM audio volume"></label><button id="romFullscreen">⛶ Fullscreen</button></div>
  <section id="romEvents" class="panel rom-events" hidden><div class="panel-heading"><h2>Popeye shot controls</h2><button id="romCoinStart" disabled>Coin + start game</button></div><p id="romBallState" role="status">Start Popeye to enable the shot controls.</p><div class="rom-event-buttons">${popeyeEvents.map(event=>`<button data-popeye-event="${event.id}" disabled>${event.label}</button>`).join('')}</div><p>Press Coin + start game, wait for a ball, then Launch ball. Choose shots to let the game produce its own color DMD and sound. Results depend on the current game mode.</p></section>
  <section id="romMatrix" class="panel rom-matrix" hidden><div class="matrix-heading"><div><h2>Popeye switch matrix</h2><p>Choose a switch to trigger the game’s DMD and sound.</p></div><div class="matrix-actions"><label>Input <select id="romMatrixMode"><option value="pulse">Pulse</option><option value="hold">Hold / release</option></select></label><button id="romMatrixRelease" disabled>Release held switches</button></div></div><div class="matrix-key"><span><i class="matrix-key-opto"></i> Opto, typically closed</span><span><i class="matrix-key-active"></i> Active input</span><span>AUTO · ball simulator / flipper EOS</span></div><div class="matrix-scroll" tabindex="0" role="region" aria-label="Popeye switch matrix; scroll horizontally for all columns"><table class="popeye-matrix"><caption>Columns across, rows down. Switch number = column × 10 + row.</caption><thead><tr><th scope="col">Dedicated<br>grounded</th><th scope="col">Row</th>${popeyeColumnColors.map((color,i)=>`<th scope="col"><strong>${i+1}</strong><span>${color}</span></th>`).join('')}<th scope="col">Flipper<br>grounded</th></tr></thead><tbody>${matrixRows}</tbody></table></div><p class="matrix-hint">Pulse briefly activates a switch. Hold / release toggles it until released. Trough, shooter, and end-of-stroke inputs are automatic; switch 24 stays closed. Pause or leaving the player releases held inputs.</p></section>
  <div class="panel rom-inputs"><h2>Game controls</h2><div class="rom-buttons"><button data-rom-key="31">Coin · 5</button><button data-rom-key="27">Start · 1</button><button id="romDoor" aria-pressed="false">Coin door · closed</button></div><section class="service-panel" aria-label="Coin-door service buttons"><div class="service-heading"><h3>Service buttons</h3><span>COIN DOOR PANEL</span></div><div class="service-assembly"><i class="service-screw screw-left" aria-hidden="true"></i><i class="service-screw screw-right" aria-hidden="true"></i><div class="service-legend" aria-hidden="true"><span>SERVICE<br>CREDITS</span><span class="service-volume">VOLUME</span><span>BEGIN<br>TEST</span></div><div class="service-switches">${[
    [33,'black','Service credits / Escape','7'],[34,'red','Volume down / Test minus','8'],[35,'red','Volume up / Test plus','9'],[26,'black','Begin test / Enter','0']
  ].map(([code,color,label,shortcut])=>`<button class="service-button service-${color}" data-rom-key="${code}" aria-label="${label} · ${shortcut}" title="${label} (keyboard ${shortcut})"><span class="service-hardware" aria-hidden="true"><span class="service-bezel"></span><span class="service-cap"></span></span></button>`).join('')}</div><div class="service-functions" aria-hidden="true"><span>ESCAPE</span><span>−</span><span>+</span><span>ENTER</span></div><div class="service-function-caption" aria-hidden="true"><span>TEST MODE FUNCTION</span></div></div></section><div class="rom-switch"><label>Switch number <input id="romSwitch" type="number" min="1" max="1023" value="13"></label><button id="romPulse">Pulse switch</button><button id="romHold" aria-pressed="false">Hold switch</button></div><p>Use the game’s service menus to test animations and sound. Switch numbers depend on the game. This is a ROM test bench; ball movement is controlled manually. Live PAC colorization is experimental until checked with your ROM/PAC pair.</p></div>
  <p id="romStatus" role="status" class="status">Select a game above to run its ROMs with color DMD and sound.</p><details class="panel rom-log"><summary>Emulator log</summary><pre id="romLog"></pre></details>`;
  let files=[],pac=null,colorizer=null,worker=null,active=false,running=false,busy=false,paused=false,raw=null,frameCount=0,tick=0,hold=null,door=false,generation=0;
  const audio=new RomAudio(),history=new RomHistory(),pressed=new Set(),timers=new Set();
  let replay=null,historyVersion='',machineState=null;
  const canvas=$('romDmd'),ctx=canvas.getContext('2d');
  function status(text,error=false){$('romStatus').textContent=text;$('romStatus').classList.toggle('error',error);}
  function appendLog(text){$('romLog').textContent=($('romLog').textContent+'\n'+text).slice(-20000);}
  function send(data){worker?.postMessage(data)}
  function controls(){eventControls();historyControls();$('romSourceBadge').textContent=replay?'CAPTURED COLOR + SOUND':'LIVE COLOR + SOUND';for(const id of ['romPause','romReset','romStop','romPulse','romHold','romDoor'])$(id).disabled=id==='romStop'?!(running||busy):!running;panel.querySelectorAll('[data-rom-key]').forEach(b=>b.disabled=!running||!!replay);$('romStart').disabled=busy||running||!pac||!files.length||!globalThis.crossOriginIsolated;$('romGame').disabled=busy||running;$('romOpen').disabled=busy||running;$('romIsolation').hidden=!!globalThis.crossOriginIsolated;$('romPause').textContent=(replay?!replay.playing:paused)?'▶ Resume':'Ⅱ Pause';}
  function release(){for(const code of pressed)send({type:'key',code,state:0});pressed.clear();if(hold!==null)send({type:'switch',number:hold,state:0});hold=null;$('romHold').setAttribute('aria-pressed','false');}
  function stop(){machineState=null;replay=null;history.clear();historyVersion='';generation++;release();for(const timer of timers)clearTimeout(timer);timers.clear();send({type:'stop'});worker?.terminate();worker=null;audio.clear();running=false;busy=false;paused=false;door=false;$('romDoor').setAttribute('aria-pressed','false');$('romDoor').textContent='Coin door · closed';$('romState').textContent='STOPPED';controls();}
  function pause(value){if(replay){pauseReplay(value);return}if(!running)return;release();paused=value;send({type:'pause',paused});audio.clear();$('romState').textContent=paused?'PAUSED':'RUNNING';controls();}
  function drawFrame(f){
    const {w,h}=f;
    if(canvas.width!==w*8||canvas.height!==h*8){canvas.width=w*8;canvas.height=h*8;}
    ctx.fillStyle='#080b0c';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<f.data.length;i++){const value=f.data[i],c=f.colors?.[value]||[Math.round(255*value/(f.levels-1)),Math.round(135*value/(f.levels-1)),Math.round(36*value/(f.levels-1))];ctx.fillStyle='rgb('+c.join(',')+')';ctx.beginPath();ctx.arc((i%w)*8+4,Math.floor(i/w)*8+4,3,0,Math.PI*2);ctx.fill();}
  }
  function historyControls(){
    const clips=history.clips,version=clips.map(c=>c.id).join(',');
    if(version!==historyVersion){$('romAnimation').replaceChildren(new Option('Live game',''),...clips.map((c,i)=>new Option((i+1)+'. '+c.label,String(c.id))));historyVersion=version;}
    $('romAnimation').value=replay?String(replay.clip.id):'';$('romAnimation').disabled=!clips.length;
    const index=replay?clips.findIndex(c=>c.id===replay.clip.id):clips.length;
    $('romPreviousAnimation').disabled=!clips.length||index===0;
    $('romNextAnimation').disabled=!replay||index>=clips.length-1;
    $('romReplayAnimation').disabled=!replay;$('romLive').disabled=!replay;
    $('romHistoryInfo').textContent=replay?'Captured animation '+(index+1)+' / '+clips.length+' · original game sound · Return to live to capture more.':clips.length+' captured animation'+(clips.length===1?'':'s')+' · Previous animation replays with original sound. Up to 60 seconds are kept.';
  }
  function replayTime(){return Math.min(replay.clip.duration,replay.offset+(replay.playing?Math.max(0,performance.now()-replay.started):0));}
  function resumeReplay(){replay.started=performance.now()+30;replay.audioStart=(audio.context?.currentTime||0)+0.03;replay.audioIndex=0;replay.playing=true;}
  function pauseReplay(value){if(!replay)return;if(value){replay.offset=replayTime();replay.playing=false;audio.clear()}else {if(replay.offset>=replay.clip.duration)replay.offset=0;resumeReplay()}$('romState').textContent=value?'REPLAY PAUSED':'REPLAYING';controls();}
  async function playClip(id){
    const clip=history.clip(Number(id)),session=generation;if(!clip||!running)return;
    try{if(!audio.muted)await audio.unlock();}catch(error){status(error.message,true);return;}
    if(session!==generation||!running)return;
    if(!replay)pause(true);else audio.clear();
    replay={clip,offset:0,playing:false};resumeReplay();drawFrame(clip.frames[0]);$('romState').textContent='REPLAYING';$('romMatch').textContent=clip.label+' · recorded color DMD + sound';controls();
  }
  async function returnLive(){
    try{if(!audio.muted)await audio.unlock();}catch(error){status(error.message,true);return;}
    replay=null;audio.clear();pause(false);status('Live game resumed. New animations and sound are being captured.');
  }
  $('romPreviousAnimation').onclick=()=>{const clips=history.clips,index=replay?clips.findIndex(c=>c.id===replay.clip.id):clips.length;return playClip(clips[index-1]?.id)};
  $('romNextAnimation').onclick=()=>{const clips=history.clips,index=clips.findIndex(c=>c.id===replay?.clip.id);return playClip(clips[index+1]?.id)};
  $('romReplayAnimation').onclick=()=>playClip(replay?.clip.id);
  $('romAnimation').onchange=()=>{$('romAnimation').value?playClip($('romAnimation').value):returnLive()};
  $('romLive').onclick=returnLive;
  function render(){
    if(!raw)return;
    const f={...colorizer.render(raw.data,raw.w,raw.h,raw.depth,tick,raw.planes),w:raw.w,h:raw.h};drawFrame(f);
    const scene=colorizer.active?.scene,key=scene?scene.offset+':'+scene.mode+':'+scene.paletteId:colorizer.lastMatch;
    history.recordFrame(tick,f,key,scene?.name||'Game display');historyControls();
    $('romMatch').textContent=colorizer.matches+' triggers · '+colorizer.lastMatch;
  }
  function renderReplay(){
    const t=replayTime(),clip=replay.clip,absolute=clip.start+t;
    let frame=clip.frames[0];for(const f of clip.frames){if(f.time>absolute)break;frame=f}drawFrame(frame);
    if(!replay.playing)return;
    while(replay.audioIndex<clip.audio.length&&clip.audio[replay.audioIndex].start-clip.start<=t+100){
      const packet=clip.audio[replay.audioIndex++],offset=Math.max(0,replay.offset-(packet.start-clip.start));
      const first=Math.ceil(offset*packet.rate/1000)*packet.channels;
      if(first<packet.data.length)audio.play({...packet,data:packet.data.subarray(first)},replay.audioStart+Math.max(0,packet.start-clip.start-replay.offset)/1000);
    }
    if(t>=clip.duration){replay.offset=clip.duration;replay.playing=false;audio.clear();$('romState').textContent='REPLAY FINISHED';controls();}
  }
  let lastTime=0;
  function loop(time){const delta=lastTime?Math.min(100,time-lastTime):0;lastTime=time;if(replay)renderReplay();else if(running&&!paused){tick+=delta;if(raw)render();}requestAnimationFrame(loop)}requestAnimationFrame(loop);
  async function accept(incoming){
    const selected=Array.from(incoming),roms=selected.filter(f=>/\.zip$/i.test(f.name)),pacs=selected.filter(f=>/\.pac$/i.test(f.name));
    if(!roms.length||pacs.length!==1){status('Choose at least one ROM ZIP and exactly one matching PAC together.',true);return false;}
    if(selected.some(f=>f.size>64*1024*1024)||roms.reduce((n,f)=>n+f.size,0)>128*1024*1024){status('ROM selection exceeds the 128 MB session limit (64 MB per ZIP).',true);return false;}
    stop();const session=generation;setMode();busy=true;controls();status('Decoding PAC and preparing the ROM pair…');
    try{const decoded=await parsePac(new Uint8Array(await pacs[0].arrayBuffer()),$('pacKey')?.value||'');if(session!==generation)return false;if(!decoded.mappings?.length)throw Error('This PAC contains no live frame mappings.');
      files=roms;pac=pacs[0];colorizer=new LiveColorizer(decoded);$('romGame').replaceChildren(...files.map(f=>new Option(f.name.replace(/\.zip$/i,''),f.name.replace(/\.zip$/i,'').toLowerCase())));$('romPair').textContent=pac.name+' · '+decoded.mappings.length+' mappings';status('ROM/PAC pair ready. Select the game ROM set, then Start ROM.');return true;
    }catch(error){files=[];pac=null;colorizer=null;status(error.message,true);return false;}finally{busy=false;controls();}
  }
  async function start(){
    if(!pac||!files.length||busy||running)return;
    if(!globalThis.crossOriginIsolated){status('Enable browser emulation, then select the files again.',true);return;}
    const session=++generation;busy=true;controls();$('romState').textContent='STARTING';status('Loading the browser emulator and checking ROM files…');$('romLog').textContent='';raw=null;tick=0;frameCount=0;colorizer.reset();
    try{
      if(!audio.muted)await audio.unlock();
      const payload=await Promise.all(files.map(async file=>({name:file.name,bytes:await file.arrayBuffer()})));
      if(session!==generation)return;worker=new Worker(new URL('./rom-worker.mjs?v=popeye-matrix-1',import.meta.url),{type:'module'});const currentWorker=worker;
      worker.onerror=e=>{if(worker!==currentWorker)return;appendLog(e.message);stop();status('Emulator error: '+e.message,true)};
      worker.onmessage=({data})=>{if(worker!==currentWorker)return;
        if(data.type==='started'){busy=false;running=true;paused=false;$('romTitle').textContent=data.info.split('\n')[0];$('romState').textContent='RUNNING';controls();if(!active)pause(true);status('ROM running. Use game controls or the service menus to test DMD animations and sound.');}
        if(data.type==='machine'){machineState=data;eventControls();}
        if(data.type==='event-status')status(data.text,!!data.error);
        if(data.type==='frame'){raw=data;frameCount++;$('romDimensions').textContent=data.w+' × '+data.h;}
        if(data.type==='audio'&&!paused&&!replay){history.recordAudio(tick,data);audio.play(data);}
        if(data.type==='log')appendLog(data.text);
        if(data.type==='error'){appendLog(data.message);stop();status(data.message,true);}
        if(data.type==='stopped'){stop();status('ROM stopped. Check the emulator log if it stopped during startup.');}
      };
      worker.postMessage({type:'start',files:payload,game:$('romGame').value},payload.map(f=>f.bytes));
    }catch(error){stop();status(error.message,true);}
  }
  function eventControls(){
    const popeye=$('romGame').value==='pop_lx5',enabled=popeye&&running&&!paused&&!replay;
    $('romEvents').hidden=!popeye;$('romMatrix').hidden=!popeye;
    const active=new Set(machineState?.active||[]),held=new Set(machineState?.held||[]);
    $('romMatrixMode').disabled=!enabled||!machineState;$('romMatrixRelease').disabled=!enabled||!held.size;
    panel.querySelectorAll('[data-popeye-switch]').forEach(button=>{const n=+button.dataset.popeyeSwitch;button.disabled=!enabled||!machineState||popeyeSwitchByNumber.get(n).managed;button.setAttribute('aria-pressed',String(active.has(n)));button.classList.toggle('matrix-held',held.has(n));});$('romCoinStart').disabled=!enabled||!machineState||machineState.starting;
    if(machineState)$('romBallState').textContent='Trough: '+machineState.trough+' / 6 · Shooter: '+(machineState.shooter?'ball ready':'empty')+' · In play: '+machineState.playfield+' · '+machineState.event;
    else $('romBallState').textContent='Start Popeye to enable the shot controls.';
    panel.querySelectorAll('[data-popeye-event]').forEach(button=>{button.disabled=!enabled||!machineState||machineState.busy||(button.dataset.popeyeEvent==='launch'?!machineState.shooter:!machineState.playfield);});
  }
  panel.querySelectorAll('[data-popeye-event]').forEach(button=>{button.onclick=()=>{if(running&&!paused&&!replay)send({type:'event',id:button.dataset.popeyeEvent});};});
  panel.querySelectorAll('[data-popeye-switch]').forEach(button=>{button.onclick=()=>{if(!button.disabled)send({type:'matrix',number:+button.dataset.popeyeSwitch,hold:$('romMatrixMode').value==='hold'});};});
  $('romMatrixRelease').onclick=()=>send({type:'matrix',release:true});
  $('romMatrixMode').onchange=()=>send({type:'matrix',release:true});
  $('romCoinStart').onclick=async()=>{
    try{if(!audio.muted)await audio.unlock();if(!running||paused||replay)return;
      send({type:'event',id:'begin-game'});
      status('Adding credit and pressing Start. The ROM will serve a ball when ready.');
    }catch(error){status(error.message,true)}
  };
  function key(code,state){if(!running||paused)return;if(state)pressed.add(code);else pressed.delete(code);send({type:'key',code,state});}
  const keyCodes={Digit0:26,Digit1:27,Digit2:28,Digit3:29,Digit4:30,Digit5:31,Digit6:32,Digit7:33,Digit8:34,Digit9:35,Enter:66,ArrowLeft:81,ArrowRight:82,ArrowUp:83,ArrowDown:84,ShiftLeft:93,ShiftRight:94,ControlLeft:95,ControlRight:96};
  function inputFocused(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;}
  document.addEventListener('keydown',event=>{if(!active||!running||inputFocused()||event.ctrlKey||event.metaKey)return;if(event.code==='Space'){event.preventDefault();if(!event.repeat)pause(replay?replay.playing:!paused);return}if(keyCodes[event.code]!==undefined){event.preventDefault();key(keyCodes[event.code],1)}});
  document.addEventListener('keyup',event=>{if(keyCodes[event.code]!==undefined&&pressed.has(keyCodes[event.code])){event.preventDefault();key(keyCodes[event.code],0)}});
  globalThis.addEventListener?.('blur',()=>{release();if(running&&(!paused||replay?.playing))pause(true)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&(!paused||replay?.playing))pause(true)});
  panel.querySelectorAll('[data-rom-key]').forEach(button=>{
    const code=+button.dataset.romKey;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);key(code,1)});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>key(code,0));
    button.onclick=event=>{if(event.detail===0){key(code,1);const timer=setTimeout(()=>{key(code,0);timers.delete(timer)},120);timers.add(timer)}};
  });
  $('romOpen').onclick=()=>$('romFiles').click();$('romFiles').onchange=async event=>{await accept(event.target.files);event.target.value=''};$('romStart').onclick=start;
  $('romPause').onclick=async()=>{try{if(!audio.muted)await audio.unlock();pause(replay?replay.playing:!paused)}catch(error){status(error.message,true)}};$('romReset').onclick=()=>{machineState=null;replay=null;history.clear();historyVersion='';pause(false);release();audio.clear();colorizer.reset();raw=null;tick=0;send({type:'reset'});};$('romStop').onclick=()=>{stop();status('ROM stopped. Your selected ROM/PAC pair is ready to start again.')};
  async function setSound(enabled){audio.muted=!enabled;audio.update();audio.clear();$('romSound').checked=enabled;onSoundChange(enabled);if(replay){replay.offset=replayTime();if(replay.playing)resumeReplay()}if(enabled&&running){try{await audio.unlock()}catch(error){audio.muted=true;audio.update();$('romSound').checked=false;onSoundChange(false);status(error.message,true)}}}
  $('romSound').oninput=()=>setSound($('romSound').checked);$('romVolume').oninput=()=>{audio.volume=+$('romVolume').value/100;audio.update()};
  $('romFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('romScreen').requestFullscreen()}catch{status('Fullscreen is unavailable in this browser.',true)}};
  $('romDoor').onclick=()=>{key(78,1);const timer=setTimeout(()=>{key(78,0);timers.delete(timer)},120);timers.add(timer);door=!door;$('romDoor').setAttribute('aria-pressed',String(door));$('romDoor').textContent='Coin door · '+(door?'open':'closed')};
  const switchNumber=()=>{const n=+$('romSwitch').value;if(!Number.isInteger(n)||n<1||n>1023)throw Error('Enter a switch number from 1 to 1023.');return n};
  $('romPulse').onclick=()=>{try{if(!running||paused)return;const number=switchNumber();send({type:'switch',number,state:1});const timer=setTimeout(()=>{send({type:'switch',number,state:0});timers.delete(timer)},120);timers.add(timer)}catch(error){status(error.message,true)}};
  $('romHold').onclick=()=>{try{if(!running||paused)return;if(hold!==null){send({type:'switch',number:hold,state:0});hold=null}else{hold=switchNumber();send({type:'switch',number:hold,state:1})}$('romHold').setAttribute('aria-pressed',String(hold!==null))}catch(error){status(error.message,true)}};
  $('romEnable').onclick=async()=>{try{if(!isSecureContext||!navigator.serviceWorker)throw Error('Browser emulation needs HTTPS and service-worker support.');status('Enabling browser emulation. The page will reload once…');if($('includedGame')?.value){const url=new URL(location.href);url.searchParams.set('game',$('includedGame').value);url.searchParams.set('playback','rom');history.replaceState(null,'',url);}await navigator.serviceWorker.register(new URL('coi-serviceworker.js',location.href),{scope:new URL('./',location.href).pathname});await navigator.serviceWorker.ready;if(navigator.serviceWorker.controller)location.reload();else navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true})}catch(error){status(error.message,true)}};
  controls();return {accept,start,stop,setSound,prepareAudio:()=>audio.muted?Promise.resolve():audio.unlock(),setActive(value){active=value;if(!value&&running&&(!paused||replay?.playing))pause(true);},get running(){return running}};
}
