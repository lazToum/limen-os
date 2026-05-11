import {
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
import { BaseScene } from "./BaseScene";
import { experiences, type Experience } from "./lobby/experiences.config";
import { useShellStore } from "../store/shell";
import { getApp } from "../constants/apps";

export class LobbyScene extends BaseScene {
  private highlightLayer!: HighlightLayer;
  private camera!: UniversalCamera;
  private currentCameraAnimation: Animatable | null = null;
  private portalMeshes: Map<string, Mesh> = new Map();

  async build() {
    this.scene.clearColor = new Color3(0, 0, 0) as any;

    // Highlight layer for portal glow effects
    this.highlightLayer = new HighlightLayer("hl1", this.scene);
    this.highlightLayer.innerGlow = true;
    this.highlightLayer.outerGlow = false;
    this.highlightLayer.blurHorizontalSize = 0.5;
    this.highlightLayer.blurVerticalSize = 0.5;

    // Camera setup
    this.camera = new UniversalCamera(
      "camera",
      new Vector3(0, 0, -15),
      this.scene,
    );
    this.camera.setTarget(Vector3.Zero());
    this.camera.speed = 0.5;
    this.camera.inputs.addMouseWheel();

    // Lighting
    new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

    this.createSpiralDecoration();
    this.createPortals();
  }

  activate() {
    const canvas = this.engine.getRenderingCanvas();
    if (canvas) this.camera.attachControl(canvas, true);
  }

  deactivate() {
    this.camera.detachControl();
  }

  private animateCameraTo(
    targetPosition: Vector3,
    targetTarget: Vector3,
    duration = 800,
  ) {
    if (this.currentCameraAnimation) {
      this.currentCameraAnimation.stop();
      this.currentCameraAnimation = null;
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
      { frame: 0, value: this.camera.position.clone() },
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
      { frame: 0, value: this.camera.getTarget().clone() },
      { frame: totalFrames, value: targetTarget },
    ]);

    this.currentCameraAnimation = this.scene.beginDirectAnimation(
      this.camera,
      [positionAnimation, targetAnimation],
      0,
      totalFrames,
      false,
    );
  }

  private createSpiralDecoration() {
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
      this.scene,
    );

    const spiralMat = new StandardMaterial("spiralMat", this.scene);
    spiralMat.emissiveColor = new Color3(0.1, 0.4, 0.8);
    spiral.material = spiralMat;

    // Create pulsing nodes along the spiral
    const numberOfNodes = 20;
    const nodeMaterial = new StandardMaterial("nodeMat", this.scene);
    nodeMaterial.diffuseColor = new Color3(0.8, 0.1, 0.1);
    nodeMaterial.emissiveColor = new Color3(1, 0.2, 0.2);

    for (let i = 0; i < numberOfNodes; i++) {
      const node = MeshBuilder.CreateSphere(
        "node" + String(i),
        { diameter: 0.5 },
        this.scene,
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
      this.scene.beginAnimation(node, 0, 60, true, 1.0 + i * 0.1);
    }
  }

  private createPortals() {
    experiences.forEach((exp) => {
      const portal = MeshBuilder.CreateTorus(
        "portal-" + exp.id,
        {
          diameter: 3,
          thickness: 0.75,
          tessellation: 30,
        },
        this.scene,
      );
      portal.position = exp.position;
      portal.metadata = { experience: exp };

      const portalMat = new StandardMaterial("portalMat-" + exp.id, this.scene);
      portalMat.diffuseColor = exp.color;
      portalMat.emissiveColor = exp.color.scale(0.5);
      portalMat.alpha = 0.7;
      portal.material = portalMat;

      this.portalMeshes.set(exp.id, portal);

      // Action manager for interactions
      portal.actionManager = new ActionManager(this.scene);

      // Click to select
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
          this.handleExperienceSelect(exp);
        }),
      );

      // Hover to highlight
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
          this.highlightLayer.addMesh(portal, exp.color);

          const focusPosition = exp.position.add(new Vector3(0, 0, -5));
          this.animateCameraTo(focusPosition, exp.position, 800);
        }),
      );

      // Hover out to reset
      portal.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
          this.highlightLayer.removeMesh(portal);
          this.animateCameraTo(new Vector3(0, 0, -15), Vector3.Zero(), 800);
        }),
      );
    });
  }

  private handleExperienceSelect(experience: Experience) {
    const app = getApp(experience.id);
    if (app) {
      useShellStore.getState().openWindow(app);
    }
  }
}
