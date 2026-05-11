import {
  ArcRotateCamera,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointerEventTypes,
  Scene,
  Vector3,
  WebGPUEngine,
  Animation,
} from "@babylonjs/core";
import { invoke } from "@tauri-apps/api/core";
import { BaseScene } from "./BaseScene";
import { useShellStore } from "../store/shell";

interface AppEntry {
  id: string;
  name: string;
  icon: string;
  categories: string[];
  exec: string;
}

/**
 * LaunchScene — App launcher.
 *
 * Layout: 3D grid of app cards fanning out from center.
 * Each card is a thin PBR box with the app name rendered on a DynamicTexture.
 *
 * Interactions:
 *   - Click card → launch app via Tauri `launch_app` command
 *   - Voice: "Hey Limen, open terminal" → highlights + launches matching card
 *   - Keyboard: type to filter, arrow keys to navigate, Enter to launch
 *   - Escape / voice "go home" → transition back to HomeScene
 */
export class LaunchScene extends BaseScene {
  private cards: Map<string, Mesh> = new Map();
  private apps: AppEntry[] = [];
  private filterText = "";
  private selectedIndex = 0;

  constructor(engine: Engine | WebGPUEngine) {
    super(engine);
  }

  async build() {
    const scene = this.scene;
    scene.clearColor = new Color4(0.04, 0.04, 0.12, 1);

    // Overhead arc camera — user can rotate to see more cards.
    const cam = new ArcRotateCamera(
      "cam",
      -Math.PI / 2,
      Math.PI / 3.5,
      14,
      Vector3.Zero(),
      scene,
    );
    cam.lowerRadiusLimit = 8;
    cam.upperRadiusLimit = 22;
    cam.panningSensibility = 0;

    // Ambient light.
    const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
    light.intensity = 0.5;
    light.diffuse = new Color3(0.6, 0.7, 1.0);

    // Subtle glow on hover.
    const glow = new GlowLayer("glow", scene, { mainTextureFixedSize: 256 });
    glow.intensity = 0.4;

    // Fetch apps from the OS (Tauri command).
    try {
      this.apps = await invoke<AppEntry[]>("list_apps");
    } catch {
      // Fallback: minimal set for dev without Tauri.
      this.apps = FALLBACK_APPS;
    }

    this.buildGrid(scene);
    this.setupPointerEvents(scene);
    this.setupKeyboard();
  }

