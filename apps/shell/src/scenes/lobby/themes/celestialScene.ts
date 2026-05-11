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
  Animation,
  ActionManager,
  ExecuteCodeAction,
  HighlightLayer,
  Animatable,
  Mesh,
  GlowLayer,
} from "@babylonjs/core";
import {
  celestialConfig,
  themedLobbySceneConfig,
  LobbyExperience,
} from "./themes.config";

export interface CelestialSceneCallbacks {
  onExperienceHover: (experience: LobbyExperience | null) => void;
  onExperienceSelect: (experience: LobbyExperience) => void;
  onBackToVoid: () => void;
  onSceneReady: () => void;
}

export interface CelestialSceneControls {
  selectHoveredExperience: () => void;
  goBack: () => void;
  dispose: () => void;
}

const config = themedLobbySceneConfig.celestial;

/**
 * Create the Celestial Observatory scene
 */
export const createCelestialScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: CelestialSceneCallbacks,
): CelestialSceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = celestialConfig.backgroundColor;

  let hoveredExperience: LobbyExperience | null = null;
  let unhoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentCameraAnimation: Animatable | null = null;

  const orbitingPortals: {
    mesh: Mesh;
    hitbox: Mesh;
    experience: LobbyExperience;
    angle: number;
  }[] = [];

  // ========== LIGHTING ==========

  const ambientLight = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.3;
  ambientLight.diffuse = celestialConfig.ambientColor;
  ambientLight.groundColor = new Color3(0.05, 0.05, 0.1);

  // Central warm light (like a sun)
  const centralLight = new PointLight("central", new Vector3(0, 2, 0), scene);
  centralLight.intensity = 1.5;
  centralLight.diffuse = celestialConfig.secondaryColor;

  // Accent lights
  const accentLight1 = new PointLight("accent1", new Vector3(5, 3, 5), scene);
  accentLight1.intensity = 0.4;
  accentLight1.diffuse = celestialConfig.accentColor;

  const accentLight2 = new PointLight("accent2", new Vector3(-5, 3, -5), scene);
  accentLight2.intensity = 0.4;
  accentLight2.diffuse = celestialConfig.accentColor;

  // ========== GLOW & HIGHLIGHT ==========

  const glowLayer = new GlowLayer("glow", scene, {
    blurKernelSize: 64,
    mainTextureFixedSize: 512,
  });
  glowLayer.intensity = 1.0;

  const highlightLayer = new HighlightLayer("highlight", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = true;
  highlightLayer.blurHorizontalSize = 1.5;
  highlightLayer.blurVerticalSize = 1.5;

  // ========== CAMERA ==========

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 2,
    Math.PI / 3, // Looking down at an angle
    14,
    new Vector3(0, 1, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 25;
  camera.wheelPrecision = 40;
  camera.panningSensibility = 0;
  camera.inertia = 0.9;
  camera.lowerBetaLimit = 0.3;
  camera.upperBetaLimit = Math.PI / 2 + 0.3;

  // ========== STARFIELD ==========

  const createStarfield = () => {
    for (let i = 0; i < config.starCount; i++) {
      const star = MeshBuilder.CreateSphere(
        `star${i}`,
        {
          diameter: 0.02 + Math.random() * 0.06,
          segments: 4,
        },
        scene,
      );

      // Distribute on a large sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40 + Math.random() * 20;

      star.position = new Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );

      const mat = new StandardMaterial(`starMat${i}`, scene);
      const brightness = 0.5 + Math.random() * 0.5;
      mat.emissiveColor = new Color3(brightness, brightness, brightness * 0.9);
      mat.disableLighting = true;
      star.material = mat;

      // Twinkle animation
      if (Math.random() > 0.7) {
        const twinkleOffset = Math.random() * Math.PI * 2;
        const twinkleSpeed = 1 + Math.random() * 2;
        scene.registerBeforeRender(() => {
          const t = performance.now() * 0.001 * twinkleSpeed;
          mat.alpha = 0.5 + Math.sin(t + twinkleOffset) * 0.3;
        });
      }
    }
  };

  createStarfield();

  // ========== NEBULA CLOUDS ==========

  const createNebula = () => {
    // Create subtle nebula using particle systems
    for (let i = 0; i < config.nebulaCount; i++) {
      const nebulaPos = new Vector3(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 15 + 5,
        (Math.random() - 0.5) * 30,
      );

      const nebula = MeshBuilder.CreateSphere(
        `nebula${i}`,
        { diameter: 8 + Math.random() * 6 },
        scene,
      );
      nebula.position = nebulaPos;

      const nebulaMat = new StandardMaterial(`nebulaMat${i}`, scene);
      nebulaMat.emissiveColor =
        i % 2 === 0
          ? celestialConfig.accentColor.scale(0.15)
          : celestialConfig.secondaryColor.scale(0.1);
      nebulaMat.alpha = 0.08;
      nebulaMat.disableLighting = true;
      nebula.material = nebulaMat;
    }
  };

  createNebula();

  // ========== CENTRAL PLATFORM ==========

  const platform = MeshBuilder.CreateCylinder(
    "platform",
    {
      diameter: config.platformRadius * 2,
      height: 0.3,
      tessellation: 64,
    },
    scene,
  );
  platform.position.y = -0.15;

  const platformMat = new StandardMaterial("platformMat", scene);
  platformMat.diffuseColor = new Color3(0.1, 0.1, 0.15);
  platformMat.emissiveColor = celestialConfig.accentColor.scale(0.1);
  platformMat.specularColor = new Color3(0.3, 0.3, 0.4);
  platform.material = platformMat;

  // Platform ring
  const platformRing = MeshBuilder.CreateTorus(
    "platformRing",
    {
      diameter: config.platformRadius * 2 + 0.5,
      thickness: 0.1,
      tessellation: 64,
    },
    scene,
  );
  platformRing.position.y = 0;

  const ringMat = new StandardMaterial("ringMat", scene);
  ringMat.emissiveColor = celestialConfig.accentColor.scale(0.5);
  ringMat.disableLighting = true;
  platformRing.material = ringMat;
  glowLayer.addIncludedOnlyMesh(platformRing);

  // ========== ORBITING PORTALS ==========

  const createOrbitingPortals = () => {
    const experiences = celestialConfig.experiences;
    const angleStep = (Math.PI * 2) / experiences.length;

    experiences.forEach((exp, index) => {
      const angle = index * angleStep;

      // Create portal as a glowing sphere with rings (planet-like)
      const portal = MeshBuilder.CreateSphere(
        `portal-${exp.id}`,
        {
          diameter: 1.2,
          segments: 32,
        },
        scene,
      );

      const portalMat = new StandardMaterial(`portalMat-${exp.id}`, scene);
      // Alternate colors between accent and secondary
      const baseColor =
        index % 2 === 0
          ? celestialConfig.accentColor
          : celestialConfig.secondaryColor;
      portalMat.diffuseColor = baseColor;
      portalMat.emissiveColor = baseColor.scale(0.4);
      portalMat.specularColor = new Color3(0.5, 0.5, 0.6);
      portal.material = portalMat;
      portal.metadata = { experience: exp };

      // Orbital ring around the portal
      const orbitalRing = MeshBuilder.CreateTorus(
        `ring-${exp.id}`,
        {
          diameter: 2,
          thickness: 0.05,
          tessellation: 32,
        },
        scene,
      );
      orbitalRing.parent = portal;
      orbitalRing.rotation.x = Math.PI / 2;

      const orbitalRingMat = new StandardMaterial(
        `orbitalRingMat-${exp.id}`,
        scene,
      );
      orbitalRingMat.emissiveColor = baseColor.scale(0.3);
      orbitalRingMat.disableLighting = true;
      orbitalRingMat.alpha = 0.6;
      orbitalRing.material = orbitalRingMat;

      glowLayer.addIncludedOnlyMesh(portal);

      // Hitbox
      const hitbox = MeshBuilder.CreateSphere(
        `hitbox-${exp.id}`,
        {
          diameter: 2.5,
          segments: 8,
        },
        scene,
      );
      hitbox.visibility = 0;
      hitbox.isPickable = true;
      hitbox.metadata = { experience: exp };

      // Initial position
      const x = Math.cos(angle) * config.orbitRadius;
      const z = Math.sin(angle) * config.orbitRadius;
      portal.position = new Vector3(x, 1.5, z);
      hitbox.position = portal.position.clone();

      orbitingPortals.push({ mesh: portal, hitbox, experience: exp, angle });

      // Actions
      hitbox.actionManager = new ActionManager(scene);

      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          callbacks.onExperienceSelect(exp);
        }),
      );

      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
          if (unhoverTimeout) {
            clearTimeout(unhoverTimeout);
            unhoverTimeout = null;
          }
          if (hoveredExperience?.id === exp.id) return;

          hoveredExperience = exp;
          callbacks.onExperienceHover(exp);
          highlightLayer.addMesh(portal, baseColor);

          // Scale up
          const scaleAnim = new Animation(
            "scaleUp",
            "scaling",
            60,
            Animation.ANIMATIONTYPE_VECTOR3,
            Animation.ANIMATIONLOOPMODE_CONSTANT,
          );
          scaleAnim.setKeys([
            { frame: 0, value: portal.scaling.clone() },
            { frame: 10, value: new Vector3(1.3, 1.3, 1.3) },
          ]);
          scene.beginDirectAnimation(portal, [scaleAnim], 0, 10, false);
        }),
      );

      hitbox.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
          if (hoveredExperience?.id !== exp.id) return;

          unhoverTimeout = setTimeout(() => {
            if (hoveredExperience?.id !== exp.id) return;

            hoveredExperience = null;
            callbacks.onExperienceHover(null);
            highlightLayer.removeMesh(portal);

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
          }, 200);
        }),
      );
    });
  };

  createOrbitingPortals();

  // ========== ORBIT ANIMATION ==========

  scene.registerBeforeRender(() => {
    const time = performance.now();

    orbitingPortals.forEach((portal, index) => {
      // Update orbit angle
      portal.angle += config.orbitSpeed;

      // Calculate new position
      const x = Math.cos(portal.angle) * config.orbitRadius;
      const z = Math.sin(portal.angle) * config.orbitRadius;
      const y = 1.5 + Math.sin(time * 0.0005 + index) * 0.3; // Gentle vertical bob

      portal.mesh.position.set(x, y, z);
      portal.hitbox.position.set(x, y, z);

      // Rotate portal on its axis
      portal.mesh.rotation.y += 0.005;
    });

    // Slowly rotate platform ring
    platformRing.rotation.y += 0.001;
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

    goBack: () => {
      callbacks.onBackToVoid();
    },

    dispose: () => {
      if (unhoverTimeout) clearTimeout(unhoverTimeout);
      (currentCameraAnimation as Animatable | null)?.stop();
      glowLayer.dispose();
      highlightLayer.dispose();
      scene.dispose();
    },
  };
};
