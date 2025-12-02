// animations/vortex.js
//
// Swirling Vortex Animation (based on LiveBG template)
// ----------------------------------------------------
// Same public API and expectations as the template.
// See comments in sections 1–6 for how it plugs into main.js.

export function createAnimation({ canvas, initialState = {}, onStats }) {
  const ctx = canvas.getContext('2d', { alpha: true });

  // ==============================================================
  // 1. CANVAS + DENSITY STATE
  // ==============================================================

  let W = 0;
  let H = 0;
  let DPR = 1;

  // "points per pixel" from UI
  let baseDensity =
    typeof initialState.density === 'number' ? initialState.density : 0.005;

  // Clamp for perf
  const minPoints = 6000;
  const maxPoints = 90000;

  let N = 0;
  let xVals = new Float32Array(0);
  let yVals = new Float32Array(0);

  // ==============================================================
  // 2. ANIMATION STATE
  // ==============================================================

  let speed =
    typeof initialState.speed === 'number' ? initialState.speed : 0.5;

  let zoom =
    typeof initialState.zoom === 'number' ? initialState.zoom : 1.0;

  let zoomAuto = !!initialState.zoomAuto;
  let zoomPhase = 0;

  let running = false;
  let rafId = null;
  let last = performance.now();
  let t = 0;
  let fpsEMA = 60;

  // ==============================================================
  // 3. CANVAS FITTING + POINT FIELD
  // ==============================================================

  function fitCanvas() {
    DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    rebuildPointField();
  }

  function rebuildPointField() {
    const target = Math.min(
      maxPoints,
      Math.max(
        minPoints,
        Math.floor(baseDensity * W * H)
      )
    );

    if (target === N && xVals.length === target) {
      onStats && onStats({ points: N });
      return;
    }

    N = target;
    xVals = new Float32Array(N);
    yVals = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // Base layout: random point in a unit disc, biased slightly outward
      const u = Math.random();
      const v = Math.random();

      // radius biased toward outer ring to emphasize the vortex arms
      const r = 1 - Math.pow(1 - u, 1.6);
      const theta = 2 * Math.PI * v;

      xVals[i] = r * Math.cos(theta);
      yVals[i] = r * Math.sin(theta);
    }

    if (onStats) onStats({ points: N });
  }

  // ==============================================================
  // 4. MAIN RENDER LOOP
  // ==============================================================

  function loop(now) {
    if (!running) return;

    const dt = Math.max(0.0001, (now - last) / 1000);
    last = now;

    const fps = 1 / dt;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;

    const speedScale = 60;
    t += dt * speed * speedScale;

    // Auto zoom breathing
    let z = zoom;
    if (zoomAuto) {
      zoomPhase += dt;
      const amp = 0.08;
      const hz = 0.09;
      z = zoom * (1 + amp * Math.sin(2 * Math.PI * hz * zoomPhase));
    }

    if (onStats) onStats({ fps: fpsEMA, speed, zoom: z });

    // --- BACKGROUND WITH TRAILS (vortex feel) -------------------
    // Slight alpha so previous frames linger as motion trails.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(4, 0, 15, 0.25)';
    ctx.fillRect(0, 0, W, H);

    if (!N) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    const cx = W * 0.5;
    const cy = H * 0.5;
    const baseRadius = Math.min(W, H) * 0.5 * 0.9 * z;

    // Additive blending so overlapping points bloom
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(180, 220, 255, 0.75)';

    // ============================================================
    // 4a. VORTEX MATH
    // ------------------------------------------------------------
    // For each base point (bx, by in [-1,1] disc):
    //   1. Convert to polar.
    //   2. Apply differential rotation + arm modulation + turbulence.
    //   3. Compress radius inward slightly so it feels like a vortex.
    // ============================================================

    for (let i = 0; i < N; i++) {
      const bx = xVals[i];
      const by = yVals[i];

      const r = Math.hypot(bx, by);       // 0..1
      const baseAng = Math.atan2(by, bx); // -π..π

      // Overall rotation (faster further out)
      const swirl = t * 0.22 + r * 7.0;

      // Spiral arms: modulate by angle so we get bright curved arms
      const armWobble = Math.sin(4 * baseAng + t * 0.6) * 0.25;

      // Per-point turbulence so it feels alive
      const turbulence = Math.sin(i * 0.017 + t * 0.95) * 0.2;

      const ang = baseAng + swirl + armWobble + turbulence;

      // Radial pulsing + inward compression to sell the "pull"
      const radialPulse = 1 + 0.14 * Math.sin(t * 0.5 + r * 9.0);

      // Compress radius toward center in a non-linear way
      const fallIn = 0.35 + 0.65 * (1 - Math.exp(-r * 4.0));

      const radius = r * baseRadius * radialPulse * fallIn;

      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;

      if (x >= 0 && x < W && y >= 0 && y < H) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  // ==============================================================
  // 5. PUBLIC API
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
    t = 0;
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
      rebuildPointField();
    }

    if (params.zoom != null) {
      zoom = params.zoom;
      if (onStats) onStats({ zoom });
    }

    if (params.zoomAuto != null) {
      zoomAuto = !!params.zoomAuto;
      if (!zoomAuto) {
        zoomPhase = 0;
      }
    }
  }

  function destroy() {
    pause();
    window.removeEventListener('resize', fitCanvas);
  }

  // ==============================================================
  // 6. INITIALIZATION
  // ==============================================================

  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  setParams(initialState || {});

  if (initialState.running !== false) {
    play();
  }

  return { play, pause, reset, setParams, destroy };
}

