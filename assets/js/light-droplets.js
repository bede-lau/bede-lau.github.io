/* Original canvas light-streak effect, inspired by the public Light Droplets preview. */
(() => {
  const canvas = document.getElementById('lightDroplets');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, frame = 0, elapsed = 0, lastTime = 0;
  const spaceCanvas = document.getElementById('projectSpaceField');
  const spaceContext = spaceCanvas?.getContext('2d');
  const pointer = { x:-10000, y:-10000 };
  let ripple = null;
  const stars = Array.from({ length:52 }, () => ({
    x:Math.random(), y:Math.random(), radius:0.45 + Math.random() * 0.8,
    phase:Math.random() * Math.PI * 2,
  }));

  function constellation(context, w, h, left = 0, top = 0) {
    const active = !motion.matches;
    const px = pointer.x - left, py = pointer.y - top;
    const count = w < 700 ? 30 : stars.length;
    const nearby = [];
    for (const star of stars.slice(0, count)) {
      const parallaxX = active && px > 0 && px < w ? (px / w - 0.5) * 7 : 0;
      const parallaxY = active && py > 0 && py < h ? (py / h - 0.5) * 5 : 0;
      const x = star.x * w + parallaxX;
      const y = star.y * h + parallaxY;
      const distance = Math.hypot(x - px, y - py);
      const proximity = active ? Math.max(0, 1 - distance / 150) : 0;
      const twinkle = active ? 0.04 * Math.sin(elapsed * 0.6 + star.phase) : 0;
      context.fillStyle = `rgba(174,198,255,${0.18 + twinkle + proximity * 0.3})`;
      context.beginPath(); context.arc(x, y, star.radius + proximity * 0.5, 0, Math.PI * 2); context.fill();
      if (proximity > 0) nearby.push({x, y, distance});
    }
    // Only a small local constellation lights up; lines never span the page.
    nearby.sort((a, b) => a.distance - b.distance);
    for (let i = 1; i < Math.min(nearby.length, 4); i++) {
      const a = nearby[i - 1], b = nearby[i];
      context.strokeStyle = `rgba(174,198,255,${0.13 * (1 - b.distance / 150)})`;
      context.lineWidth = 0.6;
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
    if (ripple && active) {
      const age = elapsed - ripple.time;
      if (age < 1.2) {
        context.strokeStyle = `rgba(174,198,255,${0.13 * Math.pow(1 - age / 1.2, 2)})`;
        context.lineWidth = 0.7;
        context.beginPath(); context.arc(ripple.x - left, ripple.y - top, 8 + 70 * (1 - Math.exp(-age * 2)), 0, Math.PI * 2); context.stroke();
      } else ripple = null;
    }
  }

  function paintProjectSpace() {
    if (!spaceContext || !document.getElementById('projectListBackdrop')?.classList.contains('open')) return;
    const rect = spaceCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (spaceCanvas.width !== Math.round(rect.width * dpr) || spaceCanvas.height !== Math.round(rect.height * dpr)) {
      spaceCanvas.width = Math.round(rect.width * dpr); spaceCanvas.height = Math.round(rect.height * dpr);
      spaceContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    spaceContext.clearRect(0, 0, rect.width, rect.height);
    constellation(spaceContext, rect.width, rect.height, rect.left, rect.top);
  }
  // Stable, staggered lanes keep the background calm rather than flashing randomly.
  const lanes = Array.from({ length: 64 }, (_, i) => ({
    y: (i + 0.5) / 64,
    phase: Math.random(),
    speed: 0.045 + Math.random() * 0.035,
    length: 0.025 + Math.random() * 0.09,
    weight: 0.3 + Math.random() * 0.7,
  }));
  function paint() {
    ctx.clearRect(0, 0, width, height);
    for (const lane of lanes) {
      const travel = (lane.phase + elapsed * lane.speed) % 1;
      const x = travel * (width * 1.5) - width * 0.25;
      const y = lane.y * height;
      const length = lane.length * width;
      const rise = length * 0.12;
      const gradient = ctx.createLinearGradient(x - length, y + rise, x, y);
      gradient.addColorStop(0, 'rgba(82,39,255,0)');
      gradient.addColorStop(0.55, `rgba(82,39,255,${lane.weight * 0.45})`);
      gradient.addColorStop(0.92, `rgba(166,105,255,${lane.weight})`);
      gradient.addColorStop(1, `rgba(228,192,255,${lane.weight * 0.8})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x - length, y + rise);
      ctx.quadraticCurveTo(x - length * 0.36, y + rise * 0.6, x, y);
      ctx.quadraticCurveTo(x - length * 0.18, y + 3, x - length, y + rise);
      ctx.fill();
    }
    constellation(ctx, width, height);
    paintProjectSpace();
  }
  function tick(time) {
    frame = 0;
    if (document.hidden || motion.matches) return;
    if (!lastTime) lastTime = time;
    const delta = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    elapsed += delta;
    paint();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    if (motion.matches) { paint(); return; }
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }
  addEventListener('resize', resize, { passive: true });
  addEventListener('pagehide', () => { cancelAnimationFrame(frame); frame = 0; });
  addEventListener('pageshow', sync);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener?.('change', sync);
  addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || motion.matches) return;
    pointer.x = event.clientX; pointer.y = event.clientY;
  }, { passive:true });
  addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || motion.matches) return;
    ripple = { x:event.clientX, y:event.clientY, time:elapsed };
  }, { passive:true });
  const clearPointer = () => { pointer.x = -10000; pointer.y = -10000; };
  document.documentElement.addEventListener('pointerleave', clearPointer);
  addEventListener('blur', clearPointer);
  // Reduced-motion users receive a still star field when opening a category.
  const projectBackdrop = document.getElementById('projectListBackdrop');
  if (projectBackdrop && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { if (motion.matches) paintProjectSpace(); })
      .observe(projectBackdrop, { attributes:true, attributeFilter:['class'] });
  }
  resize(); sync();
})();
