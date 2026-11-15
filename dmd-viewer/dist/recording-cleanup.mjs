// Purge the retired recorder's per-origin data without touching game preferences.
export function deleteStoredRecordings(onBlocked=()=>{}){
 if(!globalThis.indexedDB)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const request=indexedDB.deleteDatabase('dmd-learned-animations');
  request.onsuccess=()=>resolve();
  request.onerror=()=>reject(request.error||Error('Browser storage deletion failed.'));
  request.onblocked=onBlocked;
 });
}
