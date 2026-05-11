import {
  ArcRotateCamera,
  Color3,
  Color4,
  DynamicTexture,
  Effect,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointerEventTypes,
  PointerInfo,
  PointLight,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  Vector3,
  Animation,
  WebGPUEngine,
} from "@babylonjs/core";
import { BaseScene } from "./BaseScene";
import { useShellStore } from "../store/shell";
import { voicePipeline } from "../voice/pipeline";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SysStats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  diskUsedPct: number;
  diskTotalGib: number;
  netDownBps: number;
  netUpBps: number;
}

const DEFAULT_STATS: SysStats = {
  cpu: 0,
  memUsed: 0,
  memTotal: 16,
  diskUsedPct: 0,
  diskTotalGib: 100,
  netDownBps: 0,
  netUpBps: 0,
};

// Card slot definition
interface CardDef {
  kind:
    | "clock"
    | "cpu"
    | "ram"
    | "disk"
    | "network"
    | "launcher"
    | "terminal"
    | "ai";
  color: Color3;
  action?: () => void;
  actionable?: boolean;
}

/**
 * HomeScene — Main desktop.
 *
 * Orbital dock with 7 live-data widget cards:
 *   clock, cpu gauge, ram gauge, disk gauge, network sparkline,
 *   launcher, ai-chat
 *
 * Live data pulled from get_sysinfo Tauri command every 2s.
 * Background: deep-space nebula + aurora shader + star particles.
 * Central orb pulses on AI activity.
 */
export class HomeScene extends BaseScene {
  private orb!: Mesh;
  private dockCards: Mesh[] = [];
  private cardTextures: Map<string, DynamicTexture> = new Map();
  private glowLayer!: GlowLayer;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private stats: SysStats = { ...DEFAULT_STATS };
  private netHistory: number[] = Array(20).fill(0);
  private bgMat!: ShaderMaterial;
  private startTime = Date.now();
  private orbMat!: StandardMaterial;

  constructor(engine: Engine | WebGPUEngine) {
    super(engine);
  }

