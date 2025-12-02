// main.js
// ===== DOM helpers =====
const $ = (sel) => document.querySelector(sel);

// Core elements
const canvas = $('#c');
const controlsModal = $('#modal');
const infoDrawer = $('#infoDrawer');
const scrim = $('#scrim');

// Controls
const fpsEl = $('#fps');
const ptsEl = $('#pts');
const spdEl = $('#spd');
const zoomStatEl = $('#zoomStat');

const speedRange = $('#speed');
const speedVal = $('#speedVal');
const densRange = $('#density');
const densVal = $('#densVal');
const zoomRange = $('#zoom');
const zoomVal = $('#zoomVal');
const zoomAutoCb = $('#zoomAuto');

const btnToggle = $('#toggle');
const btnReset = $('#reset');

const animSelect = $('#animationSelect');
const animName = $('#animName');

const tabControls = $('#tabControls');
const tabInfo = $('#tabInfo');

// ===== Global UI state =====
const state = {
  speed: parseFloat(speedRange.value),
  density: parseFloat(densRange.value),
  zoom: parseFloat(zoomRange.value),
  zoomAuto: zoomAutoCb.checked,
  running: true
};

// ===== Animation registry =====
// Your animations live in /animations/*.js and each exports createAnimation()
const animationDefs = [
  {
    id: 'cnidarian',
    label: 'Cnidarian',
    module: './animations/orbitField.js'
  },
  {
    id: 'swirl',
    label: 'Swirl Waves',
    module: './animations/swirlField.js'
  },
{
  id: 'template',
  label: 'Template Field',
  module: './animations/templateField.js'
},
{
  id: 'fiya',
  label: 'Fire Field',
  module: './animations/fireField.js'
}

];

// Populate the <select> from the registry (so you only maintain one list)
function populateAnimationSelect() {
  animSelect.innerHTML = '';
  for (const def of animationDefs) {
    const opt = document.createElement('option');
    opt.value = def.id;
    opt.textContent = def.label;
    animSelect.appendChild(opt);
  }
  const first = animationDefs[0];
  animSelect.value = first.id;
  animName.textContent = first.label;
}
populateAnimationSelect();

// ===== Animation management =====
let currentAnimation = null;
let isLoadingAnimation = false;

function updateStats(partial) {
  // Called by animations via onStats({...})
  if (partial.fps != null) {
    fpsEl.textContent = 'fps: ' + partial.fps.toFixed(0);
  }
  if (partial.points != null) {
    ptsEl.textContent = 'points: ' + partial.points.toLocaleString();
  }
  if (partial.speed != null) {
    const s = partial.speed;
    spdEl.textContent = 'speed: ' + s.toFixed(2);
    speedVal.textContent = s.toFixed(2);
    if (parseFloat(speedRange.value) !== s) {
      speedRange.value = s.toFixed(2);
    }
  }
  if (partial.zoom != null) {
    const z = partial.zoom;
    zoomStatEl.textContent = 'zoom: ' + z.toFixed(2) + '×';
    zoomVal.textContent = z.toFixed(2) + '×';
    if (parseFloat(zoomRange.value) !== z) {
      zoomRange.value = z.toFixed(2);
    }
  }
}

async function loadAnimation(id) {
  const def = animationDefs.find((a) => a.id === id);
  if (!def || isLoadingAnimation) return;

  isLoadingAnimation = true;

  // Clean up old animation
  if (currentAnimation) {
    try {
      currentAnimation.pause?.();
      currentAnimation.destroy?.();
    } catch (e) {
      console.error('Error cleaning up animation', e);
    }
    currentAnimation = null;
  }

  try {
    const mod = await import(def.module);
    const factory = mod.createAnimation || mod.default;

    currentAnimation = factory({
      canvas,
      initialState: { ...state },
      onStats: updateStats
    });

    // Ensure animation is in sync with UI state
    currentAnimation.setParams?.({
      speed: state.speed,
      density: state.density,
      zoom: state.zoom,
      zoomAuto: state.zoomAuto
    });

    if (state.running) {
      currentAnimation.play?.();
    }

    animName.textContent = def.label;
  } catch (err) {
    console.error('Failed to load animation', err);
  } finally {
    isLoadingAnimation = false;
  }
}

// Initial load
loadAnimation(animationDefs[0].id);

// When user changes the selector
animSelect.addEventListener('change', () => {
  const id = animSelect.value;
  loadAnimation(id);
});

// ===== Controls wiring =====
function updateZoomUI() {
  zoomVal.textContent = state.zoom.toFixed(2) + '×';
  zoomStatEl.textContent = 'zoom: ' + state.zoom.toFixed(2) + '×';
}

// Speed slider
speedRange.addEventListener('input', () => {
  state.speed = parseFloat(speedRange.value);
  spdEl.textContent = 'speed: ' + state.speed.toFixed(2);
  speedVal.textContent = state.speed.toFixed(2);
  currentAnimation?.setParams?.({ speed: state.speed });
});

// Density slider
densRange.addEventListener('input', () => {
  state.density = parseFloat(densRange.value);
  densVal.textContent = state.density.toFixed(3);
  currentAnimation?.setParams?.({ density: state.density });
});

