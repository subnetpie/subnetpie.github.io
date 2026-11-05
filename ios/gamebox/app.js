'use strict';
// Safari gesture guards leave touch events available to the game controller.
const cancelBrowserGesture = event => { if (event.cancelable) event.preventDefault(); };
for (const name of ['selectstart', 'contextmenu', 'dragstart', 'dblclick',
  'gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(name, cancelBrowserGesture, {capture:true, passive:false});
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) cancelBrowserGesture(event);
}, {capture:true, passive:false});
const $ = id => document.getElementById(id);
const state = { games: [], current: null, running: false, loading: false, muted: false, token: 0,
  view: 'splash', index: 0, preview: 0, turboI: false, turboII: false, tick: 0,
  resetCombo: false, volume: 0.8, optionsReturn: 'player', directions: 8, helpPage: 1 };
const emulator = new PCE();
emulator.SetCanvas('screen');
// Keep touch, hardware keyboard and gamepad input independent.
emulator.JoystickEventInit = () => {};
emulator.JoystickEventRelease = () => {};
const pointers = new Map();
let padContact = null;
let lastInputVisual = '';
let lastPadSprite = -1;
const keyboard = new Set();
const bindings = { ArrowUp:'UP', ArrowDown:'DOWN', ArrowLeft:'LEFT', ArrowRight:'RIGHT',
  KeyZ:'SHOT2', KeyX:'SHOT1', KeyA:'SELECT', KeyS:'RUN', Enter:'RUN', ShiftRight:'SELECT' };
const buttons = [...document.querySelectorAll('[data-key]')];
// Decode the nine directions while the title screen is open so the first
// movement in a new direction does not wait on an image request/decode.
const padSprites = Array.from({length:9}, (_, index) => {
  const image = document.createElement('img');
  image.src = 'native/pad-' + index + '.png';
  image.decode?.().catch(() => {});
  return image;
});

