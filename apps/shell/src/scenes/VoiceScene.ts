import {
  Color3,
  Color4,
  Engine,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  UniversalCamera,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import { BaseScene } from "./BaseScene";

/**
 * VoiceScene — Overlay shown during active voice interaction.
 *
 * Visual concept:
 *   - Rendered as a transparent overlay (scene clearColor alpha = 0).
 *   - Central waveform ring that responds to audio amplitude.
 *   - Radial spectrum bars around the ring.
 *   - Transcription text rendered via BabylonJS GUI.
 *   - "Thinking" spinner while AI is processing.
 */
export class VoiceScene extends BaseScene {
  private bars: Mesh[] = [];

  constructor(engine: Engine | WebGPUEngine) {
    super(engine);
  }

  async build() {
    const scene = this.scene;
    scene.clearColor = new Color4(0, 0, 0, 0); // transparent overlay

    const camera = new UniversalCamera("cam", new Vector3(0, 0, -10), scene);
    camera.setTarget(Vector3.Zero());

    // Build 64 spectrum bars in a circle.
    const barCount = 64;
    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;
      const r = 2.5;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      const bar = MeshBuilder.CreateBox(
        `bar-${i}`,
        { width: 0.06, height: 0.2, depth: 0.06 },
        scene,
      );
      bar.position = new Vector3(x, y, 0);
      bar.lookAt(Vector3.Zero());
      bar.rotation.z += Math.PI / 2;

      const mat = new PBRMaterial(`bar-mat-${i}`, scene);
      mat.emissiveColor = new Color3(0.2, 0.7, 1.0);
      mat.metallic = 0.0;
      mat.roughness = 1.0;
      bar.material = mat;
      this.bars.push(bar);
    }
  }

  /**
   * Update bar heights from audio frequency data (0–255 per bin).
   * Call this from the voice pipeline on each audio frame.
   */
  updateSpectrum(frequencies: Uint8Array) {
    const step = Math.floor(frequencies.length / this.bars.length);
    this.bars.forEach((bar, i) => {
      const val = (frequencies[i * step] ?? 0) / 255;
      bar.scaling.y = 0.2 + val * 2.0;
    });
  }

  activate() {}
  deactivate() {
    this.bars.forEach((b) => (b.scaling.y = 0.2));
  }
}
