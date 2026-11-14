import {builtInCatalog,builtInClip} from './built-in-animations.mjs?v=popeye-1';
import {RomHistory} from './rom-history.mjs?v=saved-1';
const sessionId=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not save animation'));});
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export class SavedRomHistory{
 constructor(){this.current=new RomHistory({maxDuration:Infinity,maxBytes:Infinity});this.saved=[];this.builtIn=[];this.session=sessionId();this.game='';this.frames=[];this.audio=[];this.queue=Promise.resolve();this.lastSave=0;this.error='';this.previousInputs=new Set();}
 get clips(){return [...this.builtIn,...this.saved,...this.metadata()];}
 metadata(){return this.current.clips.map(c=>({...c,id:this.session+':'+c.id,session:this.session,game:this.game,switches:[...(c.switches||[])]}));}
 async open(game){
  await this.flush();this.clear();await this.queue;this.game=game;this.saved=[];this.builtIn=[];
  try{this.builtIn=await builtInCatalog(game)}catch(error){this.error=error.message;}
  if(!globalThis.indexedDB){this.error='Local saving unavailable; recordings last for this session.';return;}
  try{
   this.db??=await new Promise((resolve,reject)=>{const req=indexedDB.open('dmd-learned-animations',1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('frames',{keyPath:['session','time']});db.createObjectStore('audio',{keyPath:['session','end']});db.createObjectStore('clips',{keyPath:'id'}).createIndex('game','game');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
   const tx=this.db.transaction('clips','readonly');const finished=done(tx);this.saved=await request(tx.objectStore('clips').index('game').getAll(game));await finished;
   this.saved.sort((a,b)=>(a.savedAt||0)-(b.savedAt||0)||a.start-b.start);this.error='';
  }catch(error){this.error='Saving unavailable: '+error.message;}
 }
 clear(){
  if(this.db){const entries=this.metadata();this.flush();this.saved.push(...entries);}
  this.current.clear();this.session=sessionId();this.frames=[];this.audio=[];this.lastSave=0;this.previousInputs.clear();
 }
 recordFrame(time,frame,key,label){
  const last=this.current.frames.at(-1);this.current.recordFrame(time,frame,key,label);
  const item=this.current.frames.at(-1);if(item!==last)this.frames.push(item);
  if(time-this.lastSave>=1000){this.lastSave=time;this.flush();}
 }
 recordAudio(time,packet){this.current.recordAudio(time,packet);this.audio.push(this.current.audio.at(-1));if(time-this.lastSave>=1000){this.lastSave=time;this.flush();}}
 recordTriggers(inputs){const clip=this.current.clips.at(-1);if(clip){clip.switches??=new Set();for(const n of inputs)if(!this.previousInputs.has(n))clip.switches.add(n);}this.previousInputs=new Set(inputs);}
 flush(){
  if(!this.db)return this.queue;
  const frames=this.frames.splice(0),audio=this.audio.splice(0),session=this.session,current=this.current;
  const clips=this.metadata().map(c=>({...c,savedAt:Date.now()}));
  if(!frames.length&&!audio.length&&!clips.length)return this.queue;
  this.queue=this.queue.then(async()=>{
   const tx=this.db.transaction(['frames','audio','clips'],'readwrite'),finished=done(tx);
   for(const f of frames)tx.objectStore('frames').put({...f,session});
   for(const a of audio)tx.objectStore('audio').put({...a,session});
   for(const c of clips)tx.objectStore('clips').put(c);
   await finished;
   // Only the saved sample data leaves RAM; the complete recording stays in IndexedDB.
   if(this.session===session){
    const time=frames.at(-1)?.time;if(time!==undefined)while(current.frames.length>1&&current.frames[1].time<=time)current.frames.shift();
    const end=audio.at(-1)?.end;if(end!==undefined)while(current.audio.length>1&&current.audio[1].end<=end)current.audio.shift();
   }
  }).catch(error=>{this.error='Animation could not be saved: '+error.message;this.frames.unshift(...frames);this.audio.unshift(...audio);});
  return this.queue;
 }
 async clip(id){
  const builtIn=this.builtIn.find(c=>c.id===id);if(builtIn)return builtInClip(builtIn);
  if(!this.db){const number=Number(String(id).split(':').at(-1));return this.current.clip(number)&&{...this.current.clip(number),id};}
  await this.flush();const clip=this.clips.find(c=>c.id===id);if(!clip)return null;
  const tx=this.db.transaction(['frames','audio'],'readonly'),finished=done(tx);
  const framesPromise=request(tx.objectStore('frames').getAll(IDBKeyRange.bound([clip.session,clip.start],[clip.session,clip.end])));
  const audioPromise=new Promise((resolve,reject)=>{const out=[],req=tx.objectStore('audio').openCursor(IDBKeyRange.bound([clip.session,clip.start],[clip.session,Infinity]));req.onerror=()=>reject(req.error);req.onsuccess=()=>{const cursor=req.result;if(!cursor||cursor.value.start>=clip.end){resolve(out);return}out.push(cursor.value);cursor.continue();};});
  const [allFrames,allAudio]=await Promise.all([framesPromise,audioPromise]);await finished;
  const frames=allFrames.filter(f=>f.time<clip.end||clip.start===clip.end);if(!frames.length)return null;
  const audio=allAudio.map(a=>{const first=Math.max(0,Math.ceil((clip.start-a.start)*a.rate/1000)),last=Math.min(a.data.length/a.channels,Math.floor((clip.end-a.start)*a.rate/1000));return {...a,start:Math.max(clip.start,a.start),data:a.data.subarray(first*a.channels,Math.max(first,last)*a.channels)};}).filter(a=>a.data.length);
  return {...clip,frames,audio,duration:Math.max(1,clip.end-clip.start)};
 }
}
