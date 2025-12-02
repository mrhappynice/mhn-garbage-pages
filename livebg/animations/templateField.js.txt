// animations/templateField.js
//
// LiveBG Animation Template (Working Version)
// ------------------------------------------
// This file is BOTH:
//   1. A fully working animation.
//   2. A reference for how to build new animations that plug into main.js.
//
// CONTRACT (what main.js expects)
// ===============================
// main.js will do something like:
//
//   import { createAnimation } from './animations/whatever.js'
//
//   const anim = createAnimation({
//     canvas,          // <canvas> element to draw on
//     initialState: {  // values from the UI controls
//       speed,         // 0..1 (or more), how fast time moves
//       density,       // "points per pixel" base density
//       zoom,          // zoom factor, usually ~1.0
//       zoomAuto,      // boolean, whether auto-zoom pulse is on
//       running        // boolean, start paused or running
//     },
//     onStats          // function(stats) to report fps, points, etc
//   });
//
// and expects you to return an object:
//
//   {
//     play(),          // start / resume animation
//     pause(),         // stop animation, keep state
//     reset(),         // optional: reset time, phases, etc
//     setParams({...}),// called whenever UI sliders/checkboxes change
//     destroy()        // cleanup (remove listeners, cancel RAF)
//   }
//
// As long as you keep that shape, your animation will work with the
// existing UI, controls, and animation switcher.

