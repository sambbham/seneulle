// 360° garment viewer built on Three.js.
// The viewer assembles a stylised 3D garment out of primitives, then lets the
// user drag to rotate, scroll to zoom and switch fabric colours live.

import * as THREE from 'three';
import { shade } from './data.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

const STYLE_BUILDERS = {
  tee: buildTee,
  dress: buildDress,
  jacket: buildJacket,
  hoodie: buildHoodie,
  polo: (g, c) => buildPolo(g, c, false),
  shirt: (g, c) => buildPolo(g, c, true),
  pants: buildPants,
};

export function createGarmentViewer(container, product) {
  const width = container.clientWidth || 640;
  const height = container.clientHeight || 480;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
  const FOCUS = new THREE.Vector3(0, 1.35, 0);
  let zoom = 5.4;

  // --- lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffffff, 0x52525b, 1.15));

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3.5, 6, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 15;
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc7d2fe, 1.0);
  rim.position.set(-4, 2.5, -3.5);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xfff7ed, 0.5);
  fill.position.set(-2, 1.5, 4);
  scene.add(fill);

  // --- floor --------------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 64),
    new THREE.MeshStandardMaterial({ color: 0xe8e9ec, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- garment ------------------------------------------------------------
  const group = new THREE.Group();
  scene.add(group);
  const fabricMats = buildGarment(group, product);

  // --- interaction --------------------------------------------------------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let velX = 0;
  let velY = 0;
  let rotX = 0.24;
  let rotY = 0.55;
  let idleMs = 0;
  let rafId = 0;
  let lastTime = performance.now();

  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';

  function onPointerDown(e) {
    dragging = true;
    idleMs = 0;
    velX = velY = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    rotY += dx * 0.012;
    rotX = clamp(rotX + dy * 0.006, -0.35, 0.85);
    velX = dy * 0.006;
    velY = dx * 0.012;
    idleMs = 0;
  }

  function onPointerUp(e) {
    dragging = false;
    el.style.cursor = 'grab';
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  function onWheel(e) {
    e.preventDefault();
    zoom = clamp(zoom + e.deltaY * 0.004, 2.8, 7.5);
    idleMs = 0;
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  function frame(now) {
    const dt = Math.min(now - lastTime, 100);
    lastTime = now;
    idleMs += dt;

    if (dragging) {
      velX = velY = 0;
    } else if (velX !== 0 || velY !== 0) {
      // inertia after a flick
      rotX += velX;
      rotY += velY;
      velX *= 0.94;
      velY *= 0.94;
      if (Math.abs(velX) < 0.0004) velX = 0;
      if (Math.abs(velY) < 0.0004) velY = 0;
    } else if (idleMs > 2600) {
      // slow auto-rotate when the user has stopped interacting
      rotY += 0.006 * (dt / 16.7);
    }

    group.rotation.x = rotX;
    group.rotation.y = rotY;

    camera.position.set(0, 2.15, zoom);
    camera.lookAt(FOCUS);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  return {
    /** Re-colour the garment fabric (and its darker trim) live. */
    setColor(hex) {
      fabricMats.forEach((m) => {
        if (m.userData.part === 'fabric') m.color.set(hex);
        else if (m.userData.part === 'accent') m.color.set(shade(hex, -28));
      });
    },
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

// ---------------------------------------------------------------------------
// Garment construction — stylised clothes built from basic primitives.
// ---------------------------------------------------------------------------

function buildGarment(group, product) {
  const style = product.style || 'tee';
  const builder = STYLE_BUILDERS[style] || buildTee;
  return builder(group, product.color);
}

function makeMaterials(color) {
  const fabric = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.03 });
  fabric.userData.part = 'fabric';
  const accent = new THREE.MeshStandardMaterial({ color: shade(color, -30), roughness: 0.75 });
  accent.userData.part = 'accent';
  return [fabric, accent];
}

function adder(group) {
  return (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
}

function buildTee(group, color) {
  const [fabric, accent] = makeMaterials(color);
  const add = adder(group);
  add(new THREE.CapsuleGeometry(0.62, 1.05, 12, 32), fabric, 0, 1.5, 0);
  add(new THREE.CylinderGeometry(0.28, 0.25, 0.62, 24), fabric, -0.86, 1.9, 0, 0, 0, 0.5);
  add(new THREE.CylinderGeometry(0.28, 0.25, 0.62, 24), fabric, 0.86, 1.9, 0, 0, 0, -0.5);
  add(new THREE.TorusGeometry(0.24, 0.06, 12, 32), accent, 0, 2.05, 0, Math.PI / 2);
  return [fabric, accent];
}

function buildDress(group, color) {
  const [fabric, accent] = makeMaterials(color);
  const add = adder(group);
  add(new THREE.CapsuleGeometry(0.5, 0.85, 12, 32), fabric, 0, 1.55, 0);
  add(new THREE.CylinderGeometry(0.52, 0.98, 0.95, 28, 1, true), fabric, 0, 1.2, 0);
  add(new THREE.TorusGeometry(0.2, 0.055, 12, 32), accent, 0, 2.08, 0, Math.PI / 2);
  add(new THREE.TorusGeometry(0.5, 0.035, 10, 28), accent, 0, 1.52, 0, Math.PI / 2);
  return [fabric, accent];
}

function buildJacket(group, color) {
  const [fabric, accent] = makeMaterials(color);
  const trim = new THREE.MeshStandardMaterial({ color: 0x2f2f38, roughness: 0.55 });
  const add = adder(group);
  add(new THREE.CapsuleGeometry(0.68, 1.0, 12, 32), fabric, 0, 1.5, 0);
  add(new THREE.CylinderGeometry(0.32, 0.29, 0.7, 24), fabric, -0.92, 1.9, 0, 0, 0, 0.5);
  add(new THREE.CylinderGeometry(0.32, 0.29, 0.7, 24), fabric, 0.92, 1.9, 0, 0, 0, -0.5);
  add(new THREE.TorusGeometry(0.26, 0.06, 12, 32), accent, 0, 2.05, 0, Math.PI / 2);
  // zipper + pull
  add(new THREE.BoxGeometry(0.05, 1.1, 0.035), trim, 0, 1.5, 0.71);
  add(new THREE.BoxGeometry(0.15, 0.1, 0.06), trim, 0, 0.98, 0.72);
  return [fabric, accent];
}

function buildHoodie(group, color) {
  const [fabric, accent] = makeMaterials(color);
  const light = new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.85 });
  const add = adder(group);
  add(new THREE.CapsuleGeometry(0.64, 1.0, 12, 32), fabric, 0, 1.5, 0);
  add(new THREE.CylinderGeometry(0.3, 0.27, 0.68, 24), fabric, -0.88, 1.9, 0, 0, 0, 0.5);
  add(new THREE.CylinderGeometry(0.3, 0.27, 0.68, 24), fabric, 0.88, 1.9, 0, 0, 0, -0.5);
  add(new THREE.TorusGeometry(0.24, 0.06, 12, 32), accent, 0, 2.05, 0, Math.PI / 2);
  // hood at the back of the neck
  add(new THREE.SphereGeometry(0.36, 24, 20), accent, 0, 2.36, -0.3, 0.2, 0, 0);
  // drawstrings
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), light, -0.08, 1.55, 0.66, 0, 0, 0.35);
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), light, 0.08, 1.55, 0.66, 0, 0, -0.35);
  return [fabric, accent];
}

