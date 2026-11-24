/* BrandWeave motion layer. Uses the existing olive / sand / stone palette only. */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
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
    <span class="ambient-cursor-glow"></span>
    <span class="ambient-geometry ambient-diamond"></span>
    <span class="ambient-geometry ambient-ring"></span>
    <span class="ambient-geometry ambient-cross">✳</span>
    <span class="ambient-geometry ambient-orbit"><i></i></span>
    <span class="ambient-geometry ambient-pill">STRATEGY IN MOTION</span>
    <span class="ambient-geometry ambient-square"></span>
    <span class="ambient-geometry ambient-streak"></span>
    <span class="ambient-scroll-meter"></span>`;
  document.body.prepend(world);

  const canvas = world.querySelector('canvas');
  const ctx = canvas?.getContext('2d', { alpha: true, desynchronized: true });
  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let animationFrame = 0;
  let pointerFrame = 0;
  let scrollFrame = 0;
  let lastFrame = 0;
  let pointer = { x: -1000, y: -1000, active: false };
  const frameInterval = finePointer ? 1000 / 42 : 1000 / 30;
  const maxLinks = finePointer ? 138 : 104;
  const palette = [
    [108, 110, 54],  // olive #6C6E36
    [227, 189, 144], // sand #E3BD90
    [223, 211, 181], // stone #DFD3B5
    [192, 189, 188], // soft grey #C0BDBC
    [103, 86, 71]    // warm brown #675647
  ];
  const random = (min, max) => min + Math.random() * (max - min);

  function createParticle() {
    return {
      x: random(0, width),
      y: random(0, height),
      vx: random(-0.17, 0.17),
      vy: random(-0.17, 0.17),
      radius: random(0.75, 1.7),
      phase: random(0, Math.PI * 2),
      pulse: random(0.005, 0.014),
      alpha: random(0.18, 0.46),
      color: palette[Math.floor(Math.random() * palette.length)]
    };
  }

  function resize() {
    if (!canvas || !ctx) return;
    const oldWidth = width || window.innerWidth;
    const oldHeight = height || window.innerHeight;
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, finePointer ? 1.45 : 1.1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const area = width * height;
    const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
    const maxCount = finePointer ? (lowPower ? 54 : 78) : 38;
    const targetCount = reducedMotion ? 26 : Math.min(maxCount, Math.max(24, Math.floor(area / 18500)));
    if (particles.length < targetCount) {
      for (let i = particles.length; i < targetCount; i += 1) particles.push(createParticle());
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
    const scaleX = width / oldWidth;
    const scaleY = height / oldHeight;
    particles.forEach(particle => { particle.x *= scaleX; particle.y *= scaleY; });
  }

  function draw(now = 0, animate = true) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const time = now * 0.001;
    const linkDistance = finePointer ? 146 : 112;
    const linkDistanceSquared = linkDistance * linkDistance;

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      if (animate) {
        particle.phase += particle.pulse;
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = height + 10;
        if (particle.y > height + 10) particle.y = -10;

        if (pointer.active && finePointer) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 1 && distance < 170) {
            const force = (1 - distance / 170) * 0.006;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }
        particle.vx = Math.max(-0.24, Math.min(0.24, particle.vx * 0.997));
        particle.vy = Math.max(-0.24, Math.min(0.24, particle.vy * 0.997));
      }

      const glow = 0.78 + Math.sin(particle.phase + time) * 0.22;
      const [red, green, blue] = particle.color;
      const alpha = particle.alpha * glow;

      ctx.beginPath();
      ctx.fillStyle = `rgba(${red},${green},${blue},${alpha * 0.12})`;
      ctx.arc(particle.x, particle.y, particle.radius * 4.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j += 1) {
        const other = particles[j];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < linkDistanceSquared) {
          const opacity = (1 - Math.sqrt(distanceSquared) / linkDistance) * 0.105;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(108,110,54,${opacity})`;
          ctx.lineWidth = 0.65;
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    }

    if (pointer.active && finePointer) {
      const aura = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 180);
      aura.addColorStop(0, 'rgba(227,189,144,0.10)');
      aura.addColorStop(1, 'rgba(227,189,144,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(pointer.x - 180, pointer.y - 180, 360, 360);
    }
  }

  function animate(now) {
    animationFrame = 0;
    if (document.hidden) return;
    if (now - lastFrame >= frameInterval) {
      lastFrame = now;
      draw(now, !reducedMotion);
    }
    if (!reducedMotion) animationFrame = requestAnimationFrame(animate);
  }

  function start() {
    if (reducedMotion) { draw(0, false); return; }
    if (!animationFrame && !document.hidden) animationFrame = requestAnimationFrame(animate);
  }

  function stop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  resize();
  draw(0, false);
  start();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

  if (finePointer && !reducedMotion) {
    const cursorGlow = world.querySelector('.ambient-cursor-glow');
    window.addEventListener('pointermove', event => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (!pointerFrame) {
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0;
          cursorGlow.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
          cursorGlow.classList.add('is-active');
        });
      }
    }, { passive: true });
    window.addEventListener('pointerout', event => {
      if (!event.relatedTarget) {
        pointer.active = false;
        cursorGlow.classList.remove('is-active');
      }
    }, { passive: true });
  }

  // Scroll progress is a single transform-only update, throttled to one frame.
  const scrollMeter = world.querySelector('.ambient-scroll-meter');
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      scrollMeter.style.transform = `scaleX(${progress})`;
    });
  }, { passive: true });

  // Reveal cards only as they enter view; works again when the dashboard rerenders.
  const revealSelector = [
    '.lp-hero > *', '.lp-section > *', '.cap-card', '.step-card',
    '.page-heading', '.dashboard-hero', '.stat-card', '.panel', '.info-card',
    '.setup-item', '.version-block', '.upload-zone', '.explain', '.review-item'
  ].join(',');
  if (!reducedMotion && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('motion-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });

    const revealIn = scope => {
      if (!scope) return;
      if (scope.nodeType === 1 && scope.matches?.(revealSelector) && !scope.classList.contains('motion-observed')) {
        scope.classList.add('motion-reveal', 'motion-observed');
        revealObserver.observe(scope);
      }
      scope.querySelectorAll?.(revealSelector).forEach((element, index) => {
        if (element.classList.contains('motion-observed')) return;
        element.classList.add('motion-reveal', 'motion-observed');
        element.style.setProperty('--motion-delay', `${Math.min(index % 6, 5) * 65}ms`);
        revealObserver.observe(element);
      });
    };

    revealIn(document);
    const pageContent = document.getElementById('page-content');
    if (pageContent) {
      const contentObserver = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType === 1) revealIn(node);
        }));
      });
      contentObserver.observe(pageContent, { childList: true, subtree: true });
    }
  }

  // Gentle pointer tilt for a few prominent cards. Inputs and interactive controls are excluded.
  if (finePointer && !reducedMotion) {
    const tiltSelector = '.cap-card,.step-card,.stat-card,.dashboard-hero';
    let activeCard = null;
    let lastPointerEvent = null;
    let tiltFrame = 0;
    const resetTilt = card => {
      if (!card) return;
      card.style.removeProperty('--motion-rotate-x');
      card.style.removeProperty('--motion-rotate-y');
      card.classList.remove('motion-tilting');
    };

    document.addEventListener('pointermove', event => {
      const card = event.target.closest?.(tiltSelector);
      if (activeCard !== card) resetTilt(activeCard);
      activeCard = card;
      if (!card || event.target.closest('button,a,input,textarea,select')) return;
      lastPointerEvent = event;
      if (tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        if (!activeCard || !lastPointerEvent) return;
        const rect = activeCard.getBoundingClientRect();
        const x = (lastPointerEvent.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
        const y = (lastPointerEvent.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
        const strength = activeCard.classList.contains('dashboard-hero') ? 1.2 : 2.4;
        activeCard.style.setProperty('--motion-rotate-x', `${(x * strength).toFixed(2)}deg`);
        activeCard.style.setProperty('--motion-rotate-y', `${(-y * strength).toFixed(2)}deg`);
        activeCard.classList.add('motion-tilting');
      });
    }, { passive: true });

    document.addEventListener('pointerout', event => {
      if (activeCard && (!event.relatedTarget || !activeCard.contains(event.relatedTarget))) {
        resetTilt(activeCard);
        activeCard = null;
      }
    }, { passive: true });
  }
})();
