import {CloudProfileClient,loadCloudSyncSettings,saveCloudSyncSettings} from './cloud_profile_client.js?v=20261006-cloud1';
import {loadMachineProfile,syncLegacySettingsFromProfile} from './machine_profile.js?v=20261006-profile1';

const cloudMode=new URLSearchParams(location.search).get('cloud')==='1';
if(!cloudMode) throw new Error('Cloud profile UI loaded without ?cloud=1');

function install(){
  if(document.getElementById('iigsCloudProfilePanel'))return;
  const dialog=document.getElementById('iigsConfigurationDialog');
  if(!dialog)return;
  const form=dialog.querySelector('form');
  if(!form)return;

  const settings=loadCloudSyncSettings();
  const section=document.createElement('section');
  section.id='iigsCloudProfilePanel';
  section.style.cssText='margin-top:16px;padding:12px;background:#ecece8;border:1px solid #777';
  section.innerHTML=`
    <h3>Cloud machine profile <small style="font-weight:400">test mode</small></h3>
    <p style="font-size:13px;margin:.35rem 0">Cloud sync is isolated behind <code>?cloud=1</code>. The normal IIgs path is unchanged.</p>
    <label style="display:grid;gap:4px;margin:8px 0">Worker URL<input id="iigsCloudEndpoint" type="url" autocapitalize="none" autocomplete="off" value="${settings.endpoint||''}"></label>
    <label style="display:grid;gap:4px;margin:8px 0">Profile ID<input id="iigsCloudProfileId" autocapitalize="none" autocomplete="off" value="${settings.profileId||'default-iigs'}"></label>
    <label style="display:grid;gap:4px;margin:8px 0">Sync token<input id="iigsCloudToken" type="password" autocomplete="off" value="${settings.token||''}"></label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
      <button type="button" id="iigsCloudSaveSettings">Save cloud settings</button>
      <button type="button" id="iigsCloudPull">Pull profile</button>
      <button type="button" id="iigsCloudPush">Push profile</button>
    </div>
    <p id="iigsCloudStatus" role="status" style="font-size:13px;min-height:1.2em;margin:.55rem 0 0"></p>`;
  form.insertBefore(section,form.querySelector('footer'));

  const status=section.querySelector('#iigsCloudStatus');
  const readForm=()=>saveCloudSyncSettings({
    endpoint:section.querySelector('#iigsCloudEndpoint').value.trim(),
    token:section.querySelector('#iigsCloudToken').value,
    profileId:section.querySelector('#iigsCloudProfileId').value.trim()||'default-iigs'
  });
  const setStatus=(text,bad=false)=>{status.textContent=text;status.style.color=bad?'#8b0000':'#123';};

  section.querySelector('#iigsCloudSaveSettings').addEventListener('click',()=>{
    const s=readForm();
    setStatus(s.endpoint&&s.token?'Cloud settings saved locally.':'Saved. Worker URL/token still required.',!(s.endpoint&&s.token));
  });

  section.querySelector('#iigsCloudPull').addEventListener('click',async()=>{
    try{
      const client=new CloudProfileClient(readForm());
      setStatus('Pulling profile…');
      const profile=await client.pull();
      syncLegacySettingsFromProfile(profile);
      setStatus(`Pulled ${profile.name||profile.id} · revision ${profile.revision}. Reload to apply hardware changes.`);
    }catch(err){setStatus(err?.message||String(err),true);}
  });

  section.querySelector('#iigsCloudPush').addEventListener('click',async()=>{
    try{
      const client=new CloudProfileClient(readForm());
      setStatus('Pushing profile…');
      const profile=await client.push(loadMachineProfile());
      setStatus(`Pushed ${profile.name||profile.id} · revision ${profile.revision}.`);
    }catch(err){setStatus(err?.message||String(err),true);}
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
