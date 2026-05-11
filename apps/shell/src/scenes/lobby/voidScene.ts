import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  PointLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Animation,
  ActionManager,
  ExecuteCodeAction,
  HighlightLayer,
  Animatable,
  Mesh,
  GlowLayer,
  CubicEase,
  EasingFunction,
} from "@babylonjs/core";
import { Experience, experiences, voidConfig } from "./void.config";
import type { PortalShape } from "./void.config";

export interface VoidSceneCallbacks {
  onExperienceHover: (experience: Experience | null) => void;
  onExperienceSelect: (experience: Experience) => void;
  onSceneReady: () => void;
}

export interface VoidSceneControls {
  selectHoveredExperience: () => void;
  resetCameraView: () => void;
  dispose: () => void;
}

/**
 * Create a portal mesh based on shape type
 */
const createPortalMesh = (
  shape: PortalShape,
  name: string,
  scene: Scene,
): Mesh => {
  switch (shape) {
    case "icosahedron":
      return MeshBuilder.CreateIcoSphere(
        name,
        {
          radius: 0.7,
          subdivisions: 1,
          flat: true,
        },
        scene,
      );

    case "torus":
      return MeshBuilder.CreateTorus(
        name,
        {
          diameter: 1.4,
          thickness: 0.35,
          tessellation: 32,
        },
        scene,
      );

    case "octahedron":
      return MeshBuilder.CreatePolyhedron(
        name,
        {
          type: 1,
          size: 0.6,
        },
        scene,
      );

    case "dodecahedron":
      return MeshBuilder.CreatePolyhedron(
        name,
        {
          type: 2,
          size: 0.55,
        },
        scene,
      );

    default:
      return MeshBuilder.CreateIcoSphere(
        name,
        { radius: 0.7, subdivisions: 1 },
        scene,
      );
  }
};

/**
 * Create an invisible hitbox mesh (larger than the portal for easier hovering)
 */
const createHitbox = (
  _shape: PortalShape,
  name: string,
  scale: number,
  scene: Scene,
): Mesh => {
  let hitbox: Mesh;

  // Use a sphere for all hitboxes - simpler and more forgiving
  hitbox = MeshBuilder.CreateSphere(
    name,
    {
      diameter: 1.8 * scale, // Base size that covers all portal types
      segments: 8,
    },
    scene,
  );

  // Make it invisible
  hitbox.visibility = 0;
  hitbox.isPickable = true;

  return hitbox;
};

/**
 * Create a custom grid using lines
 */
const createGrid = (scene: Scene): void => {
  const { size, divisions, yPosition } = voidConfig.grid;
  const step = size / divisions;
  const half = size / 2;

  for (let i = 0; i <= divisions; i++) {
    const pos = -half + i * step;
    const isMajor = i % 5 === 0;
    const alpha = isMajor ? 0.4 : 0.15;
    const color = isMajor
      ? new Color3(0.12, 0.12, 0.18)
      : new Color3(0.06, 0.06, 0.09);

    // Horizontal line
    const hLine = MeshBuilder.CreateLines(
      `gridH${i}`,
      {
        points: [
          new Vector3(-half, yPosition, pos),
          new Vector3(half, yPosition, pos),
        ],
      },
      scene,
    );
    hLine.color = color;
    hLine.alpha = alpha;

    // Vertical line
    const vLine = MeshBuilder.CreateLines(
      `gridV${i}`,
      {
        points: [
          new Vector3(pos, yPosition, -half),
          new Vector3(pos, yPosition, half),
        ],
      },
      scene,
    );
    vLine.color = color;
    vLine.alpha = alpha;
  }
};

/**
 * Create the Minimalist Void scene
 */
