import {parsePac} from './pac.mjs';
import {LiveColorizer} from './live-colorizer.mjs';

export class RomAudio {
  constructor(){this.context=null;this.nodes=new Set();this.next=0;this.volume=0.7;this.muted=false;}
  async unlock(){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('This browser does not support Web Audio.');this.context??=new Audio({latencyHint:'interactive'});await this.context.resume();}
  clear(){for(const node of this.nodes){try{node.stop()}catch{}}this.nodes.clear();this.next=0;}
  play({data,channels,rate}){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||!data.length)return;
    if(this.next-ctx.currentTime>0.3)this.clear();
    const count=data.length/channels,buffer=ctx.createBuffer(channels,count,rate);
    for(let c=0;c<channels;c++){const out=buffer.getChannelData(c);for(let i=0;i<count;i++)out[i]=data[i*channels+c];}
    const source=ctx.createBufferSource();source.buffer=buffer;
    if(!this.gain){this.gain=ctx.createGain();this.gain.connect(ctx.destination);}this.gain.gain.value=this.muted?0:this.volume;source.connect(this.gain);
    const when=Math.max(this.next,ctx.currentTime+0.03);source.start(when);this.next=when+buffer.duration;
    this.nodes.add(source);source.onended=()=>{this.nodes.delete(source);source.disconnect()};
  }
  update(){if(this.gain)this.gain.gain.value=this.muted?0:this.volume;}
}

