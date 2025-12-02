// animations/orbitField.js

export function createAnimation({ canvas, initialState, onStats }) {
  const ctx = canvas.getContext('2d', { alpha: true });

  let W = 0;
  let H = 0;
  let DPR = 1;

  let baseDensity =
    typeof initialState.density === 'number' ? initialState.density : 0.005;
  const minPoints = 6000;
  const maxPoints = 120000;

  let N = 0;
  let xVals = new Float32Array(0);
  let yVals = new Float32Array(0);

  let t = 0;
  let speed =
    typeof initialState.speed === 'number' ? initialState.speed : 0.05;
  let running = false;
  let last = performance.now();
  let fpsEMA = 60;

  let zoom =
    typeof initialState.zoom === 'number' ? initialState.zoom : 1.0;
  let zoomAuto = !!initialState.zoomAuto;
  let zoomPhase = 0;

  let rafId = null;

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
      Math.max(minPoints, Math.floor(baseDensity * W * H))
    );
    if (target === N) return;
    N = target;
    xVals = new Float32Array(N);
    yVals = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const ii = i + 1;
      xVals[i] = ii % 200;
      yVals[i] = ii / 43;
    }
    onStats?.({ points: N });
  }

  function loop(now) {
    if (!running) return;

    const dt = Math.max(0.0001, (now - last) / 1000);
    last = now;

    // FPS
    const fps = 1 / dt;
    fpsEMA = fpsEMA * 0.9 + fps * 0.1;
    onStats?.({ fps: fpsEMA, speed, zoom });

    const targetRate = (Math.PI / 20) * 60; // rad/sec
    t += targetRate * dt * speed;

    let zoomNow = zoom;
    if (zoomAuto) {
      zoomPhase += dt;
      const amp = 0.06;
      const hz = 0.08;
      zoomNow = zoom * (1 + amp * Math.sin(2 * Math.PI * hz * zoomPhase));
    }

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (let i = 0; i < N; i++) {
      const xv = xVals[i];
      const yv = yVals[i];

      const k = 5 * Math.cos(xv / 14) * Math.cos(yv / 30);
      const e = yv / 8 - 13;
      const d = (k * k + e * e) / 59 + 4;

      const q =
        60 -
        3 * Math.sin(Math.atan2(k, e) * e) +
        k * (3 + (4 / d) * Math.sin(d * d - t * 2));

      const c = d / 2 + e / 99 - t / 18;

      const mx = q * Math.sin(c);
      const my = (q + d * 9) * Math.cos(c);

      if (mx < minX) minX = mx;
      if (mx > maxX) maxX = mx;
      if (my < minY) minY = my;
      if (my > maxY) maxY = my;
    }

    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const margin = 0.92;
    const baseScale = Math.min((W * margin) / bw, (H * margin) / bh);
    const scale = baseScale * zoomNow;

    const cx = W * 0.5,
      cy = H * 0.5;
    const midX = (minX + maxX) * 0.5;
    const midY = (minY + maxY) * 0.5;
    const offX = cx - midX * scale;
    const offY = cy - midY * scale;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.376)';
    for (let i = 0; i < N; i++) {
      const xv = xVals[i];
      const yv = yVals[i];

      const k = 5 * Math.cos(xv / 14) * Math.cos(yv / 30);
      const e = yv / 8 - 13;
      const d = (k * k + e * e) / 59 + 4;

      const q =
        60 -
        3 * Math.sin(Math.atan2(k, e) * e) +
        k * (3 + (4 / d) * Math.sin(d * d - t * 2));

      const c = d / 2 + e / 99 - t / 18;

      const mx = q * Math.sin(c);
      const my = (q + d * 9) * Math.cos(c);

      const x = mx * scale + offX;
      const y = my * scale + offY;

      if (x >= 0 && x < W && y >= 0 && y < H) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  // Public API expected by main.js
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
  }

  function setParams(params) {
    if (params.speed != null) {
      speed = params.speed;
      onStats?.({ speed });
    }
    if (params.density != null) {
      baseDensity = params.density;
      rebuildPointField();
    }
    if (params.zoom != null) {
      zoom = params.zoom;
      onStats?.({ zoom });
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

  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  setParams(initialState || {});

  if (initialState?.running !== false) {
    play();
  }

  return { play, pause, reset, setParams, destroy };
}