export const createVoidScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: VoidSceneCallbacks,
): VoidSceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.01, 0.01, 0.02, 1);

  let currentCameraAnimation: Animatable | null = null;
  let hoveredExperience: Experience | null = null;
  let unhoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const portalMeshes: Map<string, Mesh> = new Map();
  const portalHitboxes: Map<string, Mesh> = new Map();
  const portalMaterials: Map<string, StandardMaterial> = new Map();

  // ========== LIGHTING ==========

  const ambientLight = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.25;
  ambientLight.diffuse = new Color3(0.6, 0.6, 0.7);
  ambientLight.groundColor = new Color3(0.1, 0.1, 0.15);

  // Light that follows focus
  const focusLight = new PointLight("focusLight", new Vector3(0, 2, -3), scene);
  focusLight.intensity = 1.2;
  focusLight.diffuse = new Color3(0.6, 0.6, 0.7);

  // ========== GLOW LAYER ==========

  const glowLayer = new GlowLayer("glow", scene, {
    blurKernelSize: 48,
    mainTextureFixedSize: 512,
  });
  glowLayer.intensity = 0.9;

  // ========== HIGHLIGHT LAYER ==========

  const highlightLayer = new HighlightLayer("highlight", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = true;
  highlightLayer.blurHorizontalSize = 1.2;
  highlightLayer.blurVerticalSize = 1.2;

  // ========== CAMERA ==========

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 2,
    Math.PI / 2.2,
    voidConfig.camera.defaultRadius,
    Vector3.Zero(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 3;
  camera.upperRadiusLimit = 18;
  camera.wheelPrecision = 40;
  camera.panningSensibility = 0;
  camera.inertia = voidConfig.camera.inertia;
  camera.lowerBetaLimit = 0.5;
  camera.upperBetaLimit = Math.PI - 0.5;

  // ========== GRID ==========

  createGrid(scene);

  // ========== FLOATING PARTICLES ==========

  const particles: Mesh[] = [];
  const particleData: { offset: number; speed: number }[] = [];

  const createFloatingParticles = () => {
    const { count, spread, size, color } = voidConfig.particles;

    for (let i = 0; i < count; i++) {
      const particle = MeshBuilder.CreateSphere(
        `particle${i}`,
        {
          diameter: size.min + Math.random() * (size.max - size.min),
          segments: 4,
        },
        scene,
      );

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 4 + Math.random() * spread;

      particle.position = new Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) * 0.3 - 0.5,
        r * Math.cos(phi),
      );

      const mat = new StandardMaterial(`particleMat${i}`, scene);
      mat.emissiveColor = color;
      mat.disableLighting = true;
      mat.alpha = 0.15 + Math.random() * 0.25;
      particle.material = mat;

      particles.push(particle);
      particleData.push({
        offset: Math.random() * Math.PI * 2,
        speed:
          voidConfig.particles.speed.min +
          Math.random() *
            (voidConfig.particles.speed.max - voidConfig.particles.speed.min),
      });
    }
  };

  createFloatingParticles();

  // ========== ANIMATION HELPERS ==========

  const animateCameraTo = (
    targetAlpha: number,
    targetBeta: number,
    targetRadius: number,
    targetTarget: Vector3,
    duration: number,
  ) => {
    if (currentCameraAnimation) {
      currentCameraAnimation.stop();
    }

    const frameRate = 60;
    const totalFrames = Math.round(frameRate * (duration / 1000));
    const easing = new CubicEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const animations: Animation[] = [];

    const alphaAnim = new Animation(
      "alphaAnim",
      "alpha",
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    alphaAnim.setKeys([
      { frame: 0, value: camera.alpha },
      { frame: totalFrames, value: targetAlpha },
    ]);
    alphaAnim.setEasingFunction(easing);
    animations.push(alphaAnim);

    const betaAnim = new Animation(
      "betaAnim",
      "beta",
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    betaAnim.setKeys([
      { frame: 0, value: camera.beta },
      { frame: totalFrames, value: targetBeta },
    ]);
    betaAnim.setEasingFunction(easing);
    animations.push(betaAnim);

    const radiusAnim = new Animation(
      "radiusAnim",
      "radius",
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    radiusAnim.setKeys([
      { frame: 0, value: camera.radius },
      { frame: totalFrames, value: targetRadius },
    ]);
    radiusAnim.setEasingFunction(easing);
    animations.push(radiusAnim);

    const targetAnim = new Animation(
      "targetAnim",
      "target",
      frameRate,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    targetAnim.setKeys([
      { frame: 0, value: camera.target.clone() },
      { frame: totalFrames, value: targetTarget },
    ]);
    targetAnim.setEasingFunction(easing);
    animations.push(targetAnim);

    currentCameraAnimation = scene.beginDirectAnimation(
      camera,
      animations,
      0,
      totalFrames,
      false,
    );
  };

  /**
   * Dim/undim portals for focus effect
   */
  const setPortalFocus = (focusedId: string | null) => {
    const duration = voidConfig.transitions.portalDimDuration;
    const frameRate = 60;
    const totalFrames = Math.round(frameRate * (duration / 1000));

    portalMeshes.forEach((_mesh, id) => {
      const mat = portalMaterials.get(id);
      if (!mat) return;

      const exp = experiences.find((e) => e.id === id);
      if (!exp) return;

      const isFocused = focusedId === null || focusedId === id;
      const targetEmissive = isFocused
        ? exp.emissiveColor
        : exp.emissiveColor.scale(0.2);
      const targetAlpha = isFocused ? 1 : voidConfig.portal.dimmedAlpha;

      const emissiveAnim = new Animation(
        "emissive",
        "emissiveColor",
        frameRate,
        Animation.ANIMATIONTYPE_COLOR3,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      emissiveAnim.setKeys([
        { frame: 0, value: mat.emissiveColor.clone() },
        { frame: totalFrames, value: targetEmissive },
      ]);

      const alphaAnim = new Animation(
        "alpha",
        "alpha",
        frameRate,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      alphaAnim.setKeys([
        { frame: 0, value: mat.alpha },
        { frame: totalFrames, value: targetAlpha },
      ]);

      scene.beginDirectAnimation(
        mat,
        [emissiveAnim, alphaAnim],
        0,
        totalFrames,
        false,
      );
    });
  };

  // ========== HOVER HANDLERS ==========

  const handleHoverOn = (exp: Experience, portal: Mesh) => {
    // Cancel any pending unhover
    if (unhoverTimeout) {
      clearTimeout(unhoverTimeout);
      unhoverTimeout = null;
    }

    // If already hovering this one, do nothing
    if (hoveredExperience?.id === exp.id) return;

    hoveredExperience = exp;
    callbacks.onExperienceHover(exp);

    // Highlight this portal
    highlightLayer.addMesh(portal, exp.color);

    // Dim others
    setPortalFocus(exp.id);

    // Scale up
    const targetScale = voidConfig.portal.hoverScale;
    const scaleAnim = new Animation(
      "scaleUp",
      "scaling",
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    scaleAnim.setKeys([
      { frame: 0, value: portal.scaling.clone() },
      { frame: 10, value: new Vector3(targetScale, targetScale, targetScale) },
    ]);
    const easing = new CubicEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
    scaleAnim.setEasingFunction(easing);
    scene.beginDirectAnimation(portal, [scaleAnim], 0, 10, false);

    // Move camera to focus on this portal
    const targetAlpha = Math.atan2(exp.position.x, 1) + Math.PI / 2;
    const targetBeta = Math.PI / 2 - exp.position.y * 0.15;
    animateCameraTo(
      targetAlpha,
      Math.max(0.6, Math.min(targetBeta, 2.4)),
      voidConfig.camera.focusRadius,
      exp.position.clone(),
      voidConfig.transitions.cameraFocusDuration,
    );

    // Move focus light
    focusLight.position = exp.position.add(new Vector3(0, 1, -2));
  };

  const handleHoverOff = (exp: Experience, portal: Mesh) => {
    // Don't unhover if we're not currently hovering this one
    if (hoveredExperience?.id !== exp.id) return;

    // Delay the unhover to make it "sticky"
    if (unhoverTimeout) {
      clearTimeout(unhoverTimeout);
    }

    unhoverTimeout = setTimeout(() => {
      // Double-check we're still supposed to unhover
      if (hoveredExperience?.id !== exp.id) return;

      hoveredExperience = null;
      callbacks.onExperienceHover(null);

      // Remove highlight
      highlightLayer.removeMesh(portal);

      // Restore all portals
      setPortalFocus(null);

      // Scale down
      const scaleAnim = new Animation(
        "scaleDown",
        "scaling",
        60,
        Animation.ANIMATIONTYPE_VECTOR3,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      scaleAnim.setKeys([
        { frame: 0, value: portal.scaling.clone() },
        { frame: 10, value: new Vector3(1, 1, 1) },
      ]);
      scene.beginDirectAnimation(portal, [scaleAnim], 0, 10, false);

      // Reset camera
      animateCameraTo(
        Math.PI / 2,
        Math.PI / 2.2,
        voidConfig.camera.defaultRadius,
        Vector3.Zero(),
        voidConfig.transitions.cameraResetDuration,
      );

      // Reset focus light
      focusLight.position = new Vector3(0, 2, -3);

      unhoverTimeout = null;
    }, voidConfig.hover.unhoverDelay);
  };

  // ========== PORTALS ==========

  const createPortals = () => {
    experiences.forEach((exp) => {
      // Create the visible portal
      const portal = createPortalMesh(
        exp.portalShape,
        `portal-${exp.id}`,
        scene,
      );
      portal.position = exp.position.clone();
      portal.metadata = { experience: exp };
      portal.isPickable = false; // Hitbox handles picking

      const mat = new StandardMaterial(`portalMat-${exp.id}`, scene);
      mat.diffuseColor = exp.color;
      mat.emissiveColor = exp.emissiveColor;
      mat.specularColor = new Color3(0.6, 0.6, 0.6);
      mat.specularPower = 64;
      mat.alpha = 1;
      portal.material = mat;

      glowLayer.addIncludedOnlyMesh(portal);
      portalMeshes.set(exp.id, portal);
      portalMaterials.set(exp.id, mat);

      // Create invisible hitbox (larger, for easier hover)
      const hitbox = createHitbox(
        exp.portalShape,
        `hitbox-${exp.id}`,
        voidConfig.hover.hitboxScale,
        scene,
      );
      hitbox.position = exp.position.clone();
      hitbox.metadata = { experience: exp, isHitbox: true };
      portalHitboxes.set(exp.id, hitbox);

      // Random offsets for variety
      const rotOffsetX = Math.random() * Math.PI * 2;
      const rotOffsetY = Math.random() * Math.PI * 2;
      const baseY = exp.position.y;

      // Continuous subtle animations
      scene.registerBeforeRender(() => {
        const time = performance.now() * 0.001;

        // Slow rotation
        portal.rotation.y = time * voidConfig.portal.rotationSpeed + rotOffsetY;
        portal.rotation.x =
          time * voidConfig.portal.rotationSpeed * 0.5 + rotOffsetX;

        // Gentle floating (both portal and hitbox)
        const floatY =
          baseY +
          Math.sin(time * voidConfig.portal.floatSpeed + rotOffsetX) *
            voidConfig.portal.floatAmount;
        portal.position.y = floatY;
        hitbox.position.y = floatY;

        // Subtle pulse (only when not hovered)
        if (!hoveredExperience || hoveredExperience.id !== exp.id) {
          const pulse =
            1 +
            Math.sin(time * voidConfig.portal.pulseSpeed) *
              voidConfig.portal.pulseAmount;
          portal.scaling.setAll(pulse);
        }
      });

      // Action manager on HITBOX (not portal)
      hitbox.actionManager = new ActionManager(scene);

      // Click
      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          callbacks.onExperienceSelect(exp);
        }),
      );

      // Hover ON
      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
          handleHoverOn(exp, portal);
        }),
      );

      // Hover OFF
      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
          handleHoverOff(exp, portal);
        }),
      );
    });
  };

  createPortals();

  // ========== PARTICLE ANIMATION ==========

  scene.registerBeforeRender(() => {
    const time = performance.now();
    particles.forEach((particle, i) => {
      const data = particleData[i];
      const t = time * data.speed;
      particle.position.y += Math.sin(t + data.offset) * 0.00015;
      particle.position.x += Math.cos(t * 0.7 + data.offset) * 0.00005;
    });
  });

  // ========== RENDER ==========

  engine.runRenderLoop(() => scene.render());
  callbacks.onSceneReady();

  // ========== CONTROLS ==========

  return {
    selectHoveredExperience: () => {
      if (hoveredExperience) {
        callbacks.onExperienceSelect(hoveredExperience);
      }
    },

    resetCameraView: () => {
      // Clear any pending unhover
      if (unhoverTimeout) {
        clearTimeout(unhoverTimeout);
        unhoverTimeout = null;
      }

      if (hoveredExperience) {
        const portal = portalMeshes.get(hoveredExperience.id);
        if (portal) {
          highlightLayer.removeMesh(portal);
          // Scale back
          const scaleAnim = new Animation(
            "scaleDown",
            "scaling",
            60,
            Animation.ANIMATIONTYPE_VECTOR3,
            Animation.ANIMATIONLOOPMODE_CONSTANT,
          );
          scaleAnim.setKeys([
            { frame: 0, value: portal.scaling.clone() },
            { frame: 10, value: new Vector3(1, 1, 1) },
          ]);
          scene.beginDirectAnimation(portal, [scaleAnim], 0, 10, false);
        }
      }

      hoveredExperience = null;
      callbacks.onExperienceHover(null);
      setPortalFocus(null);
      animateCameraTo(
        Math.PI / 2,
        Math.PI / 2.2,
        voidConfig.camera.defaultRadius,
        Vector3.Zero(),
        voidConfig.transitions.cameraResetDuration,
      );
      focusLight.position = new Vector3(0, 2, -3);
    },

    dispose: () => {
      if (unhoverTimeout) {
        clearTimeout(unhoverTimeout);
      }
      if (currentCameraAnimation) {
        currentCameraAnimation.stop();
      }
      glowLayer.dispose();
      highlightLayer.dispose();
      scene.dispose();
    },
  };
};