function syncInput() {
  if (!emulator.Keybord[0]) return;
  const held = new Set(keyboard);
  for (const keys of pointers.values()) for (const key of keys) held.add(key);
  for (const [a,b] of [['LEFT','RIGHT'],['UP','DOWN']]) {
    if (held.has(a) && held.has(b)) { held.delete(a); held.delete(b); }
  }
  emulator.Keybord[0][0] = 0xBF;
  emulator.Keybord[0][1] = 0xBF;
  if (state.running) for (const key of held) {
    if (key === 'SHOT1' && state.turboI && state.tick % 6 >= 3) continue;
    if (key === 'SHOT2' && state.turboII && state.tick % 6 >= 3) continue;
    emulator['SetButton' + key](0);
  }
  const visual = String(state.running) + [...held].sort().join(',');
  if (visual !== lastInputVisual) {
    for (const button of buttons) button.classList.toggle('pressed', state.running && held.has(button.dataset.key));
    lastInputVisual = visual;
  }
  const dir = ['UP','RIGHT','DOWN','LEFT'].filter(key => held.has(key));
  const sprites = {UP:1,'UP,RIGHT':2,RIGHT:3,'RIGHT,DOWN':4,DOWN:5,'DOWN,LEFT':6,LEFT:7,'UP,LEFT':8};
  const sprite = state.running ? (sprites[dir.join(',')] || 0) : 0;
  if (sprite !== lastPadSprite) { $('padImage').src = 'native/pad-' + sprite + '.png'; lastPadSprite = sprite; }
  if (state.running && held.has('RUN') && held.has('SELECT')) {
    if (!state.resetCombo) { emulator.Reset(); state.resetCombo = true; }
  } else state.resetCombo = false;
}
function releaseInput() { pointers.clear(); padContact = null; keyboard.clear(); syncInput(); }
function audioFromTap() {
  if (!emulator.WebAudioCtx) emulator.SoundInit();
  if (emulator.WebAudioCtx?.state !== 'running') emulator.WebAudioCtx?.resume().catch(() => {});
}
function setRunning(running) {
  state.running = running;
  if (running) {
    emulator.WaveDataArray = [[], []];
    emulator.Start();
  } else {
    emulator.Pause();
    releaseInput();
    if (emulator.WebAudioCtx?.state === 'running') emulator.WebAudioCtx.suspend().catch(() => {});
  }
  $('pause').setAttribute('aria-label', running ? 'Pause game' : 'Resume game');
  $('resume').hidden = running || state.loading || !state.current;
  $('status').textContent = running ? 'PLAYING · ' + state.current.region : 'PAUSED';
  $('pause').hidden = !running;
}
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
async function launch(game) {
  if (state.loading) return;
  const token = ++state.token;
  state.loading = true;
  emulator.Pause();
  releaseInput();
  state.running = false;
  state.current = game;
  showView('player');
  document.body.classList.add('playing');
  $('gameTitle').textContent = game.title;
  $('status').textContent = 'LOADING';
  $('loading').hidden = false;
  $('resume').hidden = true;
  $('error').hidden = true;
  window.scrollTo(0, 0);
  try {
    audioFromTap(); // iOS requires this before the first asynchronous operation.
    const response = await fetch(game.file);
    if (!response.ok) throw new Error('Cartridge could not be loaded.');
    const rom = Array.from(new Uint8Array(await response.arrayBuffer()));
    if (token !== state.token) return;
    if (!rom.length || rom.length % 8192 !== 0) throw new Error('Invalid cartridge data.');
    emulator.CountryType = game.region === 'USA' ? emulator.CountryTypeTG16 : emulator.CountryTypePCE;
    emulator.SetROM(rom);
    emulator.WaveVolume = state.muted ? 0 : state.volume;
    state.loading = false;
    $('loading').hidden = true;
    // Safari can suspend audio during a fetch or an interruption. Resume on the next tap.
    setRunning(!document.hidden);
    try { localStorage.setItem('turbografx-last', game.id); } catch {}
  } catch (error) {
    if (token !== state.token) return;
    state.loading = false;
    $('loading').hidden = true;
    setRunning(false);
    $('resume').hidden = true;
    showError(error.message + ' Return to the collection and try again.');
  }
}
function renderLibrary() {
  $('games').replaceChildren();
  if (!state.games.length) return;
  const game = state.games[state.index];
  $('selectedTitle').textContent = game.nativeTitle || game.title;
  $('selectedInfo').textContent = game.release ? 'Release Date.' + game.release : game.region + ' · TurboGrafx-16 / PC Engine';
  $('resultCount').textContent = (state.index + 1) + ' / ' + state.games.length;
  for (let offset = -3; offset <= 3; offset++) {
    const index = (state.index + offset + state.games.length) % state.games.length;
    const item = state.games[index];
    const button = document.createElement('button');
    button.className = 'cartridge' + (offset === 0 ? ' active' : '');
    button.setAttribute('aria-label', item.title + ', ' + item.region + (offset === 0 ? '. Tap for game information.' : ''));
    button.style.transform = offset === 0 ? 'translateZ(30px)' : `translateX(${Math.sign(offset) * (108 + (Math.abs(offset)-1)*40)}px) translateZ(${-60 - Math.abs(offset)*28}px) rotateY(${-Math.sign(offset)*64}deg)`;
    button.style.zIndex = String(10 - Math.abs(offset));
    button.style.opacity = String(1 - Math.abs(offset) * 0.13);
    if (item.cover) {
      const image = document.createElement('img');
      image.src = item.cover; image.alt = ''; image.draggable = false;
      image.addEventListener('error', () => image.remove());
      button.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'fallback'; fallback.textContent = item.title; button.append(fallback);
    }
    button.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return;
      if (offset === 0) openDetail();
      else { state.index = index; renderLibrary(); }
    });
    $('games').append(button);
  }
}