// Zoom slider
zoomRange.addEventListener('input', () => {
  state.zoom = parseFloat(zoomRange.value);
  updateZoomUI();
  currentAnimation?.setParams?.({ zoom: state.zoom });
});

// Auto zoom
zoomAutoCb.addEventListener('change', () => {
  state.zoomAuto = zoomAutoCb.checked;
  currentAnimation?.setParams?.({ zoomAuto: state.zoomAuto });
});

// Pause / resume
btnToggle.addEventListener('click', () => {
  state.running = !state.running;
  btnToggle.textContent = state.running ? 'Pause' : 'Resume';
  if (state.running) currentAnimation?.play?.();
  else currentAnimation?.pause?.();
});

// Reset
btnReset.addEventListener('click', () => {
  currentAnimation?.reset?.();
});

// Wheel interactions for speed / zoom
canvas.addEventListener(
  'wheel',
  (ev) => {
    if (ev.shiftKey) {
      ev.preventDefault();
      state.zoom *= Math.pow(1.1, -ev.deltaY / 100);
      state.zoom = Math.min(4, Math.max(0.5, state.zoom));
      zoomRange.value = state.zoom.toFixed(2);
      updateZoomUI();
      currentAnimation?.setParams?.({ zoom: state.zoom });
      return;
    }

    ev.preventDefault();
    state.speed *= Math.pow(1.1, -ev.deltaY / 100);
    state.speed = Math.max(0.05, Math.min(5, state.speed));
    speedRange.value = state.speed.toFixed(2);
    spdEl.textContent = 'speed: ' + state.speed.toFixed(2);
    speedVal.textContent = state.speed.toFixed(2);
    currentAnimation?.setParams?.({ speed: state.speed });
  },
  { passive: false }
);

// Keyboard zoom
window.addEventListener('keydown', (e) => {
  if (e.key === '+' || e.key === '=') {
    state.zoom = Math.min(4, state.zoom * 1.1);
  } else if (e.key === '-' || e.key === '_') {
    state.zoom = Math.max(0.5, state.zoom / 1.1);
  } else {
    return;
  }
  zoomRange.value = state.zoom.toFixed(2);
  updateZoomUI();
  currentAnimation?.setParams?.({ zoom: state.zoom });
});

// Initial zoom UI
updateZoomUI();

// ===== Draggable controls modal =====
const dragHandle = document.getElementById('dragHandle');
let dragging = false;
let offsetX = 0;
let offsetY = 0;

dragHandle.addEventListener('pointerdown', (e) => {
  dragging = true;
  const r = controlsModal.getBoundingClientRect();
  offsetX = e.clientX - r.left;
  offsetY = e.clientY - r.top;
  dragHandle.setPointerCapture(e.pointerId);
});
dragHandle.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const x = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - offsetX));
  const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - offsetY));
  controlsModal.style.left = x + 'px';
  controlsModal.style.top = y + 'px';
});
dragHandle.addEventListener('pointerup', () => (dragging = false));
dragHandle.addEventListener('pointercancel', () => (dragging = false));

// ===== Drawer / scrim / dialogs / themes (your old 2nd script, slightly cleaned) =====
function setDrawer(open, el, tab) {
  el.classList.toggle('is-open', !!open);
  tab?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    el.removeAttribute('inert');
    el.setAttribute('aria-hidden', 'false');
  } else {
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
  }
  updateScrim();
}

function anyOpen() {
  return (
    controlsModal.classList.contains('is-open') ||
    infoDrawer.classList.contains('is-open')
  );
}

function updateScrim() {
  const on = anyOpen();
  scrim.classList.toggle('is-on', on);
  scrim.setAttribute('aria-hidden', on ? 'false' : 'true');
}

// start closed
setDrawer(false, controlsModal, tabControls);
setDrawer(false, infoDrawer, tabInfo);

tabControls.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !controlsModal.classList.contains('is-open');
  setDrawer(open, controlsModal, tabControls);
  if (open) setDrawer(false, infoDrawer, tabInfo);
});

tabInfo.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !infoDrawer.classList.contains('is-open');
  setDrawer(open, infoDrawer, tabInfo);
  if (open) setDrawer(false, controlsModal, tabControls);
});

scrim.addEventListener('click', () => {
  setDrawer(false, controlsModal, tabControls);
  setDrawer(false, infoDrawer, tabInfo);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && anyOpen()) {
    setDrawer(false, controlsModal, tabControls);
    setDrawer(false, infoDrawer, tabInfo);
  }
});

// Pop dialogs
function openPop(id) {
  const dlg = document.getElementById(id);
  if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
}
function closePop(id) {
  const dlg = document.getElementById(id);
  if (dlg?.open) dlg.close();
}
document.querySelectorAll('[data-pop]').forEach((btn) => {
  btn.addEventListener('click', () => openPop(btn.getAttribute('data-pop')));
});
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closePop(btn.getAttribute('data-close')));
});

// Themes
const themeAccents = {
  classic: 'rgba(255,255,255,0.12)',
  neon: 'rgba(0,255,200,0.24)',
  embers: 'rgba(255,120,0,0.24)'
};
document.querySelectorAll('[data-theme]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-theme');
    const accent = themeAccents[key] || themeAccents.classic;
    document.querySelectorAll('.pill, .link-card, .drawer-tab').forEach((el) => {
      el.style.background = accent;
    });
  });
});
