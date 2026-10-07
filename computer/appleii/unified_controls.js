(() => {
  const params=new URLSearchParams(location.search);
  if(params.get('ui')!=='unified') return;

  const STORAGE={
    island:'subnetpie.apple2.unifiedIsland.v1',
    tab:'subnetpie.apple2.unifiedTab.v1',
    glide:'subnetpie.apple2.glidepadMode.v1'
  };
  const get=(k,fallback)=>{try{const v=localStorage.getItem(k);return v==null?fallback:v;}catch(_){return fallback;}};
  const set=(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}};

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

  function click(id){
    const el=document.getElementById(id);
    if(el){el.click();return true;}
    return false;
  }

  function sourcePressed(id){return document.getElementById(id)?.getAttribute('aria-pressed')==='true';}

  function install(){
    if(document.getElementById('unifiedLauncher'))return;
    document.body.classList.add('unified-ui');

    const workstation=matchMedia('(min-width: 700px)').matches;
    if(workstation)document.body.classList.add('unified-workstation');

    const launcher=make('div',{id:'unifiedLauncher','aria-label':'Apple II controls'});
    launcher.classList.add('collapsed');
    const grip=make('button',{type:'button',class:'unified-grip','aria-label':'Move or expand controls',title:'Move or expand controls'},'•••');
    const key=make('button',{type:'button',class:'unified-island-action','aria-label':'Virtual keyboard','aria-pressed':'false'},'⌨');
    const joy=make('button',{type:'button',class:'unified-island-action','aria-label':'Virtual joystick','aria-pressed':'false'},'◉');
    const machine=make('button',{type:'button',class:'unified-island-action','aria-label':'Machine controls','aria-expanded':'false'},'⚙');
    launcher.append(grip,key,joy,machine);
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
          <p class="unified-note">Slot cards, boot device and persistent-drive settings remain handled by the existing IIgs configuration panel.</p>
        </div>
      </div>
      <div class="unified-tab" data-panel="drives" hidden>
        <div class="unified-section"><h3>Mounted media</h3>
          <div class="unified-drive"><div><div class="unified-drive-name" id="unifiedDrive0">Drive 1</div><div class="unified-drive-meta">System / boot</div></div><div class="unified-drive-actions"><button type="button" data-drive-load="0">Change</button><button type="button" data-drive-eject="0">Eject</button></div></div>
          <div class="unified-drive"><div><div class="unified-drive-name" id="unifiedDrive1">Drive 2</div><div class="unified-drive-meta">Application / data</div></div><div class="unified-drive-actions"><button type="button" data-drive-load="1">Insert</button><button type="button" data-drive-eject="1">Eject</button></div></div>
        </div>
        <div class="unified-section"><button type="button" class="unified-action" id="unifiedDriveManager">Open full drive manager</button><p class="unified-note">The existing drive manager remains authoritative for Slot 5, Slot 6 and SmartPort drives while this UI is being integrated.</p></div>
      </div>
      <div class="unified-tab" data-panel="display" hidden>
        <div class="unified-section"><h3>Speed</h3><div class="unified-grid five" id="unifiedSpeed"></div></div>
        <div class="unified-section"><h3>Monitor</h3><div class="unified-grid four" id="unifiedColor"></div></div>
        <div class="unified-section"><div class="unified-grid two"><button type="button" class="unified-action" data-proxy="buttonScanlines">Scanlines</button><button type="button" class="unified-action" data-proxy="buttonDiagnostics">Diagnostics</button></div></div>
      </div>
      <div class="unified-tab" data-panel="input" hidden>
        <div class="unified-section"><h3>On-screen controls</h3><div class="unified-grid two">
          <button type="button" class="unified-choice" id="unifiedKeyboard">Keyboard</button>
          <button type="button" class="unified-choice" id="unifiedJoystick">Joystick</button>
        </div><p class="unified-note">On iPad and desktop both are off by default so the physical keyboard and pointing device can control the IIgs unobstructed.</p></div>
        <div class="unified-section unified-joystick-settings" id="unifiedJoystickSettings" hidden>
          <h3>Joystick</h3>
          <div class="unified-setting-row"><span>Mode</span><button type="button" class="unified-choice" data-joy-proxy="buttonMode">Analog</button></div>
          <div class="unified-setting-row"><span>Recenter</span><button type="button" class="unified-choice" data-joy-proxy="buttonCenter">On</button></div>
          <div class="unified-setting-row"><span>Grid</span><button type="button" class="unified-choice" data-joy-proxy="buttonGrid">Off</button></div>
          <p class="unified-note">These settings appear only while the on-screen joystick is enabled.</p>
        </div>
        <div class="unified-section"><h3>Glide pad / pointer</h3><div class="unified-grid two">
          <button type="button" class="unified-choice" data-glide="mouse">Mouse</button>
          <button type="button" class="unified-choice" data-glide="joystick">Joystick</button>
        </div><p class="unified-note" id="unifiedGlideNote">Mouse mode is active. Joystick glide-pad routing is the next input-layer hook and is not enabled in this first UI-only build.</p></div>
      </div>`;
    document.body.append(panel);

    const closePanel=()=>{panel.hidden=true;machine.setAttribute('aria-expanded','false');};
    const openPanel=()=>{panel.hidden=false;machine.setAttribute('aria-expanded','true');};
    machine.addEventListener('click',()=>panel.hidden?openPanel():closePanel());
    panel.querySelector('#unifiedPanelClose').addEventListener('click',closePanel);

    // Tabs preserve state across orientation changes.
    const tabs=[...panel.querySelectorAll('[data-tab]')];
    const panes=[...panel.querySelectorAll('[data-panel]')];
    const selectTab=name=>{
      if(!panes.some(p=>p.dataset.panel===name))name='machine';
      tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
      panes.forEach(p=>p.hidden=p.dataset.panel!==name);
      set(STORAGE.tab,name);
      if(name==='display')syncDisplay();
      if(name==='drives')syncDrives();
      if(name==='input')syncInput();
    };
    tabs.forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
    selectTab(get(STORAGE.tab,'machine'));

    panel.querySelectorAll('[data-proxy]').forEach(b=>b.addEventListener('click',()=>click(b.dataset.proxy)));
    panel.querySelector('#unifiedDriveManager').addEventListener('click',()=>click('buttonLoad'));
    panel.querySelector('[data-drive-load="0"]').addEventListener('click',()=>document.getElementById('filedialogInsert')?.click());
    panel.querySelector('[data-drive-load="1"]').addEventListener('click',()=>document.getElementById('filedialogInsert2')?.click());
    panel.querySelectorAll('[data-drive-eject]').forEach(b=>b.addEventListener('click',()=>click('ejectDrive'+b.dataset.driveEject)));

    // Configuration button: use any currently installed config launcher rather than duplicating it.
    panel.querySelector('#unifiedConfiguration').addEventListener('click',()=>{
      const candidate=document.querySelector('#iigsConfigButton,[data-iigs-config],button[aria-label*="configuration" i],button[title*="configuration" i]');
      if(candidate)candidate.click();
      else click('buttonLoad');
    });

    const setInput=mode=>{
      const wantKey=mode==='keyboard', wantJoy=mode==='joystick';
      if(sourcePressed('buttonInput')!==wantKey)click('buttonInput');
      if(sourcePressed('buttonJoystick')!==wantJoy)click('buttonJoystick');
      document.body.classList.toggle('keyboard-mode',wantKey);
      document.body.classList.toggle('joystick-mode',wantJoy);
      syncInput();
    };
    key.addEventListener('click',()=>setInput(sourcePressed('buttonInput')?'none':'keyboard'));
    joy.addEventListener('click',()=>setInput(sourcePressed('buttonJoystick')?'none':'joystick'));
    panel.querySelector('#unifiedKeyboard').addEventListener('click',()=>setInput(sourcePressed('buttonInput')?'none':'keyboard'));
    panel.querySelector('#unifiedJoystick').addEventListener('click',()=>setInput(sourcePressed('buttonJoystick')?'none':'joystick'));

    panel.querySelectorAll('[data-joy-proxy]').forEach(b=>b.addEventListener('click',()=>{
      click(b.dataset.joyProxy);
      setTimeout(syncJoystickSettings,0);
    }));

    function syncJoystickSettings(){
      const wrap=panel.querySelector('#unifiedJoystickSettings');
      const enabled=sourcePressed('buttonJoystick');
      wrap.hidden=!enabled;
      wrap.querySelectorAll('[data-joy-proxy]').forEach(b=>{
        const src=document.getElementById(b.dataset.joyProxy);
        if(!src)return;
        const text=(src.textContent||'').trim();
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
      syncJoystickSettings();
      const glide=get(STORAGE.glide,'mouse');
      panel.querySelectorAll('[data-glide]').forEach(b=>b.classList.toggle('active',b.dataset.glide===glide));
      panel.querySelector('#unifiedGlideNote').textContent=glide==='mouse'
        ?'Mouse mode is active. Physical trackpad movement controls the IIgs pointer.'
        :'Joystick is selected for the glide pad. Routing will activate when the joystick input bridge is added; this UI build does not intercept the working mouse path.';
    }

    panel.querySelectorAll('[data-glide]').forEach(b=>b.addEventListener('click',()=>{
      set(STORAGE.glide,b.dataset.glide);
      syncInput();
    }));

    function syncDrives(){
      const d0=document.getElementById('driveName0')?.textContent?.trim()||'Empty';
      const d1=document.getElementById('driveName1')?.textContent?.trim()||'Empty';
      panel.querySelector('#unifiedDrive0').textContent=d0==='Empty'?'Drive 1 · Empty':d0;
      panel.querySelector('#unifiedDrive1').textContent=d1==='Empty'?'Drive 2 · Empty':d1;
    }

    function rebuildProxy(sourceSelector,target,attr,labelFallback){
      const source=[...document.querySelectorAll(sourceSelector)];
      if(!source.length)return;
      target.replaceChildren();
      source.forEach((src,i)=>{
        const b=make('button',{type:'button',class:'unified-choice'},src.textContent.trim()||labelFallback||String(i+1));
        const selected=src.classList.contains('selected')||src.getAttribute('aria-checked')==='true';
        b.classList.toggle('active',selected);
        b.addEventListener('click',()=>{src.click();setTimeout(syncDisplay,0);});
        target.append(b);
      });
    }
    function syncDisplay(){
      rebuildProxy('#displaySpeedPresets button',panel.querySelector('#unifiedSpeed'),'data-speed-mode','Speed');
      rebuildProxy('#displayColorPresets button',panel.querySelector('#unifiedColor'),'data-display-color','Color');
    }

    // Existing source controls can change from keyboard shortcuts or other UI.
    const observer=new MutationObserver(()=>{
      syncDrives();syncInput();
      if(!panel.hidden && tabs.find(b=>b.classList.contains('active'))?.dataset.tab==='display')syncDisplay();
    });
    ['controls','joyControls','driveName0','driveName1'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{subtree:true,childList:true,attributes:true,characterData:true});});

    // Workstation default: no virtual overlays. Wait until script.js has attached listeners.
    if(workstation)setTimeout(()=>setInput('none'),250);
    else setTimeout(syncInput,250);
    setTimeout(()=>{syncDrives();syncDisplay();syncInput();},400);

    // Floating island: tap grip expands/collapses; drag moves it. Position persists.
    const saved=get(STORAGE.island,'');
    if(saved){
      try{const p=JSON.parse(saved);if(Number.isFinite(p.x)&&Number.isFinite(p.y)){launcher.style.left=p.x+'px';launcher.style.top=p.y+'px';launcher.style.right='auto';launcher.style.bottom='auto';}}catch(_){}
    }
    let drag=null,moved=false;
    grip.addEventListener('pointerdown',e=>{
      moved=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:launcher.offsetLeft,top:launcher.offsetTop};
      launcher.classList.add('dragging');grip.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    grip.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;
      const rect=launcher.getBoundingClientRect();
      const x=Math.max(4,Math.min(innerWidth-rect.width-4,drag.left+dx));
      const y=Math.max(4,Math.min(innerHeight-rect.height-4,drag.top+dy));
      launcher.style.left=x+'px';launcher.style.top=y+'px';launcher.style.right='auto';launcher.style.bottom='auto';
    });
    const end=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      launcher.classList.remove('dragging');
      if(!moved)launcher.classList.toggle('collapsed');
      else set(STORAGE.island,JSON.stringify({x:launcher.offsetLeft,y:launcher.offsetTop}));
      drag=null;
    };
    grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);

    // Keep floating position within the usable viewport after rotation.
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
