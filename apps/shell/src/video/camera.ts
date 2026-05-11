/**
 * CameraManager — singleton that owns the active webcam stream.
 *
 * Features:
 *  - Enumerate all cameras: browser (enumerateDevices) + native (Tauri v4l2)
 *  - Switch between cameras without re-requesting permission
 *  - Motion-based presence detection → automatic scene transitions
 *  - Expose videoElement for Babylon.js VideoTexture (shared, never replaced)
 *
 * The <video> element is created once and its srcObject is swapped on camera
 * switch, so any VideoTexture pointing at it updates automatically.
 */

import { useShellStore } from "../store/shell";

export interface CameraDevice {
  /** Browser deviceId, or "native:N" for v4l2 devices, or "default". */
  id: string;
  /** Human-readable label (may be empty before permission is granted). */
  label: string;
  /** "browser" | "native" */
  source: "browser" | "native";
}

// ── VAD / presence constants (mirror crates/limen-voice/src/vad.rs) ───────

const INACTIVITY_SECS = parseInt(
  (import.meta.env.LIMEN_INACTIVITY_SECS as string | undefined) ?? "300",
  10,
);
const MOTION_THRESH = 8; // avg per-pixel diff (0–255) that counts as motion
const CHECK_MS = 2000; // presence check interval
const THUMB_W = 64;
const THUMB_H = 36;

// ── CameraManager ────────────────────────────────────────────────────────────

class CameraManager {
  /** Shared off-screen video element — hand to Babylon.js VideoTexture. */
  readonly video: HTMLVideoElement;

  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private prevFrame: Uint8ClampedArray | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMotionTs = Date.now();
  private _active = false;
  private _activeDeviceId = "default";
  private _lastPresent: boolean | null = null; // track transitions for IPC

  constructor() {
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    this.canvas = document.createElement("canvas");
    this.canvas.width = THUMB_W;
    this.canvas.height = THUMB_H;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the default camera and presence loop. No-op if already running. */
  async start(): Promise<void> {
    if (this._active) return;
    await this._openStream("default");
    if (this._active) {
      // Enumerate cameras now that we have permission (labels become available).
      void this.listCameras();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this._stopStream();
    useShellStore.getState().setCameraActive(false);
    useShellStore.getState().setPresenceDetected(false);
  }

  get isActive() {
    return this._active;
  }
  get activeDeviceId() {
    return this._activeDeviceId;
  }

  // ── Camera enumeration ────────────────────────────────────────────────────

  /**
   * Enumerate all available cameras from the browser (enumerateDevices) and,
   * inside Tauri, from the native v4l2 layer.  Updates the store immediately.
   */
  async listCameras(): Promise<CameraDevice[]> {
    const devices: CameraDevice[] = [];

    // 1. Browser cameras (labels available only after getUserMedia permission).
    try {
      const media = await navigator.mediaDevices.enumerateDevices();
      for (const d of media.filter((d) => d.kind === "videoinput")) {
        devices.push({
          id: d.deviceId || "default",
          label: d.label || `Camera ${devices.length + 1}`,
          source: "browser",
        });
      }
    } catch (e) {
      console.warn("[Camera] enumerateDevices failed:", e);
    }

    // 2. Native cameras via Tauri (for devices not visible to the browser).
    if ("__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const native = await invoke<CameraDevice[]>("list_cameras");
        for (const cam of native) {
          if (!devices.find((d) => d.label === cam.label)) {
            devices.push(cam);
          }
        }
      } catch {
        /* Tauri unavailable or command not registered yet */
      }
    }

    useShellStore.getState().setCameraDevices(devices);
    return devices;
  }

  // ── Camera switching ──────────────────────────────────────────────────────

  /**
   * Switch to a different camera.  The shared `videoElement` gets a new
   * srcObject — any Babylon.js VideoTexture pointing at it updates automatically.
   */
  async switchTo(deviceId: string): Promise<void> {
    if (deviceId === this._activeDeviceId && this._active) return;
    const wasActive = this._active;
    const fromDeviceId = this._activeDeviceId;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._stopStream();
    await this._openStream(deviceId);
    if (!wasActive) {
      this.stop();
      return;
    }
    // Emit camera_switched (camera_started is already emitted by _openStream).
    const label =
      useShellStore.getState().cameraDevices.find((d) => d.id === deviceId)
        ?.label ?? deviceId;
    void this._ipc("camera_switched", {
      from_device_id: fromDeviceId,
      to_device_id: deviceId,
      label,
    });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _openStream(deviceId: string): Promise<void> {
    try {
      const constraint: MediaTrackConstraints =
        deviceId === "default"
          ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: "user",
            }
          : {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
            };

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: constraint,
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      const label = this.stream.getVideoTracks()[0]?.label ?? deviceId;
      this._active = true;
      this._activeDeviceId = deviceId;
      this.lastMotionTs = Date.now();
      this.prevFrame = null;
      this._lastPresent = null;

      useShellStore.getState().setCameraActive(true);
      useShellStore.getState().setActiveCameraId(deviceId);

      // WID-stamped event → synapsd → TUI / mobile / plugins
      void this._ipc("camera_started", { device_id: deviceId, label });

      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this._tick(), CHECK_MS);
    } catch (e) {
      console.warn("[Camera] getUserMedia failed:", e);
    }
  }

  private _stopStream(): void {
    const deviceId = this._activeDeviceId;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this._active = false;
    void this._ipc("camera_stopped", { device_id: deviceId });
  }

  /** Fire-and-forget Tauri IPC — silent if not in Tauri or synapsd is down. */
  private async _ipc(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    if (!("__TAURI_INTERNALS__" in window)) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke(cmd, args);
    } catch {
      /* best-effort */
    }
  }

  // ── Presence detection ────────────────────────────────────────────────────

  private _tick(): void {
    if (!this._active || this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, THUMB_W, THUMB_H);
    const frame = this.ctx.getImageData(0, 0, THUMB_W, THUMB_H).data;

    let motion = 0;
    if (this.prevFrame) {
      for (let i = 0; i < frame.length; i += 4) {
        motion += Math.abs(frame[i] - this.prevFrame[i]);
      }
      motion /= THUMB_W * THUMB_H;
    }
    this.prevFrame = new Uint8ClampedArray(frame);

    const present = motion > MOTION_THRESH;
    if (present) this.lastMotionTs = Date.now();
    useShellStore.getState().setPresenceDetected(present);

    // Emit presence_event only on state transitions (absent↔present), not every tick.
    if (present !== this._lastPresent) {
      this._lastPresent = present;
      void this._ipc("presence_event", { present, motion_score: motion });
    }

    const { activeScene, setScene } = useShellStore.getState();
    const idleSecs = (Date.now() - this.lastMotionTs) / 1000;

    if (idleSecs > INACTIVITY_SECS && activeScene === "home")
      setScene("ambient");
    if (motion > MOTION_THRESH * 2 && activeScene === "ambient")
      setScene("home");
  }
}

export const cameraManager = new CameraManager();
