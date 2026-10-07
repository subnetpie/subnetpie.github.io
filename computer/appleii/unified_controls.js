(() => {
  // Unified controls are the production default. Only the explicit legacy
  // override should suppress this layer.
  if(new URLSearchParams(location.search).get('ui')==='legacy')return;

  const STORAGE={
    island:'subnetpie.apple2.unifiedIsland.v2',
    tab:'subnetpie.apple2.unifiedTab.v1',
    glide:'subnetpie.apple2.glidepadMode.v1'
  };
  const get=(k,fallback)=>{try{const v=localStorage.getItem(k);return v==null?fallback:v;}catch(_){return fallback;}};
  const set=(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}};
  const click=id=>{const el=document.getElementById(id);if(el){el.click();return true;}return false;};
  const pointerDown=id=>{
    const el=document.getElementById(id);
    if(!el)return false;
    const EventCtor=window.PointerEvent||window.MouseEvent;
    el.dispatchEvent(new EventCtor('pointerdown',{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true}));
    return true;
  };
  const sourcePressed=id=>document.getElementById(id)?.getAttribute('aria-pressed')==='true';

  function make(tag,attrs={},text=''){
    const el=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){
      if(k==='class')el.className=v;
      else if(k==='dataset')Object.assign(el.dataset,v);
      else el.setAttribute(k,v);
    }
    if(text)el.textContent=text;
    return el;
  }

  function install(){
    if(document.getElementById('unifiedLauncher'))return;
    document.body.classList.add('unified-ui');

    const workstation=matchMedia('(min-width:700px)').matches;
    if(workstation)document.body.classList.add('unified-workstation');

    const launcher=make('div',{id:'unifiedLauncher','aria-label':'Apple II controls',class:'collapsed'});
    const gear=make('button',{type:'button',class:'unified-grip','aria-label':'Open or close controls',title:'Open or close controls','aria-expanded':'false'},'⚙');
    const drives=make('button',{type:'button',class:'unified-island-action','aria-label':'Drives',title:'Drives','aria-expanded':'false'});
    drives.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 15h8v6H8z"/></svg>';
    const key=make('button',{type:'button',class:'unified-island-action','aria-label':'Virtual keyboard','aria-pressed':'false'},'⌨');
    const joy=make('button',{type:'button',class:'unified-island-action','aria-label':'Virtual joystick','aria-pressed':'false'},'◉');
    const machine=make('button',{type:'button',class:'unified-island-action','aria-label':'Machine controls',title:'Machine controls','aria-expanded':'false'});
    machine.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9h6v6H9zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></svg>';
    launcher.append(gear,drives,key,joy,machine);
    document.body.append(launcher);

    const panel=make('section',{id:'unifiedMachinePanel','aria-label':'Machine controls'});
    panel.hidden=true;
    panel.innerHTML=`
      <div class="unified-panel-head">
        <div><div class="unified-panel-title">Apple IIgs</div><div class="unified-panel-subtitle">Machine controls</div></div>
        <button type="button" id="unifiedPanelClose" aria-label="Close controls">×</button>
      </div>
      <nav class="unified-tabs" role="tablist" aria-label="Machine sections">
        <button type="button" data-tab="machine">Machine</button>
        <button type="button" data-tab="drives">Drives</button>
        <button type="button" data-tab="display">Display</button>
        <button type="button" data-tab="input">Input</button>
      </nav>
      <div class="unified-tab" data-panel="machine">
        <div class="unified-section"><h3>Machine</h3><div class="unified-grid two">
          <button type="button" class="unified-action" data-proxy="buttonRunStop">Run / Stop</button>
          <button type="button" class="unified-action unified-danger" data-proxy="buttonReset">Reset</button>
        </div></div>
        <div class="unified-section"><h3>Configuration</h3>
          <button type="button" class="unified-action" id="unifiedConfiguration">System Configuration</button>
          <p class="unified-note">Slot cards and hardware configuration.</p>
        </div>
      </div>
      <div class="unified-tab" data-panel="drives" hidden></div>
      <div class="unified-tab" data-panel="display" hidden>
        <div class="unified-section"><h3>Speed</h3><div class="unified-grid five" id="unifiedSpeed"></div></div>
        <div class="unified-section"><h3>Monitor</h3><div class="unified-grid four" id="unifiedColor"></div></div>
        <div class="unified-section"><div class="unified-grid two"><button type="button" class="unified-action" data-proxy="buttonScanlines">Scanlines</button><button type="button" class="unified-action" data-proxy="buttonDiagnostics">Diagnostics</button></div></div>
      </div>
      <div class="unified-tab" data-panel="input" hidden>
        <div class="unified-section"><h3>On-screen controls</h3><div class="unified-grid two">
          <button type="button" class="unified-choice" id="unifiedKeyboard">Keyboard</button>
          <button type="button" class="unified-choice" id="unifiedJoystick">Joystick</button>
        </div><p class="unified-note">On iPad and desktop both are off by default so physical input can control the IIgs unobstructed.</p></div>
        <div class="unified-section unified-joystick-settings" id="unifiedJoystickSettings" hidden>
          <h3>Joystick</h3>
          <div class="unified-setting-row"><span>Mode</span><button type="button" class="unified-choice" data-joy-proxy="buttonMode">Analog</button></div>
          <div class="unified-setting-row"><span>Recenter</span><button type="button" class="unified-choice" data-joy-proxy="buttonCenter">On</button></div>
          <div class="unified-setting-row"><span>Grid</span><button type="button" class="unified-choice" data-joy-proxy="buttonGrid">Off</button></div>
        </div>
        <div class="unified-section"><h3>Glide pad / pointer</h3><div class="unified-grid two">
          <button type="button" class="unified-choice" data-glide="mouse">Mouse</button>
          <button type="button" class="unified-choice" data-glide="joystick">Joystick</button>
        </div><p class="unified-note" id="unifiedGlideNote"></p></div>
      </div>`;
    document.body.append(panel);

    const tabs=[...panel.querySelectorAll('[data-tab]')];
    const panes=[...panel.querySelectorAll('[data-panel]')];
    const selectTab=name=>{
      if(!panes.some(p=>p.dataset.panel===name))name='machine';
      tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
      panes.forEach(p=>p.hidden=p.dataset.panel!==name);
      set(STORAGE.tab,name);
      machine.setAttribute('aria-expanded',(!panel.hidden&&name==='machine')?'true':'false');
      drives.setAttribute('aria-expanded',(!panel.hidden&&name==='drives')?'true':'false');
      if(name==='display')syncDisplay();
      if(name==='input')syncInput();
      if(name==='drives')window.dispatchEvent(new Event('unified-drives-show'));
    };
    const closePanel=()=>{
      panel.hidden=true;
      machine.setAttribute('aria-expanded','false');
      drives.setAttribute('aria-expanded','false');
    };
    const openPanel=name=>{
      panel.hidden=false;
      selectTab(name);
    };
    tabs.forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
    selectTab(get(STORAGE.tab,'machine'));

    drives.addEventListener('click',()=>openPanel('drives'));
    machine.addEventListener('click',()=>openPanel('machine'));
    panel.querySelector('#unifiedPanelClose').addEventListener('click',closePanel);

    panel.querySelectorAll('[data-proxy]').forEach(b=>b.addEventListener('click',()=>click(b.dataset.proxy)));
    panel.querySelector('#unifiedConfiguration').addEventListener('click',()=>{
      const candidate=document.querySelector('#buttonIIgsConfiguration,#iigsConfigButton,[data-iigs-config],button[aria-label*="configuration" i],button[title*="configuration" i]');
      if(candidate)candidate.click();
      else click('buttonLoad');
    });

    const setInput=mode=>{
      const wantKey=mode==='keyboard',wantJoy=mode==='joystick';
      if(sourcePressed('buttonInput')!==wantKey)click('buttonInput');
      if(sourcePressed('buttonJoystick')!==wantJoy)click('buttonJoystick');
      document.body.classList.toggle('keyboard-mode',wantKey);
      document.body.classList.toggle('joystick-mode',wantJoy);
      document.body.classList.toggle('joystick-disabled',!wantJoy);
      syncInput();
    };
    const toggleInput=mode=>setInput(sourcePressed(mode==='keyboard'?'buttonInput':'buttonJoystick')?'none':mode);
    key.addEventListener('click',()=>toggleInput('keyboard'));
    joy.addEventListener('click',()=>toggleInput('joystick'));
    panel.querySelector('#unifiedKeyboard').addEventListener('click',()=>toggleInput('keyboard'));
    panel.querySelector('#unifiedJoystick').addEventListener('click',()=>toggleInput('joystick'));

    panel.querySelectorAll('[data-joy-proxy]').forEach(b=>b.addEventListener('click',()=>{
      pointerDown(b.dataset.joyProxy);
      requestAnimationFrame(syncJoystickSettings);
    }));

    function syncJoystickSettings(){
      const wrap=panel.querySelector('#unifiedJoystickSettings');
      wrap.hidden=!sourcePressed('buttonJoystick');
      wrap.querySelectorAll('[data-joy-proxy]').forEach(b=>{
        const text=(document.getElementById(b.dataset.joyProxy)?.textContent||'').trim();
        if(text)b.textContent=text.charAt(0).toUpperCase()+text.slice(1);
        const value=text.toLowerCase();
        b.classList.toggle('active',value==='on'||value==='analog');
      });
    }

    function syncInput(){
      const kp=sourcePressed('buttonInput'),jp=sourcePressed('buttonJoystick');
      key.setAttribute('aria-pressed',kp?'true':'false');
      joy.setAttribute('aria-pressed',jp?'true':'false');
      panel.querySelector('#unifiedKeyboard').classList.toggle('active',kp);
      panel.querySelector('#unifiedJoystick').classList.toggle('active',jp);
      document.body.classList.toggle('keyboard-mode',kp);
      document.body.classList.toggle('joystick-mode',jp);
      document.body.classList.toggle('joystick-disabled',!jp);
      syncJoystickSettings();
      const glide=get(STORAGE.glide,'mouse');
      panel.querySelectorAll('[data-glide]').forEach(b=>b.classList.toggle('active',b.dataset.glide===glide));
      panel.querySelector('#unifiedGlideNote').textContent=glide==='mouse'
        ?'Physical trackpad movement controls the IIgs pointer.'
        :'Glide pad joystick routing is selected; virtual joystick remains available for touch.';
    }

    panel.querySelectorAll('[data-glide]').forEach(b=>b.addEventListener('click',()=>{
      set(STORAGE.glide,b.dataset.glide);syncInput();
    }));

    function rebuildProxy(sourceSelector,target,labelFallback){
      const source=[...document.querySelectorAll(sourceSelector)];
      if(!source.length)return;
      target.replaceChildren(...source.map((src,i)=>{
        const b=make('button',{type:'button',class:'unified-choice'},src.textContent.trim()||labelFallback||String(i+1));
        b.classList.toggle('active',src.classList.contains('selected')||src.getAttribute('aria-checked')==='true');
        b.addEventListener('click',()=>{src.click();setTimeout(syncDisplay,0);});
        return b;
      }));
    }
    function syncDisplay(){
      rebuildProxy('#displaySpeedPresets button',panel.querySelector('#unifiedSpeed'),'Speed');
      rebuildProxy('#displayColorPresets button',panel.querySelector('#unifiedColor'),'Color');
    }

    const observer=new MutationObserver(()=>{
      syncInput();
      if(!panel.hidden&&tabs.find(b=>b.classList.contains('active'))?.dataset.tab==='display')syncDisplay();
    });
    ['controls','joyControls'].forEach(id=>{
      const el=document.getElementById(id);if(el)observer.observe(el,{subtree:true,childList:true,attributes:true,characterData:true});
    });

    if(workstation)setTimeout(()=>setInput('none'),250);
    else setTimeout(syncInput,250);
    setTimeout(()=>{syncDisplay();syncInput();},400);

    const saved=get(STORAGE.island,'');
    if(saved){
      try{const p=JSON.parse(saved);if(Number.isFinite(p.x)&&Number.isFinite(p.y)){launcher.style.left=p.x+'px';launcher.style.top=p.y+'px';launcher.style.right='auto';launcher.style.bottom='auto';}}catch(_){}
    }
    let drag=null,moved=false;
    gear.addEventListener('pointerdown',e=>{
      moved=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:launcher.offsetLeft,top:launcher.offsetTop};
      launcher.classList.add('dragging');gear.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    gear.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;
      const rect=launcher.getBoundingClientRect();
      launcher.style.left=Math.max(4,Math.min(innerWidth-rect.width-4,drag.left+dx))+'px';
      launcher.style.top=Math.max(4,Math.min(innerHeight-rect.height-4,drag.top+dy))+'px';
      launcher.style.right='auto';launcher.style.bottom='auto';
    });
    const end=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      launcher.classList.remove('dragging');
      if(!moved){
        launcher.classList.toggle('collapsed');
        const expanded=!launcher.classList.contains('collapsed');
        gear.setAttribute('aria-expanded',expanded?'true':'false');
        if(!expanded)closePanel();
      }else set(STORAGE.island,JSON.stringify({x:launcher.offsetLeft,y:launcher.offsetTop}));
      drag=null;
    };
    gear.addEventListener('pointerup',end);gear.addEventListener('pointercancel',end);

    addEventListener('resize',()=>{
      if(!launcher.style.left)return;
      const r=launcher.getBoundingClientRect();
      launcher.style.left=Math.max(4,Math.min(innerWidth-r.width-4,r.left))+'px';
      launcher.style.top=Math.max(4,Math.min(innerHeight-r.height-4,r.top))+'px';
    });
  }

  if(document.readyState==='complete')install();
  else addEventListener('load',install,{once:true});
})();
