const DB_NAME='appleii-disk-persistence';
const DB_VERSION=1;
const STORE='blocks';

function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   const store=db.objectStoreNames.contains(STORE)?req.transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:'id'});
   if(!store.indexNames.contains('diskKey'))store.createIndex('diskKey','diskKey',{unique:false});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}

// Stable identity for the source image. Hashing the complete source prevents a
// different disk with the same filename/size from inheriting another disk's writes.
export function mediaPersistenceKey(name,value){
 const data=value instanceof Uint8Array?value:new Uint8Array(value);
 let h1=0x811c9dc5,h2=0x9e3779b9;
 for(let i=0;i<data.length;i++){
  const b=data[i];
  h1=Math.imul(h1^b,0x01000193)>>>0;
  h2=(Math.imul(h2^b,0x85ebca6b)+(i&255))>>>0;
 }
 for(let i=0;i<name.length;i++)h1=Math.imul(h1^name.charCodeAt(i),0x01000193)>>>0;
 return `v1:${data.length}:${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}`;
}

export async function restorePersistentBlocks(key,data){
 if(!key||!globalThis.indexedDB)return 0;
 const db=await openDB();
 try{
  const records=await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly');
   const req=tx.objectStore(STORE).index('diskKey').getAll(key);
   req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
  let restored=0;
  for(const record of records){
   const offset=record.block*512,bytes=new Uint8Array(record.data);
   if(offset+512<=data.length&&bytes.length===512){data.set(bytes,offset);restored++;}
  }
  return restored;
 } finally {db.close();}
}

export function createBlockPersistenceWriter(){
 const pending=new Map();
 let timer=null,busy=false;
 async function flush(){
  timer=null;if(busy||!pending.size||!globalThis.indexedDB)return;
  busy=true;
  const batch=[...pending.values()];pending.clear();
  try{
   const db=await openDB();
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    for(const r of batch)store.put(r);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
   db.close();
  }catch(err){console.error('Unable to persist disk writes',err);}
  finally{busy=false;if(pending.size)schedule();}
 }
 function schedule(){if(timer===null)timer=setTimeout(flush,300);}
 return {
  write(drive,disk,block){
   if(!disk?.persistenceKey||disk.writeProtected||!disk.image)return;
   const offset=block*512;if(offset+512>disk.image.length)return;
   const id=`${disk.persistenceKey}:${block}`;
   pending.set(id,{id,diskKey:disk.persistenceKey,block,data:disk.image.slice(offset,offset+512).buffer,updatedAt:Date.now()});
   schedule();
  },
  flush
 };
}
