import {lampCatalog,lampLabel,lampRecommendation,normalizeLampChoice,compatibleProfiles,bulbBases,ledColors,lampSources} from './lamp-catalog.mjs';
const areaLabel=area=>area==='main'?'Main playfield':area==='upper'?'Upper playfield':'Backbox / head';
export function lampPickMarkup(game,area){return lampCatalog(game).filter(l=>l.area===area).map(l=>{
 if(l.point)return `<span class="planner-bulb-glow" data-light-glow="${l.id}" style="left:${l.point.x}%;top:${l.point.y}%" aria-hidden="true"></span><button type="button" class="lamp-pick" data-light-pick="${l.id}" style="left:${l.point.x}%;top:${l.point.y}%" aria-label="Select ${l.kind} ${l.number}: ${l.name}" title="${l.kind} ${l.number}: ${l.name}">${l.kind==='flasher'?'F':''}${l.number}</button>`;
 if(l.zone)return `<span class="lamp-gi-zone" data-light-zone="${l.id}" style="left:${l.zone.x}%;top:${l.zone.y}%;width:${l.zone.w}%;height:${l.zone.h}%" aria-hidden="true"></span><button type="button" class="lamp-pick gi-pick" data-light-pick="${l.id}" style="left:${l.zone.x+l.zone.w/2}%;top:${l.zone.y+5}%" aria-label="Select GI string ${l.number}: ${l.name}">GI${l.number}</button>`;
 return '';
}).join('');}

