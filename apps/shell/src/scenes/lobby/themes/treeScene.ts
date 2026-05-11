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
  Mesh,
  GlowLayer,
  Curve3,
} from "@babylonjs/core";
import {
  treeConfig,
  themedLobbySceneConfig,
  LobbyExperience,
} from "./themes.config";

export interface TreeSceneCallbacks {
  onExperienceHover: (experience: LobbyExperience | null) => void;
  onExperienceSelect: (experience: LobbyExperience) => void;
  onBackToVoid: () => void;
  onSceneReady: () => void;
}

export interface TreeSceneControls {
  selectHoveredExperience: () => void;
  goBack: () => void;
  dispose: () => void;
}

const config = themedLobbySceneConfig.tree;

/**
 * Create a curved branch
 */
const createBranch = (
  name: string,
  startPoint: Vector3,
  direction: Vector3,
  length: number,
  thickness: number,
  scene: Scene,
): { branch: Mesh; endPoint: Vector3 } => {
  const midPoint = startPoint
    .add(direction.scale(length * 0.5))
    .add(new Vector3(0, length * 0.3, 0));
  const endPoint = startPoint
    .add(direction.scale(length))
    .add(new Vector3(0, length * 0.1, 0));

  const curve = Curve3.CreateCatmullRomSpline(
    [startPoint, midPoint, endPoint],
    20,
  );
  const path = curve.getPoints();

  const branch = MeshBuilder.CreateTube(
    name,
    {
      path,
      radius: thickness,
      tessellation: 12,
      cap: 3,
    },
    scene,
  );

  return { branch, endPoint };
};

/**
 * Create the Tree of Experiences scene
 */
