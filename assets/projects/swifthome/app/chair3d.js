// A real-time 3D model of the Single Sofa Chair for the AR screen: a tufted velvet barrel chair
// built from code, lit softly with a contact shadow. Modelled on the product photos: barrel back with diamond button tufting, piped cushion
// on a deep base band, dark ring and tapered legs with brass tips. Exposes window.Chair3D.create(host) -> { setColor, setView, setAuto, drag, release, spin, reset, resume, el }.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const COLORS = { green: 0x98a23c, cream: 0xeee4d4, taupe: 0xa88d78 };

function velvet(hex, extra = {}) {
  const c = new THREE.Color(hex);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.86, metalness: 0,
    sheen: 1, sheenRoughness: 0.5, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.35), ...extra,
  });
}

// diamond button tufting, drawn once: a puffy pillow per diamond, creases along the diagonals,
// a button at every crossing. Used as both a shading map and a bump map on the inner back.
function tuftTextures() {
  const W = 1024, H = 512, cols = 14, rows = 3.6, v0 = 0.25, v1 = 0.64;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const b = document.createElement("canvas"); b.width = W; b.height = H;
  const cx = c.getContext("2d"), bx = b.getContext("2d");
  const ci = cx.createImageData(W, H), bi = bx.createImageData(W, H);
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = y / H, k = (y * W + x) * 4;
    let shade = 1, hgt = 0.5;
    if (v > v0 && v < v1) {
      const p = (x / W) * cols, q = ((v - v0) / (v1 - v0)) * rows;
      const d1 = Math.abs((p + q) - Math.round(p + q)), d2 = Math.abs((p - q) - Math.round(p - q));
      const m = Math.min(d1, d2), bd = Math.hypot(d1, d2), btn = 1 - smooth(0.045, 0.085, bd);
      const edge = smooth(0, 0.03, v - v0) * smooth(0, 0.03, v1 - v);
      const puff = Math.sqrt(Math.min(1, m * 2));
      hgt = 0.5 + edge * (puff * 0.6 - 0.3 - btn * 0.15);
      shade = 1 - edge * (0.13 * (1 - smooth(0, 0.25, m)) + 0.1 * (1 - smooth(0, 0.015, m)) + btn * 0.45);
    }
    const s8 = Math.round(shade * 255), h8 = Math.round(hgt * 255);
    ci.data.set([s8, s8, s8, 255], k); bi.data.set([h8, h8, h8, 255], k);
  }
  cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b); bump.anisotropy = 8;
  return { map, bump };
}

// a smooth rounded band (lathe profile) used for the seat base and the cushion
const lathe = (pts, seg = 96) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const ring = (rad, y, tube, mat) => { const m = new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, 160), mat); m.rotation.x = Math.PI / 2; m.position.y = y; return m; };

