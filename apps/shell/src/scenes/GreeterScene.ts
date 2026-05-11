import {
  Animation,
  ArcRotateCamera,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  MeshBuilder,
  ParticleSystem,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import { BaseScene } from "./BaseScene";
import { useShellStore } from "../store/shell";

/**
 * GreeterScene — Pre-login display manager screen.
 *
 * Visual concept:
 *   - Aurora borealis particle field (vertical curtains of color).
 *   - Floating clock in the center with live time + date.
 *   - Glowing torus ring around the clock.
 *   - Click anywhere → transition to home.
 */
export class GreeterScene extends BaseScene {
  private clockTex!: DynamicTexture;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private _onClick: (() => void) | null = null;

  constructor(engine: Engine | WebGPUEngine) {
    super(engine);
  }

  async build() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.01, 0.01, 0.04, 1);

    // Camera — fixed, no user control on greeter.
    const camera = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 2.5,
      15,
      Vector3.Zero(),
      scene,
    );
    camera.fov = 1.0;

    // Ambient fill.
    const ambient = new HemisphericLight(
      "ambient",
      new Vector3(0, 1, 0),
      scene,
    );
    ambient.intensity = 0.15;
    ambient.diffuse = new Color3(0.3, 0.4, 0.8);

    // Glow.
    const glow = new GlowLayer("glow", scene, { mainTextureFixedSize: 256 });
    glow.intensity = 1.2;

    // Aurora particles — vertical color curtains.
    this.buildAurora(scene);

    // Glowing torus ring.
    this.buildRing(scene);

    // Live clock panel.
    this.buildClock(scene);
  }

  private buildRing(scene: Scene) {
    const ring = MeshBuilder.CreateTorus(
      "ring",
      { diameter: 2.8, thickness: 0.04, tessellation: 64 },
      scene,
    );
    const mat = new StandardMaterial("ring-mat", scene);
    mat.emissiveColor = new Color3(0.4, 0.8, 1.0);
    mat.disableLighting = true;
    ring.material = mat;

    // Slow rotation.
    const anim = new Animation(
      "ring-spin",
      "rotation.z",
      30,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 600, value: Math.PI * 2 },
    ]);
    ring.animations = [anim];
    scene.beginAnimation(ring, 0, 600, true);
  }

  private buildClock(scene: Scene) {
    // Flat plane facing camera.
    const plane = MeshBuilder.CreatePlane(
      "clock-panel",
      { width: 3.2, height: 1.8 },
      scene,
    );
    plane.position.z = 0.1; // slightly in front of ring

    this.clockTex = new DynamicTexture(
      "clock-tex",
      { width: 512, height: 288 },
      scene,
      false,
    );
    const mat = new StandardMaterial("clock-mat", scene);
    mat.diffuseTexture = this.clockTex;
    mat.emissiveTexture = this.clockTex;
    mat.disableLighting = true;
    mat.transparencyMode = 2; // ALPHATESTANDBLEND
    this.clockTex.hasAlpha = true;
    plane.material = mat;

    this.drawClock();
    this.clockInterval = setInterval(() => this.drawClock(), 1000);
  }

  private drawClock() {
    const ctx = this.clockTex.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 288);

    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const date = now.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    // Time — large, bright.
    ctx.fillStyle = "rgba(220, 240, 255, 0.95)";
    ctx.font = "bold 96px Inter, system-ui, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(time, 256, 110);

    // Date — smaller.
    ctx.fillStyle = "rgba(160, 200, 240, 0.75)";
    ctx.font = "28px Inter, system-ui, sans-serif";
    ctx.fillText(date, 256, 195);

    // Hint.
    ctx.fillStyle = "rgba(100, 160, 220, 0.5)";
    ctx.font = "18px Inter, system-ui, sans-serif";
    ctx.fillText("click anywhere to enter", 256, 258);

    this.clockTex.update();
  }

  /** Build a radial soft-glow flare texture procedurally — no external URLs needed. */
  private makeFlareTexture(scene: Scene): DynamicTexture {
    const tex = new DynamicTexture(
      "flare",
      { width: 64, height: 64 },
      scene,
      false,
    );
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    tex.update();
    return tex;
  }

  private buildAurora(scene: Scene) {
    const flare = this.makeFlareTexture(scene);
    const colors: [number, number, number][] = [
      [0.0, 0.8, 0.6],
      [0.3, 0.5, 1.0],
      [0.8, 0.2, 0.9],
    ];
    for (let i = 0; i < 3; i++) {
      const ps = new ParticleSystem(`aurora-${i}`, 800, scene);
      ps.particleTexture = flare;
      const [r = 0, g = 0, b = 0] = colors[i] ?? [0, 0, 0];
      ps.color1 = new Color4(r, g, b, 0.8);
      ps.color2 = new Color4(r * 0.5, g * 0.5, b * 0.5, 0.4);
      ps.colorDead = new Color4(0, 0, 0, 0);
      ps.minSize = 0.3;
      ps.maxSize = 1.2;
      ps.minLifeTime = 3;
      ps.maxLifeTime = 6;
      ps.emitRate = 60;
      ps.gravity = new Vector3(0, 0.02, 0);
      ps.direction1 = new Vector3(-0.5, 1, 0);
      ps.direction2 = new Vector3(0.5, 1, 0);
      ps.minEmitBox = new Vector3(-8 + i * 5, -6, -2);
      ps.maxEmitBox = new Vector3(-6 + i * 5, -4, 2);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.start();
    }
  }

  activate() {
    this._onClick = () => useShellStore.getState().setScene("home");
    this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERTAP) {
        this._onClick?.();
      }
    });
  }

  deactivate() {
    this._onClick = null;
  }

  dispose() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    super.dispose();
  }
}