function directionAt(event) {
  const rect = padContact?.rect || $('dpad').getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * 2 - 1;
  const y = (event.clientY - rect.top) / rect.height * 2 - 1;
  const previous = padContact?.sector;
  const radius = Math.hypot(x,y);
  // A slightly larger engagement zone stops center noise; a smaller release
  // zone lets a deliberate direction remain steady near the center.
  if (!Number.isFinite(radius) || radius < (previous == null ? 0.32 : 0.23) || Math.abs(x) > 1.6 || Math.abs(y) > 1.6) {
    if (padContact) { padContact.sector = null; padContact.pending = null; }
    return [];
  }
  const angle = Math.atan2(y, x);
  const count = state.directions === 4 ? 4 : 8;
  const step = Math.PI * 2 / count;
  let sector = (Math.round(angle / step) + count) % count;
  if (previous != null) {
    const delta = Math.abs(Math.atan2(Math.sin(angle - previous*step), Math.cos(angle - previous*step)));
    if (delta < step / 2 + Math.PI / 18) sector = previous;
  }
  const directions = count === 4 ? [['RIGHT'],['DOWN'],['LEFT'],['UP']] :
    [['RIGHT'], ['RIGHT','DOWN'], ['DOWN'], ['DOWN','LEFT'], ['LEFT'], ['LEFT','UP'], ['UP'], ['UP','RIGHT']];
  if (padContact) {
    const last = padContact.lastSector;
    const turn = last == null ? 0 : Math.min((sector-last+count)%count,(last-sector+count)%count);
    // The contact centroid can jump across the pad as a finger lifts. An
    // opposite direction must remain held briefly; a release cancels it.
    if (turn >= count * 3 / 8) {
      if (radius < 0.5) { padContact.pending = null; padContact.sector = null; return []; }
      if (padContact.pending?.sector !== sector) padContact.pending = {sector, keys:directions[sector], readyAt:performance.now()+50};
      padContact.sector = null;
      return [];
    }
    padContact.sector = sector;
    padContact.lastSector = sector;
    padContact.pending = null;
  }
  return directions[sector];
}
function settlePadDirection() {
  const pending = padContact?.pending;
  if (!pending || performance.now() < pending.readyAt || !pointers.has(padContact.id)) return;
  pointers.set(padContact.id,pending.keys);
  padContact.sector = pending.sector;
  padContact.lastSector = pending.sector;
  padContact.pending = null;
}
const dpad = $('dpad');
const actionButtons = buttons.filter(button => !dpad.contains(button));
function beginContact(id, target, point) {
  if (!state.running || state.loading) return false;
  if (target === dpad || dpad.contains(target)) {
    if (padContact) return false;
    padContact = {id, rect:dpad.getBoundingClientRect(), sector:null};
    pointers.set(id, directionAt(point));
  } else {
    const button = actionButtons.find(button => button === target || button.contains(target));
    if (!button) return false;
    pointers.set(id, [button.dataset.key]);
  }
  audioFromTap(); syncInput(); return true;
}
function endContact(id) {
  pointers.delete(id);
  if (padContact?.id === id) padContact = null;
  syncInput();
}
// iOS touch identifiers are authoritative. Reconcile against the complete
// active-touch list, even if Safari omitted an earlier release/capture event.
const controller = document.querySelector('.controller');
controller.addEventListener('touchstart', event => {
  reconcileTouches(event.touches);
  let handled = false;
  for (const touch of event.changedTouches) handled = beginContact('touch:' + touch.identifier, touch.target, touch) || handled;
  if (handled && event.cancelable) event.preventDefault();
  reconcileTouches(event.touches);
}, {passive:false});
function reconcileTouches(touches) {
  const active = new Set(Array.from(touches, touch => 'touch:' + touch.identifier));
  for (const id of pointers.keys()) if (typeof id === 'string' && id.startsWith('touch:') && !active.has(id)) endContact(id);
}
document.addEventListener('touchmove', event => {
  reconcileTouches(event.touches);
  let handled = false;
  for (const touch of event.changedTouches) {
    const id = 'touch:' + touch.identifier;
    if (!pointers.has(id)) continue;
    handled = true;
    if (padContact?.id === id) pointers.set(id, directionAt(touch));
  }
  if (handled && event.cancelable) event.preventDefault();
  syncInput();
}, {passive:false, capture:true});
for (const name of ['touchend','touchcancel']) document.addEventListener(name, event => {
  for (const touch of event.changedTouches) endContact('touch:' + touch.identifier);
  reconcileTouches(event.touches);
}, {passive:true, capture:true});
// Mouse/pen fallback. Touch PointerEvents are ignored to avoid double input.
for (const control of [dpad, ...actionButtons]) {
  control.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || (event.button != null && event.button !== 0)) return;
    if (!state.running || state.loading) return;
    event.preventDefault();
    if (beginContact(event.pointerId, control, event)) {
      try { control.setPointerCapture(event.pointerId); } catch {}
    }
  });
}
window.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || !pointers.has(event.pointerId)) return;
  if (event.buttons === 0) { endContact(event.pointerId); return; }
  if (padContact?.id === event.pointerId) { pointers.set(event.pointerId, directionAt(event)); syncInput(); }
}, true);
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(eventName, event => { if (event.pointerType !== 'touch') endContact(event.pointerId); }, true);
}
window.addEventListener('keydown', event => {
  if (state.view === 'library') {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); moveSelection(event.code === 'ArrowLeft' ? -1 : 1); }
    if (event.code === 'Enter') openDetail();
    return;
  }
  if (!state.current || $('player').hidden || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === 'Escape' || event.code === 'KeyP') {
    event.preventDefault(); if (!event.repeat && !state.loading) togglePause(); return;
  }
  const key = bindings[event.code];
  if (key && state.running) { event.preventDefault(); keyboard.add(key); syncInput(); }
});
window.addEventListener('keyup', event => {
  const key = bindings[event.code];
  if (key) { keyboard.delete(key); syncInput(); }
});
function togglePause() {
  if (!state.current || state.loading || !$('error').hidden) return;
  if (!state.running) audioFromTap();
  setRunning(!state.running);
}
$('pause').addEventListener('click', togglePause);
$('resume').addEventListener('click', togglePause);
$('back').addEventListener('click', () => {
  ++state.token; state.loading = false;
  setRunning(false);
  showView('library'); renderLibrary();
  document.body.classList.remove('playing');
  state.current = null;
});
$('mute').addEventListener('click', () => {
  state.muted = !state.muted;
  emulator.WaveVolume = state.muted ? 0 : state.volume;
  $('mute').textContent = state.muted ? 'Sound off' : 'Sound on';
  $('mute').setAttribute('aria-pressed', String(state.muted));
  if (state.running) audioFromTap();
});
$('reset').addEventListener('click', () => {
  if (!state.current || state.loading || !$('error').hidden) return;
  if (!confirm('Restart this cartridge? Current progress will be lost.')) return;
  emulator.Pause(); releaseInput(); audioFromTap(); emulator.Reset(); showView('player'); setRunning(true);
});
function backgroundPause() { if (state.running) setRunning(false); else releaseInput(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });
window.addEventListener('pagehide', backgroundPause);
window.addEventListener('blur', backgroundPause);
document.querySelector('.controller').addEventListener('contextmenu', event => event.preventDefault());
fetch('games.json').then(response => {
  if (!response.ok) throw new Error('Unable to load the collection.');
  return response.json();
}).then(games => {
  state.games = games;
  const first = games.findIndex(game => game.title === "Bonk's Adventure");
  state.index = first >= 0 ? first : 0;
  $('featuredCover').src = games[state.index].cover || '';
  $('featuredTitle').textContent = games[state.index].title;
  renderLibrary();
}).catch(error => notify(error.message + ' Reload to try again.'));

