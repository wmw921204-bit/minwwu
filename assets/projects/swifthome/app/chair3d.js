// A real-time 3D model of the Single Sofa Chair for the AR screen: a tufted velvet tub chair
// built from code (shell, cushion, plinth, splayed legs with brass caps), lit softly with a
// contact shadow. Exposes window.Chair3D.create(host) -> { setColor, setView, setAuto, drag, release, spin, reset, resume, el }.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const COLORS = { green: 0x8c973a, cream: 0xeee4d4, taupe: 0xa88d78 };

function velvet(hex) {
  const c = new THREE.Color(hex);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.82, metalness: 0,
    sheen: 1, sheenRoughness: 0.45, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.45),
  });
}

function buildChair(mat) {
  const chair = new THREE.Group();
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.45, metalness: 0.1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a46a, roughness: 0.3, metalness: 0.9 });

  // shell: a rounded cross-section swept around the seat (smooth, indexed), low at the arms,
  // tall at the back, pinched closed at the arm ends so they read as rolled arms
  const R = 0.47, r = 0.35, open = 0.95, base = 0.2; // open: half-angle of the front gap
  const rc = (R + r) / 2, w = (R - r) / 2;
  const height = (phi) => { const back = (1 - Math.cos(phi)) / 2; return 0.24 + 0.3 * Math.pow(back, 1.2); };
  const NP = 120, NU = 40, cap = 0.32, P = 0.45;
  const vs = [], idx = [];
  for (let i = 0; i <= NP; i++) {
    const t = i / NP, phi = open + (2 * Math.PI - 2 * open) * t;
    const dEnd = Math.min(phi - open, 2 * Math.PI - open - phi) / cap;
    const sc = dEnd >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - dEnd) * (1 - dEnd)));
    const h = height(phi), hh = h / 2;
    for (let j = 0; j < NU; j++) {
      const u = (j / NU) * 2 * Math.PI, cu = Math.cos(u), su = Math.sin(u);
      const rad = rc + w * sc * Math.sign(cu) * Math.pow(Math.abs(cu), P);
      const y = base + (hh + hh * Math.sign(su) * Math.pow(Math.abs(su), P)) * (0.15 + 0.85 * sc);
      const belly = 1 + 0.03 * Math.sin(Math.PI * Math.min(1, (y - base) / h)) * (cu > 0 ? 1 : 0);
      vs.push(Math.sin(phi) * rad * belly, y, Math.cos(phi) * rad * belly);
    }
  }
  for (let i = 0; i < NP; i++) for (let j = 0; j < NU; j++) {
    const a1 = i * NU + j, b1 = i * NU + (j + 1) % NU, c1 = (i + 1) * NU + j, d1 = (i + 1) * NU + (j + 1) % NU;
    idx.push(a1, c1, b1, b1, c1, d1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3)); g.setIndex(idx); g.computeVertexNormals();
  const shell = new THREE.Mesh(g, mat); shell.castShadow = true; shell.receiveShadow = true;
  chair.add(shell);

  // tufting buttons pressed into the inside of the back
  const btnGeo = new THREE.SphereGeometry(0.009, 12, 8);
  const btnMat = mat.clone(); btnMat.color = mat.color.clone().multiplyScalar(0.5);
  for (let row = 0; row < 2; row++) {
    for (let j = -4; j <= 4; j++) {
      const phi = Math.PI + (j + (row ? 0.5 : 0)) * 0.26;
      if (Math.abs(Math.PI - phi) > 1.1) continue;
      const y = base + 0.14 + (height(phi) - 0.14) * (0.45 + row * 0.25);
      const b = new THREE.Mesh(btnGeo, btnMat); b.position.set(Math.sin(phi) * (r - 0.006), y, Math.cos(phi) * (r - 0.006)); chair.add(b);
    }
  }

  // seat cushion: a puffy disc
  const prof = [[0, 0.19], [0.28, 0.19], [0.36, 0.2], [0.392, 0.225], [0.398, 0.26], [0.385, 0.29], [0.34, 0.31], [0.2, 0.322], [0, 0.326]].map(([x, y]) => new THREE.Vector2(x, y));
  const cushion = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), mat);
  cushion.castShadow = true; cushion.receiveShadow = true; chair.add(cushion);

  // dark plinth under the seat
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.38, 0.04, 72), darkWood);
  plinth.position.y = 0.175; plinth.castShadow = true; chair.add(plinth);

  // four splayed legs with brass caps
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
    const leg = new THREE.Group();
    const L = 0.17;
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.011, L, 16), darkWood); wood.position.y = -L / 2; wood.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0105, 0.035, 16), brass); cap.position.y = -L + 0.012;
    leg.add(wood, cap);
    leg.position.set(Math.sin(a) * 0.33, 0.16, Math.cos(a) * 0.33);
    leg.rotation.set(Math.cos(a) * 0.14, 0, -Math.sin(a) * 0.14);
    chair.add(leg);
  }
  chair.position.y = -0.01;
  return chair;
}

function contactShadow() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), grd = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "rgba(0,0,0,.55)"); grd.addColorStop(.55, "rgba(0,0,0,.18)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.001; return m;
}

function create(host, { color = "green", auto = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const el = renderer.domElement; el.style.cssText = "width:100%;height:100%;display:block";
  host.append(el);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(0, 0.95, 2.55); cam.lookAt(0, 0.33, 0);
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6f6152, 1.05));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1); key.position.set(0.7, 3.4, 1.4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 8 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.8); rim.position.set(-2, 1.6, -1.8); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor, contactShadow());

  let mat = velvet(COLORS[color] || COLORS.green);
  let chair = buildChair(mat); scene.add(chair);

  let yaw = 0, vel = 0, target = null, autoSpin = auto, dragging = false;
  const resize = () => { const w = host.clientWidth || 300, h = host.clientHeight || 300; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  resize(); new ResizeObserver(resize).observe(host);
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (target !== null) { const d = target - yaw; yaw += d * Math.min(1, dt * 7); if (Math.abs(d) < 0.002) { yaw = target; target = null; } }
    else if (!dragging) { yaw += vel * dt; vel *= Math.pow(0.08, dt); if (autoSpin && Math.abs(vel) < 0.3) yaw += 0.35 * dt; }
    chair.rotation.y = yaw;
    renderer.render(scene, cam);
    if (el.isConnected) requestAnimationFrame(tick); else running = false;
  };
  let running = true; requestAnimationFrame(tick);
  const api = {
    el,
    setColor(name) { const m = velvet(COLORS[name] || COLORS.green); chair.traverse((o) => { if (o.material === mat) o.material = m; else if (o.material && o.material.sheen && o.material !== m) { o.material = m.clone(); o.material.color = m.color.clone().multiplyScalar(0.55); } }); mat = m; },
    setAuto(on) { autoSpin = on; },
    // studio: an eye-level product shot; home: looking down at the floor like the room photo
    setView(mode) { if (mode === "studio") { cam.position.set(0, 0.85, 2.6); cam.lookAt(0, 0.36, 0); } else { cam.position.set(0, 1.7, 2.6); cam.lookAt(0, 0.28, 0); } },
    drag(dx) { dragging = true; target = null; yaw += dx * 0.012; vel = dx * 0.012 * 60; },
    release() { dragging = false; },
    spin(rad) { target = (target ?? yaw) + rad; },
    reset() { target = Math.round(yaw / (2 * Math.PI)) * 2 * Math.PI; vel = 0; },
    resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); } },
  };
  return api;
}

window.Chair3D = { create };
window.dispatchEvent(new Event("chair3d-ready"));