export const createTreeScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: TreeSceneCallbacks,
): TreeSceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = treeConfig.backgroundColor;

  let hoveredExperience: LobbyExperience | null = null;
  let unhoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const branches: {
    mesh: Mesh;
    hitbox: Mesh;
    experience: LobbyExperience;
    portal: Mesh;
    portalLight: PointLight;
  }[] = [];

  const fireflies: {
    mesh: Mesh;
    offset: Vector3;
    speed: number;
    phase: number;
  }[] = [];
  const fallingLeaves: { mesh: Mesh; velocity: Vector3; rotation: Vector3 }[] =
    [];

  // ========== LIGHTING ==========

  const ambientLight = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.25;
  ambientLight.diffuse = treeConfig.ambientColor;
  ambientLight.groundColor = new Color3(0.02, 0.04, 0.02);

  const rootLight = new PointLight("rootLight", new Vector3(0, -2, 0), scene);
  rootLight.intensity = 0.5;
  rootLight.diffuse = treeConfig.secondaryColor.scale(0.5);

  const treeLight = new PointLight(
    "treeLight",
    new Vector3(0, config.trunkHeight / 2, 0),
    scene,
  );
  treeLight.intensity = 1.0;
  treeLight.diffuse = treeConfig.accentColor.scale(0.6);

  // ========== GLOW & HIGHLIGHT ==========

  const glowLayer = new GlowLayer("glow", scene, {
    blurKernelSize: 64,
    mainTextureFixedSize: 512,
  });
  glowLayer.intensity = 0.9;

  const highlightLayer = new HighlightLayer("highlight", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = true;
  highlightLayer.blurHorizontalSize = 1.5;
  highlightLayer.blurVerticalSize = 1.5;

  // ========== CAMERA ==========

  const camera = new ArcRotateCamera(
    "camera",
    Math.PI / 4,
    Math.PI / 3,
    18,
    new Vector3(0, config.trunkHeight / 2, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 30;
  camera.wheelPrecision = 40;
  camera.panningSensibility = 0;
  camera.inertia = 0.9;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = Math.PI / 2 + 0.3;

  // ========== GROUND ==========

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 40, height: 40 },
    scene,
  );
  ground.position.y = -0.5;

  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.08, 0.1, 0.06);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  // Roots spreading on ground
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const rootLength = 3 + Math.random() * 4;

    const rootPath = [
      new Vector3(0, -0.3, 0),
      new Vector3(
        Math.cos(angle) * rootLength * 0.5,
        -0.4,
        Math.sin(angle) * rootLength * 0.5,
      ),
      new Vector3(
        Math.cos(angle) * rootLength,
        -0.5,
        Math.sin(angle) * rootLength,
      ),
    ];

    const root = MeshBuilder.CreateTube(
      `root${i}`,
      {
        path: rootPath,
        radius: 0.3 - i * 0.02,
        tessellation: 8,
      },
      scene,
    );

    const rootMat = new StandardMaterial(`rootMat${i}`, scene);
    rootMat.diffuseColor = new Color3(0.25, 0.18, 0.1);
    rootMat.emissiveColor = treeConfig.secondaryColor.scale(0.05);
    root.material = rootMat;
  }

  // ========== TREE TRUNK ==========

  const trunk = MeshBuilder.CreateCylinder(
    "trunk",
    {
      diameterTop: config.trunkRadius * 0.6,
      diameterBottom: config.trunkRadius * 2,
      height: config.trunkHeight,
      tessellation: 24,
    },
    scene,
  );
  trunk.position.y = config.trunkHeight / 2 - 0.5;

  const trunkMat = new StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = new Color3(0.3, 0.22, 0.12);
  trunkMat.specularColor = new Color3(0.1, 0.08, 0.05);
  trunk.material = trunkMat;

  // Glowing veins on trunk
  for (let i = 0; i < 5; i++) {
    const veinAngle = (i / 5) * Math.PI * 2;
    const vein = MeshBuilder.CreateBox(
      `vein${i}`,
      {
        width: 0.08,
        height: config.trunkHeight * 0.8,
        depth: 0.08,
      },
      scene,
    );
    vein.position = new Vector3(
      Math.cos(veinAngle) * config.trunkRadius * 0.9,
      config.trunkHeight / 2,
      Math.sin(veinAngle) * config.trunkRadius * 0.9,
    );

    const veinMat = new StandardMaterial(`veinMat${i}`, scene);
    veinMat.emissiveColor = treeConfig.accentColor.scale(0.3);
    vein.material = veinMat;
    glowLayer.addIncludedOnlyMesh(vein);
  }

  // ========== BRANCHES WITH PORTALS ==========

  const experiences = treeConfig.experiences;
  const branchStartY = config.trunkHeight * 0.6;

  experiences.forEach((exp, index) => {
    const angle = (index / experiences.length) * Math.PI * 2 + Math.PI / 4;
    const elevationAngle = 0.3 + (index % 2) * 0.2;

    const direction = new Vector3(
      Math.cos(angle),
      elevationAngle,
      Math.sin(angle),
    ).normalize();

    const startPoint = new Vector3(
      Math.cos(angle) * config.trunkRadius * 0.5,
      branchStartY + index * 0.8,
      Math.sin(angle) * config.trunkRadius * 0.5,
    );

    const { branch, endPoint } = createBranch(
      `branch-${exp.id}`,
      startPoint,
      direction,
      config.branchLength,
      0.25 - index * 0.03,
      scene,
    );

    const branchMat = new StandardMaterial(`branchMat-${exp.id}`, scene);
    branchMat.diffuseColor = new Color3(0.28, 0.2, 0.1);
    branch.material = branchMat;

    const portalColor =
      index % 2 === 0 ? treeConfig.accentColor : treeConfig.secondaryColor;

    const portal = MeshBuilder.CreateSphere(
      `portal-${exp.id}`,
      {
        diameter: 0.8,
        segments: 16,
      },
      scene,
    );
    portal.position = endPoint;
    portal.metadata = { experience: exp };

    const portalMat = new StandardMaterial(`portalMat-${exp.id}`, scene);
    portalMat.emissiveColor = portalColor.scale(0.7);
    portalMat.alpha = 0.9;
    portal.material = portalMat;

    glowLayer.addIncludedOnlyMesh(portal);

    // Small leaves around the portal
    for (let l = 0; l < 6; l++) {
      const leafAngle = (l / 6) * Math.PI * 2;
      const leaf = MeshBuilder.CreateDisc(
        `leaf-${exp.id}-${l}`,
        {
          radius: 0.3,
          tessellation: 6,
        },
        scene,
      );
      leaf.position = endPoint.add(
        new Vector3(Math.cos(leafAngle) * 0.6, 0.2, Math.sin(leafAngle) * 0.6),
      );
      leaf.rotation = new Vector3(Math.random() * 0.5, leafAngle, Math.PI / 4);

      const leafMat = new StandardMaterial(`leafMat-${exp.id}-${l}`, scene);
      leafMat.diffuseColor = treeConfig.accentColor.scale(0.4);
      leafMat.emissiveColor = treeConfig.accentColor.scale(0.1);
      leafMat.backFaceCulling = false;
      leaf.material = leafMat;
    }

    const portalLight = new PointLight(
      `portalLight-${exp.id}`,
      endPoint,
      scene,
    );
    portalLight.intensity = 0.6;
    portalLight.diffuse = portalColor;

    const hitbox = MeshBuilder.CreateSphere(
      `hitbox-${exp.id}`,
      {
        diameter: 2,
        segments: 8,
      },
      scene,
    );
    hitbox.position = endPoint;
    hitbox.visibility = 0;
    hitbox.isPickable = true;
    hitbox.metadata = { experience: exp };

    branches.push({
      mesh: branch,
      hitbox,
      experience: exp,
      portal,
      portalLight,
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
        highlightLayer.addMesh(portal, portalColor);

        portalMat.emissiveColor = portalColor;
        portalLight.intensity = 1.5;

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

          portalMat.emissiveColor = portalColor.scale(0.7);
          portalLight.intensity = 0.6;

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

  // ========== FIREFLIES ==========

  for (let i = 0; i < config.fireflyCount; i++) {
    const firefly = MeshBuilder.CreateSphere(
      `firefly${i}`,
      {
        diameter: 0.08,
        segments: 4,
      },
      scene,
    );

    const startPos = new Vector3(
      (Math.random() - 0.5) * 15,
      Math.random() * config.trunkHeight + 1,
      (Math.random() - 0.5) * 15,
    );
    firefly.position = startPos;

    const fireflyMat = new StandardMaterial(`fireflyMat${i}`, scene);
    fireflyMat.emissiveColor = treeConfig.accentColor.scale(0.8);
    fireflyMat.disableLighting = true;
    firefly.material = fireflyMat;

    glowLayer.addIncludedOnlyMesh(firefly);

    fireflies.push({
      mesh: firefly,
      offset: startPos,
      speed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ========== FALLING LEAVES ==========

  for (let i = 0; i < config.leafParticles; i++) {
    const leaf = MeshBuilder.CreateDisc(
      `fallingLeaf${i}`,
      {
        radius: 0.1 + Math.random() * 0.1,
        tessellation: 5,
      },
      scene,
    );

    leaf.position = new Vector3(
      (Math.random() - 0.5) * 12,
      config.trunkHeight + Math.random() * 3,
      (Math.random() - 0.5) * 12,
    );

    const leafMat = new StandardMaterial(`fallingLeafMat${i}`, scene);
    leafMat.diffuseColor = treeConfig.accentColor.scale(
      0.3 + Math.random() * 0.3,
    );
    leafMat.emissiveColor = treeConfig.accentColor.scale(0.05);
    leafMat.backFaceCulling = false;
    leafMat.alpha = 0.8;
    leaf.material = leafMat;

    fallingLeaves.push({
      mesh: leaf,
      velocity: new Vector3(
        (Math.random() - 0.5) * 0.01,
        -0.005 - Math.random() * 0.01,
        (Math.random() - 0.5) * 0.01,
      ),
      rotation: new Vector3(
        Math.random() * 0.02,
        Math.random() * 0.02,
        Math.random() * 0.02,
      ),
    });
  }

  // ========== ANIMATION LOOP ==========

  scene.registerBeforeRender(() => {
    const time = performance.now() * 0.001;

    // Animate fireflies
    fireflies.forEach((ff) => {
      const t = time * ff.speed;
      ff.mesh.position.x = ff.offset.x + Math.sin(t + ff.phase) * 2;
      ff.mesh.position.y = ff.offset.y + Math.sin(t * 0.7 + ff.phase) * 1;
      ff.mesh.position.z = ff.offset.z + Math.cos(t * 0.8 + ff.phase) * 2;

      const mat = ff.mesh.material as StandardMaterial;
      mat.alpha = 0.5 + Math.sin(t * 5 + ff.phase) * 0.3;
    });

    // Animate falling leaves
    fallingLeaves.forEach((leaf) => {
      leaf.mesh.position.addInPlace(leaf.velocity);
      leaf.mesh.rotation.addInPlace(leaf.rotation);

      leaf.velocity.x += (Math.random() - 0.5) * 0.001;
      leaf.velocity.z += (Math.random() - 0.5) * 0.001;

      if (leaf.mesh.position.y < -1) {
        leaf.mesh.position.y = config.trunkHeight + 2;
        leaf.mesh.position.x = (Math.random() - 0.5) * 12;
        leaf.mesh.position.z = (Math.random() - 0.5) * 12;
      }
    });

    // Pulse portal glow
    branches.forEach((branch, i) => {
      if (!hoveredExperience || hoveredExperience.id !== branch.experience.id) {
        const pulse = 0.6 + Math.sin(time * 2 + i) * 0.1;
        const mat = branch.portal.material as StandardMaterial;
        const baseColor =
          i % 2 === 0 ? treeConfig.accentColor : treeConfig.secondaryColor;
        mat.emissiveColor = baseColor.scale(pulse);
      }
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

    goBack: () => {
      callbacks.onBackToVoid();
    },

    dispose: () => {
      if (unhoverTimeout) clearTimeout(unhoverTimeout);
      glowLayer.dispose();
      highlightLayer.dispose();
      scene.dispose();
    },
  };
};
