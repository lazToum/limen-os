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
  islandsConfig,
  themedLobbySceneConfig,
  LobbyExperience,
} from "./themes.config";

export interface IslandsSceneCallbacks {
  onExperienceHover: (experience: LobbyExperience | null) => void;
  onExperienceSelect: (experience: LobbyExperience) => void;
  onBackToVoid: () => void;
  onSceneReady: () => void;
}

export interface IslandsSceneControls {
  selectHoveredExperience: () => void;
  goBack: () => void;
  dispose: () => void;
}

const config = themedLobbySceneConfig.islands;

/**
 * Create a floating island mesh
 */
const createIsland = (name: string, radius: number, scene: Scene): Mesh => {
  // Create top (grass) part
  const top = MeshBuilder.CreateCylinder(
    `${name}-top`,
    {
      diameterTop: radius * 2,
      diameterBottom: radius * 1.8,
      height: 0.4,
      tessellation: 32,
    },
    scene,
  );

  // Create rocky bottom
  const bottom = MeshBuilder.CreateCylinder(
    `${name}-bottom`,
    {
      diameterTop: radius * 1.8,
      diameterBottom: radius * 0.3,
      height: 1.5,
      tessellation: 32,
    },
    scene,
  );
  bottom.position.y = -0.95;
  bottom.parent = top;

  return top;
};

/**
 * Create a light bridge between two points
 */
const createLightBridge = (
  name: string,
  start: Vector3,
  end: Vector3,
  color: Color3,
  scene: Scene,
): Mesh[] => {
  const bridges: Mesh[] = [];
  const segments = 20;
  const direction = end.subtract(start);
  const length = direction.length();
  const step = direction.scale(1 / segments);

  for (let i = 0; i < segments; i++) {
    const pos = start.add(step.scale(i + 0.5));

    const segment = MeshBuilder.CreateBox(
      `${name}-seg${i}`,
      {
        width: config.bridgeWidth,
        height: 0.05,
        depth: (length / segments) * 1.1,
      },
      scene,
    );

    // Rotate to face direction
    segment.lookAt(end);
    segment.position = pos;

    const mat = new StandardMaterial(`${name}-segMat${i}`, scene);
    mat.emissiveColor = color.scale(0.4 + Math.sin(i * 0.5) * 0.2);
    mat.alpha = 0.6;
    mat.disableLighting = true;
    segment.material = mat;

    bridges.push(segment);
  }

  return bridges;
};

/**
 * Create the Floating Islands scene
 */
