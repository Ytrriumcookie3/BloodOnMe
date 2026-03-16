const HERO_TERMINAL_CONFIG = {
  gridDensity: [58, 34],
  mobileGridDensity: [34, 22],
  digitScale: 0.88,
  activitySpeed: 1.08,
  revealThreshold: 0.58,
  edgeSoftness: 0.055,
  scanlineIntensity: 0.16,
  noiseAmount: 0.2,
  glitchAmount: 0.12,
  tintStrength: 0.1,
  brightness: 1.02,
  mouseStrength: 0.82,
  mobileQuality: 0.62,
  dprCap: 1.8,
  pauseWhenHidden: true,
};

const vertexShaderSource = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;

varying vec2 vUv;

uniform sampler2D uVideoTexture;
uniform sampler2D uImageTexture;
uniform vec2 uResolution;
uniform vec2 uVideoResolution;
uniform vec2 uImageResolution;
uniform vec2 uMouse;
uniform vec2 uGridDensity;
uniform float uTime;
uniform float uDigitScale;
uniform float uActivitySpeed;
uniform float uRevealThreshold;
uniform float uEdgeSoftness;
uniform float uScanlineIntensity;
uniform float uNoiseAmount;
uniform float uGlitchAmount;
uniform float uTintStrength;
uniform float uBrightness;
uniform float uMouseStrength;
uniform float uMouseEnabled;
uniform float uMobileQuality;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

vec2 coverUv(vec2 uv, vec2 viewport, vec2 media) {
  float viewportRatio = viewport.x / max(viewport.y, 1.0);
  float mediaRatio = media.x / max(media.y, 1.0);

  vec2 scale = viewportRatio > mediaRatio
    ? vec2(1.0, mediaRatio / viewportRatio)
    : vec2(viewportRatio / mediaRatio, 1.0);

  return (uv - 0.5) * scale + 0.5;
}

float rectMask(vec2 uv, float sx, float sy) {
  vec2 d = abs(uv - 0.5);
  float edge = max(d.x / sx, d.y / sy);
  return 1.0 - smoothstep(0.82, 1.0, edge);
}

float digitalMask(vec2 cellId, vec2 localUv, float activity) {
  vec2 subGrid = max(vec2(3.0, 4.0), floor(vec2(4.0, 6.0) * uDigitScale));
  vec2 subCell = localUv * subGrid;
  vec2 subId = floor(subCell);
  vec2 subUv = fract(subCell);

  float scanSeed = floor(uTime * (0.65 + activity * 0.35));
  float bit = hash21(cellId * 13.37 + subId + scanSeed);
  float bitOn = step(0.3 - activity * 0.18, bit);
  float pixelShape = rectMask(subUv, 0.52, 0.47);

  return bitOn * pixelShape;
}

