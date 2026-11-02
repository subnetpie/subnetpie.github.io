(() => {
  if(new URLSearchParams(location.search).get('machine')==='iie')return;

  function ensureSummaryNodes(){
    const dialog=document.getElementById('iigsConfigurationDialog');
    if(!dialog)return false;
    let map=dialog.querySelector('.iigs-storage-map');
    if(!map)return false;

    if(!document.getElementById('iigsSmartPortSummary')){
      const holder=document.createElement('span');
      holder.id='iigsSmartPortSummary';
      holder.hidden=true;
      map.append(holder);
    }
    if(!document.getElementById('iigsDiskIISummary')){
      const holder=document.createElement('span');
      holder.id='iigsDiskIISummary';
      holder.hidden=true;
      map.append(holder);
    }
    return true;
  }

  function patch(){
    const dialog=document.getElementById('iigsConfigurationDialog');
    if(!dialog||dialog.__storageCompatPatched)return false;
    const original=dialog.openWithConfiguration;
    if(typeof original!=='function')return false;
    dialog.__storageCompatPatched=true;
    dialog.openWithConfiguration=function(...args){
      ensureSummaryNodes();
      return original.apply(this,args);
    };
    return true;
  }

  let tries=0;
  const wait=()=>{
    ensureSummaryNodes();
    if(patch())return;
    if(++tries<120)setTimeout(wait,50);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wait,{once:true});
  else wait();
})();