export const createIslandsScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: IslandsSceneCallbacks,
): IslandsSceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = islandsConfig.backgroundColor;

  // Add fog for mystical atmosphere
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = config.fogDensity;
  scene.fogColor = new Color3(0.1, 0.15, 0.2);

  let hoveredExperience: LobbyExperience | null = null;
  let unhoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentCameraAnimation: Animatable | null = null;

  const islands: {
    mesh: Mesh;
    hitbox: Mesh;
    experience: LobbyExperience;
    baseY: number;
    floatOffset: number;
    portal: Mesh;
  }[] = [];

  // ========== LIGHTING ==========

  const ambientLight = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.4;
  ambientLight.diffuse = islandsConfig.ambientColor;
  ambientLight.groundColor = new Color3(0.05, 0.08, 0.1);

  // Aurora-like top light
  const auroraLight = new HemisphericLight(
    "aurora",
    new Vector3(0, -1, 0),
    scene,
  );
  auroraLight.intensity = 0.3;
  auroraLight.diffuse = islandsConfig.accentColor;

  // ========== GLOW & HIGHLIGHT ==========

  const glowLayer = new GlowLayer("glow", scene, {
    blurKernelSize: 64,
    mainTextureFixedSize: 512,
  });
  glowLayer.intensity = 0.8;

  const highlightLayer = new HighlightLayer("highlight", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = true;
  highlightLayer.blurHorizontalSize = 1.5;
  highlightLayer.blurVerticalSize = 1.5;

  // ========== CAMERA ==========

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 2,
    Math.PI / 3,
    18,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 30;
  camera.wheelPrecision = 40;
  camera.panningSensibility = 0;
  camera.inertia = 0.9;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = Math.PI / 2 + 0.2;

  // ========== AURORA EFFECT ==========

  const createAurora = () => {
    for (let i = 0; i < 5; i++) {
      const aurora = MeshBuilder.CreatePlane(
        `aurora${i}`,
        {
          width: 40,
          height: 8,
        },
        scene,
      );
      aurora.position = new Vector3(
        (Math.random() - 0.5) * 30,
        15 + Math.random() * 5,
        (Math.random() - 0.5) * 30,
      );
      aurora.rotation.x = Math.PI / 2;
      aurora.rotation.z = Math.random() * Math.PI;

      const auroraMat = new StandardMaterial(`auroraMat${i}`, scene);
      auroraMat.emissiveColor =
        i % 2 === 0
          ? islandsConfig.accentColor.scale(0.15)
          : islandsConfig.secondaryColor.scale(0.1);
      auroraMat.alpha = 0.15;
      auroraMat.disableLighting = true;
      auroraMat.backFaceCulling = false;
      aurora.material = auroraMat;

      // Gentle wave animation
      const offset = Math.random() * Math.PI * 2;
      scene.registerBeforeRender(() => {
        const t = performance.now() * 0.0003;
        aurora.position.y = 15 + Math.sin(t + offset) * 2;
        auroraMat.alpha = 0.1 + Math.sin(t * 2 + offset) * 0.05;
      });
    }
  };

  createAurora();

  // ========== CENTRAL ISLAND ==========

  const centralIsland = createIsland("central", 3, scene);
  centralIsland.position.y = 0;

  const centralTopMat = new StandardMaterial("centralTopMat", scene);
  centralTopMat.diffuseColor = new Color3(0.2, 0.4, 0.3);
  centralIsland.material = centralTopMat;

  const centralBottom = centralIsland.getChildren()[0] as Mesh;
  const centralBottomMat = new StandardMaterial("centralBottomMat", scene);
  centralBottomMat.diffuseColor = new Color3(0.25, 0.2, 0.18);
  centralBottom.material = centralBottomMat;

  // Central platform glow ring
  const centralRing = MeshBuilder.CreateTorus(
    "centralRing",
    {
      diameter: 5,
      thickness: 0.1,
      tessellation: 64,
    },
    scene,
  );
  centralRing.position.y = 0.2;

  const centralRingMat = new StandardMaterial("centralRingMat", scene);
  centralRingMat.emissiveColor = islandsConfig.accentColor.scale(0.5);
  centralRing.material = centralRingMat;
  glowLayer.addIncludedOnlyMesh(centralRing);

  // ========== EXPERIENCE ISLANDS ==========

  const createExperienceIslands = () => {
    const experiences = islandsConfig.experiences;
    const angleStep = (Math.PI * 2) / experiences.length;
    const orbitRadius = 10;

    experiences.forEach((exp, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const x = Math.cos(angle) * orbitRadius;
      const z = Math.sin(angle) * orbitRadius;
      const baseY = -1 + Math.random() * 2;

      // Create island
      const island = createIsland(
        `island-${exp.id}`,
        config.islandRadius,
        scene,
      );
      island.position = new Vector3(x, baseY, z);
      island.metadata = { experience: exp };

      // Island materials
      const islandColor =
        index % 2 === 0
          ? islandsConfig.accentColor
          : islandsConfig.secondaryColor;

      const topMat = new StandardMaterial(`islandTopMat-${exp.id}`, scene);
      topMat.diffuseColor = new Color3(0.15, 0.35, 0.25).add(
        islandColor.scale(0.1),
      );
      island.material = topMat;

      const bottomMat = new StandardMaterial(
        `islandBottomMat-${exp.id}`,
        scene,
      );
      bottomMat.diffuseColor = new Color3(0.22, 0.18, 0.15);
      const islandBottom = island.getChildren()[0] as Mesh;
      islandBottom.material = bottomMat;

      // Portal on the island (glowing crystal)
      const portal = MeshBuilder.CreatePolyhedron(
        `portal-${exp.id}`,
        {
          type: 1, // Octahedron
          size: 0.5,
        },
        scene,
      );
      portal.position = new Vector3(x, baseY + 1.2, z);
      portal.metadata = { experience: exp };

      const portalMat = new StandardMaterial(`portalMat-${exp.id}`, scene);
      portalMat.emissiveColor = islandColor.scale(0.6);
      portalMat.alpha = 0.9;
      portal.material = portalMat;

      glowLayer.addIncludedOnlyMesh(portal);

      // Point light at the portal
      const portalLight = new PointLight(
        `portalLight-${exp.id}`,
        portal.position.add(new Vector3(0, 0.5, 0)),
        scene,
      );
      portalLight.intensity = 0.8;
      portalLight.diffuse = islandColor;

      // Light bridge from central to this island
      const bridgeStart = new Vector3(0, 0.2, 0).add(
        new Vector3(x, 0, z).normalize().scale(2.5),
      );
      const bridgeEnd = new Vector3(x, baseY + 0.2, z).subtract(
        new Vector3(x, 0, z).normalize().scale(config.islandRadius),
      );
      createLightBridge(
        `bridge-${exp.id}`,
        bridgeStart,
        bridgeEnd,
        islandColor,
        scene,
      );

      // Hitbox
      const hitbox = MeshBuilder.CreateSphere(
        `hitbox-${exp.id}`,
        {
          diameter: config.islandRadius * 3,
          segments: 8,
        },
        scene,
      );
      hitbox.position = new Vector3(x, baseY + 0.5, z);
      hitbox.visibility = 0;
      hitbox.isPickable = true;
      hitbox.metadata = { experience: exp };

      islands.push({
        mesh: island,
        hitbox,
        experience: exp,
        baseY,
        floatOffset: Math.random() * Math.PI * 2,
        portal,
      });

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
          highlightLayer.addMesh(portal, islandColor);

          // Intensify glow
          portalMat.emissiveColor = islandColor.scale(1.0);
          portalLight.intensity = 2.0;

          // Scale up portal
          const scaleAnim = new Animation(
            "scaleUp",
            "scaling",
            60,
            Animation.ANIMATIONTYPE_VECTOR3,
            Animation.ANIMATIONLOOPMODE_CONSTANT,
          );
          scaleAnim.setKeys([
            { frame: 0, value: portal.scaling.clone() },
            { frame: 10, value: new Vector3(1.4, 1.4, 1.4) },
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

            portalMat.emissiveColor = islandColor.scale(0.6);
            portalLight.intensity = 0.8;

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

  createExperienceIslands();

  // ========== FLOATING ANIMATION ==========

  scene.registerBeforeRender(() => {
    const time = performance.now() * 0.001;

    // Float the central island gently
    centralIsland.position.y = Math.sin(time * 0.3) * 0.15;
    centralRing.position.y = 0.2 + Math.sin(time * 0.3) * 0.15;

    // Float experience islands
    islands.forEach((island) => {
      const floatY =
        island.baseY +
        Math.sin(time * config.floatSpeed + island.floatOffset) *
          config.floatAmplitude;
      island.mesh.position.y = floatY;
      island.hitbox.position.y = floatY + 0.5;
      island.portal.position.y = floatY + 1.2;

      // Rotate portal
      island.portal.rotation.y += 0.01;
    });

    // Rotate central ring
    centralRing.rotation.y += 0.002;
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