  private buildGrid(scene: Scene) {
    const cols = 6;
    const cardW = 1.6;
    const cardH = 1.0;
    const gap = 0.25;
    const stepX = cardW + gap;
    const stepY = cardH + gap;

    this.cards.clear();

    this.apps.forEach((app, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = (col - (cols - 1) / 2) * stepX;
      const y = -(row * stepY);

      const card = MeshBuilder.CreateBox(
        `card-${app.id}`,
        {
          width: cardW,
          height: cardH,
          depth: 0.06,
        },
        scene,
      );
      card.position = new Vector3(x, y, 0);

      // Card material — dark glass panel with coloured emissive edge.
      const mat = new PBRMaterial(`mat-${app.id}`, scene);
      mat.metallic = 0.0;
      mat.roughness = 0.4;
      mat.albedoColor = new Color3(0.1, 0.1, 0.22);
      mat.emissiveColor = new Color3(0.05, 0.1, 0.3);
      mat.alpha = 0.92;

      // Render app name onto a DynamicTexture.
      const tex = new DynamicTexture(
        `tex-${app.id}`,
        { width: 256, height: 160 },
        scene,
        false,
      );
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 256, 160);
      ctx.fillStyle = "rgba(20,20,50,0.0)";
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 22px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(app.name.slice(0, 18), 128, 90);
      ctx.fillStyle = "#64748b";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.fillText(app.categories[0] ?? "", 128, 115);
      tex.update();

      mat.albedoTexture = tex;
      card.material = mat;

      // Entrance animation — cards fly in from z=-5.
      card.position.z = -5;
      const anim = new Animation(
        `enter-${idx}`,
        "position.z",
        60,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
      );
      anim.setKeys([
        { frame: 0, value: -5 },
        { frame: Math.round(20 + idx * 1.5), value: 0 },
      ]);
      card.animations = [anim];
      scene.beginAnimation(card, 0, Math.round(20 + idx * 1.5), false);

      card.metadata = { app, index: idx };
      this.cards.set(app.id, card);
    });
  }

  private setupPointerEvents(scene: Scene) {
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERPICK) return;
      const mesh = info.pickInfo?.pickedMesh;
      if (!mesh?.metadata?.app) return;
      void this.launchApp(mesh.metadata.app as AppEntry);
    });

    // Hover highlight.
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERMOVE) return;
      const picked = info.pickInfo?.pickedMesh;
      this.cards.forEach((card) => {
        const mat = card.material as PBRMaterial;
        if (card === picked) {
          mat.emissiveColor = new Color3(0.1, 0.3, 0.8);
          mat.alpha = 1.0;
        } else {
          mat.emissiveColor = new Color3(0.05, 0.1, 0.3);
          mat.alpha = 0.92;
        }
      });
    });
  }

  private setupKeyboard() {
    window.addEventListener("keydown", this._onKey);
  }

  private _onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      useShellStore.getState().setScene("home");
      return;
    }
    if (e.key === "Enter" && this.apps[this.selectedIndex]) {
      void this.launchApp(this.apps[this.selectedIndex]!);
      return;
    }
    if (e.key === "Backspace") {
      this.filterText = this.filterText.slice(0, -1);
      this.applyFilter();
    } else if (e.key.length === 1) {
      this.filterText += e.key.toLowerCase();
      this.applyFilter();
    }
  };

  private applyFilter() {
    const q = this.filterText;
    this.cards.forEach((card, _id) => {
      const app = card.metadata?.app as AppEntry | undefined;
      const visible = !q || app?.name.toLowerCase().includes(q) || false;
      card.setEnabled(visible);
    });
  }

  /** Voice: highlight the best matching app and optionally launch it. */
  highlightApp(query: string, launch = false) {
    const q = query.toLowerCase();
    const match = this.apps.find(
      (a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
    if (!match) return;

    const card = this.cards.get(match.id);
    if (card) {
      const mat = card.material as PBRMaterial;
      mat.emissiveColor = new Color3(0.2, 0.6, 1.0);
    }

    if (launch) void this.launchApp(match);
  }

  private async launchApp(app: AppEntry) {
    useShellStore.getState().addNotification({
      kind: "info",
      title: `Launching ${app.name}`,
      body: "",
    });
    try {
      await invoke("launch_app", { id: app.id, exec: app.exec });
      // Return to home after launch.
      useShellStore.getState().setScene("home");
    } catch (e) {
      useShellStore.getState().addNotification({
        kind: "error",
        title: `Failed to launch ${app.name}`,
        body: String(e),
      });
    }
  }

  activate() {
    this.filterText = "";
    this.scene.attachControl();
  }

  deactivate() {
    window.removeEventListener("keydown", this._onKey);
    this.scene.detachControl();
  }
}

// Dev fallback when running outside Tauri.
const FALLBACK_APPS: AppEntry[] = [
  {
    id: "org.gnome.Terminal",
    name: "Terminal",
    icon: "utilities-terminal",
    categories: ["System"],
    exec: "gnome-terminal",
  },
  {
    id: "org.gnome.Nautilus",
    name: "Files",
    icon: "system-file-manager",
    categories: ["Utility"],
    exec: "nautilus",
  },
  {
    id: "firefox",
    name: "Firefox",
    icon: "firefox",
    categories: ["Network"],
    exec: "firefox",
  },
  {
    id: "org.gnome.gedit",
    name: "Text Editor",
    icon: "gedit",
    categories: ["Utility"],
    exec: "gedit",
  },
  {
    id: "org.gnome.Settings",
    name: "Settings",
    icon: "preferences-system",
    categories: ["Settings"],
    exec: "gnome-control-center",
  },
  {
    id: "org.gnome.Calculator",
    name: "Calculator",
    icon: "gnome-calculator",
    categories: ["Utility"],
    exec: "gnome-calculator",
  },
];
