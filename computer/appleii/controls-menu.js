// Load IIgs hardware configuration before the main module constructs the machine.
// This script is parser-inserted before script.js, so a parser-inserted module
// here executes first and can patch the controller prototypes deterministically.
//
// iPhone Safari: the emulator installs a document-level touch guard before this
// file loads. Capture configuration-dialog gestures at window level first so
// native select pickers and form buttons are never cancelled by that guard.
(() => {
  const allowConfigGesture = event => {
    const target=event.target;
    if(!(target instanceof Element) || !target.closest('#iigsConfigurationDialog')) return;
    event.stopPropagation();
  };
  for(const type of ['pointerdown','touchstart','touchend','click'])
    window.addEventListener(type,allowConfigGesture,{capture:true,passive:true});
})();

if(document.readyState === 'loading') {
  document.write('<link rel="stylesheet" href="./iigs_configuration_mobile.css?v=20261004-touch2">');
  document.write('<script type="module" src="./iigs_configuration.js?v=20261004-slots-drives2"><\/script>');
} else {
  if(!document.querySelector('link[href*="iigs_configuration_mobile.css"]')) {
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./iigs_configuration_mobile.css?v=20261004-touch2';
    document.head.append(link);
  }
  import('./iigs_configuration.js?v=20261004-slots-drives2');
}

// Independent emulator and joystick settings menus.
(() => {
  const definitions = [
    ['buttonSettings', 'controls'],
    ['buttonJoySettings', 'joyControls']
  ];
  const menus = definitions
    .map(([buttonId,panelId]) => ({
      button: document.getElementById(buttonId),
      panel: document.getElementById(panelId)
    }))
    .filter(({button,panel}) => button && panel);

  const close = ({button,panel}) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded','false');
  };
  const open = menu => {
    menus.forEach(other => { if(other !== menu) close(other); });
    menu.panel.hidden = false;
    menu.button.setAttribute('aria-expanded','true');
  };

  menus.forEach(menu => {
    close(menu);
    menu.button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if(menu.panel.hidden) open(menu);
      else close(menu);
    });
  });

  document.addEventListener('pointerdown', event => {
    menus.forEach(menu => {
      if(!menu.panel.hidden &&
         !menu.panel.contains(event.target) &&
         !menu.button.contains(event.target)) close(menu);
    });
  });

  document.addEventListener('keydown', event => {
    if(event.key !== 'Escape') return;
    const menu=menus.find(menu => !menu.panel.hidden);
    if(!menu) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(menu);
    menu.button.focus();
  }, true);
})();
