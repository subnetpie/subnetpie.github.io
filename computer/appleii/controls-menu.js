// Load IIgs hardware configuration before the main module constructs the machine.
// The document-level touch guard explicitly exempts native controls and the
// IIgs configuration dialog, so do not stop propagation here: a capture-phase
// stop would prevent Safari from ever delivering taps to select/button targets.
const iiGsMode = new URLSearchParams(location.search).get('machine') !== 'iie';
if(document.readyState === 'loading') {
  document.write('<link rel="stylesheet" href="./iigs_configuration_mobile.css?v=20261007-panel-audit1">');
  document.write('<script type="module" src="./iigs_configuration.js?v=20261007-panel-audit1"><\/script>');
  document.write('<script type="module" src="./iigs_slot4_devices.js?v=20261007-panel-audit1"><\/script>');
  if(iiGsMode) document.write('<script type="module" src="./iigs_extra_drives.js?v=20261006-smartport4"><\/script>');
  if(iiGsMode) document.write('<script type="module" src="./iigs_persistent_boot.js?v=20261007-panel-audit1"><\/script>');
  if(iiGsMode) document.write('<script type="module" src="./iigs_persistent_boot_ui.js?v=20261007-panel-audit1"><\/script>');
  document.write('<script type="module" src="./display_speed_panel.js?v=20261006-speed-presets1"><\/script>');
  document.write('<script src="./display_color_panel.js?v=20261006-display-presets1"><\/script>');
  document.write('<script type="module" src="./iigs_keyboard_layout.js?v=20261005-iigs-kbd1"><\/script>');
} else {
  if(!document.querySelector('link[href*="iigs_configuration_mobile.css"]')) {
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='./iigs_configuration_mobile.css?v=20261007-panel-audit1';
    document.head.append(link);
  }
  const hardware=import('./iigs_configuration.js?v=20261007-panel-audit1').then(() =>
    import('./iigs_slot4_devices.js?v=20261007-panel-audit1'));
  if(iiGsMode) hardware
    .then(() => import('./iigs_extra_drives.js?v=20261006-smartport4'))
    .then(() => import('./iigs_persistent_boot.js?v=20261007-panel-audit1'))
    .then(() => import('./iigs_persistent_boot_ui.js?v=20261007-panel-audit1'));
  import('./display_speed_panel.js?v=20261006-speed-presets1');
  if(!document.querySelector('script[src*="display_color_panel.js"]')) {
    const displayScript=document.createElement('script');
    displayScript.src='./display_color_panel.js?v=20261006-display-presets1';
    document.head.append(displayScript);
  }
  import('./iigs_keyboard_layout.js?v=20261005-iigs-kbd1');
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
