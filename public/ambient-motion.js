/* BrandWeave kinetic atmosphere — adaptive particle field + pointer-responsive depth. */
(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const world = document.createElement('div');
  world.id = 'ambient-world';
  world.setAttribute('aria-hidden', 'true');
  world.innerHTML = `
    <div class="ambient-grid-layer"></div>
    <canvas class="ambient-particle-field"></canvas>
    <span class="ambient-halo ambient-halo-a"></span>
    <span class="ambient-halo ambient-halo-b"></span>
    <span class="ambient-halo ambient-halo-c"></span>
    <span class="ambient-geometry ambient-diamond"></span>
    <span class="ambient-geometry ambient-ring"></span>
    <span class="ambient-geometry ambient-cross">✳</span>
    <span class="ambient-geometry ambient-orbit"><i></i></span>
    <span class="ambient-geometry ambient-pill">IDEAS → IMPACT</span>
    <span class="ambient-geometry ambient-square"></span>`;
  document.body.prepend(world);

  const canvas = world.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let raf = 0;
  let lastFrame = 0;
  let pointer = { x: -1000, y: -1000, active: false };
  const frameInterval = finePointer ? 1000 / 42 : 1000 / 30;
  const colors = [
    [153, 137, 255], // electric lavender
    [255, 104, 190], // pop pink
    [102, 220, 211], // aqua
    [196, 255, 104]  // acid lime
  ];
  const random = (min, max) => min + Math.random() * (max - min);

  function makeParticle() {
    const color = colors[Math.floor(Math.random() * colors.length)];
    return {
      x: random(0, width), y: random(0, height),
      vx: random(-0.22, 0.22), vy: random(-0.22, 0.22),
      r: random(0.7, 1.9), phase: random(0, Math.PI * 2),
      color, alpha: random(0.2, 0.62),
      pulse: random(0.006, 0.018)
    };
  }

  function resize() {
    const oldWidth = width || window.innerWidth;
    const oldHeight = height || window.innerHeight;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, finePointer ? 1.5 : 1.15);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = width * height;
    const deviceLimit = (navigator.hardwareConcurrency || 4) <= 4 ? 68 : 104;
    const targetCount = reduceMotion ? 34 : Math.min(finePointer ? deviceLimit : 44, Math.max(28, Math.floor(area / 14500)));
    if (particles.length < targetCount) {
      for (let i = particles.length; i < targetCount; i++) particles.push(makeParticle());
    } else if (particles.length > targetCount) particles.length = targetCount;
    const sx = width / oldWidth;
    const sy = height / oldHeight;
    particles.forEach(p => { p.x *= sx; p.y *= sy; });
  }

  function draw(now = 0, animate = true) {
    ctx.clearRect(0, 0, width, height);
    const pulseTime = now * 0.001;
    const maxDistance = finePointer ? 142 : 112;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (animate) {
        p.phase += p.pulse;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -12) p.x = width + 12;
        if (p.x > width + 12) p.x = -12;
        if (p.y < -12) p.y = height + 12;
        if (p.y > height + 12) p.y = -12;
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 1 && distance < 150) {
            const force = (1 - distance / 150) * 0.012;
            p.vx += (dx / distance) * force;
            p.vy += (dy / distance) * force;
          }
        }
        p.vx *= 0.996;
        p.vy *= 0.996;
      }
      const glow = 0.78 + Math.sin(p.phase + pulseTime) * 0.22;
      const [r, g, b] = p.color;
      const a = p.alpha * glow;

      // Soft node bloom, kept small to avoid large overdraw.
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.12})`;
      ctx.arc(p.x, p.y, p.r * 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < maxDistance * maxDistance) {
          const distance = Math.sqrt(distanceSquared);
          const opacity = (1 - distance / maxDistance) * 0.12;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(157,165,255,${opacity})`;
          ctx.lineWidth = 0.65;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    // A faint cursor ripple connects the interaction to the ambient network.
    if (pointer.active && finePointer) {
      const gradient = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 190);
      gradient.addColorStop(0, 'rgba(149,126,255,0.10)');
      gradient.addColorStop(1, 'rgba(149,126,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(pointer.x - 190, pointer.y - 190, 380, 380);
    }
  }

  function loop(now) {
    raf = 0;
    if (document.hidden) return;
    if (now - lastFrame >= frameInterval) {
      lastFrame = now;
      draw(now, !reduceMotion);
    }
    if (!reduceMotion) raf = requestAnimationFrame(loop);
  }

  function start() {
    if (reduceMotion) { draw(0, false); return; }
    if (!raf && !document.hidden) raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  resize();
  draw(0, false);
  start();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  if (finePointer && !reduceMotion) {
    let pointerFrame = 0;
    window.addEventListener('pointermove', event => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; });
    }, { passive: true });
    window.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });
  }

  // Add lightweight 3D tilt only to compact surfaces, never to form controls.
  if (finePointer && !reduceMotion) {
    const selector = '.cap-card,.step-card,.stat-card,.memory-card,.review-card,.insight-card,.dashboard-hero';
    let activeCard = null;
    let tiltFrame = 0;
    document.addEventListener('pointermove', event => {
      const card = event.target.closest?.(selector);
      if (activeCard && activeCard !== card) {
        activeCard.style.removeProperty('--tilt-x');
        activeCard.style.removeProperty('--tilt-y');
        activeCard.classList.remove('is-tilting');
      }
      activeCard = card;
      if (!card || tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
        const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
        const intensity = card.classList.contains('dashboard-hero') ? 1.5 : 3.2;
        card.style.setProperty('--tilt-x', `${(x * intensity).toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${(y * intensity).toFixed(2)}deg`);
        card.classList.add('is-tilting');
      });
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      if (activeCard) {
        activeCard.style.removeProperty('--tilt-x');
        activeCard.style.removeProperty('--tilt-y');
        activeCard.classList.remove('is-tilting');
        activeCard = null;
      }
    });
  }
})();
