import {parsePac} from '../dmd-viewer/dist/pac.mjs';
import {LiveColorizer} from '../dmd-viewer/dist/live-colorizer.mjs';
import {games,gameById,shared} from './games.mjs';

const select=document.querySelector('#game'),status=document.querySelector('#status'),tables=document.querySelector('#tables'),service=document.querySelector('#serviceSwitches'),canvas=document.querySelector('#dmd'),ctx=canvas.getContext('2d');
let worker,abort,generation=0,ready=false,paused=false,colorizer,audio,nextAudio=0,pendingFrame,lastPaint=0;
function paint(now){if(pendingFrame&&now-lastPaint>=33){const frame=pendingFrame;pendingFrame=null;lastPaint=now;draw(frame);}requestAnimationFrame(paint);}requestAnimationFrame(paint);
const held=new Map(),sources=new Set();
function message(text,error=false){status.textContent=text;status.hidden=!text;status.classList.toggle('error',error);}
function send(data){worker?.postMessage(data);}
function clearAudio(){for(const source of sources){try{source.stop()}catch{}}sources.clear();nextAudio=0;}
function unlock(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});}catch{}}
document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
function sound({data,channels,rate}){
 if(!audio||audio.state!=='running'||paused)return;
 const frames=Math.floor(data.length/channels);if(!frames)return;
 const buffer=audio.createBuffer(channels,frames,rate);
 for(let c=0;c<channels;c++){const out=buffer.getChannelData(c);for(let i=0;i<frames;i++)out[i]=data[i*channels+c];}
 const source=audio.createBufferSource(),gain=audio.createGain();gain.gain.value=.7;source.buffer=buffer;source.connect(gain).connect(audio.destination);
 nextAudio=Math.max(audio.currentTime+.02,nextAudio);if(nextAudio>audio.currentTime+.5){clearAudio();nextAudio=audio.currentTime+.02;}
 sources.add(source);source.onended=()=>sources.delete(source);source.start(nextAudio);nextAudio+=buffer.duration;
}
function clearInputs(){for(const [number,item] of held){clearTimeout(item.timer);send({type:'input',number,pressed:false});}held.clear();}
function press(number){if(!ready||paused)return;const previous=held.get(number);if(previous){clearTimeout(previous.timer);previous.timer=null;return;}held.set(number,{at:performance.now(),timer:null});send({type:'input',number,pressed:true});}
function release(number){const item=held.get(number);if(!item)return;clearTimeout(item.timer);item.timer=setTimeout(()=>{if(held.get(number)!==item)return;held.delete(number);send({type:'input',number,pressed:false});},Math.max(0,120-(performance.now()-item.at)));}
function switchButton(item,point){
 const button=document.createElement('button');button.type='button';button.dataset.switch=item.number;button.dataset.managed=String(!!item.managed);button.setAttribute('aria-pressed','false');button.title=`${item.code||item.number} · ${item.label}${item.managed?' (automatic)':''}`;button.setAttribute('aria-label',button.title);button.disabled=true;
 if(point){button.className='switch';button.style.left=point.x+'%';button.style.top=point.y+'%';button.textContent=item.number;
  if(/flipper/i.test(item.label)){button.classList.add('flipper');if(item.managed)button.classList.add('auto');const small=document.createElement('small');small.textContent=/left/i.test(item.label)?'LEFT':'RIGHT';button.append(small);}
 }else{button.textContent=`${item.code||item.number} · ${item.label}`;}
 button.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();button.setPointerCapture?.(event.pointerId);press(item.number);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>release(item.number));
 button.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)press(item.number);}});
 button.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();release(item.number);}});
 button.addEventListener('blur',()=>release(item.number));
 button.addEventListener('click',event=>{if(event.detail===0&&!held.has(item.number)){press(item.number);release(item.number);}});
 return button;
}
function lamp(item,point){const el=document.createElement('span');el.className='lamp';el.dataset.lamp=item.number;el.style.left=point.x+'%';el.style.top=point.y+'%';el.title=`${item.number} · ${item.name}`;return el;}
function renderTable(game){
 tables.replaceChildren();service.replaceChildren();const located=new Set();
 for(const area of game.areas){
  const column=document.createElement('div'),title=document.createElement('h3');title.textContent=area==='upper'?'Upper table':'Table';column.append(title);
  const scroll=document.createElement('div');scroll.className='board-scroll';const board=document.createElement('div');board.className='board';
  const image=document.createElement('img');image.src=new URL(`playfield/${game.id==='popeye'?'popeye':'t2'}-${area}.webp`,shared);image.alt=`${game.title} ${title.textContent.toLowerCase()} lights and switches`;board.append(image);
  for(const item of game.lamps.filter(l=>!l.unused))for(const point of [item,...(item.extra||[])])if((point.area||item.area)===area&&Number.isFinite(point.x))board.append(lamp(item,point));
  for(const point of game.hotspots.filter(p=>p.area===area)){const item=game.map.get(point.number);if(item&&!item.unused){located.add(item.number);board.append(switchButton(item,point));}}
  scroll.append(board);column.append(scroll);tables.append(column);
 }
 const others=document.createElement('div');others.className='other-switches';
 for(const item of game.map.values())if(item.number>8&&item.number!==22&&!item.unused&&!located.has(item.number))others.append(switchButton(item));
 if(others.childElementCount)tables.lastElementChild.append(others);
 const outside=document.createElement('div');outside.className='outside-lamps';
 for(const item of game.lamps.filter(l=>!l.unused&&!Number.isFinite(l.x))){const el=document.createElement('span');el.className='outside-lamp';el.dataset.lamp=item.number;const dot=document.createElement('i');el.append(dot,`${item.number} · ${item.name}`);outside.append(el);}
 if(outside.childElementCount)tables.lastElementChild.append(outside);
 for(let n=1;n<=8;n++){const button=switchButton(game.map.get(n));if([6,7].includes(n))button.classList.add('red');service.append(button);}
 const door=document.createElement('button');door.type='button';door.dataset.door='';door.disabled=true;door.textContent='22 · Coin door closed';door.setAttribute('aria-pressed','true');door.addEventListener('click',()=>{if(ready&&!paused)send({type:'door'});});service.append(door);
}
function state(data){
 ready=data.ready;paused=data.paused;const active=new Set([...data.active,...data.held]),lamps=new Set(data.lamps);
 for(const button of document.querySelectorAll('[data-switch]')){button.disabled=!ready||paused||button.dataset.managed==='true';button.setAttribute('aria-pressed',String(active.has(Number(button.dataset.switch))));}
 for(const el of document.querySelectorAll('[data-lamp]'))el.classList.toggle('on',lamps.has(Number(el.dataset.lamp)));
 const door=service.querySelector('[data-door]');door.disabled=!ready||paused;door.setAttribute('aria-pressed',String(data.doorClosed));door.textContent=`22 · Coin door ${data.doorClosed?'closed':'open'}`;
 if(ready)message('');
}
function draw(frame){const rendered=colorizer.render(frame.data,frame.w,frame.h,frame.depth,frame.time,frame.planes);ctx.fillStyle='#050708';ctx.fillRect(0,0,canvas.width,canvas.height);const sx=canvas.width/frame.w,sy=canvas.height/frame.h;
 for(let i=0;i<rendered.data.length;i++){const value=rendered.data[i],color=rendered.colors?.[value];ctx.fillStyle=color?`rgb(${color[0]},${color[1]},${color[2]})`:`rgb(${Math.round(value*255/(rendered.levels-1))},${Math.round(value*140/(rendered.levels-1))},0)`;ctx.beginPath();ctx.ellipse((i%frame.w+.5)*sx,(Math.floor(i/frame.w)+.5)*sy,sx*.42,sy*.42,0,0,Math.PI*2);ctx.fill();}
}
async function loadGame(id){
 const game=gameById(id)||games[0],token=++generation;clearInputs();worker?.terminate();worker=null;pendingFrame=null;abort?.abort();abort=new AbortController();clearAudio();ready=false;paused=false;select.value=game.id;renderTable(game);ctx.clearRect(0,0,canvas.width,canvas.height);message('Loading game…');
 try{
  const options={signal:abort.signal};const [rom,pac]=await Promise.all([fetch(new URL('library/'+game.rom,shared),options),fetch(new URL('library/'+game.pac,shared),options)]);if(!rom.ok||!pac.ok)throw Error('Could not load the selected game.');
  const [bytes,pacBytes]=await Promise.all([rom.arrayBuffer(),pac.arrayBuffer()]);const parsed=await parsePac(new Uint8Array(pacBytes));if(token!==generation)return;colorizer=new LiveColorizer(parsed);
  worker=new Worker(new URL('./rom-worker.mjs?v=clean-20261115a',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(token!==generation)return;if(data.type==='state')state(data);if(data.type==='frame')pendingFrame=data;if(data.type==='audio')sound(data);if(data.type==='started')message('Starting game…');if(data.type==='error'){ready=false;message(data.message,true);}};
  worker.onerror=()=>{ready=false;message('The game could not start. Reload to try again.',true);};worker.postMessage({type:'start',set:game.set,bytes},[bytes]);
 }catch(error){if(token===generation&&error.name!=='AbortError')message(error.message,true);}
}
function visibility(){const shouldPause=document.hidden||!document.hasFocus();clearInputs();clearAudio();send({type:'pause',paused:shouldPause});}
window.addEventListener('blur',visibility);window.addEventListener('focus',visibility);document.addEventListener('visibilitychange',visibility);
select.addEventListener('change',()=>{unlock();loadGame(select.value);});
async function isolate(){
 if(crossOriginIsolated){sessionStorage.removeItem('dmd-clean-isolation');return true;}
 if(!navigator.serviceWorker)throw Error('Open this viewer using HTTPS or localhost.');
 const url=new URL('./coi-serviceworker.js',import.meta.url);await navigator.serviceWorker.register(url,{scope:'./'});
 await new Promise((resolve,reject)=>{const check=()=>{if(navigator.serviceWorker.controller?.scriptURL===url.href){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',check);resolve();}};const timer=setTimeout(()=>reject(Error('Browser isolation could not start. Reload to try again.')),10000);navigator.serviceWorker.addEventListener('controllerchange',check);check();});
 if(sessionStorage.getItem('dmd-clean-isolation'))throw Error('Browser isolation is unavailable. Close and reopen this page.');sessionStorage.setItem('dmd-clean-isolation','1');location.reload();return false;
}
export const startup=(async()=>{message('Loading game…');try{if(await isolate())await loadGame(new URL(location.href).searchParams.get('game')||'popeye');}catch(error){message(error.message,true);}})();