export function createRomViewer({setMode,onSoundChange=()=>{}}){
  const $=id=>document.getElementById(id),panel=$('romPanel');
  panel.innerHTML=`<div class="panel rom-loader"><div><h2>ROM + PAC emulator</h2><p>Load a game’s ROM ZIP and matching PAC together. Everything runs on this device.</p></div><button id="romOpen" class="primary">＋ Load ROM + PAC</button><input id="romFiles" type="file" multiple hidden></div>
  <p id="romIsolation" class="rom-notice" hidden>Browser emulation needs an isolated page. <button id="romEnable">Enable browser emulation</button> This reloads the page. Published selections reload automatically; choose local files again.</p>
  <div class="panel rom-selection"><label>ROM set <select id="romGame"><option value="">Choose ROM + PAC files first</option></select></label><span id="romPair">No ROM/PAC pair loaded</span><button id="romStart" class="primary" disabled>Start ROM</button></div>
  <div class="panel display-panel"><div class="display-top"><span id="romTitle">Choose a game above</span><span class="badge">LIVE COLOR + SOUND</span></div><div class="screen-wrap" id="romScreen"><canvas id="romDmd" width="1024" height="256" aria-label="Live ROM dot matrix display"></canvas><div class="screen-label"><span id="romDimensions">128 × 32</span><span>LIVE DMD</span></div></div><div class="display-bottom"><span id="romState">STOPPED</span><span id="romMatch">Live color DMD</span></div></div>
  <div class="panel rom-controls"><button id="romPause" disabled>Ⅱ Pause</button><button id="romReset" disabled>↶ Reset ROM</button><button id="romStop" disabled>■ Stop</button><label><input id="romSound" type="checkbox" checked> Sound on</label><label>Volume <input id="romVolume" type="range" min="0" max="100" value="70" aria-label="ROM audio volume"></label><button id="romFullscreen">⛶ Fullscreen</button></div>
  <div class="panel rom-inputs"><h2>Game controls</h2><div class="rom-buttons"><button data-rom-key="31">Coin · 5</button><button data-rom-key="27">Start · 1</button><button data-rom-key="33">Service escape · 7</button><button data-rom-key="34">Service − · 8</button><button data-rom-key="35">Service + · 9</button><button data-rom-key="26">Service enter · 0</button><button id="romDoor" aria-pressed="false">Coin door · closed</button></div><div class="rom-switch"><label>Switch number <input id="romSwitch" type="number" min="1" max="1023" value="13"></label><button id="romPulse">Pulse switch</button><button id="romHold" aria-pressed="false">Hold switch</button></div><p>Use the game’s service menus to test animations and sound. Switch numbers depend on the game. This is a ROM test bench; ball movement is controlled manually. Live PAC colorization is experimental until checked with your ROM/PAC pair.</p></div>
  <p id="romStatus" role="status" class="status">Select a game above to run its ROMs with color DMD and sound.</p><details class="panel rom-log"><summary>Emulator log</summary><pre id="romLog"></pre></details>`;
  let files=[],pac=null,colorizer=null,worker=null,active=false,running=false,busy=false,paused=false,raw=null,frameCount=0,tick=0,hold=null,door=false,generation=0;
  const audio=new RomAudio(),pressed=new Set(),timers=new Set();
  const canvas=$('romDmd'),ctx=canvas.getContext('2d');
  function status(text,error=false){$('romStatus').textContent=text;$('romStatus').classList.toggle('error',error);}
  function appendLog(text){$('romLog').textContent=($('romLog').textContent+'\n'+text).slice(-20000);}
  function send(data){worker?.postMessage(data)}
  function controls(){for(const id of ['romPause','romReset','romStop','romPulse','romHold','romDoor'])$(id).disabled=id==='romStop'?!(running||busy):!running;panel.querySelectorAll('[data-rom-key]').forEach(b=>b.disabled=!running);$('romStart').disabled=busy||running||!pac||!files.length||!globalThis.crossOriginIsolated;$('romGame').disabled=busy||running;$('romOpen').disabled=busy||running;$('romIsolation').hidden=!!globalThis.crossOriginIsolated;$('romPause').textContent=paused?'▶ Resume':'Ⅱ Pause';}
  function release(){for(const code of pressed)send({type:'key',code,state:0});pressed.clear();if(hold!==null)send({type:'switch',number:hold,state:0});hold=null;$('romHold').setAttribute('aria-pressed','false');}
  function stop(){generation++;release();for(const timer of timers)clearTimeout(timer);timers.clear();send({type:'stop'});worker?.terminate();worker=null;audio.clear();running=false;busy=false;paused=false;door=false;$('romDoor').setAttribute('aria-pressed','false');$('romDoor').textContent='Coin door · closed';$('romState').textContent='STOPPED';controls();}
  function pause(value){if(!running)return;release();paused=value;send({type:'pause',paused});audio.clear();$('romState').textContent=paused?'PAUSED':'RUNNING';controls();}
  function render(){
    if(raw){const f=colorizer.render(raw.data,raw.w,raw.h,raw.depth,tick,raw.planes),colors=$('romColor')?.checked===false?null:f.colors;
      if(canvas.width!==raw.w*8||canvas.height!==raw.h*8){canvas.width=raw.w*8;canvas.height=raw.h*8;}
      ctx.fillStyle='#080b0c';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(let i=0;i<f.data.length;i++){const value=f.data[i],c=colors?.[value]||[Math.round(255*value/(f.levels-1)),Math.round(135*value/(f.levels-1)),Math.round(36*value/(f.levels-1))];ctx.fillStyle='rgb('+c.join(',')+')';ctx.beginPath();ctx.arc((i%raw.w)*8+4,Math.floor(i/raw.w)*8+4,3,0,Math.PI*2);ctx.fill();}
      $('romMatch').textContent=colorizer.matches+' triggers · '+colorizer.lastMatch;
    }
  }
  let lastTime=0;
  function loop(time){const delta=lastTime?Math.min(100,time-lastTime):0;lastTime=time;if(running&&!paused){tick+=delta;if(raw)render();}requestAnimationFrame(loop)}requestAnimationFrame(loop);
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
      if(session!==generation)return;worker=new Worker(new URL('./rom-worker.mjs',import.meta.url),{type:'module'});const currentWorker=worker;
      worker.onerror=e=>{if(worker!==currentWorker)return;appendLog(e.message);stop();status('Emulator error: '+e.message,true)};
      worker.onmessage=({data})=>{if(worker!==currentWorker)return;
        if(data.type==='started'){busy=false;running=true;paused=false;$('romTitle').textContent=data.info.split('\n')[0];$('romState').textContent='RUNNING';controls();if(!active)pause(true);status('ROM running. Use game controls or the service menus to test DMD animations and sound.');}
        if(data.type==='frame'){raw=data;frameCount++;$('romDimensions').textContent=data.w+' × '+data.h;}
        if(data.type==='audio'&&!paused)audio.play(data);
        if(data.type==='log')appendLog(data.text);
        if(data.type==='error'){appendLog(data.message);stop();status(data.message,true);}
        if(data.type==='stopped'){stop();status('ROM stopped. Check the emulator log if it stopped during startup.');}
      };
      worker.postMessage({type:'start',files:payload,game:$('romGame').value},payload.map(f=>f.bytes));
    }catch(error){stop();status(error.message,true);}
  }
  function key(code,state){if(!running||paused)return;if(state)pressed.add(code);else pressed.delete(code);send({type:'key',code,state});}
  const keyCodes={Digit0:26,Digit1:27,Digit2:28,Digit3:29,Digit4:30,Digit5:31,Digit6:32,Digit7:33,Digit8:34,Digit9:35,Enter:66,ArrowLeft:81,ArrowRight:82,ArrowUp:83,ArrowDown:84,ShiftLeft:93,ShiftRight:94,ControlLeft:95,ControlRight:96};
  function inputFocused(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;}
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
  $('romPause').onclick=async()=>{try{if(!audio.muted)await audio.unlock();pause(!paused)}catch(error){status(error.message,true)}};$('romReset').onclick=()=>{release();audio.clear();colorizer.reset();raw=null;tick=0;send({type:'reset'});};$('romStop').onclick=()=>{stop();status('ROM stopped. Your selected ROM/PAC pair is ready to start again.')};
  async function setSound(enabled){audio.muted=!enabled;audio.update();audio.clear();$('romSound').checked=enabled;onSoundChange(enabled);if(enabled&&running){try{await audio.unlock()}catch(error){audio.muted=true;audio.update();$('romSound').checked=false;onSoundChange(false);status(error.message,true)}}}
  $('romSound').oninput=()=>setSound($('romSound').checked);$('romVolume').oninput=()=>{audio.volume=+$('romVolume').value/100;audio.update()};
  $('romFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('romScreen').requestFullscreen()}catch{status('Fullscreen is unavailable in this browser.',true)}};
  $('romDoor').onclick=()=>{key(78,1);const timer=setTimeout(()=>{key(78,0);timers.delete(timer)},120);timers.add(timer);door=!door;$('romDoor').setAttribute('aria-pressed',String(door));$('romDoor').textContent='Coin door · '+(door?'open':'closed')};
  const switchNumber=()=>{const n=+$('romSwitch').value;if(!Number.isInteger(n)||n<1||n>1023)throw Error('Enter a switch number from 1 to 1023.');return n};
  $('romPulse').onclick=()=>{try{if(!running||paused)return;const number=switchNumber();send({type:'switch',number,state:1});const timer=setTimeout(()=>{send({type:'switch',number,state:0});timers.delete(timer)},120);timers.add(timer)}catch(error){status(error.message,true)}};
  $('romHold').onclick=()=>{try{if(!running||paused)return;if(hold!==null){send({type:'switch',number:hold,state:0});hold=null}else{hold=switchNumber();send({type:'switch',number:hold,state:1})}$('romHold').setAttribute('aria-pressed',String(hold!==null))}catch(error){status(error.message,true)}};
  $('romEnable').onclick=async()=>{try{if(!isSecureContext||!navigator.serviceWorker)throw Error('Browser emulation needs HTTPS and service-worker support.');status('Enabling browser emulation. The page will reload once…');if($('includedGame')?.value){const url=new URL(location.href);url.searchParams.set('game',$('includedGame').value);url.searchParams.set('playback','rom');history.replaceState(null,'',url);}await navigator.serviceWorker.register(new URL('coi-serviceworker.js',location.href),{scope:new URL('./',location.href).pathname});await navigator.serviceWorker.ready;if(navigator.serviceWorker.controller)location.reload();else navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true})}catch(error){status(error.message,true)}};
  controls();return {accept,start,stop,setSound,prepareAudio:()=>audio.muted?Promise.resolve():audio.unlock(),setActive(value){active=value;if(!value&&running&&!paused)pause(true);},get running(){return running}};
}
