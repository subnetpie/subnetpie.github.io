// Direct monitor-color presets for the emulator control panel.
// Apply the selected phosphor/color treatment to the final presentation canvas
// so the choice works in IIgs SHR as well as legacy Apple II video modes.
(() => {
  const STORAGE='subnetpie.apple2.displayMonitor.v2';
  const MODES = [
    {id:'color', label:'Color', cls:'display-preset-color'},
    {id:'white', label:'White', cls:'display-preset-white'},
    {id:'green', label:'Green', cls:'display-preset-green'},
    {id:'amber', label:'Amber', cls:'display-preset-amber'}
  ];
  const FILTERS={
    color:'none',
    white:'grayscale(1) contrast(1.04) brightness(1.04)',
    green:'grayscale(1) sepia(1) saturate(5.5) hue-rotate(72deg) brightness(.92) contrast(1.08)',
    amber:'grayscale(1) sepia(1) saturate(5.2) hue-rotate(352deg) brightness(1.01) contrast(1.08)'
  };

  function savedMode(){
    try{const v=localStorage.getItem(STORAGE);return MODES.some(m=>m.id===v)?v:'color';}
    catch(_){return 'color';}
  }
  function saveMode(v){try{localStorage.setItem(STORAGE,v);}catch(_){}}
  function applyMode(mode){
    if(!FILTERS[mode])mode='color';
    const screen=document.getElementById('screen');
    if(screen)screen.style.filter=FILTERS[mode];
    document.documentElement.dataset.displayMonitor=mode;
    const source=document.getElementById('buttonColor');
    if(source)source.dataset.displayColor=mode;
    saveMode(mode);
    window.dispatchEvent(new CustomEvent('apple-display-monitor-changed',{detail:{mode}}));
    return mode;
  }
  function currentMode(){
    const mode=document.documentElement.dataset.displayMonitor||savedMode();
    return FILTERS[mode]?mode:'color';
  }

  // Small public bridge used by the unified panel and future display controls.
  window.__appleIIDisplayMonitor={
    modes:MODES.map(m=>m.id),
    getMode:currentMode,
    setMode:applyMode
  };

  function install() {
    const controls=document.getElementById('controls');
    const source=document.getElementById('buttonColor');
    const scan=document.getElementById('buttonScanlines');
    if(!controls||!source||document.getElementById('displayColorPresets'))return;

    // The old button cycles states and cannot represent four independent
    // monitor modes. Keep it out of the layout and use direct presets below.
    source.style.display='none';
    source.setAttribute('aria-hidden','true');
    source.tabIndex=-1;

    const panel=document.createElement('div');
    panel.id='displayColorPresets';
    panel.className='display-color-presets';
    panel.setAttribute('role','radiogroup');
    panel.setAttribute('aria-label','Display monitor');

    const buttons=new Map();
    for(const mode of MODES) {
      const button=document.createElement('button');
      button.type='button';
      button.className=`display-color-preset ${mode.cls}`;
      button.dataset.displayColor=mode.id;
      button.setAttribute('role','radio');
      button.setAttribute('aria-label',`${mode.label} display`);
      button.title=`${mode.label} display`;
      if(mode.id==='color') {
        const bars=document.createElement('span');
        bars.className='display-preset-rainbow';
        bars.setAttribute('aria-hidden','true');
        button.append(bars);
      } else {
        const swatch=document.createElement('span');
        swatch.className='display-preset-swatch';
        swatch.setAttribute('aria-hidden','true');
        button.append(swatch);
      }
      const text=document.createElement('span');
      text.className='display-preset-label';
      text.textContent=mode.label;
      button.append(text);
      panel.append(button);
      buttons.set(mode.id,button);
    }

    function sync() {
      const active=currentMode();
      for(const [id,button] of buttons) {
        const selected=id===active;
        button.classList.toggle('selected',selected);
        button.setAttribute('aria-checked',selected?'true':'false');
      }
    }

    for(const [id,button] of buttons)button.addEventListener('click',()=>{applyMode(id);sync();});
    window.addEventListener('apple-display-monitor-changed',sync);

    if(scan)controls.insertBefore(panel,scan);
    else controls.append(panel);

    const style=document.createElement('style');
    style.textContent=`
      #displayColorPresets{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:7px;
        padding:7px;
        background:#183f2b;
        border:2px solid #426a52;
        border-radius:5px;
      }
      .display-color-preset{
        min-width:0;
        min-height:64px;
        padding:5px;
        border:4px solid #101416;
        border-radius:3px;
        background:#253fff;
        color:#fff;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:4px;
        touch-action:manipulation;
      }
      .display-color-preset.selected{outline:3px solid #c7d0d8;outline-offset:1px}
      .display-preset-rainbow,.display-preset-swatch{display:block;width:100%;height:30px;border:1px solid #222}
      .display-preset-rainbow{background:linear-gradient(to bottom,#35c95a 0 16%,#f4cf28 16% 32%,#f88a25 32% 48%,#ef5b74 48% 64%,#d35b93 64% 80%,#55a8ff 80% 100%)}
      .display-preset-white .display-preset-swatch{background:#f4f4f4}
      .display-preset-green .display-preset-swatch{background:#00e65c}
      .display-preset-amber .display-preset-swatch{background:#ffc21a}
      .display-preset-label{font-size:11px;line-height:1;font-weight:700}
      #buttonScanlines{grid-column:1 / -1}
      @media(max-width:430px){
        #displayColorPresets{gap:5px;padding:5px}
        .display-color-preset{min-height:58px;padding:4px}
        .display-preset-label{font-size:10px}
      }
    `;
    document.head.append(style);
    applyMode(savedMode());
    sync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