export function createAnimation({ canvas, initialState = {}, onStats }) {
  const ctx = canvas.getContext('2d', { alpha: true });

  // ==============================================================
  // 1. CANVAS + DENSITY STATE
  // --------------------------------------------------------------
  // These handle:
  //   - High-DPI scaling (devicePixelRatio).
  //   - Rebuilding the point field when size or density changes.
  // ==============================================================

  let W = 0;
  let H = 0;
  let DPR = 1;

  // CUSTOMIZE: density semantics
  // ----------------------------
  // baseDensity is "points per pixel". Higher -> more points.
  // main.js will pass in initialState.density from the slider.
  let baseDensity =
    typeof initialState.density === 'number' ? initialState.density : 0.005;

  // You can clamp the total number of points for perf reasons.
  const minPoints = 6000;
  const maxPoints = 120000;

  // Number of points currently in use and their base positions.
  let N = 0;
  let xVals = new Float32Array(0);
  let yVals = new Float32Array(0);

  // ==============================================================
  // 2. ANIMATION STATE
  // --------------------------------------------------------------
  // These are the knobs the UI controls, plus internal time & fps.
  // ==============================================================

  let speed =
    typeof initialState.speed === 'number' ? initialState.speed : 0.5;

  let zoom =
    typeof initialState.zoom === 'number' ? initialState.zoom : 1.0;

  let zoomAuto = !!initialState.zoomAuto;
  let zoomPhase = 0; // internal phase for zoom pulsing

  let running = false;
  let rafId = null;
  let last = performance.now();
  let t = 0;        // main animation time
  let fpsEMA = 60;  // smoothed FPS estimate

  // ==============================================================
  // 3. CANVAS FITTING + POINT FIELD GENERATION
  // ==============================================================

  function fitCanvas() {
    // Handle HiDPI while keeping drawing units in CSS pixels.
    DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    rebuildPointField();
  }

  // CUSTOMIZE HERE (LAYOUT)
  // -----------------------
  // rebuildPointField() defines the *base positions* of your particles.
  // Currently:
  //   - random points in a unit disc [-1,1] normalized space
  // You can change this to:
  //   - grid
  //   - rings
  //   - noise
  //   - any other base pattern
  //
  // IMPORTANT: keep coordinates roughly in [-1,1] so later scaling is simple.
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
      // --- CURRENT LAYOUT: Random point in a unit disc ---

      const u = Math.random();
      const v = Math.random();
      const r = Math.sqrt(u);            // radius 0..1 (biased toward center)
      const theta = 2 * Math.PI * v;     // angle 0..2π

      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);

      xVals[i] = x;
      yVals[i] = y;
    }

    if (onStats) onStats({ points: N });
  }

  // ==============================================================
  // 4. MAIN RENDER LOOP
  // --------------------------------------------------------------
  // This is where the visual *behavior* happens.
  // You will usually:
  //   - advance time t
  //   - compute zoom (and auto-zoom)
  //   - clear background
  //   - for each point: transform base (xVals[i], yVals[i]) into
  //     screen coordinates using your custom math.
  // ==============================================================

  function loop(now) {
    if (!running) return;

    const dt = Math.max(0.0001, (now - last) / 1000);
    last = now;

    // FPS smoothing for UI stats (optional but nice).
    const fps = 1 / dt;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;

    // Advance time based on "speed". This makes "speed" feel
    // consistent across frame rates.
    const speedScale = 60; // 1.0 => roughly 60 units/sec at 60fps
    t += dt * speed * speedScale;

    // Auto zoom breathing (optional)
    let z = zoom;
    if (zoomAuto) {
      zoomPhase += dt;
      const amp = 0.08; // how much zoom pulses
      const hz = 0.09;  // pulses per second
      z = zoom * (1 + amp * Math.sin(2 * Math.PI * hz * zoomPhase));
    }

    // Report stats back to UI
    if (onStats) onStats({ fps: fpsEMA, speed, zoom: z });

    // --- BACKGROUND STYLE (CUSTOMIZE COLORS HERE) ---
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05030a'; // background color
    ctx.fillRect(0, 0, W, H);

    if (!N) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    const cx = W * 0.5;
    const cy = H * 0.5;
    const baseRadius = Math.min(W, H) * 0.5 * 0.9 * z;

    // Point color
    ctx.fillStyle = 'rgba(255,255,255,0.5)';

    // ============================================================
    // 4a. ANIMATION MATH (THE FUN PART)
    // ------------------------------------------------------------
    // This block is the heart of the look/feel.
    // For each base point (bx, by in [-1,1] disc), we:
    //   1. Convert to polar (r, baseAng).
    //   2. Modify angle and radius using time t, index i, etc.
    //   3. Map back to screen space (x, y).
    //
    // To create a new animation, you typically ONLY need to change:
    //   - the formulas for "swirl", "wobble", "radialPulse".
    // ============================================================

    for (let i = 0; i < N; i++) {
      const bx = xVals[i];
      const by = yVals[i];

      // Base polar coordinates
      const r = Math.hypot(bx, by);       // 0..1
      const baseAng = Math.atan2(by, bx); // -π..π

      // CUSTOMIZE: angular behavior --------------------------------
      // swirl controls overall rotation: function of time + radius.
      const swirl = t * 0.35 + r * 5.0;

      // wobble adds per-point noise so the field feels more organic.
      const wobble = Math.sin(i * 0.013 + t * 0.7) * 0.35;

      const ang = baseAng + swirl + wobble;

      // CUSTOMIZE: radial behavior ---------------------------------
      // radialPulse makes the field "breathe" in and out.
      const radialPulse = 1 + 0.18 * Math.sin(t * 0.6 + r * 8.0);
      const radius = r * baseRadius * radialPulse;

      // Map to screen
      const x = cx + Math.cos(ang) * radius;
      const y = cy + Math.sin(ang) * radius;

      // Simple culling for a tiny perf win
      if (x >= 0 && x < W && y >= 0 && y < H) {
        // Single logical pixel (DPR already handled via setTransform)
        ctx.fillRect(x, y, 1, 1);
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  // ==============================================================
  // 5. PUBLIC API (USED BY main.js)
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
    // Optional: reset time/phase to initial state.
    t = 0;
    zoomPhase = 0;
  }

  // setParams is called whenever UI controls change.
  // Only update the values you care about; the rest can be ignored.
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
  fitCanvas();                 // size canvas + build initial field
  setParams(initialState || {}); // sync with initial UI values

  if (initialState.running !== false) {
    play();
  }

  // This object is what main.js keeps and calls.
  return { play, pause, reset, setParams, destroy };
}
