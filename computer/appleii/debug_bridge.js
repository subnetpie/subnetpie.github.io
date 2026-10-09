// Opt-in browser connection to an MCP companion. No credentials are persisted.
export function installDebugBridge(api,setControl) {
 const dialog=document.createElement('dialog');dialog.id='iigsMcpDialog';
 dialog.innerHTML=`<form method="dialog"><h2>Emulator MCP connection</h2><label>Bridge URL<input id="mcpUrl" type="url" value="http://127.0.0.1:8788" required></label><label>Pairing token<input id="mcpToken" type="password" autocomplete="off" required></label><label><input id="mcpControl" type="checkbox"> Allow pause, resume, stepping and traces</label><p id="mcpState" role="status">Disconnected</p><button type="button" id="mcpConnect">Connect</button><button type="button" id="mcpDisconnect">Disconnect</button><button value="close" formnovalidate>Close</button></form>`;
 const style=document.createElement('style');style.textContent='#iigsMcpDialog{max-width:90vw;max-height:85dvh;overflow:auto;background:#ddd;color:#111;padding:16px}#iigsMcpDialog,#iigsMcpDialog *{touch-action:manipulation}#iigsMcpDialog label{display:block;margin:12px 0}#iigsMcpDialog input:not([type=checkbox]){display:block;width:100%;min-height:44px;font-size:16px}#iigsMcpDialog button{min-height:44px;font-size:16px;margin:4px}';document.head.append(style);document.body.append(dialog);
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
 const disconnect=()=>{connection?.abort();connection=null;setControl(false);$('mcpControl').checked=false;$('mcpState').textContent='Disconnected';};
 $('mcpControl').onchange=()=>setControl(!!connection&&$('mcpControl').checked);
 $('mcpDisconnect').onclick=disconnect;
 $('mcpConnect').onclick=async()=>{
  connection?.abort();const abort=new AbortController();connection=abort;setControl(false);
  const token=$('mcpToken').value.trim();const session=crypto.randomUUID();
  try {
   const base=new URL($('mcpUrl').value);if(base.protocol!=='https:' && !(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname)))throw Error('Use HTTPS, or HTTP on localhost.');
   if(!token)throw Error('Enter the pairing token');
   const request=async(path,body)=>{const r=await fetch(new URL(path,base),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({session,...body}),signal:abort.signal});if(!r.ok)throw Error('Bridge HTTP '+r.status);return r.json();};
   await request('/pair',{});setControl($('mcpControl').checked);$('mcpState').textContent='Connected · '+session.slice(0,8);
   while(!abort.signal.aborted) {
    const {command}=await request('/poll',{});
    if(command) {
     let result,error;try{if(Date.now()>command.expires)throw Error('Command expired');result=await api.execute(command.method,command.args);}catch(e){error=e.message;}
     await request('/result',{id:command.id,result,error});
    } else await new Promise(resolve=>setTimeout(resolve,250));
   }
  }catch(e){if(connection===abort){disconnect();$('mcpState').textContent=e.name==='AbortError'?'Disconnected':e.message;}}
 };
 window.addEventListener('pagehide',disconnect);
 return {disconnect};
}