void main() {
  vec2 uv = vUv;
  vec2 videoUv = coverUv(uv, uResolution, uVideoResolution);
  vec2 imageUv = coverUv(uv, uResolution, uImageResolution);

  float displacement = (noise(vec2(uv.y * 28.0, uTime * 0.35)) - 0.5) * 0.006;
  displacement *= uGlitchAmount * mix(1.0, 0.45, 1.0 - uMobileQuality);
  videoUv.x += displacement;
  imageUv.x += displacement * 0.82;

  vec3 videoColor = texture2D(uVideoTexture, clamp(videoUv, 0.001, 0.999)).rgb;
  vec3 baseColor = texture2D(uImageTexture, clamp(imageUv, 0.001, 0.999)).rgb;

  vec2 grid = uGridDensity;
  vec2 cellUv = uv * grid;
  vec2 cellId = floor(cellUv);
  vec2 localUv = fract(cellUv);

  float pulse = sin(uTime * uActivitySpeed + cellId.x * 0.19 + cellId.y * 0.31) * 0.5 + 0.5;
  float field = noise(cellId * 0.21 + vec2(uTime * 0.12, -uTime * 0.08));
  float randomGate = hash21(cellId + floor(uTime * 0.55)) * 0.85;

  float mouseBoost = 0.0;
  if (uMouseEnabled > 0.5) {
    float distToMouse = distance((cellId + 0.5) / grid, uMouse);
    float mouseField = exp(-distToMouse * 7.0) * uMouseStrength * 1.45;
    float mouseRipple = (sin(distToMouse * 28.0 - uTime * 4.5) * 0.5 + 0.5) * 0.26 * uMouseStrength;
    mouseBoost = mouseField + mouseRipple;
  }

  float activity = pulse * 0.4 + field * 0.34 + randomGate * 0.29 + mouseBoost;

  float border = min(min(localUv.x, 1.0 - localUv.x), min(localUv.y, 1.0 - localUv.y));
  float cellWindow = smoothstep(0.01, 0.07, border);

  float activeMask = smoothstep(
    uRevealThreshold - uEdgeSoftness,
    uRevealThreshold + uEdgeSoftness,
    activity
  );

  float bits = digitalMask(cellId, localUv, activity);
  float organic = mix(0.88, 1.12, noise(cellId * 0.47 + localUv * 2.7 + uTime * 0.16));
  float revealMask = activeMask * mix(0.16, 1.12, bits) * cellWindow * organic;
  revealMask = smoothstep(0.18, 0.9, revealMask);
  revealMask = clamp(revealMask * 0.92, 0.0, 1.0);

  vec3 tint = mix(vec3(1.0), vec3(0.93, 0.98, 0.95), uTintStrength);
  float scanlines = 1.0 - sin(uv.y * uResolution.y * 1.05) * 0.02 * uScanlineIntensity;
  float cellGlow = bits * activeMask * (0.018 + 0.052 * activity) * (0.55 + 0.45 * uMobileQuality);
  float ghostGrid = cellWindow * (0.006 + 0.016 * pulse) * uTintStrength;

  vec3 color = mix(baseColor, videoColor * 1.02, revealMask);
  color += tint * (cellGlow + ghostGrid);
  color *= uBrightness;
  color *= scanlines;

  float grain = (noise(uv * uResolution * 0.028 + uTime * 0.4) - 0.5) * 0.02 * uNoiseAmount;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );
  return texture;
}

function waitForVideo(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve(video);
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve(video);
    };

    const onError = () => {
      cleanup();
      reject(new Error("Hero video failed to load"));
    };

    const cleanup = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function loadImageTextureSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Hero poster image failed to load"));
    image.src = src;
  });
}

