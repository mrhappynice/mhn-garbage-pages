// animations/sidewaysTornado.js
//
// Sideways Tornado Animation for LiveBG
// -------------------------------------
// Same public API as the template, but with a custom field + behavior:
//
//   - A horizontal "tornado tube" across the screen.
//   - Wide, fuzzy mouth on one side tapering to a tight funnel.
//   - Swirling motion around the axis, with subtle bend and wobble.
//   - Motion trails via partial clears + additive blending.

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
    typeof initialState.density === 'number' ? initialState.density : 0.0045;

  const minPoints = 3000;
  const maxPoints = 90000;

  let N = 0;

  // Instead of base x/y in a disc, we store parametric coords
  // along a horizontal tube:
  //   s in [0,1]  : position along tornado axis (left -> right)
  //   θ in [0,2π) : angle around axis (for swirl)
  //   rBase       : base radius of the funnel at that s
  let sVals = new Float32Array(0);
  let theta0Vals = new Float32Array(0);
  let radiusVals = new Float32Array(0);

  // ==============================================================
  // 2. ANIMATION STATE
  // ==============================================================

  let speed =
    typeof initialState.speed === 'number' ? initialState.speed : 0.1;

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
  // 3. CANVAS FITTING + FIELD GENERATION
  // ==============================================================

  function fitCanvas() {
    DPR = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    rebuildField();
  }

  function rebuildField() {
    const target = Math.min(
      maxPoints,
      Math.max(
        minPoints,
        Math.floor(baseDensity * W * H)
      )
    );

    if (target === N && sVals.length === target) {
      onStats && onStats({ points: N });
      return;
    }

    N = target;
    sVals = new Float32Array(N);
    theta0Vals = new Float32Array(N);
    radiusVals = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      // s = axis parameter: 0 at the wide "mouth", 1 at the tight funnel.
      const s = Math.random(); // uniform along axis

      // Funnel radius: wide at s≈0, tight at s≈1
      // Use a curved falloff so it pinches smoothly.
      const baseRadius = 0.45 * Math.pow(1 - s, 1.7) + 0.04; // in normalized units

      // Angle around axis, random start (we'll add time-dependent swirl later).
      const theta0 = 1.2 * Math.PI * Math.random();

      // Slight per-particle jitter in radius for texture
      const jitter = (Math.random() - 0.5) * 0.05 * baseRadius;

      sVals[i] = s;
      theta0Vals[i] = theta0;
      radiusVals[i] = baseRadius + jitter;
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

    const speedScale = 45; // sideways tornado looks good a bit slower
    t += dt * speed * speedScale;

    // Auto zoom breathing
    let z = zoom;
    if (zoomAuto) {
      zoomPhase += dt;
      const amp = 0.09;
      const hz = 0.07;
      z = zoom * (1 + amp * Math.sin(2 * Math.PI * hz * zoomPhase));
    }

    if (onStats) onStats({ fps: fpsEMA, speed, zoom: z });

    // --- BACKGROUND + TRAILS -------------------------------------
    ctx.globalCompositeOperation = 'source-over';
    // Semi-transparent dark overlay: leaves trails
    ctx.fillStyle = 'rgba(3, 1, 10, 0.28)';
    ctx.fillRect(0, 0, W, H);

    if (!N) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    const cx = W * 0.5;
    const cy = H * 0.5;

    const axisLen = W * 0.52 * z;     // half-length of tornado horizontally
    const radialScale = H * 0.42 * z; // vertical extent of swirl around axis

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(160, 220, 255, 0.8)';

    // ============================================================
    // 4a. SIDEWAYS TORNADO MATH
    // ------------------------------------------------------------
    // Axis:
    //   - Horizontal line across screen with slight S-curve bend.
    //   - s in [0,1] moves from left (mouth) to right (tip).
    //
    // Around axis:
    //   - Swirl angle depends on time and s, so near the mouth you see
    //     broad spiraling bands, tightening toward the tip.
    //   - Radius shrinks as s→1 (funnel).
    //   - Mild breathing / shaking to add life.
    // ============================================================

    const bendPhase = t * 0.003;
    const wobblePhase = t * 0.18;

    for (let i = 0; i < N; i++) {
      const s = sVals[i];
      const theta0 = theta0Vals[i];
      const baseR = radiusVals[i];

      // Axis position in normalized coordinates
      // Map s∈[0,1] to xAxis∈[-1,1]
      const xAxis = (s - 0.5) * 2.0;

      // S-curve bend + vertical sway
      const bend = 0.28 * Math.sin(2.7 * (s - 0.3) + bendPhase) +
                   0.12 * Math.sin(5.3 * s - bendPhase * 1.7);
      const yAxis = 0.15 * Math.sin(bendPhase * 1.3) + bend * 0.8;

      // Swirl angle:
      //   - Faster swirl near the funnel tip (s → 1).
      //   - Some global rotation and per-axis modulation.
      const swirlSpeed = 2.0 + 4.0 * s;
      const swirl = t * 0.045 * swirlSpeed;
      const theta = theta0 + swirl + 2.0 * s;

      // Radius:
      //   - Shrinks with s (baseR already handles most of that).
      //   - Add subtle pulse and turbulence.
      const pulse = 1 + 0.25 * Math.sin(t * 0.025 + s * 8.0);
      const turbulence =
        1 + 0.18 * Math.sin(theta0 * 3.1 + wobblePhase * 1.4);

      const r = baseR * pulse * turbulence;

      // Swirl around axis.
      // We keep offsets mostly vertical so it feels like a sideways vortex,
      // but allow some horizontal swirl to make the volume feel 3D-ish.
      const swirlX = Math.cos(theta) * r * 0.5;
      const swirlY = Math.sin(theta) * r;

      // Combine axis position + swirl offsets, still in [-1,1]-ish space.
      const nx = xAxis + swirlX;
      const ny = yAxis + swirlY;

      // Map to screen
      const x = cx + nx * axisLen;
      const y = cy + ny * radialScale;

      if (x >= 0 && x < W && y >= 0 && y < H) {
        // Slight taper in brightness toward the tip
        const alphaScale = 0.35 + 0.65 * (1 - s);
        ctx.globalAlpha = alphaScale;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Reset alpha for next frame
    ctx.globalAlpha = 1.0;

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
      onStats && onStats({ speed });
    }

    if (params.density != null) {
      baseDensity = params.density;
      rebuildField();
    }

    if (params.zoom != null) {
      zoom = params.zoom;
      onStats && onStats({ zoom });
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

