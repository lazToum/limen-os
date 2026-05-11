import {
  Engine,
  Scene,
  UniversalCamera,
  Vector3,
  HemisphericLight,
  SpotLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ActionManager,
  ExecuteCodeAction,
  HighlightLayer,
  Mesh,
  GlowLayer,
} from "@babylonjs/core";
import {
  galleryConfig,
  themedLobbySceneConfig,
  LobbyExperience,
} from "./themes.config";

export interface GallerySceneCallbacks {
  onExperienceHover: (experience: LobbyExperience | null) => void;
  onExperienceSelect: (experience: LobbyExperience) => void;
  onBackToVoid: () => void;
  onSceneReady: () => void;
}

export interface GallerySceneControls {
  selectHoveredExperience: () => void;
  goBack: () => void;
  dispose: () => void;
}

const config = themedLobbySceneConfig.gallery;

/**
 * Create the Gallery Hall scene
 */
export const createGalleryScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: GallerySceneCallbacks,
): GallerySceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = galleryConfig.backgroundColor;

  let hoveredExperience: LobbyExperience | null = null;
  let unhoverTimeout: ReturnType<typeof setTimeout> | null = null;

  const archways: {
    mesh: Mesh;
    hitbox: Mesh;
    experience: LobbyExperience;
    spotlight: SpotLight;
  }[] = [];

  // ========== LIGHTING ==========

  const ambientLight = new HemisphericLight(
    "ambient",
    new Vector3(0, 1, 0),
    scene,
  );
  ambientLight.intensity = 0.4;
  ambientLight.diffuse = galleryConfig.ambientColor;
  ambientLight.groundColor = new Color3(0.15, 0.12, 0.1);

  // ========== GLOW & HIGHLIGHT ==========

  const glowLayer = new GlowLayer("glow", scene, {
    blurKernelSize: 32,
    mainTextureFixedSize: 512,
  });
  glowLayer.intensity = 0.6;

  const highlightLayer = new HighlightLayer("highlight", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = true;
  highlightLayer.blurHorizontalSize = 1.2;
  highlightLayer.blurVerticalSize = 1.2;

  // ========== CAMERA ==========

  const camera = new UniversalCamera(
    "camera",
    new Vector3(0, 2, -config.hallLength / 2 + 3),
    scene,
  );
  camera.setTarget(new Vector3(0, 2, 0));
  camera.attachControl(canvas, true);
  camera.speed = config.walkSpeed;
  camera.inertia = 0.8;

  // Limit movement to the hall
  camera.keysUp = [87, 38]; // W, Up
  camera.keysDown = [83, 40]; // S, Down
  camera.keysLeft = [65, 37]; // A, Left
  camera.keysRight = [68, 39]; // D, Right

  // ========== FLOOR ==========

  const floor = MeshBuilder.CreateGround(
    "floor",
    {
      width: config.hallWidth,
      height: config.hallLength,
    },
    scene,
  );

  const floorMat = new StandardMaterial("floorMat", scene);
  floorMat.diffuseColor = new Color3(0.18, 0.15, 0.14);
  floorMat.specularColor = new Color3(0.2, 0.18, 0.15);
  floorMat.specularPower = 32;
  floor.material = floorMat;

  // Floor accent lines
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const line = MeshBuilder.CreateBox(
      `floorLine${i}`,
      {
        width: 0.05,
        height: 0.01,
        depth: config.hallLength - 2,
      },
      scene,
    );
    line.position = new Vector3(i * 1.5, 0.005, 0);

    const lineMat = new StandardMaterial(`floorLineMat${i}`, scene);
    lineMat.emissiveColor = galleryConfig.accentColor.scale(0.2);
    line.material = lineMat;
  }

  // ========== WALLS ==========

  const createWall = (side: "left" | "right") => {
    const xPos = side === "left" ? -config.hallWidth / 2 : config.hallWidth / 2;

    const wall = MeshBuilder.CreateBox(
      `wall-${side}`,
      {
        width: 0.3,
        height: config.hallHeight,
        depth: config.hallLength,
      },
      scene,
    );
    wall.position = new Vector3(xPos, config.hallHeight / 2, 0);

    const wallMat = new StandardMaterial(`wallMat-${side}`, scene);
    wallMat.diffuseColor = galleryConfig.secondaryColor.scale(0.3);
    wallMat.specularColor = new Color3(0.1, 0.1, 0.1);
    wall.material = wallMat;
  };

  createWall("left");
  createWall("right");

  // ========== CEILING ==========

  const ceiling = MeshBuilder.CreateBox(
    "ceiling",
    {
      width: config.hallWidth,
      height: 0.2,
      depth: config.hallLength,
    },
    scene,
  );
  ceiling.position.y = config.hallHeight;

  const ceilingMat = new StandardMaterial("ceilingMat", scene);
  ceilingMat.diffuseColor = new Color3(0.12, 0.1, 0.08);
  ceiling.material = ceilingMat;

  // ========== PILLARS ==========

  const createPillars = () => {
    const pillarPositions: number[] = [];
    for (
      let z = -config.hallLength / 2 + 2;
      z < config.hallLength / 2;
      z += config.archSpacing
    ) {
      pillarPositions.push(z);
    }

    pillarPositions.forEach((z, index) => {
      ["left", "right"].forEach((side) => {
        const xPos =
          side === "left"
            ? -config.hallWidth / 2 + 0.8
            : config.hallWidth / 2 - 0.8;

        // Pillar base
        const base = MeshBuilder.CreateCylinder(
          `pillarBase-${side}-${index}`,
          {
            diameter: 0.8,
            height: 0.3,
            tessellation: 24,
          },
          scene,
        );
        base.position = new Vector3(xPos, 0.15, z);

        // Pillar shaft
        const shaft = MeshBuilder.CreateCylinder(
          `pillarShaft-${side}-${index}`,
          {
            diameter: 0.5,
            height: config.hallHeight - 1,
            tessellation: 24,
          },
          scene,
        );
        shaft.position = new Vector3(xPos, config.hallHeight / 2, z);

        // Pillar capital
        const capital = MeshBuilder.CreateCylinder(
          `pillarCapital-${side}-${index}`,
          {
            diameterTop: 0.7,
            diameterBottom: 0.5,
            height: 0.4,
            tessellation: 24,
          },
          scene,
        );
        capital.position = new Vector3(xPos, config.hallHeight - 0.5, z);

        const pillarMat = new StandardMaterial(
          `pillarMat-${side}-${index}`,
          scene,
        );
        pillarMat.diffuseColor = galleryConfig.secondaryColor.scale(0.5);
        pillarMat.specularColor = new Color3(0.3, 0.25, 0.2);

        base.material = pillarMat;
        shaft.material = pillarMat;
        capital.material = pillarMat;
      });
    });
  };

  createPillars();

  // ========== ARCHWAYS (PORTALS) ==========

  const createArchways = () => {
    const experiences = galleryConfig.experiences;
    const positions: { z: number; side: "left" | "right" }[] = [];

    // Alternate sides
    experiences.forEach((_exp, index) => {
      const z = -config.hallLength / 2 + 5 + index * config.archSpacing;
      positions.push({ z, side: index % 2 === 0 ? "left" : "right" });
    });

    positions.forEach((pos, index) => {
      const exp = experiences[index];
      const xPos =
        pos.side === "left"
          ? -config.hallWidth / 2 + 0.3
          : config.hallWidth / 2 - 0.3;
      const xOffset = pos.side === "left" ? 0.5 : -0.5;

      // Archway frame
      const archHeight = 3.5;
      const archWidth = 2;

      // Vertical posts
      const leftPost = MeshBuilder.CreateBox(
        `archLeft-${exp.id}`,
        {
          width: 0.2,
          height: archHeight,
          depth: 0.2,
        },
        scene,
      );
      leftPost.position = new Vector3(
        xPos + xOffset - archWidth / 2,
        archHeight / 2,
        pos.z,
      );

      const rightPost = MeshBuilder.CreateBox(
        `archRight-${exp.id}`,
        {
          width: 0.2,
          height: archHeight,
          depth: 0.2,
        },
        scene,
      );
      rightPost.position = new Vector3(
        xPos + xOffset + archWidth / 2,
        archHeight / 2,
        pos.z,
      );

      // Top arch (simplified as a box for now)
      const archTop = MeshBuilder.CreateBox(
        `archTop-${exp.id}`,
        {
          width: archWidth + 0.2,
          height: 0.3,
          depth: 0.2,
        },
        scene,
      );
      archTop.position = new Vector3(xPos + xOffset, archHeight + 0.15, pos.z);

      const archMat = new StandardMaterial(`archMat-${exp.id}`, scene);
      archMat.diffuseColor = galleryConfig.accentColor;
      archMat.emissiveColor = galleryConfig.accentColor.scale(0.2);

      leftPost.material = archMat;
      rightPost.material = archMat;
      archTop.material = archMat;

      // Portal glow (the "doorway")
      const portal = MeshBuilder.CreatePlane(
        `portal-${exp.id}`,
        {
          width: archWidth - 0.3,
          height: archHeight - 0.3,
        },
        scene,
      );
      portal.position = new Vector3(xPos + xOffset, archHeight / 2, pos.z);
      portal.rotation.y = pos.side === "left" ? Math.PI / 2 : -Math.PI / 2;
      portal.metadata = { experience: exp };

      const portalMat = new StandardMaterial(`portalMat-${exp.id}`, scene);
      const portalColor =
        index % 2 === 0
          ? galleryConfig.accentColor
          : galleryConfig.secondaryColor;
      portalMat.emissiveColor = portalColor.scale(0.3);
      portalMat.alpha = 0.6;
      portalMat.disableLighting = true;
      portal.material = portalMat;

      glowLayer.addIncludedOnlyMesh(portal);

      // Spotlight for this archway
      const spotlightPos = new Vector3(
        xPos + xOffset,
        config.hallHeight - 0.5,
        pos.z,
      );
      const spotlight = new SpotLight(
        `spotlight-${exp.id}`,
        spotlightPos,
        new Vector3(0, -1, 0),
        Math.PI / 4,
        2,
        scene,
      );
      spotlight.intensity = 0.8;
      spotlight.diffuse = portalColor;

      // Hitbox
      const hitbox = MeshBuilder.CreateBox(
        `hitbox-${exp.id}`,
        {
          width: archWidth,
          height: archHeight,
          depth: 1.5,
        },
        scene,
      );
      hitbox.position = new Vector3(xPos + xOffset, archHeight / 2, pos.z);
      hitbox.visibility = 0;
      hitbox.isPickable = true;
      hitbox.metadata = { experience: exp };

      archways.push({ mesh: portal, hitbox, experience: exp, spotlight });

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

          // Brighten spotlight
          spotlight.intensity = 2.0;

          // Intensify portal glow
          portalMat.emissiveColor = portalColor.scale(0.6);
          portalMat.alpha = 0.8;
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

            spotlight.intensity = 0.8;
            portalMat.emissiveColor = portalColor.scale(0.3);
            portalMat.alpha = 0.6;
          }, 200);
        }),
      );
    });
  };

  createArchways();

  // ========== BOUNDARY CONSTRAINTS ==========

  scene.registerBeforeRender(() => {
    // Keep camera within hall bounds
    const margin = 1.5;
    camera.position.x = Math.max(
      -config.hallWidth / 2 + margin,
      Math.min(config.hallWidth / 2 - margin, camera.position.x),
    );
    camera.position.z = Math.max(
      -config.hallLength / 2 + margin,
      Math.min(config.hallLength / 2 - margin, camera.position.z),
    );
    camera.position.y = 2; // Lock Y position
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