function buildChair(mats) {
  const chair = new THREE.Group(), body = new THREE.Group();
  body.scale.x = 1.24; body.position.y = 0.07; // the seat is an oval, wider than deep
  chair.add(body);
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1b1816, roughness: 0.5, metalness: 0.05 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a76b, roughness: 0.28, metalness: 0.95 });
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };

  // barrel back: a rounded section swept around the seat, tall at the back and sloping down to
  // the front corners, where each arm rolls over and closes
  const R = 0.47, r = 0.385, open = 0.78, base = 0.3;
  const rc = (R + r) / 2, w = (R - r) / 2;
  const height = (phi) => { const back = (1 - Math.cos(phi)) / 2; return 0.34 + 0.32 * Math.pow(back, 0.6); };
  const NP = 160, NU = 48, cap = 0.2, P = 0.5;
  const vs = [], uv = [], idx = [];
  for (let i = 0; i <= NP; i++) {
    const t = i / NP, phi = open + (2 * Math.PI - 2 * open) * t;
    const dEnd = Math.min(phi - open, 2 * Math.PI - open - phi) / cap;
    const sc = dEnd >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - dEnd) * (1 - dEnd)));
    const h = height(phi), hh = h / 2;
    for (let j = 0; j <= NU; j++) {
      const u = (j / NU) * 2 * Math.PI, cu = Math.cos(u), su = Math.sin(u);
      const rad = rc + w * Math.max(0.35, sc) * Math.sign(cu) * Math.pow(Math.abs(cu), P);
      const y = base + (hh + hh * Math.sign(su) * Math.pow(Math.abs(su), P)) * (0.2 + 0.8 * sc);
      vs.push(Math.sin(phi) * rad, y, Math.cos(phi) * rad);
      // on the inner face, v follows the real height so the tufts keep their shape
      const inner = j >= NU / 4 && j <= (3 * NU) / 4;
      uv.push(t, inner ? 0.25 + 0.5 * (1 - (y - base) / (h * (0.2 + 0.8 * sc))) : 1 - j / NU);
    }
  }
  for (let i = 0; i < NP; i++) for (let j = 0; j < NU; j++) {
    const a1 = i * (NU + 1) + j, b1 = a1 + 1, c1 = a1 + NU + 1, d1 = c1 + 1;
    idx.push(a1, c1, b1, b1, c1, d1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vs, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  add(new THREE.Mesh(g, mats.tufted));

  // deep base band under the cushion, piped along its top
  add(new THREE.Mesh(lathe([[0, 0.2], [0.45, 0.2], [0.47, 0.212], [0.478, 0.25], [0.48, 0.38], [0.476, 0.42], [0.464, 0.443], [0.43, 0.458], [0.3, 0.468], [0, 0.472]]), mats.plain));
  body.add(ring(0.465, 0.443, 0.0055, mats.welt), ring(0.462, 0.205, 0.005, mats.welt));

  // dark ring underneath
  const plinth = new THREE.Mesh(lathe([[0, 0.168], [0.45, 0.168], [0.462, 0.178], [0.462, 0.196], [0.45, 0.204], [0, 0.204]]), darkWood);
  plinth.castShadow = true; body.add(plinth);

  // four tapered, splayed legs with brass tips
  for (const a of [0.62, Math.PI - 0.62, Math.PI + 0.62, -0.62]) {
    const leg = new THREE.Group(), L = 0.27;
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, L, 20), darkWood); wood.position.y = -L / 2; wood.castShadow = true;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0108, 0.04, 20), brass); tip.position.y = -L + 0.016;
    leg.add(wood, tip);
    leg.position.set(Math.sin(a) * 0.4 * 1.24, 0.26, Math.cos(a) * 0.36);
    leg.rotation.set(Math.cos(a) * 0.16, 0, -Math.sin(a) * 0.16);
    chair.add(leg);
  }
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
  cam.position.set(0, 0.95, 2.75); cam.lookAt(0, 0.4, 0);
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x6f6152, 1.05));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1); key.position.set(0.7, 3.4, 1.4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 8 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.8); rim.position.set(-2, 1.6, -1.8); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor, contactShadow());

  const tex = tuftTextures();
  const mats = { tufted: velvet(COLORS.green, { map: tex.map, bumpMap: tex.bump, bumpScale: 1.4 }), plain: velvet(COLORS.green), welt: velvet(COLORS.green, { roughness: 0.7 }) };
  const paint = (name) => { const c = new THREE.Color(COLORS[name] || COLORS.green);
    for (const [k, m] of Object.entries(mats)) { const cc = k === "welt" ? c.clone().multiplyScalar(0.86) : c; m.color.copy(cc); m.sheenColor.copy(cc.clone().lerp(new THREE.Color(0xffffff), 0.35)); } };
  paint(color);
  const chair = buildChair(mats); scene.add(chair);

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
    setColor(name) { paint(name); },
    setAuto(on) { autoSpin = on; },
    // studio: an eye-level product shot; home: looking down at the floor like the room photo
    setView(mode) { if (mode === "studio") { cam.position.set(0, 1.0, 3.1); cam.lookAt(0, 0.5, 0); } else { cam.position.set(0, 1.8, 3.0); cam.lookAt(0, 0.36, 0); } },
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