class HeroTerminalRenderer {
  constructor(hero, video, container, options = {}) {
    this.hero = hero;
    this.video = video;
    this.container = container;
    this.config = { ...HERO_TERMINAL_CONFIG, ...options };

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");

    this.gl = this.canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });

    if (!this.gl) {
      throw new Error("WebGL is not available");
    }

    this.program = createProgram(this.gl, vertexShaderSource, fragmentShaderSource);
    this.buffer = this.gl.createBuffer();
    this.videoTexture = createTexture(this.gl);
    this.imageTexture = createTexture(this.gl);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);

    this.imageResolution = [1, 1];
    this.videoResolution = [
      this.video.videoWidth || 1920,
      this.video.videoHeight || 1080,
    ];

    this.mouseTarget = { x: 0.5, y: 0.5 };
    this.mouseCurrent = { x: 0.5, y: 0.5 };
    this.frameHandle = 0;
    this.ready = false;
    this.destroyed = false;
    this.lastVideoUpdateTime = -1;

    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.uniforms = {
      uResolution: this.gl.getUniformLocation(this.program, "uResolution"),
      uVideoResolution: this.gl.getUniformLocation(this.program, "uVideoResolution"),
      uImageResolution: this.gl.getUniformLocation(this.program, "uImageResolution"),
      uMouse: this.gl.getUniformLocation(this.program, "uMouse"),
      uGridDensity: this.gl.getUniformLocation(this.program, "uGridDensity"),
      uTime: this.gl.getUniformLocation(this.program, "uTime"),
      uDigitScale: this.gl.getUniformLocation(this.program, "uDigitScale"),
      uActivitySpeed: this.gl.getUniformLocation(this.program, "uActivitySpeed"),
      uRevealThreshold: this.gl.getUniformLocation(this.program, "uRevealThreshold"),
      uEdgeSoftness: this.gl.getUniformLocation(this.program, "uEdgeSoftness"),
      uScanlineIntensity: this.gl.getUniformLocation(this.program, "uScanlineIntensity"),
      uNoiseAmount: this.gl.getUniformLocation(this.program, "uNoiseAmount"),
      uGlitchAmount: this.gl.getUniformLocation(this.program, "uGlitchAmount"),
      uTintStrength: this.gl.getUniformLocation(this.program, "uTintStrength"),
      uBrightness: this.gl.getUniformLocation(this.program, "uBrightness"),
      uMouseStrength: this.gl.getUniformLocation(this.program, "uMouseStrength"),
      uMouseEnabled: this.gl.getUniformLocation(this.program, "uMouseEnabled"),
      uMobileQuality: this.gl.getUniformLocation(this.program, "uMobileQuality"),
    };
  }

  async init() {
    this.container.appendChild(this.canvas);

    this.gl.useProgram(this.program);
    this.initGeometry();
    this.initUniforms();
    this.bindEvents();

    const baseImageSource = this.video.poster;

    if (!baseImageSource) {
      throw new Error("Missing hero poster image");
    }

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.play().catch(() => {});

    const [image] = await Promise.all([
      loadImageTextureSource(baseImageSource),
      waitForVideo(this.video),
    ]);

    this.imageResolution = [image.naturalWidth || 1, image.naturalHeight || 1];

    this.videoResolution = [
      this.video.videoWidth || this.videoResolution[0],
      this.video.videoHeight || this.videoResolution[1],
    ];

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      image
    );

    this.updateResponsiveUniforms();
    this.handleResize();
    this.ready = true;
    this.hero.classList.add("is-enhanced");
    this.frameHandle = window.requestAnimationFrame(time => this.render(time));
  }

  initGeometry() {
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const positionLocation = this.gl.getAttribLocation(this.program, "aPosition");

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
  }

  initUniforms() {
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, "uVideoTexture"), 0);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, "uImageTexture"), 1);
    this.gl.uniform1f(this.uniforms.uDigitScale, this.config.digitScale);
    this.gl.uniform1f(this.uniforms.uActivitySpeed, this.config.activitySpeed);
    this.gl.uniform1f(this.uniforms.uRevealThreshold, this.config.revealThreshold);
    this.gl.uniform1f(this.uniforms.uEdgeSoftness, this.config.edgeSoftness);
    this.gl.uniform1f(this.uniforms.uScanlineIntensity, this.config.scanlineIntensity);
    this.gl.uniform1f(this.uniforms.uNoiseAmount, this.config.noiseAmount);
    this.gl.uniform1f(this.uniforms.uGlitchAmount, this.config.glitchAmount);
    this.gl.uniform1f(this.uniforms.uTintStrength, this.config.tintStrength);
    this.gl.uniform1f(this.uniforms.uBrightness, this.config.brightness);
    this.gl.uniform1f(this.uniforms.uMouseStrength, this.config.mouseStrength);
    this.gl.uniform2f(this.uniforms.uMouse, 0.5, 0.5);
  }

  bindEvents() {
    this.hero.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("resize", this.handleResize);

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(this.hero);
    }
  }

  handlePointerMove(event) {
    if (!this.isInteractive()) {
      return;
    }

    const rect = this.hero.getBoundingClientRect();
    this.mouseTarget.x = (event.clientX - rect.left) / rect.width;
    this.mouseTarget.y = 1 - (event.clientY - rect.top) / rect.height;
  }

  handleVisibilityChange() {
    if (!this.config.pauseWhenHidden || !this.ready) {
      return;
    }

    if (document.hidden) {
      window.cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      return;
    }

    if (!this.frameHandle) {
      this.frameHandle = window.requestAnimationFrame(time => this.render(time));
    }
  }

  handleResize() {
    if (this.destroyed) {
      return;
    }

    this.updateResponsiveUniforms();

    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.config.dprCap * (this.isMobileViewport ? this.config.mobileQuality + 0.2 : 1)
    );

    const width = Math.max(1, Math.floor(this.hero.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.hero.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.uniforms.uResolution, width, height);
  }

  updateResponsiveUniforms() {
    this.isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    this.hasFinePointer = window.matchMedia("(pointer: fine)").matches;

    const grid = this.isMobileViewport
      ? this.config.mobileGridDensity
      : this.config.gridDensity;

    this.gl.uniform2f(this.uniforms.uGridDensity, grid[0], grid[1]);
    this.gl.uniform1f(this.uniforms.uMouseEnabled, this.isInteractive() ? 1 : 0);
    this.gl.uniform1f(
      this.uniforms.uMobileQuality,
      this.isMobileViewport ? this.config.mobileQuality : 1
    );
  }

  isInteractive() {
    return !this.isMobileViewport && this.hasFinePointer;
  }

  updateVideoTexture() {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }

    if (this.video.currentTime === this.lastVideoUpdateTime) {
      return;
    }

    this.lastVideoUpdateTime = this.video.currentTime;
    this.videoResolution = [
      this.video.videoWidth || this.videoResolution[0],
      this.video.videoHeight || this.videoResolution[1],
    ];

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.video
    );
  }

  render(time) {
    if (this.destroyed) {
      return;
    }

    if (document.hidden && this.config.pauseWhenHidden) {
      this.frameHandle = 0;
      return;
    }

    this.mouseCurrent.x += (this.mouseTarget.x - this.mouseCurrent.x) * 0.08;
    this.mouseCurrent.y += (this.mouseTarget.y - this.mouseCurrent.y) * 0.08;

    this.updateVideoTexture();

    this.gl.useProgram(this.program);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageTexture);

    this.gl.uniform1f(this.uniforms.uTime, time * 0.001);
    this.gl.uniform2f(this.uniforms.uMouse, this.mouseCurrent.x, this.mouseCurrent.y);
    this.gl.uniform2f(
      this.uniforms.uVideoResolution,
      this.videoResolution[0],
      this.videoResolution[1]
    );
    this.gl.uniform2f(
      this.uniforms.uImageResolution,
      this.imageResolution[0],
      this.imageResolution[1]
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.frameHandle = window.requestAnimationFrame(nextTime => this.render(nextTime));
  }

  destroy() {
    this.destroyed = true;
    this.hero.classList.remove("is-enhanced");
    this.hero.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("resize", this.handleResize);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.frameHandle) {
      window.cancelAnimationFrame(this.frameHandle);
    }

    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }

    this.gl.deleteTexture(this.videoTexture);
    this.gl.deleteTexture(this.imageTexture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

function failGracefully(hero, container, error) {
  console.warn("Hero terminal fallback:", error);
  hero.classList.remove("is-enhanced");
  container.textContent = "";
}

function initHeroTerminal(hero, options = {}) {
  if (!hero) {
    return null;
  }

  const video = hero.querySelector(".hero-video");
  const container = hero.querySelector(".hero-terminal");

  if (!video || !container) {
    return null;
  }

  try {
    const renderer = new HeroTerminalRenderer(hero, video, container, options);
    renderer.init().catch(error => failGracefully(hero, container, error));
    return renderer;
  } catch (error) {
    failGracefully(hero, container, error);
    return null;
  }
}

window.initHeroTerminal = initHeroTerminal;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initHeroTerminal(document.querySelector(".hero")));
} else {
  initHeroTerminal(document.querySelector(".hero"));
}
