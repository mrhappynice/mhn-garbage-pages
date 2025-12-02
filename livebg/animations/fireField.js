// animations/fireField.js
//


export function createAnimation({ canvas, initialState = {}, onStats }) {
  const ctx = canvas.getContext('2d', { alpha: true });

  // Make sure any scaling we do stays smooth
  ctx.imageSmoothingEnabled = true;

  // ==============================================================
  // 1. CANVAS + GRID STATE
  // ==============================================================

  let W = 0;
  let H = 0;
  let DPR = 1;

  // density: 0..1-ish from UI. Smaller default than before.
  let baseDensity =
    typeof initialState.density === 'number' ? initialState.density : 0.3;

  let gridW = 0;
  let gridH = 0;
  let gridSize = 0;
  let buffer = new Float32Array(0); // fire intensity buffer

  // ==============================================================
  // 2. ANIMATION STATE
  // ==============================================================

  let speed =
    typeof initialState.speed === 'number' ? initialState.speed : 0.2;

  let zoom =
    typeof initialState.zoom === 'number' ? initialState.zoom : 1.0;

  let zoomAuto = !!initialState.zoomAuto;
  let zoomPhase = 0;

  let running = false;
  let rafId = null;
  let last = performance.now();
  let fpsEMA = 60;

  // ==============================================================
  // 3. CANVAS FITTING + GRID SETUP
  // ==============================================================

  function fitCanvas() {
    DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    rebuildGrid();
  }

  function rebuildGrid() {
    // Map baseDensity (~0..1) to cell size.
    // Lower density => BIGGER cells (less dense).
    const d = Math.max(0, Math.min(1, baseDensity));
    // base around 28px cells, shrink a bit as density goes up
    const cellSize = Math.max(14, 28 - d * 10);

    gridW = Math.max(24, Math.floor(W / cellSize));
    gridH = Math.max(18, Math.floor(H / (cellSize * 0.8)));
    gridSize = gridW * gridH;

    buffer = new Float32Array(gridSize + gridW + 1);
    buffer.fill(0);

    if (onStats) onStats({ points: gridSize });
  }

  // ==============================================================
  // 4. FIRE SIMULATION
  // ==============================================================

  function stepFire(steps) {
    if (gridSize === 0) return;

    // Seed fewer points so it's not a solid wall
    const d = Math.max(0, Math.min(1, baseDensity));
    const seedCount = Math.max(1, Math.floor(gridW / (6 + 4 * (1 - d))));

    for (let s = 0; s < steps; s++) {
      // Seed bottom row
      for (let i = 0; i < seedCount; i++) {
        const col = (Math.random() * gridW) | 0;
        const idx = col + gridW * (gridH - 1);
        buffer[idx] = 60 + Math.random() * 5; // slightly varied
      }

      // Diffuse upwards
      for (let i = 0; i < gridSize; i++) {
        const v =
          buffer[i] +
          buffer[i + 1] +
          buffer[i + gridW] +
          buffer[i + gridW + 1];

        buffer[i] = v * 0.25;
      }

      // Gentle global fade so it doesn’t saturate
      for (let i = 0; i < gridSize; i++) {
        buffer[i] *= 0.985;
      }
    }
  }

  // Smooth continuous color mapping instead of harsh buckets
  function intensityToRGBA(v) {
    // v is roughly 0..60
    const t = Math.max(0, Math.min(1, v / 45)); // normalized
    // Slight gamma for more detail in the lower part
    const g = t * t;

    const r = 30 + 225 * t;      // 30..255
    const gCol = 10 + 170 * g;   // 10..~180
    const b = 5 + 40 * (1 - t);  // 45..5
    const a = 0.15 + 0.8 * t;    // 0.15..0.95

    return `rgba(${r | 0},${gCol | 0},${b | 0},${a.toFixed(3)})`;
  }

  // ==============================================================
  // 5. MAIN RENDER LOOP
  // ==============================================================

  function loop(now) {
    if (!running) return;

    const dt = Math.max(0.0001, (now - last) / 1000);
    last = now;

    const fps = 1 / dt;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;

    // Fewer steps per frame to avoid over-blurring / mashing
    const steps = Math.max(1, Math.round(speed * 4));
    stepFire(steps);

    let z = zoom;
    if (zoomAuto) {
      zoomPhase += dt;
      const amp = 0.07;
      const hz = 0.07;
      z = zoom * (1 + amp * Math.sin(2 * Math.PI * hz * zoomPhase));
    }

    if (onStats) onStats({ fps: fpsEMA, speed, zoom: z });

    ctx.clearRect(0, 0, W, H);

    // Slight vignette background
    ctx.fillStyle = 'rgb(4, 3, 10)';
    ctx.fillRect(0, 0, W, H);

    if (!gridSize) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    const cellW = W / gridW;
    const cellH = (H / gridH) * z;

    // Tiny gap between cells so it doesn't look like a solid pixel block
    const gapX = Math.max(0.4, cellW * 0.08);
    const gapY = Math.max(0.4, cellH * 0.08);

    for (let y = 0; y < gridH; y++) {
      const rowOffset = y * gridW;

      // *** CHANGED: draw rows in natural order (top at y=0, bottom at y=gridH-1) ***
      const sy = y * cellH;

      if (sy > H || sy + cellH < 0) continue;

      for (let x = 0; x < gridW; x++) {
        const idx = rowOffset + x;
        const v = buffer[idx];
        if (v < 1.5) continue; // skip very faint cells

        ctx.fillStyle = intensityToRGBA(v);

        const sx = x * cellW;
        ctx.fillRect(
          sx + gapX,
          sy + gapY,
          cellW - 2 * gapX,
          cellH - 2 * gapY
        );
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  // ==============================================================
  // 6. PUBLIC API
  // ==============================================================

  function play() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function pause() {
    running = false;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function reset() {
    if (buffer && buffer.length) buffer.fill(0);
    zoomPhase = 0;
  }

  function setParams(params) {
    if (!params) return;

    if (params.speed != null) {
      speed = params.speed;
      if (onStats) onStats({ speed });
    }

    if (params.density != null) {
      baseDensity = params.density;
      rebuildGrid();
    }

    if (params.zoom != null) {
      zoom = params.zoom;
      if (onStats) onStats({ zoom });
    }

    if (params.zoomAuto != null) {
      zoomAuto = !!params.zoomAuto;
      if (!zoomAuto) zoomPhase = 0;
    }
  }

  function destroy() {
    pause();
    window.removeEventListener('resize', fitCanvas);
  }

  // ==============================================================
  // 7. INITIALIZATION
  // ==============================================================

  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  setParams(initialState || {});

  if (initialState.running !== false) {
    play();
  }

  return { play, pause, reset, setParams, destroy };
}