function buildPolo(group, color, isShirt) {
  const [fabric, accent] = makeMaterials(color);
  const trim = new THREE.MeshStandardMaterial({ color: 0x2f2f38, roughness: 0.55 });
  const add = adder(group);
  add(new THREE.CapsuleGeometry(0.58, 1.0, 12, 32), fabric, 0, 1.5, 0);
  const sleeveLen = isShirt ? 0.62 : 0.42;
  add(new THREE.CylinderGeometry(0.27, 0.24, sleeveLen, 24), fabric, -0.8, 1.92, 0, 0, 0, 0.5);
  add(new THREE.CylinderGeometry(0.27, 0.24, sleeveLen, 24), fabric, 0.8, 1.92, 0, 0, 0, -0.5);
  add(new THREE.TorusGeometry(0.21, 0.055, 12, 32), accent, 0, 2.05, 0, Math.PI / 2);
  // placket + buttons + collar
  add(new THREE.BoxGeometry(0.09, 0.75, 0.03), fabric, 0, 1.55, 0.6);
  for (let i = 0; i < 4; i++) {
    add(new THREE.SphereGeometry(0.028, 10, 8), trim, 0, 1.78 - i * 0.13, 0.62);
  }
  add(new THREE.BoxGeometry(0.17, 0.1, 0.07), accent, -0.17, 1.98, 0.22, 0, 0, -0.6);
  add(new THREE.BoxGeometry(0.17, 0.1, 0.07), accent, 0.17, 1.98, 0.22, 0, 0, 0.6);
  return [fabric, accent];
}

function buildPants(group, color) {
  const [fabric, accent] = makeMaterials(color);
  const add = adder(group);
  add(new THREE.CylinderGeometry(0.44, 0.46, 0.3, 24), fabric, 0, 1.42, 0);
  add(new THREE.CylinderGeometry(0.24, 0.21, 1.0, 20), fabric, -0.19, 0.78, 0, 0, 0, 0.06);
  add(new THREE.CylinderGeometry(0.24, 0.21, 1.0, 20), fabric, 0.19, 0.78, 0, 0, 0, -0.06);
  add(new THREE.TorusGeometry(0.44, 0.035, 10, 28), accent, 0, 1.56, 0, Math.PI / 2);
  return [fabric, accent];
}