export function createLampPlanner({root,table,onChange=()=>{}}){
 root.innerHTML=`<div class="lamp-planner-heading"><div><h3>Lighting</h3><p>Choose a lamp. Plan its color and bulb.</p></div><label class="lamp-edit-toggle"><input id="lampSelectMode" type="checkbox"> Pick on playfield</label></div>
 <div class="lamp-planner-grid"><div class="lamp-browser"><div class="lamp-filters"><label>Type<select id="lampKind"><option value="all">All lighting</option><option value="insert">Inserts / controlled lamps</option><option value="gi">GI strings</option><option value="flasher">Flasher bulbs</option></select></label><label>Find<input id="lampSearch" type="search" placeholder="Name, number, backbox…"></label></div><div id="lampCount" class="lamp-list-count"></div><div id="lampList" class="lamp-list" role="group" aria-label="Selectable lamps"></div></div>
 <section class="lamp-detail" aria-label="Selected lamp"><h4 id="lampSelectedName"></h4><p id="lampLocation"></p>
 <div class="lamp-choice-grid"><label>LED color<select id="lampColor"></select></label><label>Socket / base<select id="lampBase"></select></label><label>LED style<select id="lampProfile"></select></label><label id="lampQuantityLabel">Bulbs in this string<input id="lampQuantity" type="number" min="1" max="100" placeholder="Count required"></label></div>
 <div class="lamp-recommendation"><strong>Suggested configuration</strong><p id="lampRecommendation"></p><p id="lampCompatibility"></p><a id="lampSupplier" target="_blank" rel="noreferrer">LED specifications</a></div>
 <div class="lamp-plan-actions"><label><input id="lampPreview" type="checkbox"> Preview light</label><button id="lampReset" type="button">Reset lamp</button><button id="lampExport" type="button">Export CSV</button></div>
 <p id="lampSaveStatus" role="status"></p><details class="lamp-reference"><summary>Bulb details & sources</summary><dl class="lamp-facts"><dt>Factory bulb</dt><dd id="lampFactory"></dd><dt>Color evidence</dt><dd id="lampColorEvidence"></dd><dt>Live output</dt><dd id="lampLive"></dd></dl><p class="lamp-accuracy" id="lampAccuracy"></p><p class="lamp-accuracy">Color preview is illustrative. SMD count alone does not determine brightness; check voltage, base, lens and fit. GI strings need your bulb count.</p>
 <div class="lamp-source-links"><a id="lampFactorySource" target="_blank" rel="noreferrer">Factory tech chart</a><a href="${lampSources.guide}" target="_blank" rel="noreferrer">LED selection guide</a><a href="${lampSources.brightness}" target="_blank" rel="noreferrer">Manufacturer brightness guide</a></div></details></section></div>`;
 const $=id=>root.querySelector('#'+id),storageKey='dmd-lamp-plans-v1';
 let game='',catalog=[],selected=null,live=null,plans={},nodes=new Map(),liveSignature='';
 try{const saved=JSON.parse(globalThis.localStorage?.getItem(storageKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const key of ['pop_lx5','t2_l8'])if(saved[key]&&typeof saved[key]==='object'&&!Array.isArray(saved[key]))plans[key]=saved[key];}catch{}
 table.classList.add('lamp-planner-ready');
 const choice=lamp=>normalizeLampChoice(lamp,plans[game]?.[lamp.id]);
 function save(){try{globalThis.localStorage?.setItem(storageKey,JSON.stringify(plans));$('lampSaveStatus').textContent='Saved on this device · '+Object.keys(plans[game]||{}).length+' choices for this game.';}catch{$('lampSaveStatus').textContent='Storage unavailable. Download your choices before leaving.';}updateExport();}
 function updateExport(){$('lampExport').disabled=!Object.keys(plans[game]||{}).length;}
 function cacheNodes(){nodes=new Map();for(const node of table.querySelectorAll('[data-light-glow], [data-light-pick], [data-light-zone]')){const id=node.dataset.lightGlow||node.dataset.lightPick||node.dataset.lightZone;if(!nodes.has(id))nodes.set(id,[]);nodes.get(id).push(node);}}
 function selectedLamp(){return catalog.find(l=>l.id===selected);}
 function renderList(){
  const term=$('lampSearch').value.trim().toLowerCase(),kind=$('lampKind').value,filtered=catalog.filter(l=>(kind==='all'||l.kind===kind)&&[lampLabel(l),areaLabel(l.area),l.base].join(' ').toLowerCase().includes(term));
  $('lampCount').textContent=filtered.length+' selectable entries · '+catalog.filter(l=>l.kind==='gi').length+' GI strings';
  $('lampList').replaceChildren(...filtered.map(l=>{const b=document.createElement('button');b.type='button';b.dataset.lampRow=l.id;b.setAttribute('aria-pressed',String(l.id===selected));const title=document.createElement('strong'),location=document.createElement('small');title.textContent=lampLabel(l);location.textContent=areaLabel(l.area)+(l.zone?' · region only':l.point?' · mapped':' · position not mapped');b.append(title,location);b.onclick=()=>select(l.id);return b;}));
 }
 function liveText(lamp){if(lamp.kind==='gi')return 'GI state is not available · preview only';if(!live)return 'Start the game to see live output';const active=lamp.kind==='insert'?live.lamps:live.flashers||live.solenoids;return (active||[]).includes(lamp.number)?'On':'Off';}
 function paintLive(){for(const lamp of catalog)for(const node of nodes.get(lamp.id)||[]){const chosen=lamp.id===selected;if(node.classList.contains('planner-bulb-glow'))node.classList.toggle('planned-on',liveText(lamp)==='On'||chosen&&$('lampPreview').checked);if(node.classList.contains('lamp-gi-zone'))node.classList.toggle('gi-preview',chosen&&$('lampPreview').checked);}}
 function paint(){
  for(const lamp of catalog){const rec=lampRecommendation(lamp,choice(lamp)),isSelected=lamp.id===selected;
   for(const node of nodes.get(lamp.id)||[]){node.style.setProperty('--planned-color',rec.color.hex);node.style.setProperty('--planned-strength',rec.profile.strength);node.classList.toggle('selected-light',isSelected);if(node.matches('button'))node.setAttribute('aria-pressed',String(isSelected));}
  }
  const picked=selectedLamp();for(const node of table.querySelectorAll('.backbox-lamp'))node.classList.toggle('lamp-backbox-selected',picked?.kind==='insert'&&!picked.point&&Number(node.dataset.lamp)===picked.number);
  paintLive();
 }
 function renderDetail(){const lamp=selectedLamp();if(!lamp)return;const value=choice(lamp),rec=lampRecommendation(lamp,value);
  $('lampSelectedName').textContent=lampLabel(lamp);$('lampLocation').textContent=areaLabel(lamp.area)+' · '+(lamp.zone?'Approximate string region':lamp.point?'Mapped location':'Bulb position not mapped');
  $('lampFactory').textContent=lamp.kind==='flasher'?'#'+lamp.base+' clear incandescent · 12 V LED flasher replacement class':(lamp.base==='unknown'?'Socket not verified for this location':bulbBases[lamp.base])+' · clear incandescent';
  $('lampColorEvidence').textContent=lamp.colorEvidence;$('lampLive').textContent=liveText(lamp);
  $('lampColor').replaceChildren(...ledColors.map(c=>new Option(c.label,c.id)));$('lampColor').value=value.color;
  const allowed=lamp.kind==='flasher'?['89','906']:['unknown','bayonet','wedge'];$('lampBase').replaceChildren(...allowed.map(base=>new Option(bulbBases[base],base)));$('lampBase').value=value.base;
  $('lampProfile').replaceChildren(...compatibleProfiles(lamp,value.base).map(p=>new Option(p.label,p.id)));$('lampProfile').value=value.profile;
  $('lampQuantityLabel').hidden=lamp.kind!=='gi';$('lampQuantity').value=value.quantity||'';
  $('lampRecommendation').textContent=rec.text;$('lampCompatibility').textContent=(rec.ready?'Confirm the voltage, socket and physical fit before ordering. ':'Verify the socket and color before ordering. ')+rec.note;$('lampSupplier').href=rec.profile.url;
  $('lampAccuracy').textContent=lamp.kind==='gi'?'This entry selects a whole GI string. Individual GI bulb positions and quantities are not verified.':lamp.point?'Artwork alignment is approximate. Your LED color choice changes the preview; it is not a factory color specification.':'This bulb is selectable from the factory list, but its exact position is not mapped on the artwork.';
  $('lampFactorySource').href=lamp.source;updateExport();paint();const colors={};for(const entry of catalog.filter(l=>l.kind==='insert'))colors[entry.number]??=lampRecommendation(entry,choice(entry)).color.hex;onChange({selected:lamp,colors});
 }
 function select(id){if(!catalog.some(l=>l.id===id))return;selected=id;for(const b of $('lampList').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.lampRow===id));renderDetail();}
 function change(){const lamp=selectedLamp();if(!lamp)return;plans[game]??={};plans[game][lamp.id]=normalizeLampChoice(lamp,{base:$('lampBase').value,color:$('lampColor').value,profile:$('lampProfile').value,quantity:$('lampQuantity').value?Number($('lampQuantity').value):null});save();renderDetail();}
 for(const id of ['lampColor','lampBase','lampProfile','lampQuantity'])$(id).onchange=change;
 $('lampKind').onchange=renderList;$('lampSearch').oninput=renderList;$('lampPreview').onchange=paint;
 $('lampSelectMode').onchange=()=>table.classList.toggle('lamp-selecting',$('lampSelectMode').checked);
 table.addEventListener('click',event=>{const button=event.target.closest?.('[data-light-pick]');if(button){event.preventDefault();event.stopPropagation();select(button.dataset.lightPick);if((globalThis.innerWidth||9999)<=760)root.scrollIntoView?.({behavior:'smooth',block:'start'});}});
 $('lampReset').onclick=()=>{const lamp=selectedLamp();if(!lamp)return;delete plans[game]?.[lamp.id];save();renderDetail();};
 $('lampExport').onclick=()=>{
  const rows=[['Game','Lamp ID','Type','Circuit','Name','Area','LED base','LED color','LED style','Bulb quantity','Status','Factory source']];
  for(const lamp of catalog.filter(l=>plans[game]?.[l.id])){const rec=lampRecommendation(lamp,choice(lamp));rows.push([game,lamp.id,lamp.kind,lamp.number,lamp.name,areaLabel(lamp.area),bulbBases[rec.choice.base],rec.color.label,rec.profile.label,rec.choice.quantity??'count required',rec.ready?'Confirm fit before ordering':'Socket / color verification required',lamp.source]);}
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=game+'-lamp-led-plan.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return {selectCircuit(number){const lamp=catalog.find(l=>l.kind==='insert'&&l.number===number);if(lamp)select(lamp.id);},updateGame(next){if(next===game)return;game=next;table.querySelector('.playfield-boards>div:last-child')?.prepend(root);catalog=lampCatalog(game);cacheNodes();liveSignature='';selected=catalog[0]?.id;live=null;$('lampSearch').value='';$('lampKind').value='all';$('lampPreview').checked=false;renderList();renderDetail();},updateLive(state){live=state;const lamp=selectedLamp();if(lamp){const text=liveText(lamp);if($('lampLive').textContent!==text)$('lampLive').textContent=text;}const signature=JSON.stringify([live?.lamps,live?.flashers||live?.solenoids]);if(signature!==liveSignature){liveSignature=signature;paintLive();}}};
}
