import { Engine, Scene, WebGPUEngine } from "@babylonjs/core";

export abstract class BaseScene {
  protected scene: Scene;
  constructor(protected engine: Engine | WebGPUEngine) {
    this.scene = new Scene(engine);
  }
  abstract build(): Promise<void>;
  abstract activate(): void;
  abstract deactivate(): void;
  get babylonScene(): Scene {
    return this.scene;
  }
  dispose() {
    this.scene.dispose();
  }

  /**
   * Called by SceneManager whenever the OS mood changes.
   * Override in subclasses to update glow intensity, accent colors,
   * particle density, animation speed, etc.
   *
   * @param accentHex  — hex color string, e.g. "#22d3ee"
   * @param intensity  — 0–1, scene glow / particle brightness
   * @param animSpeed  — multiplier, 0.2–1.5
   */
  onMoodChange(
    _accentHex: string,
    _intensity: number,
    _animSpeed: number,
  ): void {}
}