// Native screen navigation and the original 480 x 320 layout.
const views = ['splash','library','detail','player','options','helpView','manualView'];
let suppressClickUntil = 0;
function showView(view) {
  for (const id of views) $(id).hidden = id !== view;
  state.view = view;
  $('notice').hidden = true;
}
function fitStage() {
  // Rotation/browser-toolbar changes invalidate the pad's captured geometry.
  releaseInput();
  const box = $('viewport').getBoundingClientRect();
  $('stage').style.setProperty('--scale', String(Math.min(box.width / 480, box.height / 320)));
}
window.addEventListener('resize', fitStage);
window.visualViewport?.addEventListener('resize', fitStage);
fitStage();
function moveSelection(delta) {
  if (!state.games.length) return;
  state.index = (state.index + delta + state.games.length) % state.games.length;
  renderLibrary();
}
function selectedGame() { return state.games[state.index]; }
function openDetail() {
  const game = selectedGame();
  if (!game) return;
  state.preview = 0;
  $('detailTitle').textContent = game.nativeTitle || game.title;
  $('detailRegion').textContent = game.release ? 'Release Date.' + game.release : game.region + ' · HuCARD';
  $('detailCopyright').textContent = (game.copyright || 'TurboGrafx-16 / PC Engine').split('\n')[0];
  $('detailCover').src = game.cover || '';
  $('detailBackground').hidden = !game.art;
  if (game.art) $('detailBackground').src = game.art;
  $('detailDescription').textContent = game.description || 'Touch PLAY! to start. Touch the screenshot to see the next image. Use RUN to begin, the directional pad to move, and buttons I and II to play.';
  updatePreview(); updateFavorite(); showView('detail');
}
function updatePreview() {
  const game = selectedGame();
  const images = game.screens?.length ? game.screens : [game.cover];
  $('previewImage').src = images[state.preview % images.length] || '';
}
function favorites() { try { return JSON.parse(localStorage.getItem('turbografx-favorites') || '[]'); } catch { return []; } }
function updateFavorite() {
  const on = favorites().includes(selectedGame().id);
  $('favorite').setAttribute('aria-pressed', String(on));
  $('favorite').classList.toggle('favorite-on', on);
}
$('enter').addEventListener('click', () => { showView('library'); renderLibrary(); });
$('featured').addEventListener('click', openDetail);
$('previous').addEventListener('click', () => moveSelection(-1));
$('next').addEventListener('click', () => moveSelection(1));
$('libraryBack').addEventListener('click', () => showView('splash'));
$('detailBack').addEventListener('click', () => { showView('library'); renderLibrary(); });
$('preview').addEventListener('click', () => { state.preview++; updatePreview(); });
$('play').addEventListener('click', () => launch(selectedGame()));
$('favorite').addEventListener('click', () => {
  const ids = favorites(), id = selectedGame().id, on = ids.includes(id);
  try { localStorage.setItem('turbografx-favorites', JSON.stringify(on ? ids.filter(x => x !== id) : [...ids,id])); updateFavorite(); notify(on ? 'FAVORITE REMOVED' : 'FAVORITE ADDED'); }
  catch { notify('Favorites could not be stored in this browser.'); }
});
$('manual').addEventListener('click', () => { $('manualTitle').textContent = selectedGame().title; showView('manualView'); });
$('manualBack').addEventListener('click', () => showView('detail'));
$('help').addEventListener('click', () => { state.helpPage=1; updateHelp(); showView('helpView'); });
function updateHelp() { $('helpImage').src = 'native/help' + state.helpPage + '.png'; $('helpImage').alt = 'Original GameBox help, page ' + state.helpPage + ' of 4'; }
$('helpPage').addEventListener('click', () => { state.helpPage = state.helpPage % 4 + 1; updateHelp(); });
$('helpBack').addEventListener('click', () => showView('library'));
let swipeStart = null;
$('games').addEventListener('pointerdown', event => { swipeStart = {id:event.pointerId,x:event.clientX}; });
$('games').addEventListener('pointerup', event => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const scale = $('stage').getBoundingClientRect().width / 480 || 1;
  const distance = (event.clientX - swipeStart.x) / scale;
  if (Math.abs(distance) > 25) { suppressClickUntil = performance.now() + 400; moveSelection(distance > 0 ? -1 : 1); }
  swipeStart = null;
});
$('games').addEventListener('pointercancel', () => { swipeStart = null; });
$('playerOptions').addEventListener('click', () => {
  if (state.loading) return;
  state.optionsReturn = 'player'; setRunning(false); showOptionsPanel('menu'); showView('options');
});
$('optionsBack').addEventListener('click', () => {
  if (state.optionsPanel !== 'menu') showOptionsPanel('menu');
  else showView(state.optionsReturn);
});
function showOptionsPanel(panel) {
  state.optionsPanel = panel;
  $('optionsMenu').hidden = panel !== 'menu';
  for (const id of ['control','display','sound']) $(id + 'Panel').hidden = panel !== id;
  $('optionsTitle').src = 'native/' + (panel === 'menu' ? 'option_tit.png' : 'option_' + panel + '_tit.png');
}
for (const panel of ['control','display','sound']) $(panel + 'Option').addEventListener('click', () => showOptionsPanel(panel));
$('displayCycle').addEventListener('click', () => {
  const modes = ['a','c','d'];
  const mode = modes[(modes.indexOf($('display').value) + 1) % modes.length];
  $('display').value = mode;
  $('displayPreview').src = 'native/option_display_dispaytype_' + mode + '.png';
  $('displayPreview').alt = 'Display type ' + mode.toUpperCase() + '. Touch to change.';
  $('player').classList.remove('display-a','display-c','display-d'); $('player').classList.add('display-' + mode);
});
$('directions').addEventListener('change', event => { state.directions = Number(event.target.value); releaseInput(); });
$('display').addEventListener('change', event => { $('player').classList.remove('display-a','display-c','display-d'); $('player').classList.add('display-' + event.target.value); });
$('opacity').addEventListener('input', event => { document.querySelector('.controller').style.opacity = event.target.value; });
$('volume').addEventListener('input', event => { state.volume = Number(event.target.value); emulator.WaveVolume = state.muted ? 0 : state.volume; });
for (const [id,key] of [['turboI','turboI'],['turboII','turboII']]) $(id).addEventListener('click', () => {
  state[key] = !state[key]; $(id).setAttribute('aria-pressed', String(state[key])); syncInput();
});
const coreRun = emulator.Run.bind(emulator);
emulator.Run = function() { settlePadDirection(); state.tick++; syncInput(); coreRun(); };
let noticeTimer;
function notify(message) {
  clearTimeout(noticeTimer); $('notice').textContent = message; $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 2200);
}