  async build() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.01, 0.01, 0.04, 1);

    // Camera — slight tilt, user can orbit.
    const cam = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 2.6,
      11,
      Vector3.Zero(),
      scene,
    );
    cam.lowerRadiusLimit = 7;
    cam.upperRadiusLimit = 20;
    cam.wheelDeltaPercentage = 0.01;
    cam.lowerBetaLimit = Math.PI / 4;
    cam.upperBetaLimit = Math.PI / 1.8;
    cam.attachControl(this.engine.getRenderingCanvas()!, true);

    // Lights.
    const ambient = new HemisphericLight(
      "ambient",
      new Vector3(0, 1, 0),
      scene,
    );
    ambient.intensity = 0.25;
    ambient.diffuse = new Color3(0.4, 0.5, 0.9);
    ambient.groundColor = new Color3(0.05, 0.05, 0.15);

    const fill = new PointLight("fill", new Vector3(4, 6, -4), scene);
    fill.intensity = 0.7;
    fill.diffuse = new Color3(0.8, 0.75, 1.0);

    // Glow — emissive surfaces bloom.
    this.glowLayer = new GlowLayer("glow", scene, {
      mainTextureFixedSize: 512,
    });
    this.glowLayer.intensity = 0.7;

    this.buildBackground(scene);
    this.buildStars(scene);
    this.buildDock(scene);
    this.buildOrb(scene);

    window.addEventListener("keydown", this._onKey);
    window.addEventListener("limen:wake", this._onWake);
  }

  // ── Deep-space aurora background ──────────────────────────────────────────

  private buildBackground(scene: Scene) {
    if (!Effect.ShadersStore["homeAuroraVertexShader"]) {
      Effect.ShadersStore["homeAuroraVertexShader"] = `
        precision highp float;
        attribute vec3 position; attribute vec2 uv;
        varying vec2 vUV;
        uniform mat4 worldViewProjection;
        void main() { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }
      `;
    }
    if (!Effect.ShadersStore["homeAuroraFragmentShader"]) {
      Effect.ShadersStore["homeAuroraFragmentShader"] = `
        precision highp float;
        varying vec2 vUV; uniform float time;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);
          for(int i=0;i<5;i++){v+=a*n(p);p=r*p*2.+100.;a*=.5;}return v;}
        void main(){
          vec2 uv=vUV; float t=time*.04;
          float q=fbm(uv+vec2(t*.4,t*.3));
          float f=fbm(uv+vec2(q+t*.3,q-.2)+2.);
          vec3 c=mix(vec3(.01,.01,.04),vec3(.02,.05,.18),clamp(f*2.,0.,1.));
          c=mix(c,vec3(.0,.12,.22),clamp(q*f,0.,1.));
          float sh=sin(uv.y*8.+t*2.5+q*5.)*.5+.5; sh=pow(sh,3.)*f*.5;
          c+=vec3(0.,.25,.35)*sh;
          vec2 v2=uv-.5; c*=clamp(1.-dot(v2,v2)*2.2,0.,1.);
          gl_FragColor=vec4(c,1.);
        }
      `;
    }

    const bg = MeshBuilder.CreatePlane(
      "home-bg",
      { width: 60, height: 34 },
      scene,
    );
    bg.position.z = 28;
    this.bgMat = new ShaderMaterial("home-aurora", scene, "homeAurora", {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time"],
    });
    bg.material = this.bgMat;
    scene.registerBeforeRender(() => {
      this.bgMat.setFloat("time", (Date.now() - this.startTime) / 1000);
    });
  }

  // ── Star particles ────────────────────────────────────────────────────────

  private buildStars(scene: Scene) {
    const tex = new DynamicTexture(
      "star-flare",
      { width: 32, height: 32 },
      scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();

    const ps = new ParticleSystem("stars", 800, scene);
    ps.particleTexture = tex;
    ps.color1 = new Color4(0.8, 0.9, 1.0, 0.5);
    ps.color2 = new Color4(0.5, 0.6, 1.0, 0.2);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize = 0.015;
    ps.maxSize = 0.07;
    ps.minLifeTime = 12;
    ps.maxLifeTime = 30;
    ps.emitRate = 40;
    ps.gravity = Vector3.Zero();
    ps.direction1 = new Vector3(-0.01, 0.005, 0);
    ps.direction2 = new Vector3(0.01, -0.005, 0);
    ps.minEmitBox = new Vector3(-18, -10, 1);
    ps.maxEmitBox = new Vector3(18, 10, 20);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
  }

  // ── Orbital dock ──────────────────────────────────────────────────────────

  private buildDock(scene: Scene) {
    const cards: CardDef[] = [
      { kind: "clock", color: new Color3(0.15, 0.75, 0.55) },
      { kind: "cpu", color: new Color3(0.15, 0.85, 0.9) },
      { kind: "ram", color: new Color3(0.25, 0.55, 1.0) },
      { kind: "disk", color: new Color3(0.9, 0.7, 0.15) },
      { kind: "network", color: new Color3(0.2, 0.9, 0.5) },
      {
        kind: "launcher",
        color: new Color3(0.3, 0.55, 1.0),
        actionable: true,
        action: () => useShellStore.getState().setScene("launcher"),
      },
      {
        kind: "ai",
        color: new Color3(0.85, 0.45, 1.0),
        actionable: true,
        action: () => useShellStore.getState().setVoiceActive(true),
      },
    ];

    const radius = 4.5;
    const count = cards.length;

    cards.forEach((def, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.55; // flatten into ellipse

      const card = MeshBuilder.CreateBox(
        `dock-${i}`,
        { width: 1.5, height: 1.0, depth: 0.05 },
        scene,
      );
      card.position = new Vector3(x, 0, z);
      card.lookAt(new Vector3(0, 0, -10));

      const W = 300,
        H = 200;
      const tex = new DynamicTexture(
        `card-tex-${i}`,
        { width: W, height: H },
        scene,
        false,
      );
      this.cardTextures.set(def.kind, tex);

      const mat = new StandardMaterial(`card-mat-${i}`, scene);
      mat.diffuseColor = def.color.scale(0.08);
      mat.emissiveColor = def.color.scale(0.2);
      mat.specularColor = new Color3(0.4, 0.4, 0.5);
      mat.specularPower = 80;
      mat.diffuseTexture = tex;
      mat.alpha = 0.92;
      card.material = mat;

      // Float animation — each card at a unique phase.
      const phase = (i / count) * Math.PI * 2;
      const floatAnim = new Animation(
        `float-${i}`,
        "position.y",
        30,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      const amp = 0.1;
      floatAnim.setKeys([
        { frame: 0, value: Math.sin(phase) * amp },
        { frame: 60, value: Math.sin(phase + Math.PI) * amp },
        { frame: 120, value: Math.sin(phase) * amp },
      ]);
      card.animations = [floatAnim];
      scene.beginAnimation(card, 0, 120, true);

      card.metadata = {
        action: def.action,
        actionable: def.actionable === true,
        kind: def.kind,
      };
      this.dockCards.push(card);

      // Initial draw.
      this.redrawCard(def.kind);
    });

    // Pointer interactions.
    this.scene.onPointerObservable.add((info: PointerInfo) => {
      if (info.type === PointerEventTypes.POINTERDOWN) {
        const mesh = info.pickInfo?.pickedMesh;
        if (mesh?.metadata?.isOrb) {
          // Start PTT: glow cyan, scale pulse.
          this.orbMat.emissiveColor = new Color3(0.0, 0.9, 1.0);
          this.glowLayer.intensity = 1.8;
          voicePipeline.startPTT();
          return;
        }
      }
      if (info.type === PointerEventTypes.POINTERUP) {
        // Stop PTT if active — restore orb to default.
        if (useShellStore.getState().voiceActive) {
          voicePipeline.stopPTT();
          this.orbMat.emissiveColor = new Color3(0.25, 0.55, 1.0);
          this.glowLayer.intensity = 0.7;
        }
      }
      if (info.type === PointerEventTypes.POINTERPICK) {
        const mesh = info.pickInfo?.pickedMesh;
        if (
          mesh?.metadata?.actionable &&
          typeof mesh?.metadata?.action === "function"
        )
          mesh.metadata.action();
      }
      if (info.type === PointerEventTypes.POINTERMOVE) {
        const picked = info.pickInfo?.pickedMesh;
        this.dockCards.forEach((card) => {
          const mat = card.material as StandardMaterial;
          if (card === picked) {
            mat.alpha = 1.0;
            mat.emissiveColor = mat.emissiveColor.scale(1.5);
          } else {
            mat.alpha = 0.92;
          }
        });
      }
    });

    // Clock: redraw every second.
    this.clockInterval = setInterval(() => this.redrawCard("clock"), 1000);

    // Stats: poll Tauri every 2s.
    this.statsInterval = setInterval(() => this.pollStats(), 2000);
    void this.pollStats();
  }

  // ── Central AI orb ────────────────────────────────────────────────────────

  private buildOrb(scene: Scene) {
    this.orb = MeshBuilder.CreateSphere(
      "orb",
      { diameter: 0.75, segments: 48 },
      scene,
    );
    this.orbMat = new StandardMaterial("orb-mat", scene);
    this.orbMat.diffuseColor = Color3.Black();
    this.orbMat.specularColor = new Color3(0.7, 0.85, 1.0);
    this.orbMat.specularPower = 300;
    this.orbMat.emissiveColor = new Color3(0.25, 0.55, 1.0);
    this.orb.material = this.orbMat;
    this.orb.metadata = { isOrb: true };

    // Breathe.
    const pulse = new Animation(
      "orb-pulse",
      "scaling",
      30,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    pulse.setKeys([
      { frame: 0, value: new Vector3(1.0, 1.0, 1.0) },
      { frame: 50, value: new Vector3(1.08, 1.08, 1.08) },
      { frame: 100, value: new Vector3(1.0, 1.0, 1.0) },
    ]);
    this.orb.animations = [pulse];
    this.scene.beginAnimation(this.orb, 0, 100, true);

    // Slow y-rotation — feels alive.
    this.scene.registerBeforeRender(() => {
      this.orb.rotation.y += 0.004;
    });
  }

  // ── Stats polling ─────────────────────────────────────────────────────────

  private async pollStats() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const s = await invoke<{
        cpu: number;
        mem_used: number;
        mem_total: number;
        disk_used_pct: number;
        disk_total_gib: number;
        net_down_bps: number;
        net_up_bps: number;
      }>("get_sysinfo");

      this.stats = {
        cpu: s.cpu,
        memUsed: s.mem_used,
        memTotal: s.mem_total,
        diskUsedPct: s.disk_used_pct,
        diskTotalGib: s.disk_total_gib,
        netDownBps: s.net_down_bps,
        netUpBps: s.net_up_bps,
      };

      this.netHistory.push(s.net_down_bps);
      if (this.netHistory.length > 20) this.netHistory.shift();

      this.redrawCard("cpu");
      this.redrawCard("ram");
      this.redrawCard("disk");
      this.redrawCard("network");
    } catch {
      // Outside Tauri or command unavailable — keep last stats.
    }
  }

  // ── Card drawing ──────────────────────────────────────────────────────────

  private redrawCard(kind: string) {
    const tex = this.cardTextures.get(kind);
    if (!tex) return;

    switch (kind) {
      case "clock":
        this.drawClockCard(tex);
        break;
      case "cpu":
        this.drawGaugeCard(
          tex,
          "CPU",
          this.stats.cpu,
          100,
          "%",
          new Color3(0.15, 0.85, 0.9),
        );
        break;
      case "ram":
        this.drawGaugeCard(
          tex,
          "RAM",
          (this.stats.memUsed / this.stats.memTotal) * 100,
          100,
          `${this.stats.memUsed.toFixed(1)}G`,
          new Color3(0.25, 0.55, 1.0),
        );
        break;
      case "disk":
        this.drawGaugeCard(
          tex,
          "Disk",
          this.stats.diskUsedPct,
          100,
          `${this.stats.diskTotalGib.toFixed(0)}G`,
          new Color3(0.9, 0.7, 0.15),
        );
        break;
      case "network":
        this.drawNetworkCard(tex);
        break;
      case "launcher":
        this.drawActionCard(tex, "⊞", "Launcher", new Color3(0.3, 0.55, 1.0));
        break;
      case "ai":
        this.drawActionCard(tex, "◎", "AI Chat", new Color3(0.85, 0.45, 1.0));
        break;
    }
  }

  /** Large time + date card. */
  private drawClockCard(tex: DynamicTexture) {
    const W = 300,
      H = 200;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);
    const now = new Date();

    ctx.textAlign = "center";
    // Time.
    ctx.fillStyle = "rgba(210, 245, 255, 0.96)";
    ctx.font = "bold 68px Inter, system-ui, monospace";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      W / 2,
      95,
    );
    // Seconds.
    ctx.fillStyle = "rgba(140, 200, 230, 0.65)";
    ctx.font = "28px Inter, system-ui, monospace";
    ctx.fillText(
      `:${String(now.getSeconds()).padStart(2, "0")}`,
      W / 2 + 52,
      95,
    );
    // Date.
    ctx.fillStyle = "rgba(140, 195, 235, 0.75)";
    ctx.font = "22px Inter, system-ui, sans-serif";
    ctx.fillText(
      now.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      W / 2,
      135,
    );
    // City — pulls from Vite env if available.
    const city =
      (import.meta.env as Record<string, string | undefined>)["VITE_CITY"] ??
      "—";
    ctx.fillStyle = "rgba(100, 160, 210, 0.50)";
    ctx.font = "18px Inter, system-ui, sans-serif";
    ctx.fillText(city, W / 2, 165);

    tex.update();
  }

  /**
   * Plasma-style circular gauge.
   * Background ring + colored progress arc + center label.
   */
  private drawGaugeCard(
    tex: DynamicTexture,
    label: string,
    pct: number, // 0-100
    _max: number,
    sublabel: string,
    color: Color3,
  ) {
    const W = 300,
      H = 200;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2,
      cy = 105,
      r = 62;
    const startA = -Math.PI * 0.75; // ~8 o'clock
    const sweepA = Math.PI * 1.5; // 270° sweep
    const endA = startA + sweepA;
    const clampedPct = Math.min(Math.max(pct, 0), 100);
    const valueA = startA + (clampedPct / 100) * sweepA;

    const hex = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;

    // Track ring.
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA, false);
    ctx.strokeStyle = "rgba(180,210,240,0.12)";
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.stroke();

    // Value arc.
    if (clampedPct > 0) {
      const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      grad.addColorStop(0, hex);
      grad.addColorStop(
        1,
        `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},0.6)`,
      );
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, valueA, false);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Center value text.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = hex;
    ctx.font = `bold 34px Inter, system-ui, monospace`;
    ctx.fillText(`${clampedPct.toFixed(1)}%`, cx, cy - 8);

    // Sublabel.
    ctx.fillStyle = "rgba(180, 210, 240, 0.60)";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText(sublabel, cx, cy + 22);

    // Card title.
    ctx.fillStyle = hex;
    ctx.font = "bold 18px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, cx, 26);

    tex.update();
  }

  /** Network sparkline + ↓↑ speeds. */
  private drawNetworkCard(tex: DynamicTexture) {
    const W = 300,
      H = 200;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);

    const color = "rgba(50, 230, 130, 0.90)";

    // Title.
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(50, 230, 130, 0.90)";
    ctx.font = "bold 18px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Network", W / 2, 26);

    // Sparkline.
    const chartX = 18,
      chartY = 40,
      chartW = W - 36,
      chartH = 80;
    const maxVal = Math.max(...this.netHistory, 1024);
    ctx.fillStyle = "rgba(50, 230, 130, 0.06)";
    ctx.fillRect(chartX, chartY, chartW, chartH);

    // Grid line at 50%.
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(50, 230, 130, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY + chartH / 2);
    ctx.lineTo(chartX + chartW, chartY + chartH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sparkline path.
    const step = chartW / (this.netHistory.length - 1);
    ctx.beginPath();
    this.netHistory.forEach((v, i) => {
      const px = chartX + i * step;
      const py = chartY + chartH - (v / maxVal) * chartH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    // Fill under.
    ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.lineTo(chartX, chartY + chartH);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
    fillGrad.addColorStop(0, "rgba(50,230,130,0.30)");
    fillGrad.addColorStop(1, "rgba(50,230,130,0.00)");
    ctx.fillStyle = fillGrad;
    ctx.fill();
    // Line.
    ctx.beginPath();
    this.netHistory.forEach((v, i) => {
      const px = chartX + i * step;
      const py = chartY + chartH - (v / maxVal) * chartH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Speeds.
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(50, 230, 130, 0.85)";
    ctx.font = "bold 17px Inter, system-ui, monospace";
    ctx.fillText(`↓ ${this.fmtSpeed(this.stats.netDownBps)}`, 18, 158);
    ctx.fillStyle = "rgba(230, 190, 50, 0.85)";
    ctx.fillText(`↑ ${this.fmtSpeed(this.stats.netUpBps)}`, 18, 182);

    tex.update();
  }

  /** Simple icon + label card for actions. */
  private drawActionCard(
    tex: DynamicTexture,
    icon: string,
    label: string,
    color: Color3,
  ) {
    const W = 300,
      H = 200;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, W, H);
    const hex = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = hex;
    ctx.font = "64px system-ui, sans-serif";
    ctx.fillText(icon, W / 2, 90);
    ctx.font = "bold 22px Inter, system-ui, sans-serif";
    ctx.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},0.80)`;
    ctx.fillText(label, W / 2, 155);
    tex.update();
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  /** Flash orb white on wake-word detection, then settle to pulsing cyan. */
  private _onWake = () => {
    if (!this.orbMat) return;
    // Flash white → cyan over 400ms.
    this.orbMat.emissiveColor = new Color3(1.0, 1.0, 1.0);
    this.glowLayer.intensity = 2.0;
    setTimeout(() => {
      if (this.orbMat) {
        this.orbMat.emissiveColor = new Color3(0.0, 0.9, 1.0);
        this.glowLayer.intensity = 1.4;
      }
    }, 400);
  };

  private _onKey = (e: KeyboardEvent) => {
    const s = useShellStore.getState();
    if (e.key === "l" || e.key === "L") s.setScene("launcher");
    if (e.key === "v" || e.key === "V") s.setVoiceActive(true);
    if (e.key === "a" || e.key === "A") s.setScene("ambient");
  };

  // ── Public API ────────────────────────────────────────────────────────────

  /** Pulse orb when AI is active. */
  highlightOrb(active: boolean) {
    this.orbMat.emissiveColor = active
      ? new Color3(0.15, 0.95, 1.0)
      : new Color3(0.25, 0.55, 1.0);
    this.glowLayer.intensity = active ? 1.4 : 0.7;
  }

  activate() {
    this.scene.attachControl();
    window.addEventListener("keydown", this._onKey);
    // Immediately refresh stats on activate.
    void this.pollStats();
  }

  deactivate() {
    this.scene.detachControl();
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("limen:wake", this._onWake);
  }

  /** Mood hook — update glow intensity and orb accent from MoodEngine. */
  override onMoodChange(
    accentHex: string,
    intensity: number,
    animSpeed: number,
  ) {
    // Parse hex → Color3
    const n = parseInt(accentHex.replace("#", ""), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;

    if (this.orbMat && !useShellStore.getState().aiThinking) {
      this.orbMat.emissiveColor = new Color3(r * 0.6, g * 0.6, b * 1.0);
    }
    if (this.glowLayer) {
      this.glowLayer.intensity = 0.4 + intensity * 0.9;
    }
    // Particle density — scale particle emitter rate if present
    void animSpeed; // reserved for future particle rate scaling
  }

  dispose() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    super.dispose();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private fmtSpeed(bps: number): string {
    if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MiB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KiB/s`;
    return `${bps.toFixed(0)} B/s`;
  }
}
