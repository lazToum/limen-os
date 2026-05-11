import {
  Engine,
  WebGPUEngine,
  PostProcess,
  Effect,
  Scene,
} from "@babylonjs/core";
import type { SceneName } from "../store/shell";
import { BaseScene } from "./BaseScene";
import { HomeScene } from "./HomeScene";
import { GreeterScene } from "./GreeterScene";
import { LaunchScene } from "./LaunchScene";
import { AmbientScene } from "./AmbientScene";
import { VoiceScene } from "./VoiceScene";
import { LobbyScene } from "./LobbyScene";

export { BaseScene };

type SceneConstructor = new (engine: Engine | WebGPUEngine) => BaseScene;

const SCENE_MAP: Record<SceneName, SceneConstructor> = {
  home: HomeScene,
  greeter: GreeterScene,
  launcher: LaunchScene,
  ambient: AmbientScene,
  voice: VoiceScene,
  lobby: LobbyScene,
};

/** Duration of cross-fade in milliseconds. */
const FADE_MS = 350;

/**
 * Manages all Babylon.js scenes and orchestrates transitions.
 *
 * Transition strategy:
 *   - React overlay fades via CSS opacity (handled by shell store + CSS transition).
 *   - BJS: old scene renders until fade completes, then new scene takes over.
 *   - Post-process fade-to-black is applied on the outgoing scene.
 */
export class SceneManager {
  private engine!: Engine | WebGPUEngine;
  private scenes: Map<SceneName, BaseScene> = new Map();
  private current: SceneName = "greeter";
  private transitioning = false;
  private _disposed = false;

  constructor(private canvas: HTMLCanvasElement) {}

  async init() {
    // Prefer WebGPU, fall back to WebGL2.
    try {
      const gpuEngine = new WebGPUEngine(this.canvas, {
        antialias: true,
        adaptToDeviceRatio: true,
      });
      await gpuEngine.initAsync();
      this.engine = gpuEngine;
      console.info("[Limen] Using WebGPU renderer");
    } catch {
      this.engine = new Engine(this.canvas, true, {
        adaptToDeviceRatio: true,
        powerPreference: "high-performance",
      });
      console.info("[Limen] Using WebGL2 renderer");
    }

    // Ensure canvas fills its container immediately after engine creation.
    this.engine.resize();

    // Pre-build startup scenes.
    await this.loadScene("greeter");
    await this.loadScene("home");

    if (this._disposed) return;

    // Activate greeter.
    this.scenes.get("greeter")?.activate();

    // Start render loop.
    this.engine.runRenderLoop(() => {
      const active = this.scenes.get(this.current);
      active?.babylonScene.render();
    });

    window.addEventListener("resize", () => this.engine.resize());

    // Listen for Tauri set_scene events pushed from the backend.
    this.hookTauriEvents();
  }

  private hookTauriEvents() {
    // listen() accesses window.__TAURI_INTERNALS__.transformCallback synchronously
    // before returning a promise, so .catch() on its result doesn't help —
    // the throw escapes as an unhandled rejection. Guard before the import.
    if (!("__TAURI_INTERNALS__" in window)) return;
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        void listen<SceneName>("limen://scene", (ev) => {
          void this.transitionTo(ev.payload);
        });
      })
      .catch(() => {
        /* import failed */
      });
  }

  private async loadScene(name: SceneName): Promise<BaseScene> {
    if (this.scenes.has(name)) return this.scenes.get(name)!;
    const Ctor = SCENE_MAP[name];
    const scene = new Ctor(this.engine);
    await scene.build();
    this.scenes.set(name, scene);
    return scene;
  }

  async transitionTo(name: SceneName) {
    if (name === this.current || this.transitioning) return;
    this.transitioning = true;

    // Lazy-load incoming scene while old one is still visible.
    const next = await this.loadScene(name);
    const prev = this.scenes.get(this.current);
    const prevScene = prev?.babylonScene;

    // Fade out old scene via post-process.
    const fadeDone = prevScene
      ? this.fadeScene(prevScene, 1, 0, FADE_MS)
      : Promise.resolve();

    await fadeDone;

    // Switch render target.
    prev?.deactivate();
    next.activate();
    this.current = name;
    this.transitioning = false;
    console.info(`[Limen] Scene: ${name}`);

    // Fade in new scene.
    void this.fadeScene(next.babylonScene, 0, 1, FADE_MS);
  }

  /**
   * Apply a simple alpha fade post-process to a scene.
   * Returns a Promise that resolves when the fade completes.
   */
  private fadeScene(
    scene: Scene,
    fromAlpha: number,
    toAlpha: number,
    durationMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      // Register a one-shot fade shader if not already registered.
      if (!Effect.ShadersStore["limenFadePixelShader"]) {
        Effect.ShadersStore["limenFadePixelShader"] = `
          varying vec2 vUV;
          uniform sampler2D textureSampler;
          uniform float alpha;
          void main(void) {
            gl_FragColor = texture2D(textureSampler, vUV) * alpha;
          }
        `;
      }

      const camera = scene.activeCamera;
      if (!camera) {
        resolve();
        return;
      }

      const pp = new PostProcess(
        "fade",
        "limenFade",
        ["alpha"],
        null,
        1.0,
        camera,
      );

      const startTime = performance.now();
      pp.onApply = (effect) => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        effect.setFloat("alpha", fromAlpha + (toAlpha - fromAlpha) * eased);
        if (t >= 1) {
          pp.dispose();
          resolve();
        }
      };
    });
  }

  /**
   * Called by useMoodSync whenever the active OsMood changes.
   * Propagates accent color and intensity to the active Babylon scene.
   */
  setMoodHint(accentHex: string, intensity: number, animSpeed: number) {
    const active = this.scenes.get(this.current);
    active?.onMoodChange?.(accentHex, intensity, animSpeed);
  }

  dispose() {
    this._disposed = true;
    this.engine?.stopRenderLoop();
    this.scenes.forEach((s) => s.dispose());
    this.engine?.dispose();
  }
}
