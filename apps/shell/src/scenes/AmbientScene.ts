import {
  Color3,
  Color4,
  DynamicTexture,
  Effect,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  MeshBuilder,
  ParticleSystem,
  PointerEventTypes,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  Vector3,
  VideoTexture,
  WebGPUEngine,
} from "@babylonjs/core";
import { BaseScene } from "./BaseScene";
import { useShellStore } from "../store/shell";
import { cameraManager } from "../video/camera";

/**
 * AmbientScene — Screensaver / idle display.
 *
 * Visuals:
 *   - Full-screen GLSL aurora shader (animated FBM noise layers)
 *   - Nebula star-field + wisp particles
 *   - Slow-drifting glowing ring
 *   - Large centered clock + date
 *   - Live system stats row (CPU / RAM)
 *   - Click or voice → home
 */
export class AmbientScene extends BaseScene {
  private clockTex!: DynamicTexture;
  private statsTex!: DynamicTexture;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private bgMat!: ShaderMaterial;
  private camMat: StandardMaterial | null = null;
  private startTime = Date.now();
  private _onPointer: (() => void) | null = null;

  constructor(engine: Engine | WebGPUEngine) {
    super(engine);
  }

  async build() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.0, 0.0, 0.02, 1);

    // Fixed camera — no user control on screensaver.
    const camera = new FreeCamera("ambient-cam", new Vector3(0, 0, -12), scene);
    camera.setTarget(Vector3.Zero());
    camera.fov = 1.05;

    // Very dim fill light.
    const ambient = new HemisphericLight(
      "ambient-light",
      new Vector3(0, 1, 0),
      scene,
    );
    ambient.intensity = 0.08;
    ambient.diffuse = new Color3(0.3, 0.4, 0.9);

    // Subtle glow for ring and clock emissive.
    const glow = new GlowLayer("ambient-glow", scene, {
      mainTextureFixedSize: 512,
    });
    glow.intensity = 0.9;

    this.buildBackground(scene);
    this.buildCameraLayer(scene);
    this.buildNebula(scene);
    this.buildRing(scene);
    this.buildClock(scene);
    this.buildStatsPanel(scene);

    // Drive camera alpha from store — ghost (0.18) vs mirror (0.88) mode.
    scene.registerBeforeRender(() => {
      if (!this.camMat) return;
      const target =
        useShellStore.getState().cameraMode === "mirror" ? 0.88 : 0.18;
      if (Math.abs(this.camMat.alpha - target) > 0.01) {
        this.camMat.alpha += (target - this.camMat.alpha) * 0.08; // smooth lerp
      }
    });
  }

  // ── Animated aurora GLSL background ───────────────────────────────────────

  private buildBackground(scene: Scene) {
    if (!Effect.ShadersStore["limenAuroraVertexShader"]) {
      Effect.ShadersStore["limenAuroraVertexShader"] = `
        precision highp float;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUV;
        uniform mat4 worldViewProjection;
        void main() {
          vUV = uv;
          gl_Position = worldViewProjection * vec4(position, 1.0);
        }
      `;
    }

    if (!Effect.ShadersStore["limenAuroraFragmentShader"]) {
      Effect.ShadersStore["limenAuroraFragmentShader"] = `
        precision highp float;
        varying vec2 vUV;
        uniform float time;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1,0)), f.x),
            mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
            f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < 6; i++) {
            v += a * noise(p); p = rot * p * 2.0 + vec2(100.0); a *= 0.5;
          }
          return v;
        }
        void main() {
          vec2 uv = vUV;
          float t = time * 0.06;
          float q = fbm(uv + vec2(t * 0.3, t * 0.4));
          float r = fbm(uv + vec2(q + t * 0.5, q - t * 0.3) + 1.7);
          float f = fbm(uv + vec2(r, q) + 4.1 + t * 0.2);

          vec3 base = vec3(0.02, 0.01, 0.06);
          vec3 mid  = vec3(0.03, 0.08, 0.25);
          vec3 high = vec3(0.00, 0.20, 0.30);
          vec3 color = mix(base, mid,  clamp(f * 2.0, 0.0, 1.0));
          color      = mix(color, high, clamp(r * f, 0.0, 1.0));

          float shimmer = sin(uv.y * 10.0 + t * 3.0 + q * 6.0) * 0.5 + 0.5;
          shimmer = pow(shimmer, 2.5) * f;
          color += vec3(0.00, 0.35, 0.45) * shimmer * 0.6;
          color += vec3(0.15, 0.00, 0.40) * (1.0 - shimmer) * r * 0.3;

          vec2 vig = uv - 0.5;
          color *= clamp(1.0 - dot(vig, vig) * 1.8, 0.0, 1.0);

          gl_FragColor = vec4(color, 1.0);
        }
      `;
    }

    // Plane sized to fill the view: fov=1.05, dist=11 → half_h ≈ 6.2
    const bg = MeshBuilder.CreatePlane(
      "aurora-bg",
      { width: 30, height: 17 },
      scene,
    );
    bg.position.z = 11;

    this.bgMat = new ShaderMaterial("aurora-mat", scene, "limenAurora", {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time"],
    });
    bg.material = this.bgMat;

    scene.registerBeforeRender(() => {
      this.bgMat.setFloat("time", (Date.now() - this.startTime) / 1000);
    });
  }

  // ── Ghost camera mirror ───────────────────────────────────────────────────
  //
  // When the webcam is available, show a very dim mirror of the user's face
  // behind the aurora — a subtle "you are part of the screensaver" effect.
  // The VideoTexture is created from the shared off-screen <video> element in
  // cameraManager; if the camera hasn't started yet it renders as black (invisible).

  private buildCameraLayer(scene: Scene) {
    // Fill the screen at z=10.8 (just in front of the aurora bg at z=11).
    // camera fov=1.05, pos z=-12 → at z=10.8 distance=22.8
    // half_h = tan(0.525) * 22.8 ≈ 13.2; half_w ≈ 23.5  (16:9)
    const plane = MeshBuilder.CreatePlane(
      "cam-bg",
      { width: 48, height: 27 },
      scene,
    );
    plane.position.z = 10.8;
    plane.scaling.x = -1; // horizontal mirror (selfie view)

    const vidTex = new VideoTexture(
      "cam-tex",
      cameraManager.video,
      scene,
      /* generateMipMaps     */ false,
      /* invertY             */ false,
      /* samplingMode        */ 3, // Texture.TRILINEAR_SAMPLINGMODE
      /* settings            */ {
        autoUpdateTexture: true,
        independentVideoSource: true,
      },
    );

    const mat = new StandardMaterial("cam-mat", scene);
    mat.diffuseTexture = vidTex;
    mat.emissiveTexture = vidTex;
    mat.disableLighting = true;
    mat.alpha = 0.18; // start ghost; lerped to 0.88 in mirror mode
    plane.material = mat;
    this.camMat = mat;
  }

  // ── Nebula particles ──────────────────────────────────────────────────────

  private buildNebula(scene: Scene) {
    const flare = this.makeFlare(scene);

    const stars = new ParticleSystem("stars", 1200, scene);
    stars.particleTexture = flare;
    stars.color1 = new Color4(0.8, 0.9, 1.0, 0.6);
    stars.color2 = new Color4(0.5, 0.7, 1.0, 0.3);
    stars.colorDead = new Color4(0, 0, 0, 0);
    stars.minSize = 0.02;
    stars.maxSize = 0.12;
    stars.minLifeTime = 10;
    stars.maxLifeTime = 22;
    stars.emitRate = 80;
    stars.gravity = Vector3.Zero();
    stars.direction1 = new Vector3(-0.02, 0.01, 0);
    stars.direction2 = new Vector3(0.02, -0.01, 0);
    stars.minEmitBox = new Vector3(-13, -7, 0);
    stars.maxEmitBox = new Vector3(13, 7, 4);
    stars.blendMode = ParticleSystem.BLENDMODE_ADD;
    stars.start();

    const wisps = new ParticleSystem("wisps", 70, scene);
    wisps.particleTexture = flare;
    wisps.color1 = new Color4(0.1, 0.3, 0.8, 0.12);
    wisps.color2 = new Color4(0.5, 0.1, 0.7, 0.06);
    wisps.colorDead = new Color4(0, 0, 0, 0);
    wisps.minSize = 2.5;
    wisps.maxSize = 5.0;
    wisps.minLifeTime = 14;
    wisps.maxLifeTime = 28;
    wisps.emitRate = 4;
    wisps.gravity = new Vector3(0, 0.005, 0);
    wisps.direction1 = new Vector3(-0.1, 0.05, 0);
    wisps.direction2 = new Vector3(0.1, 0.1, 0);
    wisps.minEmitBox = new Vector3(-12, -6, 2);
    wisps.maxEmitBox = new Vector3(12, 6, 6);
    wisps.blendMode = ParticleSystem.BLENDMODE_ADD;
    wisps.start();
  }

  private makeFlare(scene: Scene): DynamicTexture {
    const tex = new DynamicTexture(
      "flare",
      { width: 64, height: 64 },
      scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    return tex;
  }

  // ── Slow-drifting glowing ring ────────────────────────────────────────────

  private buildRing(scene: Scene) {
    const ring = MeshBuilder.CreateTorus(
      "ambient-ring",
      { diameter: 4.4, thickness: 0.025, tessellation: 80 },
      scene,
    );
    const mat = new StandardMaterial("ring-mat", scene);
    mat.emissiveColor = new Color3(0.2, 0.6, 1.0);
    mat.disableLighting = true;
    ring.material = mat;

    let t = 0;
    scene.registerBeforeRender(() => {
      t += 0.0015;
      ring.rotation.z = t;
      ring.rotation.x = Math.sin(t * 0.4) * 0.12;
    });
  }

  // ── Large clock panel ─────────────────────────────────────────────────────

  private buildClock(scene: Scene) {
    const W = 1024,
      H = 512;
    const plane = MeshBuilder.CreatePlane(
      "clock-plane",
      { width: 8.5, height: 4.25 },
      scene,
    );
    plane.position.z = 0.5;

    this.clockTex = new DynamicTexture(
      "clock-tex",
      { width: W, height: H },
      scene,
      false,
    );
    const mat = new StandardMaterial("clock-mat", scene);
    mat.diffuseTexture = this.clockTex;
    mat.emissiveTexture = this.clockTex;
    mat.disableLighting = true;
    mat.transparencyMode = 2;
    this.clockTex.hasAlpha = true;
    plane.material = mat;

    this.drawClock(W, H);
    this.clockInterval = setInterval(() => this.drawClock(W, H), 1000);
  }

  private drawClock(W: number, H: number) {
    const ctx = this.clockTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);

    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const weekday = now.toLocaleDateString([], { weekday: "long" });
    const dateStr = now.toLocaleDateString([], {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Hero time.
    ctx.fillStyle = "rgba(215, 238, 255, 0.96)";
    ctx.font = "bold 170px Inter, system-ui, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(time, W / 2, 215);

    // Weekday.
    ctx.fillStyle = "rgba(145, 195, 245, 0.75)";
    ctx.font = "44px Inter, system-ui, sans-serif";
    ctx.fillText(weekday, W / 2, 305);

    // Date.
    ctx.fillStyle = "rgba(120, 172, 225, 0.60)";
    ctx.font = "34px Inter, system-ui, sans-serif";
    ctx.fillText(dateStr, W / 2, 362);

    // Hint.
    ctx.fillStyle = "rgba(80, 130, 185, 0.38)";
    ctx.font = "22px Inter, system-ui, sans-serif";
    ctx.fillText('tap anywhere or say "Hey Limen" to wake', W / 2, 448);

    this.clockTex.update();
  }

  // ── System stats panel ────────────────────────────────────────────────────

  private buildStatsPanel(scene: Scene) {
    const W = 800,
      H = 80;
    const plane = MeshBuilder.CreatePlane(
      "stats-plane",
      { width: 6.5, height: 0.65 },
      scene,
    );
    plane.position.y = -2.8;
    plane.position.z = 0.4;

    this.statsTex = new DynamicTexture(
      "stats-tex",
      { width: W, height: H },
      scene,
      false,
    );
    const mat = new StandardMaterial("stats-mat", scene);
    mat.diffuseTexture = this.statsTex;
    mat.emissiveTexture = this.statsTex;
    mat.disableLighting = true;
    mat.transparencyMode = 2;
    this.statsTex.hasAlpha = true;
    plane.material = mat;

    this.drawStats("—", "—");
    this.statsInterval = setInterval(() => this.fetchAndDrawStats(), 2000);
  }

  private drawStats(cpu: string, mem: string) {
    const W = 800,
      H = 80;
    const ctx = this.statsTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);

    const items = [
      { label: "CPU", value: cpu, color: "rgba(100, 220, 230, 0.80)" },
      { label: "RAM", value: mem, color: "rgba(100, 160, 255, 0.80)" },
    ];
    const step = W / items.length;
    items.forEach(({ label, value, color }, i) => {
      const x = step * i + step / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(160, 200, 240, 0.35)";
      ctx.font = "20px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(label, x, 8);
      ctx.fillStyle = color;
      ctx.font = "bold 32px Inter, system-ui, monospace";
      ctx.textBaseline = "top";
      ctx.fillText(value, x, 34);
    });
    this.statsTex.update();
  }

  private fetchAndDrawStats() {
    const draw = (s: { cpu: number; mem_used: number; mem_total: number }) =>
      this.drawStats(
        `${s.cpu.toFixed(1)}%`,
        `${s.mem_used.toFixed(1)}/${s.mem_total.toFixed(0)}G`,
      );

    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<{ cpu: number; mem_used: number; mem_total: number }>(
          "get_sysinfo",
        )
          .then(draw)
          .catch(() =>
            // Fall back to HTTP API (web mode / non-Tauri)
            fetch("/api/shell/sysinfo")
              .then(
                (r) =>
                  r.json() as Promise<{
                    cpu: number;
                    mem_used: number;
                    mem_total: number;
                  }>,
              )
              .then(draw)
              .catch(() => this.drawStats("—", "—")),
          ),
      )
      .catch(() =>
        fetch("/api/shell/sysinfo")
          .then(
            (r) =>
              r.json() as Promise<{
                cpu: number;
                mem_used: number;
                mem_total: number;
              }>,
          )
          .then(draw)
          .catch(() => this.drawStats("—", "—")),
      );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  activate() {
    this._onPointer = () => useShellStore.getState().setScene("home");
    this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERTAP) this._onPointer?.();
    });
    // Also fetch stats immediately on activate.
    this.fetchAndDrawStats();
  }

  deactivate() {
    this._onPointer = null;
  }

  dispose() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    super.dispose();
  }
}