// Save only machine state; keep live canvas/audio objects and mapper prototypes.
const snapshotExcluded = new Set(['Core','ROM','MainCanvas','Ctx','ImageData','TimerID','LastFrameTime','KeyUpFunction','KeyDownFunction','Keybord','GamePad','GamePadData','WaveDataArray']);
function machineSnapshot() {
  const seen = new WeakSet();
  function copy(value) {
    if (value === null || ['number','boolean','string'].includes(typeof value)) return value;
    if (typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    if (ArrayBuffer.isView(value)) return {typed:value.constructor.name, values:Array.from(value)};
    if (Array.isArray(value)) {
      if (value.some(v => typeof v === 'function')) return undefined;
      return value.map(copy);
    }
    const result = {};
    for (const [key,item] of Object.entries(value)) {
      if (snapshotExcluded.has(key) || key.startsWith('WebAudio')) continue;
      const saved = copy(item);
      if (saved !== undefined) result[key] = saved;
    }
    return result;
  }
  return {version:1, game:state.current.id, canvasWidth:$('screen').width, canvasHeight:$('screen').height, machine:copy(emulator)};
}
function restoreSnapshot(snapshot) {
  if (snapshot.version !== 1 || snapshot.game !== state.current.id) throw Error('This save belongs to a different cartridge.');
  function restore(target, saved) {
    for (const [key,value] of Object.entries(saved)) {
      if (value && typeof value === 'object' && value.typed) {
        if (ArrayBuffer.isView(target[key])) target[key].set(value.values);
      } else if (Array.isArray(value)) target[key] = structuredClone(value);
      else if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object') restore(target[key], value);
      else if (typeof target[key] !== 'function') target[key] = value;
    }
  }
  restore(emulator, snapshot.machine);
  $('screen').width = snapshot.canvasWidth; $('screen').height = snapshot.canvasHeight;
  emulator.WaveVolume = state.muted ? 0 : state.volume;
  releaseInput();
}
const sessionSaves = new Map();
let databasePromise;
function saveDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve,reject) => {
    if (typeof indexedDB === 'undefined') { reject(Error('Storage is unavailable')); return; }
    const request = indexedDB.open('turbografx-gamebox',1);
    request.onupgradeneeded = () => request.result.createObjectStore('states');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}
