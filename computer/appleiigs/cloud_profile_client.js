import {loadMachineProfile,saveMachineProfile} from './machine_profile.js?v=20261006-profile1';

const SETTINGS='subnetpie.apple2.cloudSync.v1';

export function loadCloudSyncSettings(){
  try{
    const v=JSON.parse(localStorage.getItem(SETTINGS)||'{}');
    return {
      endpoint:typeof v.endpoint==='string'?v.endpoint.replace(/\/$/,''):'',
      token:typeof v.token==='string'?v.token:'',
      profileId:typeof v.profileId==='string'&&v.profileId?v.profileId:'default-iigs'
    };
  }catch(_){return {endpoint:'',token:'',profileId:'default-iigs'};}
}

export function saveCloudSyncSettings(value){
  const next={...loadCloudSyncSettings(),...value};
  next.endpoint=(next.endpoint||'').replace(/\/$/,'');
  localStorage.setItem(SETTINGS,JSON.stringify(next));
  return next;
}

export class CloudProfileClient{
  constructor(settings=loadCloudSyncSettings()){
    this.settings=settings;
    this.revision=null;
  }
  get enabled(){return !!(this.settings.endpoint&&this.settings.token&&this.settings.profileId);}
  headers(extra={}){
    if(!this.enabled)throw new Error('Cloud profile sync is not configured');
    return {authorization:`Bearer ${this.settings.token}`,...extra};
  }
  url(path){return `${this.settings.endpoint}${path}`;}
  async request(path,options={}){
    const response=await fetch(this.url(path),{...options,headers:this.headers(options.headers||{})});
    if(!response.ok){
      let detail='';try{detail=(await response.json()).error||'';}catch(_){}
      const error=new Error(detail||`Cloud request failed (${response.status})`);error.status=response.status;throw error;
    }
    return response;
  }
  async pull(){
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}`);
    const data=await response.json();
    this.revision=data.revision;
    const profile=saveMachineProfile({...data.profile,id:data.profileId,revision:data.revision});
    return profile;
  }
  async push(profile=loadMachineProfile()){
    const headers={'content-type':'application/json'};
    if(this.revision!==null)headers['if-match']=`"${this.revision}"`;
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}`,{
      method:'PUT',headers,body:JSON.stringify({profile})
    });
    const data=await response.json();this.revision=data.revision;
    return {...profile,revision:data.revision};
  }
  async uploadDisk(diskId,name,data){
    const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
    const response=await this.request(`/api/disks/${encodeURIComponent(diskId)}`,{
      method:'PUT',headers:{'content-type':'application/octet-stream','x-filename':name},body:bytes
    });
    return response.json();
  }
  async downloadDisk(diskId){
    const response=await this.request(`/api/disks/${encodeURIComponent(diskId)}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  async assignDisk(driveId,diskId){
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}/drives/${encodeURIComponent(driveId)}/disk`,{
      method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({diskId})
    });
    return response.json();
  }
  async uploadBlock(driveId,block,bytes){
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(data.byteLength!==512)throw new Error('Cloud overlay writes must be 512 bytes');
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}/drives/${encodeURIComponent(driveId)}/blocks/${block}`,{
      method:'PUT',headers:{'content-type':'application/octet-stream'},body:data
    });
    return response.json();
  }
  async overlayManifest(driveId){
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}/drives/${encodeURIComponent(driveId)}/overlay`);
    return response.json();
  }
  async downloadBlock(driveId,block){
    const response=await this.request(`/api/profiles/${encodeURIComponent(this.settings.profileId)}/drives/${encodeURIComponent(driveId)}/blocks/${block}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
