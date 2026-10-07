// Direct display-color presets for the emulator control panel.
// This intentionally drives the existing #buttonColor/setColor path so the
// renderer behavior remains unchanged; only the control surface changes.
(() => {
  const MODES = [
    {id:'color', label:'Color', cls:'display-preset-color'},
    {id:'green', label:'Green', cls:'display-preset-green'},
    {id:'amber', label:'Amber', cls:'display-preset-amber'},
    {id:'white', label:'White', cls:'display-preset-white'}
  ];

  function currentMode(source) {
    const value=(source?.innerText||source?.textContent||'color').trim().toLowerCase();
    return MODES.some(mode=>mode.id===value)?value:'color';
  }

  function install() {
    const controls=document.getElementById('controls');
    const source=document.getElementById('buttonColor');
    const scan=document.getElementById('buttonScanlines');
    if(!controls||!source||document.getElementById('displayColorPresets'))return;

    // Keep the original control live but out of the layout. Its existing click
    // listener is still the authoritative renderer state transition.
    source.style.display='none';
    source.setAttribute('aria-hidden','true');
    source.tabIndex=-1;

    const panel=document.createElement('div');
    panel.id='displayColorPresets';
    panel.className='display-color-presets';
    panel.setAttribute('role','radiogroup');
    panel.setAttribute('aria-label','Display color');

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
      const active=currentMode(source);
      for(const [id,button] of buttons) {
        const selected=id===active;
        button.classList.toggle('selected',selected);
        button.setAttribute('aria-checked',selected?'true':'false');
      }
    }

    function choose(target) {
      // The legacy button cycles color -> green -> amber -> white -> color.
      // Cycling through that existing path avoids duplicating renderer logic.
      for(let i=0;i<MODES.length && currentMode(source)!==target;i++)source.click();
      sync();
    }

    for(const [id,button] of buttons)button.addEventListener('click',()=>choose(id));
    source.addEventListener('click',()=>queueMicrotask(sync));

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
      .display-color-preset.selected{
        outline:3px solid #35ff39;
        outline-offset:1px;
      }
      .display-preset-rainbow,.display-preset-swatch{
        display:block;
        width:100%;
        height:30px;
        border:1px solid #222;
      }
      .display-preset-rainbow{
        background:linear-gradient(to bottom,#35c95a 0 16%,#f4cf28 16% 32%,#f88a25 32% 48%,#ef5b74 48% 64%,#d35b93 64% 80%,#55a8ff 80% 100%);
      }
      .display-preset-green .display-preset-swatch{background:#00e65c}
      .display-preset-amber .display-preset-swatch{background:#ffc21a}
      .display-preset-white .display-preset-swatch{background:#f4f4f4}
      .display-preset-label{font-size:11px;line-height:1;font-weight:700}
      #buttonScanlines{grid-column:1 / -1}
      @media(max-width:430px){
        #displayColorPresets{gap:5px;padding:5px}
        .display-color-preset{min-height:58px;padding:4px}
        .display-preset-label{font-size:10px}
      }
    `;
    document.head.append(style);
    sync();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
