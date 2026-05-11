import {
  Engine,
  Scene,
  UniversalCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Animation,
  ActionManager,
  ExecuteCodeAction,
  HighlightLayer,
  Animatable,
  Mesh,
} from "@babylonjs/core";
import { Experience, experiences } from "./experiences.config";

export interface LobbySceneCallbacks {
  onExperienceHover: (experience: Experience | null) => void;
  onExperienceSelect: (experience: Experience) => void;
  onSceneReady: () => void;
}

export interface LobbySceneControls {
  selectHoveredExperience: () => void;
  resetCameraView: () => void;
  dispose: () => void;
}

const DEFAULT_CAMERA_POSITION = new Vector3(0, 0, -15);
const DEFAULT_CAMERA_TARGET = Vector3.Zero();

export const createLobbyScene = (
  canvas: HTMLCanvasElement,
  engine: Engine,
  callbacks: LobbySceneCallbacks,
): LobbySceneControls => {
  const scene = new Scene(engine);
  scene.clearColor = new Color3(0, 0, 0) as any;

  let currentCameraAnimation: Animatable | null = null;
  let hoveredExperience: Experience | null = null;

  // Highlight layer for portal glow effects
  const highlightLayer = new HighlightLayer("hl1", scene);
  highlightLayer.innerGlow = true;
  highlightLayer.outerGlow = false;
  highlightLayer.blurHorizontalSize = 0.5;
  highlightLayer.blurVerticalSize = 0.5;

  // Camera setup
  const camera = new UniversalCamera(
    "camera",
    DEFAULT_CAMERA_POSITION.clone(),
    scene,
  );
  camera.setTarget(DEFAULT_CAMERA_TARGET.clone());
  camera.attachControl(canvas, true);
  camera.speed = 0.5;
  camera.inputs.addMouseWheel();

  // Lighting
  new HemisphericLight("light", new Vector3(0, 1, 0), scene);

  // Animation helper
  const animateCameraTo = (
    targetPosition: Vector3,
    targetTarget: Vector3,
    duration = 800,
  ) => {
    if (currentCameraAnimation) {
      currentCameraAnimation.stop();
      currentCameraAnimation = null;
    }

    const frameRate = 60;
    const totalFrames = frameRate * (duration / 1000);

    const positionAnimation = new Animation(
      "cameraPositionAnim",
      "position",
      frameRate,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    positionAnimation.setKeys([
      { frame: 0, value: camera.position.clone() },
      { frame: totalFrames, value: targetPosition },
    ]);

    const targetAnimation = new Animation(
      "cameraTargetAnim",
      "target",
      frameRate,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    targetAnimation.setKeys([
      { frame: 0, value: camera.getTarget().clone() },
      { frame: totalFrames, value: targetTarget },
    ]);

    currentCameraAnimation = scene.beginDirectAnimation(
      camera,
      [positionAnimation, targetAnimation],
      0,
      totalFrames,
      false,
    );
  };

  // Create spiral background animation
  const createSpiralDecoration = () => {
    const pathPoints: Vector3[] = [];
    const radius = 5;
    const turns = 3;
    const totalPoints = 200;

    for (let i = 0; i < totalPoints; i++) {
      const angle = (i / totalPoints) * Math.PI * 2 * turns;
      const x = radius * Math.cos(angle) * (i / totalPoints);
      const z = radius * Math.sin(angle) * (i / totalPoints);
      const y = (i / totalPoints) * 10 - 5;
      pathPoints.push(new Vector3(x, y, z));
    }

    const spiral = MeshBuilder.CreateTube(
      "spiral",
      {
        path: pathPoints,
        radius: 0.1,
        tessellation: 20,
        cap: 3,
      },
      scene,
    );

    const spiralMat = new StandardMaterial("spiralMat", scene);
    spiralMat.emissiveColor = new Color3(0.1, 0.4, 0.8);
    spiral.material = spiralMat;

    // Create pulsing nodes along the spiral
    const numberOfNodes = 20;
    const nodeMaterial = new StandardMaterial("nodeMat", scene);
    nodeMaterial.diffuseColor = new Color3(0.8, 0.1, 0.1);
    nodeMaterial.emissiveColor = new Color3(1, 0.2, 0.2);

    for (let i = 0; i < numberOfNodes; i++) {
      const node = MeshBuilder.CreateSphere(
        `node${i}`,
        { diameter: 0.5 },
        scene,
      );
      node.material = nodeMaterial;
      const pathIndex = Math.floor((i / numberOfNodes) * totalPoints);
      node.position = pathPoints[pathIndex];

      // Pulsing animation
      const scaleAnimation = new Animation(
        "scaleAnimation",
        "scaling",
        25,
        Animation.ANIMATIONTYPE_VECTOR3,
        Animation.ANIMATIONLOOPMODE_CYCLE,
      );
      scaleAnimation.setKeys([
        { frame: 0, value: new Vector3(1, 1, 1) },
        { frame: 30, value: new Vector3(1.5, 1.5, 1.5) },
        { frame: 60, value: new Vector3(1, 1, 1) },
      ]);
      node.animations.push(scaleAnimation);
      scene.beginAnimation(node, 0, 60, true, 1.0 + i * 0.1);
    }

    // Camera fly-through animation
    const cameraAnimation = new Animation(
      "cameraFlyThrough",
      "position",
      10,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );

    const keyFrames: { frame: number; value: Vector3 }[] = [];
    for (let i = 0; i < totalPoints; i++) {
      keyFrames.push({
        frame: i * 8,
        value: pathPoints[totalPoints - 1 - i].add(new Vector3(0, 0, -2)),
      });
    }
    for (let i = 0; i < totalPoints; i++) {
      keyFrames.push({
        frame: (totalPoints + i) * 4,
        value: pathPoints[i].add(new Vector3(0, 0, -2)),
      });
    }

    cameraAnimation.setKeys(keyFrames);
    camera.animations.push(cameraAnimation);
    scene.beginAnimation(
      camera,
      0,
      keyFrames[keyFrames.length - 1].frame,
      true,
    );
  };

  // Create experience portals
  const portalMeshes: Map<string, Mesh> = new Map();

  const createPortals = () => {
    experiences.forEach((exp) => {
      const portal = MeshBuilder.CreateTorus(
        `portal-${exp.id}`,
        {
          diameter: 3,
          thickness: 0.75,
          tessellation: 30,
        },
        scene,
      );
      portal.position = exp.position;
      portal.metadata = { experience: exp };

      const portalMat = new StandardMaterial(`portalMat-${exp.id}`, scene);
      portalMat.diffuseColor = exp.color;
      portalMat.emissiveColor = exp.color.scale(0.5);
      portalMat.alpha = 0.7;
      portal.material = portalMat;

      portalMeshes.set(exp.id, portal);

      // Action manager for interactions
      portal.actionManager = new ActionManager(scene);

      // Click to select
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () =>
          callbacks.onExperienceSelect(exp),
        ),
      );

      // Hover to highlight
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
          highlightLayer.addMesh(portal, exp.color);
          hoveredExperience = exp;
          callbacks.onExperienceHover(exp);

          const focusPosition = exp.position.add(new Vector3(0, 0, -5));
          animateCameraTo(focusPosition, exp.position, 800);
        }),
      );

      // Hover out to reset
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
          highlightLayer.removeMesh(portal);
          hoveredExperience = null;
          callbacks.onExperienceHover(null);
          animateCameraTo(DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, 800);
        }),
      );
    });
  };

  // Initialize scene
  createSpiralDecoration();
  createPortals();

  // Start render loop
  engine.runRenderLoop(() => scene.render());

  // Notify that scene is ready
  callbacks.onSceneReady();

  // Return controls
  return {
    selectHoveredExperience: () => {
      if (hoveredExperience) {
        callbacks.onExperienceSelect(hoveredExperience);
      }
    },
    resetCameraView: () => {
      hoveredExperience = null;
      callbacks.onExperienceHover(null);
      portalMeshes.forEach((portal) => highlightLayer.removeMesh(portal));
      animateCameraTo(DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, 800);
    },
    dispose: () => {
      if (currentCameraAnimation) {
        currentCameraAnimation.stop();
      }
      highlightLayer.dispose();
      scene.dispose();
    },
  };
};
