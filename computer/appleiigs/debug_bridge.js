// Opt-in browser connection to an MCP companion. No credentials are persisted.
export function installDebugBridge(api,setControl,setEdit=()=>{}) {
 const dialog=document.createElement('dialog');dialog.id='iigsMcpDialog';
 dialog.innerHTML=`<form method="dialog"><h2>Emulator MCP connection</h2><label>Bridge URL<input id="mcpUrl" type="url" value="http://127.0.0.1:8788" required></label><label>Pairing token<input id="mcpToken" type="password" autocomplete="off" required></label><label><input id="mcpControl" type="checkbox"> Allow pause, resume, stepping and traces</label><label><input id="mcpEdit" type="checkbox"> Allow editing disk snapshots (original stays unchanged)</label><label>Editing workspace<select id="mcpDisk"></select></label><button type="button" id="mcpRefreshDisks">Refresh workspaces</button><button type="button" id="mcpDownloadDisk">Download modified disk</button><p>Reinsert the downloaded disk to test your changes.</p><p id="mcpState" role="status">Disconnected</p><button type="button" id="mcpConnect">Connect</button><button type="button" id="mcpDisconnect">Disconnect</button><button value="close" formnovalidate>Close</button></form>`;
 const style=document.createElement('style');style.textContent='#iigsMcpDialog{max-width:90vw;max-height:85dvh;overflow:auto;background:#ddd;color:#111;padding:16px}#iigsMcpDialog,#iigsMcpDialog *{touch-action:manipulation}#iigsMcpDialog label{display:block;margin:12px 0}#iigsMcpDialog input:not([type=checkbox]){display:block;width:100%;min-height:44px;font-size:16px}#iigsMcpDialog select{display:block;width:100%;min-height:44px;font-size:16px}#iigsMcpDialog button{min-height:44px;font-size:16px;margin:4px}';document.head.append(style);document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.textContent='MCP / Debug connection';button.style.minHeight='44px';button.onclick=()=>dialog.showModal();document.getElementById('mediaTitle')?.after(button);
 const addLauncher=()=>{
  const panel=document.querySelector('#unifiedMachinePanel [data-panel="machine"]');
  if(!panel)return false;
  if(!document.getElementById('unifiedMcpConnection')){
   const launcher=button.cloneNode(true);launcher.id='unifiedMcpConnection';launcher.onclick=()=>dialog.showModal();panel.append(launcher);
  }
  return true;
 };
 if(!addLauncher()){
  const observer=new MutationObserver(()=>{if(addLauncher())observer.disconnect();});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),30000);
 }
 const $=id=>dialog.querySelector('#'+id);let connection=null;
 const disconnect=()=>{connection?.abort();connection=null;setControl(false);setEdit(false);$('mcpEdit').checked=false;$('mcpControl').checked=false;$('mcpState').textContent='Disconnected';};
 $('mcpEdit').onchange=()=>setEdit(!!connection&&$('mcpEdit').checked);
 const refreshDisks=async()=>{const {workspaces}=await api.execute('list_disk_workspaces');const select=$('mcpDisk'),old=select.value;select.replaceChildren(...workspaces.map(w=>new Option(w.name+' · '+w.workspace,w.workspace)));if(workspaces.some(w=>w.workspace===old))select.value=old;};
 $('mcpRefreshDisks').onclick=refreshDisks;
 $('mcpDownloadDisk').onclick=()=>{try{const snapshot=api.diskSnapshot($('mcpDisk').value);const url=URL.createObjectURL(new Blob([snapshot.data],{type:'application/octet-stream'}));const link=document.createElement('a');link.href=url;link.download=snapshot.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('mcpState').textContent='Download requested — choose Save to Files. Original disk unchanged.';}catch(e){$('mcpState').textContent=e.message;}};
 $('mcpControl').onchange=()=>setControl(!!connection&&$('mcpControl').checked);
 $('mcpDisconnect').onclick=disconnect;
 $('mcpConnect').onclick=async()=>{
  connection?.abort();const abort=new AbortController();connection=abort;setControl(false);setEdit(false);
  const token=$('mcpToken').value.trim();const session=crypto.randomUUID();
  try {
   const base=new URL($('mcpUrl').value);if(base.protocol!=='https:' && !(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('Use HTTPS, or HTTP on localhost.');
   if(!token)throw Error('Enter the pairing token');
   const request=async(path,body)=>{const r=await fetch(new URL(path,base),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({session,...body}),signal:abort.signal});if(!r.ok)throw Error('Bridge HTTP '+r.status);return r.json();};
   await request('/pair',{});setControl($('mcpControl').checked);setEdit($('mcpEdit').checked);$('mcpState').textContent='Connected · '+session.slice(0,8);
   while(!abort.signal.aborted) {
    const {command}=await request('/poll',{});
    if(command) {
     let result,error;try{if(Date.now()>command.expires)throw Error('Command expired');result=await api.execute(command.method,command.args);if(command.method.includes('disk'))await refreshDisks();}catch(e){error=e.message;}
     await request('/result',{id:command.id,result,error});
    } else await new Promise(resolve=>setTimeout(resolve,250));
   }
  }catch(e){if(connection===abort){disconnect();$('mcpState').textContent=e.name==='AbortError'?'Disconnected':e.message;}}
 };
 window.addEventListener('pagehide',disconnect);
 return {disconnect};
}
