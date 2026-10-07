// Load IIgs hardware configuration before the main module constructs the machine.
const params=new URLSearchParams(location.search);
const iiGsMode=params.get('machine')!=='iie';
const uiMode=params.get('ui');
const unifiedMode=uiMode!=='legacy';

// Unified controls are now the default on this feature branch. Preserve a
// deliberate ?ui=legacy escape hatch without duplicating mode checks inside
// every unified module; normalize the default URL before those modules load.
if(unifiedMode&&uiMode!=='unified'){
  const url=new URL(location.href);
  url.searchParams.set('ui','unified');
  history.replaceState(null,'',url);
}

const assets={
  configCss:'./iigs_configuration_mobile.css?v=20261004-touch3',
  config:'./iigs_configuration.js?v=20261004-slots-drives3',
  slot4:'./iigs_slot4_devices.js?v=20261004-slot4-skyfox1',
  extraDrives:'./iigs_extra_drives.js?v=20261006-smartport4',
  persistent:'./iigs_persistent_boot.js?v=20261006-persistent-boot2',
  persistentUi:'./iigs_persistent_boot_ui.js?v=20261006-persistent-ui1',
  speed:'./display_speed_panel.js?v=20261006-speed-presets1',
  color:'./display_color_panel.js?v=20261006-display-presets1',
  keyboard:'./iigs_keyboard_layout.js?v=20261005-iigs-kbd1',
  caps:'./caps_lock_indicator.js?v=20261006-caps-led1',
  unifiedCss:'./unified_controls.css?v=20261006-unified3',
  driveCss:'./unified_drive_manager.css?v=20261006-drive-manager2',
  unified:'./unified_controls.js?v=20261006-unified3',
  drive:'./unified_drive_manager.js?v=20261006-drive-manager2'
};

function addStyle(href){
  if(document.querySelector(`link[href="${href}"]`))return;
  const el=document.createElement('link');el.rel='stylesheet';el.href=href;document.head.append(el);
}
function addScript(src,{module=false,defer=false}={}){
  if(document.querySelector(`script[src="${src}"]`))return;
  const el=document.createElement('script');el.src=src;if(module)el.type='module';if(defer)el.defer=true;document.head.append(el);
}

if(document.readyState==='loading'){
  document.write(`<link rel="stylesheet" href="${assets.configCss}">`);
  document.write(`<script type="module" src="${assets.config}"><\/script>`);
  document.write(`<script type="module" src="${assets.slot4}"><\/script>`);
  if(iiGsMode){
    document.write(`<script type="module" src="${assets.extraDrives}"><\/script>`);
    document.write(`<script type="module" src="${assets.persistent}"><\/script>`);
    document.write(`<script type="module" src="${assets.persistentUi}"><\/script>`);
  }
  document.write(`<script type="module" src="${assets.speed}"><\/script>`);
  document.write(`<script src="${assets.color}"><\/script>`);
  document.write(`<script type="module" src="${assets.keyboard}"><\/script>`);
  document.write(`<script src="${assets.caps}"><\/script>`);
}else{
  addStyle(assets.configCss);
  const hardware=import(assets.config).then(()=>import(assets.slot4));
  if(iiGsMode)hardware.then(()=>import(assets.extraDrives)).then(()=>import(assets.persistent)).then(()=>import(assets.persistentUi));
  import(assets.speed);
  addScript(assets.color);
  import(assets.keyboard);
  addScript(assets.caps);
}

// Independent legacy menus remain available underneath the unified UI.
(() => {
  const menus=[['buttonSettings','controls'],['buttonJoySettings','joyControls']]
    .map(([buttonId,panelId])=>({button:document.getElementById(buttonId),panel:document.getElementById(panelId)}))
    .filter(({button,panel})=>button&&panel);

  const close=({button,panel})=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
  const open=menu=>{menus.forEach(other=>{if(other!==menu)close(other);});menu.panel.hidden=false;menu.button.setAttribute('aria-expanded','true');};

  menus.forEach(menu=>{
    close(menu);
    menu.button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      menu.panel.hidden?open(menu):close(menu);
    });
  });

  document.addEventListener('pointerdown',event=>menus.forEach(menu=>{
    if(!menu.panel.hidden&&!menu.panel.contains(event.target)&&!menu.button.contains(event.target))close(menu);
  }));

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const menu=menus.find(({panel})=>!panel.hidden);if(!menu)return;
    event.preventDefault();event.stopImmediatePropagation();close(menu);menu.button.focus();
  },true);
})();

if(unifiedMode){
  addStyle(assets.unifiedCss);
  addStyle(assets.driveCss);
  addScript(assets.unified,{defer:true});
  addScript(assets.drive,{defer:true});
}
