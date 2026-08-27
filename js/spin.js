// Image-sequence 360° viewer — the classic e-commerce "photo spin".
// Drag to scrub through N frames of a product, scroll to zoom, release for a
// flick of momentum, and it auto-spins gently after a moment of idle.
// Deliberately has NO Three.js dependency so spins work even offline.

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {HTMLElement} container stage to fill
 * @param {{ base: string, count: number, ext?: string }} spin
 *   base  — URL prefix, e.g. "/images/spins/demo/frame_"
 *   count — number of frames (zero-padded to its digit count)
 *   ext   — file extension, default "jpg"
 * Frames are expected at base + "01"..base + count + "." + ext
 */
export function createSpinViewer(container, spin) {
  const pad = String(spin.count).length;
  const ext = spin.ext || 'jpg';
  const frames = Array.from({ length: spin.count }, (_, i) =>
    `${spin.base}${String(i + 1).padStart(pad, '0')}.${ext}`
  );

  const img = document.createElement('img');
  img.className = 'spin-frame';
  img.alt = '360° view';
  img.draggable = false;
  container.appendChild(img);

  let pos = 0; // continuous frame position (float, wraps)
  let vel = 0; // drag momentum
  let scale = 1;
  let dragging = false;
  let lastX = 0;
  let idleMs = 0;
  let lastSrc = '';
  let rafId = 0;
  let lastTime = performance.now();

  img.style.touchAction = 'none';
  img.style.cursor = 'grab';

  function show() {
    const idx = ((Math.round(pos) % spin.count) + spin.count) % spin.count;
    const src = frames[idx];
    if (src !== lastSrc) {
      lastSrc = src;
      img.src = src;
    }
  }

  function applyZoom() {
    img.style.transform = `scale(${scale})`;
  }

  function onDown(e) {
    dragging = true;
    idleMs = 0;
    vel = 0;
    lastX = e.clientX;
    img.style.cursor = 'grabbing';
    try {
      img.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer events or unsupported capture */
    }
  }

  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    pos += dx * 0.22;
    vel = dx * 0.22;
    idleMs = 0;
    show();
  }

  function onUp(e) {
    dragging = false;
    img.style.cursor = 'grab';
    if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
  }

  function onWheel(e) {
    e.preventDefault();
    scale = clamp(scale * (1 - e.deltaY * 0.0012), 0.55, 2.6);
    idleMs = 0;
    applyZoom();
  }

  img.addEventListener('pointerdown', onDown);
  img.addEventListener('pointermove', onMove);
  img.addEventListener('pointerup', onUp);
  img.addEventListener('pointercancel', onUp);
  img.addEventListener('wheel', onWheel, { passive: false });

  function loop(now) {
    const dt = Math.min(now - lastTime, 100);
    lastTime = now;
    idleMs += dt;

    if (dragging) {
      vel = 0;
    } else if (Math.abs(vel) > 0.05) {
      // momentum after a flick
      pos += vel;
      vel *= 0.94;
      show();
    } else if (idleMs > 2200) {
      // gentle auto-spin when the user stops interacting
      pos += 0.18 * (dt / 16.7);
      show();
    }

    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // warm the cache for the frames closest to the start
  [1, spin.count - 1].forEach((i) => {
    const pre = new Image();
    pre.src = frames[i];
  });

  show();

  return {
    setColor() {
      // photo spins have fixed colours
    },
    dispose() {
      cancelAnimationFrame(rafId);
      img.removeEventListener('pointerdown', onDown);
      img.removeEventListener('pointermove', onMove);
      img.removeEventListener('pointerup', onUp);
      img.removeEventListener('pointercancel', onUp);
      img.removeEventListener('wheel', onWheel);
      if (img.parentNode) img.parentNode.removeChild(img);
    },
  };
}
