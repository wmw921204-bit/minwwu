// Shader textures (Paper Shaders) behind a block: [data-texture="water|grain|paper"].
// The layer spans the screen width, fades out downward, renders only near the screen,
// and stands still for reduced motion.
(function () {
  var P = window.PaperShaders;
  var els = document.querySelectorAll("[data-texture]");
  if (!P || !els.length) return;
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = P.getShaderColorFromString;
  var sizing = function (fit, scale) {
    return { u_fit: P.ShaderFitOptions[fit], u_scale: scale, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0 };
  };

  // each texture: shader, speed, and uniforms built from the element's colours (data-colors, comma separated)
  var KINDS = {
    // light through water: caustic highlights only, over the section's own background
    water: function (c) {
      return { shader: P.waterFragmentShader, speed: 0.35, image: true, uniforms: Object.assign({
        u_colorBack: C("#00000000"), u_colorHighlight: C(c[0] || "#9ff5ea"),
        u_highlights: 0.55, u_layering: 0.6, u_edges: 0, u_waves: 0.35, u_caustic: 0.15, u_size: 0.55
      }, sizing("cover", 1.4)) };
    },
    // soft colour fields with film grain
    grain: function (c) {
      return { shader: P.grainGradientFragmentShader, speed: 0.8, uniforms: Object.assign({
        u_colorBack: C(c[0]), u_colors: c.slice(1).map(C), u_colorsCount: c.length - 1,
        u_softness: 1, u_intensity: 0.45, u_noise: 0.3, u_shape: P.GrainGradientShapes.corners,
        u_noiseTexture: noise
      }, sizing("cover", 1)) };
    },
    // still paper: fibre and a little roughness in the section's colour
    paper: function (c) {
      return { shader: P.paperTextureFragmentShader, speed: 0, image: true, uniforms: Object.assign({
        u_isImage: false, u_colorBack: C(c[0]), u_colorPaper: C(c[1] || "#ffffff22"), u_colorShadow: C(c[2] || "#00000040"),
        u_blending: 1, u_distortion: 0, u_clip: false, u_angle: 0, u_seed: 455,
        u_roughness: 0.25, u_roughnessSize: 0.4, u_roughnessRows: 0.5, u_fiber: 0.35, u_fiberSize: 0.6,
        u_folds: 0, u_foldSizeX: 0, u_foldSizeY: 0.44, u_foldOffsetX: 0, u_foldOffsetY: 0,
        u_wrinkles: 0, u_wrinkleSize: 0, u_crumples: 0, u_crumpleCount: 6, u_drops: 0.05,
        u_noiseTexture: noise
      }, sizing("cover", 1)) };
    }
  };

  var css = document.createElement("style");
  css.textContent =
    "[data-texture]{position:relative;isolation:isolate}" +
    ".tx{position:absolute;z-index:-1;top:0;left:50%;width:100vw;height:min(100vh,100%);translate:-50% 0;pointer-events:none;" +
    "-webkit-mask:linear-gradient(#000 55%,transparent);mask:linear-gradient(#000 55%,transparent);opacity:0;transition:opacity 1.2s ease}" +
    ".tx.is-on{opacity:var(--tx-o,1)}";
  document.head.appendChild(css);

  // the shaders read these images, which must be loaded before a shader mounts
  var blank = new Image();
  blank.src = P.emptyPixel;
  var noise = P.getShaderNoiseTexture();
  var ready = Promise.all([blank, noise].map(function (img) {
    return img.complete ? 0 : new Promise(function (ok) { img.onload = img.onerror = ok; });
  }));

  function mount(el) {
    var kind = KINDS[el.dataset.texture];
    if (!kind) return;
    var spec = kind((el.dataset.colors || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean));
    var box = document.createElement("div");
    box.className = "tx";
    box.setAttribute("aria-hidden", "true");
    if (el.dataset.textureOpacity) box.style.setProperty("--tx-o", el.dataset.textureOpacity);
    if (el.dataset.textureBlend) box.style.mixBlendMode = el.dataset.textureBlend;
    el.prepend(box);
    if (spec.image) spec.uniforms.u_image = blank;
    var speed = still ? 0 : spec.speed;
    // a pixel ratio of 1 keeps a full-width layer light; textures don't need retina sharpness
    var m = new P.ShaderMount(box, spec.shader, spec.uniforms, { premultipliedAlpha: false }, speed, 0, 1, 1920 * 1080);
    requestAnimationFrame(function () { box.classList.add("is-on"); });
    // only animate while on screen
    new IntersectionObserver(function (es) { m.setSpeed(es[0].isIntersecting ? speed : 0); }).observe(box);
  }

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      ready.then(function () { mount(e.target); });
    });
  }, { rootMargin: "50% 0px" });
  els.forEach(function (el) { io.observe(el); });
})();
