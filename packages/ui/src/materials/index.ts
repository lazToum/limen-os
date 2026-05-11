/**
 * LIMEN OS material presets.
 *
 * Design tokens → Babylon.js PBRMaterial.
 *
 * Color palette:
 *   limen-blue    #3B82F6  — primary interactive
 *   limen-cyan    #22D3EE  — voice/AI active
 *   limen-purple  #8B5CF6  — AI/model indicator
 *   limen-green   #10B981  — success/connected
 *   limen-amber   #F59E0B  — warning
 *   limen-red     #EF4444  — error/alert
 *   surface-dark    #0A0A1A  — background
 *   surface-mid     #1E1E3A  — card/panel
 */

import { Color3, PBRMaterial, Scene } from "@babylonjs/core";

export const LIMEN_COLORS = {
  blue: new Color3(0.23, 0.51, 0.965),
  cyan: new Color3(0.13, 0.83, 0.93),
  purple: new Color3(0.545, 0.36, 0.965),
  green: new Color3(0.063, 0.722, 0.506),
  amber: new Color3(0.961, 0.62, 0.043),
  red: new Color3(0.937, 0.267, 0.267),
  surface: new Color3(0.04, 0.04, 0.1),
  panel: new Color3(0.12, 0.12, 0.23),
} as const;

/** Create a glowing holographic PBR material. */
export function holoMaterial(
  name: string,
  scene: Scene,
  emissive: Color3,
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metallic = 0.9;
  mat.roughness = 0.1;
  mat.albedoColor = emissive.scale(0.1);
  mat.emissiveColor = emissive.scale(0.5);
  mat.subSurface.isTranslucencyEnabled = true;
  mat.subSurface.translucencyIntensity = 0.3;
  return mat;
}

/** Create a frosted glass PBR material. */
export function glassMaterial(name: string, scene: Scene): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metallic = 0.0;
  mat.roughness = 0.05;
  mat.albedoColor = LIMEN_COLORS.panel;
  mat.alpha = 0.6;
  mat.backFaceCulling = false;
  return mat;
}

/** Create a matte panel PBR material. */
export function panelMaterial(name: string, scene: Scene): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.metallic = 0.0;
  mat.roughness = 0.8;
  mat.albedoColor = LIMEN_COLORS.panel;
  mat.emissiveColor = LIMEN_COLORS.blue.scale(0.03);
  return mat;
}