async function writeSave(id, snapshot) {
  const db = await saveDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('states','readwrite'); tx.objectStore('states').put(snapshot,id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
async function readSave(id) {
  const db = await saveDatabase();
  return new Promise((resolve,reject) => {
    const request = db.transaction('states').objectStore('states').get(id);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
$('save').addEventListener('click', async () => {
  if (!state.current || state.loading) return;
  const game = state.current.id, token=state.token, running = state.running;
  setRunning(false);
  try {
    const snapshot = machineSnapshot(); sessionSaves.set(game,snapshot);
    try { await writeSave(game,snapshot); if (token === state.token) notify('STATE SAVED'); }
    catch { if (token === state.token) notify('SAVED FOR THIS SESSION · Browser storage unavailable'); }
  } catch { notify('Unable to save this game state.'); }
  if (token === state.token && running && !document.hidden) { audioFromTap(); setRunning(true); }
});
$('load').addEventListener('click', async () => {
  if (!state.current || state.loading) return;
  const game=state.current.id, token=state.token, running=state.running;
  // Resume during the initiating tap, before any database operation.
  audioFromTap(); emulator.Pause(); state.running=false; releaseInput();
  try {
    let snapshot = sessionSaves.get(game);
    if (!snapshot) { try { snapshot = await readSave(game); } catch {} }
    if (token !== state.token) return;
    if (!snapshot) { notify('NO SAVED STATE'); setRunning(running && !document.hidden); return; }
    restoreSnapshot(snapshot); setRunning(!document.hidden); notify('STATE LOADED');
  } catch(error) { if (token === state.token) { setRunning(false); notify(error.message || 'Unable to load game state.'); } }
});
