import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { WindowInstance } from "../../store/shell";
import { useShellStore } from "../../store/shell";
import { DEFAULT_APPS, HA_URL, HA_LOCAL_URL } from "../../constants/apps";
import { AiClient } from "@limen-os/ai-client";
import type { Message as AiMessage } from "@limen-os/ai-client";
import { WaldiezContent } from "./WaldiezContent";
import { WaldiezPlayerContent } from "./WaldiezPlayer";
import { WaldiezReaderContent } from "./WaldiezReader";
import { AmmelieContent } from "./Ammelie";
import { DocsContent } from "./DocsContent";
import { LimenMind } from "./LimenMind";
import { SnakeGame } from "./games/SnakeGame";
import { PongGame } from "./games/PongGame";
import { ChessGame } from "./games/ChessGame";
import { BowlingGame } from "./games/BowlingGame";
import { BubbleShooterGame } from "./games/BubbleShooterGame";
import { PoolGame } from "./games/PoolGame";
import { SolitaireGame } from "./games/SolitaireGame";
import { PacmanGame } from "./games/PacmanGame";
import { CrosswordGame } from "./games/CrosswordGame";
import { HangmanGame } from "./games/HangmanGame";

interface Props {
  win: WindowInstance;
}

const SETTINGS_KEYWORDS: Record<string, string[]> = {
  Personalization: [
    "theme",
    "appearance",
    "desktop",
    "paradigm",
    "mobile",
    "wallpaper",
  ],
  Taskbar: ["taskbar", "dock", "pin", "apps", "pinned", "default", "shortcuts"],
  Sound: ["audio", "speaker", "microphone", "volume", "spatial"],
  Display: ["screen", "resolution", "refresh", "3d", "canvas"],
  "Network & Internet": ["wifi", "bluetooth", "vpn", "ethernet", "airplane"],
  "Privacy & Security": [
    "camera",
    "microphone",
    "location",
    "firewall",
    "security",
  ],
  "Power & Sleep": ["battery", "sleep", "timeout", "performance", "wake"],
  Notifications: ["bell", "focus", "dnd", "preview", "alert"],
  "AI & Voice": ["ai", "voice", "wake word", "stt", "model"],
  "Search & APIs": [
    "api",
    "key",
    "youtube",
    "google",
    "tavily",
    "search",
    "ha",
    "home assistant",
    "token",
  ],
  "Limen Update": ["update", "release", "version", "channel"],
  About: ["system", "build", "kernel", "copy info", "about"],
};

export function WindowContent({ win }: Props) {
  switch (win.contentType) {
    case "terminal":
      return <TerminalContent />;
    case "settings":
      return <SettingsContent />;
    case "ai-chat":
      return <AiChatContent />;
    case "calculator":
      return <CalculatorContent />;
    case "text-editor":
      return <TextEditorContent />;
    case "calendar":
      return <CalendarContent />;
    case "photos":
      return <PhotosContent />;
    case "music":
      return <MusicContent />;
    case "maps":
      return <MapsContent />;
    case "home-assistant":
      return <HaContent win={win} />;

    case "files":
      return <FilesContent />;
    case "mail":
      return <MailContent />;
    case "snake":
      return <SnakeGame />;
    case "minesweeper":
      return <MinesweeperContent />;
    case "solitaire":
      return <SolitaireGame />;
    case "pong":
      return <PongGame />;
    case "chess":
      return <ChessGame />;
    case "bowling":
      return <BowlingGame />;
    case "bubble-shooter":
      return <BubbleShooterGame />;
    case "pool":
      return <PoolGame />;
    case "pacman":
      return <PacmanGame />;
    case "crossword":
      return <CrosswordGame />;
    case "hangman":
      return <HangmanGame />;
    case "tutorial":
      return <TutorialContent />;
    case "docs":
      return <DocsContent />;
    case "limen-mind":
      return <LimenMind />;
    case "limen-fin":
      return <LimenFinContent />;
    case "waldiez-native":
      return <WaldiezContent win={win} />;
    case "ammelie":
      return <AmmelieContent />;
    case "limen-player":
      return <WaldiezPlayerContent />;
    case "waldiez-reader":
      return <WaldiezReaderContent />;
    case "browser":
      return (
        <BrowserContent
          win={win}
          initialUrl={win.contentUrl ?? "https://www.google.com"}
        />
      );
    case "iframe":
      return <IframeContent url={win.contentUrl ?? ""} />;
    default:
      return <NativeContent win={win} />;
  }
}

// ── Terminal ────────────────────────────────────────────────────────────────

function TerminalContent() {
  const [lines, setLines] = useState<string[]>([
    "LIMEN OS Terminal v0.1.0",
    "Type 'help' for available commands.",
    "",
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const cmd = input.trim();
    setInput("");
    const out: string[] = [`$ ${cmd}`];
    if (!cmd) {
      setLines((l) => [...l, ""]);
      return;
    }
    switch (cmd.toLowerCase()) {
      case "help":
        out.push("clear  exit  echo  uname  pwd  whoami");
        break;
      case "clear":
        setLines([]);
        return;
      case "uname":
        out.push("LIMEN OS (Tauri/Wayland) x86_64");
        break;
      case "pwd":
        out.push("/home/limen");
        break;
      case "whoami":
        out.push(useShellStore.getState().sessionUser ?? "user");
        break;
      case "exit":
        out.push("close the window to exit");
        break;
      default:
        if (cmd.startsWith("echo ")) out.push(cmd.slice(5));
        else out.push(`bash: ${cmd}: command not found`);
    }
    setLines((l) => [...l, ...out]);
  };

  return (
    <div className="win11-terminal selectable">
      <div className="win11-terminal-output">
        {lines.map((l, i) => (
          <div key={i} className="win11-terminal-line">
            {l || " "}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="win11-terminal-input-row">
        <span className="win11-terminal-prompt">$ </span>
        <input
          className="win11-terminal-input selectable"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────

const SETTING_SECTIONS = [
  { icon: "🎨", label: "Personalization" },
  { icon: "📌", label: "Taskbar" },
  { icon: "🔊", label: "Sound" },
  { icon: "🖥️", label: "Display" },
  { icon: "🌐", label: "Network & Internet" },
  { icon: "🔒", label: "Privacy & Security" },
  { icon: "⚡", label: "Power & Sleep" },
  { icon: "🔔", label: "Notifications" },
  { icon: "🤖", label: "AI & Voice" },
  { icon: "🔑", label: "Search & APIs" },
  { icon: "🔄", label: "Limen Update" },
  { icon: "ℹ️", label: "About" },
];

// ── Settings shared primitives ───────────────────────────────────────────────

function SettingToggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="win11-settings-row">
      <div>
        <div className="win11-settings-row-label">{label}</div>
        {desc && <div className="win11-settings-row-desc">{desc}</div>}
      </div>
      <button
        className={`win11-settings-toggle${value ? " active" : ""}`}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
      >
        <span className="win11-settings-toggle-thumb" />
      </button>
    </div>
  );
}

function SettingsNotice({
  text,
  tone = "info",
}: {
  text: string;
  tone?: "info" | "success";
}) {
  return (
    <div
      className={`win11-settings-notice${tone === "success" ? " success" : ""}`}
    >
      {text}
    </div>
  );
}

// ── Personalization panel ────────────────────────────────────────────────────

function PersonalizationSettings() {
  const { paradigm, setParadigm } = useShellStore();
  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Desktop Paradigm</div>
          <div className="win11-settings-row-desc">
            Visual theme and interaction style
          </div>
        </div>
        <select
          className="win11-settings-select"
          value={paradigm}
          onChange={(e) =>
            setParadigm(e.target.value as import("../../store/shell").Paradigm)
          }
        >
          <option value="win11">Windows 11</option>
          <option value="macos7">macOS</option>
          <option value="unix">Unix / GNOME</option>
          <option value="minimal">Minimal</option>
          <option value="nebula">Nebula (canvas-only)</option>
          <option value="dos">DOS Retro</option>
          <option value="calm">Calm</option>
          <option value="mobile">Mobile companion</option>
        </select>
      </div>
    </div>
  );
}

// ── Display panel ────────────────────────────────────────────────────────────

function DisplaySettings() {
  const { showCanvas, setShowCanvas } = useShellStore();
  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">3D Animated Wallpaper</div>
          <div className="win11-settings-row-desc">
            Babylon.js WebGL canvas — aurora, stars, ambient scenes
          </div>
        </div>
        <button
          className={`win11-settings-toggle${showCanvas ? " active" : ""}`}
          onClick={() => setShowCanvas(!showCanvas)}
          role="switch"
          aria-checked={showCanvas}
        >
          <span className="win11-settings-toggle-thumb" />
        </button>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Resolution</div>
          <div className="win11-settings-row-desc">
            Display resolution (read-only — set by system)
          </div>
        </div>
        <span className="win11-settings-badge">
          {window.screen.width} × {window.screen.height}
        </span>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Refresh Rate</div>
          <div className="win11-settings-row-desc">Monitor refresh rate</div>
        </div>
        <span className="win11-settings-badge">60 Hz</span>
      </div>
    </div>
  );
}

// ── AI & Voice panel ─────────────────────────────────────────────────────────

function AiVoiceSettings() {
  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Wake Word</div>
          <div className="win11-settings-row-desc">
            Say this phrase to activate voice control
          </div>
        </div>
        <span className="win11-settings-badge">Hey Limen</span>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Primary AI Model</div>
          <div className="win11-settings-row-desc">
            Model used for intent detection and responses
          </div>
        </div>
        <span className="win11-settings-badge">Claude Sonnet 4.6</span>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Fallback Chain</div>
          <div className="win11-settings-row-desc">
            Models tried in order if primary is unavailable
          </div>
        </div>
        <span className="win11-settings-badge">
          GPT-4o → Gemini → Deepseek → Groq
        </span>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">STT Engine</div>
          <div className="win11-settings-row-desc">Speech-to-text engine</div>
        </div>
        <span className="win11-settings-badge">Whisper ONNX (local)</span>
      </div>
    </div>
  );
}

// ── Sound panel ──────────────────────────────────────────────────────────────

function SoundSettings() {
  const [masterVol, setMasterVol] = useState(75);
  const [notifVol, setNotifVol] = useState(50);
  const [mediaVol, setMediaVol] = useState(80);
  const [micOn, setMicOn] = useState(true);
  const [outputDevice, setOutputDevice] = useState("Speakers (built-in)");
  const [inputDevice, setInputDevice] = useState("Microphone (built-in)");
  const [spatialAudio, setSpatialAudio] = useState(false);

  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Master Volume</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={masterVol}
            onChange={(e) => setMasterVol(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <span className="win11-settings-badge">{masterVol}%</span>
        </div>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Notification Volume</div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={notifVol}
          onChange={(e) => setNotifVol(Number(e.target.value))}
          style={{ width: 120 }}
        />
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Media Volume</div>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={mediaVol}
          onChange={(e) => setMediaVol(Number(e.target.value))}
          style={{ width: 120 }}
        />
      </div>
      <SettingToggle
        label="Microphone input"
        value={micOn}
        onChange={setMicOn}
      />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Output Device</div>
        </div>
        <select
          className="win11-settings-select"
          value={outputDevice}
          onChange={(e) => setOutputDevice(e.target.value)}
        >
          <option>Speakers (built-in)</option>
          <option>HDMI Output</option>
          <option>Bluetooth Audio</option>
        </select>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Input Device</div>
        </div>
        <select
          className="win11-settings-select"
          value={inputDevice}
          onChange={(e) => setInputDevice(e.target.value)}
        >
          <option>Microphone (built-in)</option>
          <option>USB Microphone</option>
        </select>
      </div>
      <SettingToggle
        label="Spatial Audio"
        desc="Surround sound simulation"
        value={spatialAudio}
        onChange={setSpatialAudio}
      />
    </div>
  );
}

// ── Network & Internet panel ─────────────────────────────────────────────────

function NetworkSettings() {
  const addNotification = useShellStore((s) => s.addNotification);
  const [wifi, setWifi] = useState(true);
  const [bluetooth, setBluetooth] = useState(true);
  const [airplane, setAirplane] = useState(false);
  const [vpnStatus, setVpnStatus] = useState(
    "No VPN profile is configured yet.",
  );

  return (
    <div className="win11-settings-section">
      <SettingToggle label="Wi-Fi" value={wifi} onChange={setWifi} />
      {wifi && (
        <div
          className="win11-settings-row"
          style={{
            paddingLeft: 16,
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <div
            className="win11-settings-row-label"
            style={{ fontSize: "0.9em" }}
          >
            limen-net
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="win11-settings-badge">Connected</span>
            <span className="win11-settings-badge">WPA3</span>
            <span className="win11-settings-badge">Excellent (5 GHz)</span>
          </div>
        </div>
      )}
      <SettingToggle
        label="Bluetooth"
        value={bluetooth}
        onChange={setBluetooth}
      />
      <SettingToggle
        label="Airplane Mode"
        value={airplane}
        onChange={setAirplane}
      />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">VPN</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="win11-settings-badge">Manual setup</span>
          <button
            className="wg-btn"
            onClick={() => {
              const body =
                "VPN profiles are not wired to the backend yet. Use system networking for now.";
              setVpnStatus(body);
              addNotification({
                title: "Network & Internet",
                body,
                kind: "info",
              });
            }}
          >
            Explain
          </button>
        </div>
      </div>
      <SettingsNotice text={vpnStatus} />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Ethernet</div>
        </div>
        <span className="win11-settings-badge">Not connected</span>
      </div>
    </div>
  );
}

// ── Privacy & Security panel ─────────────────────────────────────────────────

function PrivacySettings() {
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [location, setLocation] = useState(false);
  const [faceRecog, setFaceRecog] = useState(true);
  const [diagnostic, setDiagnostic] = useState(false);

  return (
    <div className="win11-settings-section">
      <SettingToggle
        label="Camera"
        desc="Allow apps to access camera"
        value={camera}
        onChange={setCamera}
      />
      <SettingToggle
        label="Microphone"
        desc="Allow apps to access microphone"
        value={microphone}
        onChange={setMicrophone}
      />
      <SettingToggle
        label="Location"
        desc="Allow apps to access location"
        value={location}
        onChange={setLocation}
      />
      <SettingToggle
        label="Face Recognition"
        desc="Unlock with face + MediaPipe"
        value={faceRecog}
        onChange={setFaceRecog}
      />
      <SettingToggle
        label="Diagnostic Data"
        desc="Send usage data to improve Limen"
        value={diagnostic}
        onChange={setDiagnostic}
      />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Firewall</div>
          <div className="win11-settings-row-desc">
            System firewall is enabled
          </div>
        </div>
        <span className="win11-settings-badge">Active</span>
      </div>
    </div>
  );
}

// ── Power & Sleep panel ──────────────────────────────────────────────────────

function PowerSettings() {
  const [screenTimeout, setScreenTimeout] = useState("10 min");
  const [sleepTimeout, setSleepTimeout] = useState("30 min");
  const [perfMode, setPerfMode] = useState("Balanced");
  const [wakeOnVoice, setWakeOnVoice] = useState(true);

  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">
            Screen timeout (when plugged in)
          </div>
        </div>
        <select
          className="win11-settings-select"
          value={screenTimeout}
          onChange={(e) => setScreenTimeout(e.target.value)}
        >
          <option>5 min</option>
          <option>10 min</option>
          <option>15 min</option>
          <option>30 min</option>
          <option>Never</option>
        </select>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">
            Sleep (when plugged in)
          </div>
        </div>
        <select
          className="win11-settings-select"
          value={sleepTimeout}
          onChange={(e) => setSleepTimeout(e.target.value)}
        >
          <option>15 min</option>
          <option>30 min</option>
          <option>1 hour</option>
          <option>Never</option>
        </select>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Performance mode</div>
        </div>
        <select
          className="win11-settings-select"
          value={perfMode}
          onChange={(e) => setPerfMode(e.target.value)}
        >
          <option>Power saver</option>
          <option>Balanced</option>
          <option>High performance</option>
        </select>
      </div>
      <SettingToggle
        label="Wake on voice"
        desc="Wake the system with 'Hey Limen'"
        value={wakeOnVoice}
        onChange={setWakeOnVoice}
      />
    </div>
  );
}

// ── Notifications panel ──────────────────────────────────────────────────────

function NotificationsSettings() {
  const [dnd, setDnd] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [notifSound, setNotifSound] = useState(true);
  const [focusAssist, setFocusAssist] = useState("Off");
  const [appAiChat, setAppAiChat] = useState(true);
  const [appHa, setAppHa] = useState(true);
  const [appMail, setAppMail] = useState(true);
  const [appTerminal, setAppTerminal] = useState(false);

  return (
    <div className="win11-settings-section">
      <SettingToggle
        label="Do Not Disturb"
        desc="Silence all notifications"
        value={dnd}
        onChange={setDnd}
      />
      <SettingToggle
        label="Show notification preview"
        value={showPreview}
        onChange={setShowPreview}
      />
      <SettingToggle
        label="Notification sound"
        value={notifSound}
        onChange={setNotifSound}
      />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Focus assist</div>
        </div>
        <select
          className="win11-settings-select"
          value={focusAssist}
          onChange={(e) => setFocusAssist(e.target.value)}
        >
          <option>Off</option>
          <option>Priority only</option>
          <option>Alarms only</option>
        </select>
      </div>
      <div
        className="win11-settings-row-label"
        style={{ padding: "12px 0 4px", fontWeight: 600, opacity: 0.7 }}
      >
        Per-app notifications
      </div>
      <SettingToggle
        label="AI Chat"
        value={appAiChat}
        onChange={setAppAiChat}
      />
      <SettingToggle label="Home Assistant" value={appHa} onChange={setAppHa} />
      <SettingToggle label="Mail" value={appMail} onChange={setAppMail} />
      <SettingToggle
        label="Terminal"
        value={appTerminal}
        onChange={setAppTerminal}
      />
    </div>
  );
}

// ── Limen Update panel ─────────────────────────────────────────────────────

function UpdateSettings() {
  const addNotification = useShellStore((s) => s.addNotification);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [lastChecked, setLastChecked] = useState(() =>
    new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const [status, setStatus] = useState(
    "No updates are available for this shell build.",
  );

  return (
    <div className="win11-settings-section">
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Status</div>
          <div className="win11-settings-row-desc">
            LIMEN OS 0.1.0 — Last checked: {lastChecked}
          </div>
        </div>
        <span className="win11-settings-badge">Up to date</span>
      </div>
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Channel</div>
          <div className="win11-settings-row-desc">Stable release channel</div>
        </div>
        <span className="win11-settings-badge">Stable</span>
      </div>
      <SettingToggle
        label="Auto-update"
        value={autoUpdate}
        onChange={setAutoUpdate}
      />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Check for updates</div>
        </div>
        <button
          className="wg-btn"
          onClick={() => {
            const checkedAt = new Date().toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            setLastChecked(checkedAt);
            setStatus(
              "Shell assets are current. Native updater hooks can be attached later.",
            );
            addNotification({
              title: "Limen Update",
              body: "Limen OS is already up to date.",
              kind: "info",
            });
          }}
        >
          Check for updates
        </button>
      </div>
      <SettingsNotice text={status} />
      <div className="win11-settings-row">
        <div>
          <div className="win11-settings-row-label">Release notes</div>
        </div>
        <span className="win11-settings-badge">v0.1.0 — 2026-03-12</span>
      </div>
    </div>
  );
}

// ── About panel ──────────────────────────────────────────────────────────────

function AboutSettings() {
  const memoryGB = (window.navigator as { deviceMemory?: number }).deviceMemory;
  const cores = window.navigator.hardwareConcurrency;

  const rows: { label: string; value: string }[] = [
    { label: "OS Name", value: "LIMEN OS" },
    { label: "Version", value: "0.1.0 (alpha)" },
    { label: "Build", value: "20260312.tauri" },
    { label: "Architecture", value: "x86_64" },
    { label: "Kernel", value: "Tauri v2 / WebKit" },
    { label: "GPU Backend", value: "WebGPU / WebGL2" },
    { label: "AI Runtime", value: "Anthropic Claude (primary)" },
    { label: "Voice Engine", value: "Whisper ONNX (local)" },
    { label: "Display Server", value: "Wayland / Xvfb" },
    { label: "Memory", value: memoryGB ? `${memoryGB} GB` : "Unknown" },
    { label: "Cores", value: cores ? `${cores} logical` : "Unknown" },
  ];
  const [copied, setCopied] = useState(false);

  const copyInfo = () => {
    const text = rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div className="win11-settings-section">
      {rows.map((r) => (
        <div key={r.label} className="win11-settings-row">
          <div className="win11-settings-row-label">{r.label}</div>
          <span className="win11-settings-badge">{r.value}</span>
        </div>
      ))}
      <div className="win11-settings-row" style={{ marginTop: 8 }}>
        <div className="win11-settings-row-label">System info</div>
        <button className="wg-btn" onClick={copyInfo}>
          Copy system info
        </button>
      </div>
      {copied && (
        <SettingsNotice
          text="System information copied to the clipboard."
          tone="success"
        />
      )}
    </div>
  );
}

// ── Taskbar settings ─────────────────────────────────────────────────────────

function TaskbarSettings() {
  const pinnedApps = useShellStore((s) => s.pinnedApps);
  const { pinApp, unpinApp } = useShellStore();
  const apps = useMemo(
    () => DEFAULT_APPS.filter((a) => !["tutorial", "docs"].includes(a.id)),
    [],
  );
  return (
    <div className="win11-settings-section">
      <div
        className="win11-settings-row"
        style={{
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 4,
          marginBottom: 8,
        }}
      >
        <div className="win11-settings-row-desc">
          Toggle which apps are pinned in the taskbar. Changes take effect
          immediately.
        </div>
      </div>
      {apps.map((app) => (
        <SettingToggle
          key={app.id}
          label={app.title}
          value={pinnedApps.includes(app.id)}
          onChange={(v) => {
            if (v) {
              pinApp(app.id);
            } else {
              unpinApp(app.id);
            }
          }}
        />
      ))}
    </div>
  );
}

// ── Search & APIs settings ────────────────────────────────────────────────────

function SettingApiInput({
  label,
  desc,
  value,
  onChange,
  masked = false,
}: {
  label: string;
  desc?: string;
  value: string;
  onChange: (v: string) => void;
  masked?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="win11-settings-row"
      style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}
    >
      <div className="win11-settings-row-label">{label}</div>
      {desc && <div className="win11-settings-row-desc">{desc}</div>}
      <div style={{ display: "flex", gap: 6, width: "100%" }}>
        <input
          type={masked && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={masked ? "••••••••••••••••" : "Enter value…"}
          spellCheck={false}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            padding: "5px 10px",
            color: "rgba(255,255,255,0.9)",
            fontSize: 12,
            fontFamily: "monospace",
            outline: "none",
          }}
        />
        {masked && (
          <button
            onClick={() => setShow((s) => !s)}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              borderRadius: 5,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
            }}
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}

function SearchApiSettings() {
  const {
    ytApiKey,
    googleSearchApiKey,
    googleSearchCxId,
    tavilyApiKey,
    haUrl,
    haToken,
    setApiConfig,
  } = useShellStore();
  const [saved, setSaved] = useState(false);
  const apply = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div className="win11-settings-section">
      <div
        className="win11-settings-row"
        style={{
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 4,
          marginBottom: 4,
        }}
      >
        <div className="win11-settings-row-desc">
          Keys are session-only (cleared when tab closes). For persistence, add
          them to{" "}
          <code
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              background: "rgba(255,255,255,0.06)",
              padding: "1px 4px",
              borderRadius: 3,
            }}
          >
            .env
          </code>{" "}
          on the server.
        </div>
      </div>

      <div
        className="win11-settings-row"
        style={{ marginTop: 8, marginBottom: 2 }}
      >
        <div
          className="win11-settings-row-label"
          style={{ fontSize: 13, color: "rgba(167,139,250,0.9)" }}
        >
          Search
        </div>
      </div>
      <SettingApiInput
        label="Tavily API Key (preferred)"
        desc="Used for web search by AI agents"
        value={tavilyApiKey}
        onChange={(v) => setApiConfig({ tavilyApiKey: v })}
        masked
      />
      <SettingApiInput
        label="Google Search API Key"
        value={googleSearchApiKey}
        onChange={(v) => setApiConfig({ googleSearchApiKey: v })}
        masked
      />
      <SettingApiInput
        label="Google Custom Search Engine ID (CX)"
        value={googleSearchCxId}
        onChange={(v) => setApiConfig({ googleSearchCxId: v })}
      />
      <SettingApiInput
        label="YouTube Data v3 API Key"
        value={ytApiKey}
        onChange={(v) => setApiConfig({ ytApiKey: v })}
        masked
      />

      <div
        className="win11-settings-row"
        style={{ marginTop: 12, marginBottom: 2 }}
      >
        <div
          className="win11-settings-row-label"
          style={{ fontSize: 13, color: "rgba(167,139,250,0.9)" }}
        >
          Home Assistant
        </div>
      </div>
      <SettingApiInput
        label="HA URL"
        desc="e.g. https://homeassistant.local:8123 or leave as /ha/ for the built-in proxy"
        value={haUrl}
        onChange={(v) => setApiConfig({ haUrl: v })}
      />
      <SettingApiInput
        label="HA Long-Lived Access Token"
        value={haToken}
        onChange={(v) => setApiConfig({ haToken: v })}
        masked
      />

      <div className="win11-settings-row" style={{ marginTop: 12 }}>
        <div />
        <button
          onClick={apply}
          style={{
            padding: "6px 20px",
            borderRadius: 7,
            border: "1px solid rgba(139,92,246,0.4)",
            background: "rgba(139,92,246,0.18)",
            color: "rgba(200,180,255,0.9)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Apply for this session
        </button>
      </div>
      {saved && (
        <SettingsNotice
          text="Applied. Add keys to .env for persistence across sessions."
          tone="success"
        />
      )}
    </div>
  );
}

// ── SettingsContent ──────────────────────────────────────────────────────────

function SettingsContent() {
  const [active, setActive] = useState("Personalization");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const sections = SETTING_SECTIONS.filter((s) => {
    if (!query) return true;
    const haystack = [s.label, ...SETTINGS_KEYWORDS[s.label]]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
  const activeSection = sections.some((s) => s.label === active)
    ? active
    : (sections[0]?.label ?? active);

  return (
    <div className="win11-settings">
      <aside className="win11-settings-nav">
        <div className="win11-settings-search">
          <input
            placeholder="Find a setting"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {sections.map((s) => (
          <button
            key={s.label}
            className={`win11-settings-nav-item${activeSection === s.label ? " active" : ""}`}
            onClick={() => setActive(s.label)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
        {sections.length === 0 && (
          <div className="win11-settings-placeholder">
            <p>No settings matched "{search}".</p>
          </div>
        )}
      </aside>
      <main className="win11-settings-main">
        {sections.length > 0 ? (
          <>
            <h2 className="win11-settings-heading">
              {SETTING_SECTIONS.find((s) => s.label === activeSection)?.icon}{" "}
              {activeSection}
            </h2>
            {activeSection === "Personalization" && <PersonalizationSettings />}
            {activeSection === "Taskbar" && <TaskbarSettings />}
            {activeSection === "Sound" && <SoundSettings />}
            {activeSection === "Display" && <DisplaySettings />}
            {activeSection === "Network & Internet" && <NetworkSettings />}
            {activeSection === "Privacy & Security" && <PrivacySettings />}
            {activeSection === "Power & Sleep" && <PowerSettings />}
            {activeSection === "Notifications" && <NotificationsSettings />}
            {activeSection === "AI & Voice" && <AiVoiceSettings />}
            {activeSection === "Search & APIs" && <SearchApiSettings />}
            {activeSection === "Limen Update" && <UpdateSettings />}
            {activeSection === "About" && <AboutSettings />}
          </>
        ) : (
          <div className="win11-settings-placeholder">
            <p>Try searching for display, update, voice, or notifications.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── AI Chat ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

// Lazily created — reused for the lifetime of the component.
let _aiClient: AiClient | null = null;
function getAiClient(): AiClient {
  if (!_aiClient) {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
    _aiClient = new AiClient(key ? { anthropicApiKey: key } : {});
  }
  return _aiClient;
}

function AiChatContent() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hello! I'm Limen AI. How can I help you today?",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    const history: AiMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.text,
    }));
    setMessages((m) => [...m, { role: "user", text, ts: Date.now() }]);
    setThinking(true);
    // Seed empty assistant message that we'll stream into.
    const assistantTs = Date.now();
    setMessages((m) => [
      ...m,
      { role: "assistant", text: "", ts: assistantTs },
    ]);
    try {
      let accumulated = "";
      for await (const token of getAiClient().stream(text, history)) {
        // Metadata sentinel — parse and attach to the last message.
        if (token.startsWith("\0meta:")) {
          try {
            const meta = JSON.parse(token.slice(6)) as {
              model?: string;
              inputTokens?: number;
              outputTokens?: number;
              latencyMs?: number;
            };
            setMessages((m) =>
              m.map((msg): ChatMessage => {
                if (msg.ts !== assistantTs) return msg;
                const updated: ChatMessage = { ...msg };
                if (meta.model !== undefined) updated.model = meta.model;
                if (meta.inputTokens !== undefined)
                  updated.inputTokens = meta.inputTokens;
                if (meta.outputTokens !== undefined)
                  updated.outputTokens = meta.outputTokens;
                if (meta.latencyMs !== undefined)
                  updated.latencyMs = meta.latencyMs;
                return updated;
              }),
            );
          } catch {
            /* ignore bad meta */
          }
          continue;
        }
        accumulated += token;
        const snap = accumulated;
        setMessages((m) =>
          m.map((msg) =>
            msg.ts === assistantTs ? { ...msg, text: snap } : msg,
          ),
        );
        if (thinking) setThinking(false);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((m) =>
        m.map((msg) =>
          msg.ts === assistantTs ? { ...msg, text: `Error: ${errMsg}` } : msg,
        ),
      );
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="win11-chat">
      <div className="win11-chat-messages selectable">
        {messages.map((m, i) => (
          <div key={i} className={`win11-chat-msg win11-chat-msg-${m.role}`}>
            <div
              className="win11-chat-bubble"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {m.text}
            </div>
            {m.role === "assistant" && (
              <div
                className="win11-chat-meta"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                {m.model && <span>{m.model}</span>}
                {m.inputTokens !== undefined && (
                  <span>
                    · {m.inputTokens}↑ {m.outputTokens}↓
                  </span>
                )}
                {m.latencyMs !== undefined && (
                  <span>· {Math.round(m.latencyMs)}ms</span>
                )}
                {m.text && (
                  <button
                    title="Copy"
                    style={{
                      marginLeft: "auto",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      opacity: 0.5,
                      fontSize: "11px",
                      color: "inherit",
                    }}
                    onClick={() => void navigator.clipboard.writeText(m.text)}
                  >
                    ⎘
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="win11-chat-msg win11-chat-msg-assistant">
            <div className="win11-chat-bubble win11-chat-thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="win11-chat-input-row">
        <input
          className="win11-chat-input selectable"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
          placeholder="Message Limen AI…"
          disabled={thinking}
        />
        {input.length > 0 && (
          <span
            style={{
              fontSize: "10px",
              opacity: 0.4,
              flexShrink: 0,
              marginRight: "4px",
            }}
          >
            {input.length}
          </span>
        )}
        <button
          className="win11-chat-send"
          onClick={() => void send()}
          disabled={thinking || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l2 6-2 6 12-6z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Browser ──────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  description: string;
  favicon: string;
}

/** Resolve raw input → full URL (auto-prefix https://, or search marker). */
function resolveUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return t;
  if (/^[\w-]+\.[\w.-]+/.test(t)) return "https://" + t;
  return "limen-search://" + encodeURIComponent(t);
}

/** Return true if the resolved URL is a search query (our internal scheme or known engines). */
function isSearchUrl(url: string): boolean {
  if (url.startsWith("limen-search://")) return true;
  try {
    const u = new URL(url);
    return (
      (u.hostname === "www.google.com" && u.pathname === "/search") ||
      (u.hostname === "www.bing.com" && u.pathname === "/search") ||
      (u.hostname === "duckduckgo.com" && u.pathname === "/") ||
      u.hostname === "search.yahoo.com"
    );
  } catch {
    return false;
  }
}

/** Extract the search query from a search URL or raw text. */
function extractQuery(url: string, fallback: string): string {
  if (url.startsWith("limen-search://")) {
    try {
      return decodeURIComponent(url.slice("limen-search://".length));
    } catch {
      return fallback;
    }
  }
  try {
    return new URL(url).searchParams.get("q") ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Search Results Page ───────────────────────────────────────────────────────

function SearchResultsPage({
  query,
  results,
  loading,
  error,
  onNavigate,
}: {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error: string;
  onNavigate: (url: string) => void;
}) {
  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          padding: "24px 32px",
          overflow: "auto",
          background: "#080d1a",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "rgba(140,170,255,0.45)",
            marginBottom: 20,
          }}
        >
          Searching for "
          <span style={{ color: "rgba(140,180,255,0.7)" }}>{query}</span>"…
        </div>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.03)",
              borderRadius: 10,
              padding: "14px 18px",
              marginBottom: 10,
              opacity: 1 - i * 0.12,
            }}
          >
            <div
              style={{
                height: 13,
                background: "rgba(100,140,255,0.12)",
                borderRadius: 4,
                width: `${55 + (i % 3) * 15}%`,
                marginBottom: 8,
              }}
            />
            <div
              style={{
                height: 10,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 3,
                width: "35%",
                marginBottom: 8,
              }}
            />
            <div
              style={{
                height: 10,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 3,
                width: "90%",
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (error && !results.length) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "rgba(255,200,100,0.7)",
          fontSize: 13,
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          fill="none"
          style={{ opacity: 0.5 }}
        >
          <circle
            cx="18"
            cy="18"
            r="16"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M18 10v9M18 24v2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ maxWidth: 320, textAlign: "center", lineHeight: 1.6 }}>
          {error}
        </span>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(180,200,255,0.3)",
          fontSize: 13,
        }}
      >
        No results for "{query}"
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        padding: "16px 28px 24px",
        overflow: "auto",
        background: "#080d1a",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(80,120,255,0.2) transparent",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(120,150,255,0.4)",
          marginBottom: 16,
        }}
      >
        {results.length} results for "
        <span style={{ color: "rgba(140,180,255,0.6)" }}>{query}</span>"
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => onNavigate(r.url)}
            style={{
              textAlign: "left",
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.055)",
              borderRadius: 10,
              padding: "12px 16px",
              cursor: "pointer",
              transition: "background 0.12s, border-color 0.12s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(60,100,255,0.1)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "rgba(80,130,255,0.22)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.025)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "rgba(255,255,255,0.055)";
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginBottom: 5,
              }}
            >
              {r.favicon && (
                <img
                  src={r.favicon}
                  width={13}
                  height={13}
                  style={{ borderRadius: 2, flexShrink: 0 }}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 11,
                  color: "rgba(80,200,100,0.75)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  fontFamily: "monospace",
                }}
              >
                {r.url}
              </span>
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#7bb8ff",
                fontWeight: 500,
                marginBottom: 5,
                lineHeight: 1.35,
              }}
            >
              {r.title}
            </div>
            {r.description && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(180,200,230,0.55)",
                  lineHeight: 1.55,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {r.description}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Build an iframe src that actually loads.
 *
 * Strategy:
 *  1. Route all requests through the local /frame-proxy endpoint which strips
 *     X-Frame-Options and CSP frame-ancestors headers — this lets us embed
 *     HomeAssistant, Grafana, local dashboards, etc. without those servers
 *     needing any reconfiguration.
 *  2. In the Tauri native app we use the same proxy but targeting
 *     http://localhost:1420 (the limen-static server that is always running).
 *  3. For "open externally", we use tauri-plugin-shell (native) or window.open.
 */
function proxyUrl(target: string): string {
  if (!target) return "";
  // Relative paths (/ha/, /jupyter/, /code/, etc.) served by this server directly.
  if (target.startsWith("/")) return target;
  // Same-origin absolute URLs (e.g. nginx injects https://domain.com/code/ into
  // __LIMEN_SERVICES__) — strip to just the path so we never hit frame-proxy
  // in production where the middleware doesn't exist.
  try {
    const u = new URL(target);
    if (u.host === window.location.host) return u.pathname + u.search + u.hash;
  } catch {
    /* invalid URL — fall through */
  }
  // All cross-origin URLs — route through /frame-proxy to strip X-Frame-Options/CSP.
  // serve.ts handles /frame-proxy in production (nginx proxies it to port 1421).
  if (window.location.origin.startsWith("tauri://")) {
    return `http://localhost:1421/frame-proxy?url=${encodeURIComponent(target)}`;
  }
  return `${window.location.origin}/frame-proxy?url=${encodeURIComponent(target)}`;
}

async function openExternal(url: string) {
  // Tauri: use plugin-shell open command
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
async function tauriInvoke<T = void>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Home Assistant dual-dashboard ──────────────────────────────────────────────

function HaContent({ win }: { win: WindowInstance }) {
  const cloudUrl =
    win.contentUrl &&
    !win.contentUrl.includes("homeassistant") &&
    !win.contentUrl.includes(":8123")
      ? win.contentUrl
      : HA_URL;
  const localUrl = HA_LOCAL_URL;
  const [active, setActive] = useState<"cloud" | "local">("cloud");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#111318",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 10px",
          background: "#1a1d24",
          borderBottom: "1px solid #2a2d38",
          flexShrink: 0,
        }}
      >
        {(
          [
            { key: "cloud", label: "☁ Cloud HA" },
            { key: "local", label: "🏠 Local HA" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              padding: "3px 14px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: active === key ? 600 : 400,
              background: active === key ? "#3b82f6" : "transparent",
              color: active === key ? "#fff" : "#9ca3af",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {active === "cloud" ? (
          <BrowserContent win={win} initialUrl={cloudUrl} showBar={false} />
        ) : (
          <BrowserContent win={win} initialUrl={localUrl} showBar={false} />
        )}
      </div>
    </div>
  );
}

// ── Browser window ─────────────────────────────────────────────────────────────

function BrowserContent({
  win,
  initialUrl,
  showBar = true,
}: {
  win: WindowInstance;
  initialUrl: string;
  showBar?: boolean;
}) {
  const [input, setInput] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Stable label derived from the shell window id — ensures one native window per browser window.
  const nativeLabel = `browser-${win.id}`;
  const inTauri = isTauri();

  // Open / focus native window on mount (Tauri only).
  useEffect(() => {
    if (!inTauri) return;
    void tauriInvoke("open_browser_window", {
      label: nativeLabel,
      url: currentUrl,
      title: win.title,
    });
    // Close native window when shell window unmounts.
    return () => {
      void tauriInvoke("close_browser_window", { label: nativeLabel });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchLoading(true);
    setSearchResults([]);
    setSearchError("");
    setInput(q);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d: { results?: SearchResult[]; error?: string }) => {
        setSearchResults(d.results ?? []);
        setSearchError(d.error ?? "");
        setSearchLoading(false);
      })
      .catch(() => {
        setSearchError("Search failed. Check your network connection.");
        setSearchLoading(false);
      });
  }, []);

  const navigate = useCallback(
    (target: string) => {
      const resolved = resolveUrl(target);
      if (!resolved) return;
      if (isSearchUrl(resolved)) {
        doSearch(extractQuery(resolved, target.trim()));
        return;
      }
      // Clear search mode when navigating to a real URL
      setSearchQuery("");
      setSearchResults([]);
      setSearchError("");
      setCurrentUrl(resolved);
      setInput(resolved);
      if (inTauri) {
        void tauriInvoke("browser_window_navigate", {
          label: nativeLabel,
          url: resolved,
        });
      }
    },
    [inTauri, nativeLabel, doSearch],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") navigate(input);
  };

  // ── Tauri: native webview is a separate OS window ──────────────────────────
  if (inTauri) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* URL toolbar */}
        {showBar && (
          <div className="win11-browser-bar">
            <div className="win11-browser-url-wrap">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                style={{ opacity: 0.5 }}
              >
                <circle
                  cx="6"
                  cy="6"
                  r="5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M6 1c-1 1.5-1.5 3-1.5 5s.5 3.5 1.5 5M6 1c1 1.5 1.5 3 1.5 5S7 9.5 6 11M1 6h10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                className="win11-browser-url selectable"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                onFocus={(e) => e.target.select()}
                spellCheck={false}
                placeholder="Search or enter URL…"
              />
            </div>
            <button
              className="win11-browser-nav-btn"
              onClick={() => navigate(input)}
              title="Go / Reload"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 7A4 4 0 1 1 4.5 10.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M3 10.5V7.5H6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            color: "rgba(200,220,255,0.55)",
            fontSize: 13,
            background: "rgba(10,15,30,0.6)",
          }}
        >
          <svg
            width="52"
            height="52"
            viewBox="0 0 52 52"
            fill="none"
            style={{ opacity: 0.35 }}
          >
            <circle
              cx="26"
              cy="26"
              r="24"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M26 2c-5 6-8 13-8 24s3 18 8 24M26 2c5 6 8 13 8 24s-3 18-8 24M2 26h48"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ maxWidth: 320, textAlign: "center", lineHeight: 1.5 }}>
            Browser launched in native window.
            <br />
            <span style={{ opacity: 0.6, fontSize: 11 }}>{currentUrl}</span>
          </span>
          <button
            onClick={() =>
              void tauriInvoke("open_browser_window", {
                label: nativeLabel,
                url: currentUrl,
                title: win.title,
              })
            }
            style={{
              padding: "7px 20px",
              borderRadius: 8,
              border: "1px solid rgba(100,160,255,0.3)",
              background: "rgba(60,100,200,0.18)",
              color: "rgba(180,210,255,0.9)",
              cursor: "pointer",
              fontSize: 12,
              letterSpacing: "0.02em",
            }}
          >
            Focus Window
          </button>
        </div>
      </div>
    );
  }

  // ── Browser / dev fallback: iframe + proxy ─────────────────────────────────
  // Search mode: show native search results instead of iframe
  if (searchQuery) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {showBar && (
          <div className="win11-browser-bar">
            <button
              className="win11-browser-nav-btn"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setSearchError("");
                setCurrentUrl("");
                setInput("");
              }}
              title="Back to browser"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M9 2L4 7l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <div className="win11-browser-url-wrap">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                style={{ opacity: 0.5 }}
              >
                <circle
                  cx="5"
                  cy="5"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M8.5 8.5L11 11"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              <input
                className="win11-browser-url selectable"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                onFocus={(e) => e.target.select()}
                spellCheck={false}
                placeholder="Search or enter URL…"
              />
            </div>
            <button
              className="win11-browser-nav-btn"
              onClick={() => navigate(input)}
              title="Search"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle
                  cx="5.5"
                  cy="5.5"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
                <path
                  d="M9 9l3 3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
        <SearchResultsPage
          query={searchQuery}
          results={searchResults}
          loading={searchLoading}
          error={searchError}
          onNavigate={navigate}
        />
      </div>
    );
  }

  return (
    <IframeBrowser
      key={currentUrl}
      url={currentUrl}
      onNavigate={navigate}
      input={input}
      onInput={setInput}
      showBar={showBar}
    />
  );
}

function IframeBrowser({
  url,
  onNavigate,
  input,
  onInput,
  showBar = true,
}: {
  url: string;
  onNavigate: (u: string) => void;
  input: string;
  onInput: (v: string) => void;
  showBar?: boolean;
}) {
  const [loading, setLoading] = useState(!!url);
  const [errored, setErrored] = useState(false);
  // null = probe in-flight; true = reachable; false = unreachable
  const [reachable, setReachable] = useState<boolean | null>(null);
  // Derive display state without synchronous setState inside effects.
  const reach: "checking" | "ok" | "down" = !url
    ? "ok"
    : reachable === null
      ? "checking"
      : reachable
        ? "ok"
        : "down";
  const [retryCount, setRetryCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = proxyUrl(url);

  // Probe reachability on URL/src change or manual retry.
  // - Same-origin (relative /path or absolute https://same-host/path): regular fetch,
  //   check r.ok — catches nginx 502 when backend is down.
  // - Cross-origin absolute: no-cors, can only detect network failure (throws on
  //   connection refused/timeout); HTTP status is inaccessible (opaque response).
  // Only sets state inside async callbacks — satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const sameOrigin =
      src.startsWith("/") ||
      (typeof window !== "undefined" &&
        src.startsWith(window.location.origin + "/"));
    fetch(src, {
      mode: sameOrigin ? "same-origin" : "no-cors",
      signal: ctrl.signal,
    })
      .then((r) =>
        setReachable(
          sameOrigin ? r.ok || r.status === 401 || r.status === 403 : true,
        ),
      )
      .catch(() => setReachable(false))
      .finally(() => clearTimeout(tid));
    return () => {
      ctrl.abort();
      clearTimeout(tid);
    };
  }, [src, retryCount, url]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {showBar && (
        <div className="win11-browser-bar">
          <button
            className="win11-browser-nav-btn"
            onClick={() => iframeRef.current?.contentWindow?.history.back()}
            title="Back"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 2L4 7l5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="win11-browser-nav-btn"
            onClick={() => iframeRef.current?.contentWindow?.history.forward()}
            title="Forward"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="win11-browser-nav-btn"
            onClick={() => onNavigate(url)}
            title="Reload"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M3 7A4 4 0 1 1 4.5 10.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3 10.5V7.5H6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="win11-browser-url-wrap">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ opacity: 0.5 }}
            >
              <circle
                cx="6"
                cy="6"
                r="5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M6 1c-1 1.5-1.5 3-1.5 5s.5 3.5 1.5 5M6 1c1 1.5 1.5 3 1.5 5S7 9.5 6 11M1 6h10"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <input
              className="win11-browser-url selectable"
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onNavigate(input);
              }}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              placeholder="Search or enter URL…"
            />
          </div>
          <button
            className="win11-browser-nav-btn"
            onClick={() => openExternal(url)}
            title="Open externally"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M6 2H2.5A1.5 1.5 0 0 0 1 3.5v8A1.5 1.5 0 0 0 2.5 13h8A1.5 1.5 0 0 0 12 11.5V8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M8 1h5v5M13 1L7 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {loading && !errored && (
        <div
          style={{
            height: 2,
            background:
              "linear-gradient(90deg,#3b82f6 0%,#8b5cf6 60%,transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "browser-load 1.2s linear infinite",
          }}
        />
      )}
      {url &&
        !errored &&
        url.startsWith("https://") &&
        !url.startsWith(window.location.origin) && (
          <div
            style={{
              padding: "4px 10px",
              fontSize: 11,
              background: "rgba(245,158,11,0.08)",
              borderBottom: "1px solid rgba(245,158,11,0.15)",
              color: "rgba(245,158,11,0.7)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>⚠</span>
            <span>External sites may block embedding.</span>
            <button
              onClick={() => openExternal(url)}
              style={{
                marginLeft: "auto",
                padding: "2px 8px",
                fontSize: 10,
                borderRadius: 4,
                border: "1px solid rgba(245,158,11,0.3)",
                background: "rgba(245,158,11,0.1)",
                color: "rgba(245,158,11,0.85)",
                cursor: "pointer",
              }}
            >
              Open in new tab ↗
            </button>
          </div>
        )}
      {!url && !errored && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "rgba(180,200,255,0.35)",
            fontSize: 13,
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            style={{ opacity: 0.3 }}
          >
            <circle
              cx="24"
              cy="24"
              r="22"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M24 2c-4.5 5.5-7 12-7 22s2.5 16.5 7 22M24 2c4.5 5.5 7 12 7 22s-2.5 16.5-7 22M2 24h44"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span>Type a URL or search term above</span>
        </div>
      )}
      {errored && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
          }}
        >
          <span>
            Could not load{" "}
            <strong style={{ color: "rgba(255,255,255,0.7)" }}>{url}</strong>
          </span>
          <button
            onClick={() => openExternal(url)}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Open in system browser
          </button>
        </div>
      )}
      {reach === "down" && !errored && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            color: "rgba(255,255,255,0.45)",
            fontSize: 13,
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            style={{ opacity: 0.3 }}
          >
            <circle
              cx="20"
              cy="20"
              r="18"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M20 12v9M20 27v2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Service not available</span>
          <span style={{ fontSize: 11, opacity: 0.6, fontFamily: "monospace" }}>
            {url}
          </span>
          <button
            onClick={() => {
              setReachable(null);
              setRetryCount((c) => c + 1);
            }}
            style={{
              padding: "5px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Retry
          </button>
        </div>
      )}
      {/* Don't render iframe with empty src — src="" reloads the shell */}
      {src && reach !== "down" && (
        <iframe
          key={src}
          ref={iframeRef}
          src={reach === "checking" ? "" : src}
          className="win11-iframe"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          title="Browser"
          style={{
            flex: 1,
            border: "none",
            display: errored ? "none" : "block",
          }}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setErrored(true);
          }}
        />
      )}
      <style>{`@keyframes browser-load { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }`}</style>
    </div>
  );
}

// ── Iframe ───────────────────────────────────────────────────────────────────

function IframeContent({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      className="win11-iframe"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
      title="Web content"
    />
  );
}

// ── Calculator ──────────────────────────────────────────────────────────────

function CalculatorContent() {
  const [display, setDisplay] = useState("0");
  const [equation, setEquation] = useState("");

  const handle = (val: string) => {
    if (val === "C") {
      setDisplay("0");
      setEquation("");
      return;
    }
    if (val === "=") {
      try {
        const expr = equation.replace(/×/g, "*").replace(/÷/g, "/");
        const res = new Function(`"use strict"; return (${expr})`)() as number;
        setDisplay(String(res));
        setEquation(String(res));
      } catch {
        setDisplay("Error");
      }
      return;
    }
    const nextEq = equation + val;
    setEquation(nextEq);
    setDisplay(
      val.match(/[0-9.]/) ? (display === "0" ? val : display + val) : val,
    );
  };

  return (
    <div className="win11-calc">
      <div className="win11-calc-display">
        <div className="win11-calc-eq">{equation}</div>
        <div className="win11-calc-val">{display}</div>
      </div>
      <div className="win11-calc-grid">
        {[
          "C",
          "÷",
          "×",
          "DEL",
          "7",
          "8",
          "9",
          "-",
          "4",
          "5",
          "6",
          "+",
          "1",
          "2",
          "3",
          "=",
          "0",
          ".",
        ].map((b) => (
          <button
            key={b}
            className={`win11-calc-btn${b === "=" ? " primary" : ""}`}
            onClick={() => handle(b)}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Text Editor ─────────────────────────────────────────────────────────────

function TextEditorContent() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("untitled.txt");
  const [savedText, setSavedText] = useState("");
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = text !== savedText;

  const lines = text.split("\n");
  const lineCount = lines.length;
  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;

  function updateCursor() {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = text.slice(0, pos);
    const ln = before.split("\n").length;
    const col = pos - before.lastIndexOf("\n");
    setCursor({ line: ln, col });
  }

  function doNew() {
    if (isDirty && text.trim() !== "") {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    setText("");
    setSavedText("");
    setFileName("untitled.txt");
  }

  function doOpen() {
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) ?? "";
      setText(content);
      setSavedText(content);
      setFileName(file.name);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function doSave() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setSavedText(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "s") {
      e.preventDefault();
      doSave();
      return;
    }
    if (ctrl && e.key === "o") {
      e.preventDefault();
      doOpen();
      return;
    }
    if (ctrl && e.key === "n") {
      e.preventDefault();
      doNew();
      return;
    }
    // Tab → insert two spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const el = textareaRef.current!;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = text.slice(0, start) + "  " + text.slice(end);
      setText(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  }

  return (
    <div className="win11-editor">
      <input
        ref={fileInputRef}
        type="file"
        accept="text/*,.txt,.md,.json,.yaml,.toml,.csv,.log,.sh,.py,.ts,.tsx,.js,.jsx,.rs,.go"
        style={{ display: "none" }}
        onChange={onFileChosen}
      />
      <div className="win11-editor-toolbar">
        <button title="New (Ctrl+N)" onClick={doNew}>
          New
        </button>
        <button title="Open (Ctrl+O)" onClick={doOpen}>
          Open
        </button>
        <button title="Save (Ctrl+S)" onClick={doSave}>
          Save
        </button>
        <span className={`win11-editor-filename${isDirty ? " dirty" : ""}`}>
          {fileName}
        </span>
        <span className="win11-editor-sep" />
      </div>
      <div className="win11-editor-body">
        <div className="win11-editor-lines" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="win11-editor-area selectable"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          placeholder="Start typing… (Ctrl+O to open, Ctrl+S to save)"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
      <div className="win11-editor-statusbar">
        <span>
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span>
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </span>
        <span>
          {wordCount} word{wordCount !== 1 ? "s" : ""}
        </span>
        <span>
          {charCount} char{charCount !== 1 ? "s" : ""}
        </span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────

function CalendarContent() {
  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const lastDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const prevLastDate = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const todayIso = now.toISOString().slice(0, 10);
  const demoEvents = [
    {
      id: "evt-1",
      title: "Daily system briefing",
      date: todayIso,
      time: "09:00",
      tag: "System",
    },
    {
      id: "evt-2",
      title: "AgentFlow review",
      date: todayIso,
      time: "13:30",
      tag: "Ops",
    },
    {
      id: "evt-3",
      title: "Ammelie tour polish",
      date: todayIso,
      time: "17:00",
      tag: "UX",
    },
    {
      id: "evt-4",
      title: "Home Assistant check",
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        .toISOString()
        .slice(0, 10),
      time: "08:45",
      tag: "Home",
    },
    {
      id: "evt-5",
      title: "Release candidate sync",
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
        .toISOString()
        .slice(0, 10),
      time: "15:00",
      tag: "Build",
    },
  ];
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const cells = [];
  // Prev month days
  for (let i = firstDay; i > 0; i--)
    cells.push({ d: prevLastDate - i + 1, m: "prev" });
  // Current month
  for (let i = 1; i <= lastDate; i++)
    cells.push({ d: i, m: "curr", active: i === now.getDate() });
  // Next month
  while (cells.length < 42)
    cells.push({ d: cells.length - (lastDate + firstDay) + 1, m: "next" });

  const selectedEvents = demoEvents.filter(
    (event) => event.date === selectedDate,
  );
  const nextEvents = demoEvents
    .filter((event) => event.date >= todayIso)
    .slice(0, 4);

  return (
    <div className="win11-calendar-app live">
      <section className="win11-calendar-main">
        <header className="win11-calendar-header">
          <div>
            <h3>
              {now.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <p>
              {now.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="win11-calendar-header-chip">Today</div>
        </header>
        <div className="win11-calendar-grid">
          {days.map((d) => (
            <div key={d} className="win11-calendar-day-head">
              {d}
            </div>
          ))}
          {cells.map((c, i) => {
            const iso =
              c.m === "curr"
                ? new Date(now.getFullYear(), now.getMonth(), c.d)
                    .toISOString()
                    .slice(0, 10)
                : "";
            const selected = c.m === "curr" && iso === selectedDate;
            const hasEvents =
              c.m === "curr" && demoEvents.some((event) => event.date === iso);
            return (
              <button
                key={i}
                className={`win11-calendar-cell ${c.m}${c.active ? " active" : ""}${selected ? " selected" : ""}`}
                onClick={() => {
                  if (c.m === "curr") setSelectedDate(iso);
                }}
              >
                <span>{c.d}</span>
                {hasEvents && <span className="win11-calendar-dot" />}
              </button>
            );
          })}
        </div>
      </section>

      <aside className="win11-calendar-sidepanel">
        <div className="win11-calendar-panel-card">
          <div className="win11-calendar-panel-title">Agenda</div>
          <div className="win11-calendar-panel-subtitle">
            {selectedDate === todayIso ? "Today" : selectedDate}
          </div>
          <div className="win11-calendar-event-list">
            {selectedEvents.length === 0 ? (
              <div className="win11-calendar-empty">No events on this day.</div>
            ) : (
              selectedEvents.map((event) => (
                <div key={event.id} className="win11-calendar-event">
                  <div className="win11-calendar-event-time">{event.time}</div>
                  <div>
                    <div className="win11-calendar-event-title">
                      {event.title}
                    </div>
                    <div className="win11-calendar-event-tag">{event.tag}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="win11-calendar-panel-card">
          <div className="win11-calendar-panel-title">Upcoming</div>
          <div className="win11-calendar-upcoming">
            {nextEvents.map((event) => (
              <div key={event.id} className="win11-calendar-upcoming-row">
                <span>{event.time}</span>
                <strong>{event.title}</strong>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ── Photos ──────────────────────────────────────────────────────────────────

function PhotosContent() {
  const photos = [
    { url: "https://picsum.photos/id/10/800/600", title: "Forest" },
    { url: "https://picsum.photos/id/20/800/600", title: "Desk" },
    { url: "https://picsum.photos/id/30/800/600", title: "Architecture" },
    { url: "https://picsum.photos/id/40/800/600", title: "Abstract" },
    { url: "https://picsum.photos/id/50/800/600", title: "Nature" },
    { url: "https://picsum.photos/id/60/800/600", title: "City" },
  ];
  const [selected, setSelected] = useState(photos[0]);

  return (
    <div className="win11-photos">
      <div className="win11-photos-main">
        <img src={selected.url} alt={selected.title} />
      </div>
      <div className="win11-photos-grid">
        {photos.map((p) => (
          <div
            key={p.url}
            className={`win11-photos-thumb${p === selected ? " active" : ""}`}
            onClick={() => setSelected(p)}
          >
            <img src={p.url} alt={p.title} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Music ───────────────────────────────────────────────────────────────────

function MusicContent() {
  const tracks = [
    {
      title: "Aurora Borealis",
      artist: "Limen Ambient",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    {
      title: "Quantum Dreams",
      artist: "LLM Beats",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
    {
      title: "Digital Horizon",
      artist: "Synth Wave",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
  ];
  const [current, setCurrent] = useState(tracks[0]);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <div className="win11-music">
      <audio
        ref={audioRef}
        src={current.url}
        onEnded={() => setPlaying(false)}
      />
      <div className="win11-music-hero">
        <div className="win11-music-art">🎵</div>
        <div className="win11-music-info">
          <h3>{current.title}</h3>
          <p>{current.artist}</p>
        </div>
      </div>
      <div className="win11-music-controls">
        <button onClick={toggle}>{playing ? "⏸" : "▶"}</button>
      </div>
      <div className="win11-music-list">
        {tracks.map((t) => (
          <div
            key={t.url}
            className={`win11-music-item${t === current ? " active" : ""}`}
            onClick={() => {
              setCurrent(t);
              setPlaying(false);
            }}
          >
            <span>{t.title}</span>
            <small>{t.artist}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Maps ────────────────────────────────────────────────────────────────────

function MapsContent() {
  const places = [
    {
      id: "athens-center",
      name: "Athens Center",
      subtitle: "Walkable city core",
      category: "City",
      eta: "12 min",
      embed:
        "https://www.openstreetmap.org/export/embed.html?bbox=23.713%2C37.973%2C23.743%2C37.989&layer=mapnik",
      notes:
        "Dense central grid with cafes, museums, and transit close together.",
    },
    {
      id: "san-francisco",
      name: "San Francisco Bay",
      subtitle: "Waterfront and downtown",
      category: "City",
      eta: "22 min",
      embed:
        "https://www.openstreetmap.org/export/embed.html?bbox=-122.45%2C37.77%2C-122.38%2C37.81&layer=mapnik",
      notes:
        "A useful demo region for mixed urban routing, waterfront context, and landmarks.",
    },
    {
      id: "london",
      name: "Central London",
      subtitle: "Transit-rich city slice",
      category: "City",
      eta: "18 min",
      embed:
        "https://www.openstreetmap.org/export/embed.html?bbox=-0.15%2C51.48%2C0.1%2C51.52&layer=mapnik",
      notes:
        "Good for testing place cards, distances, and layered urban density.",
    },
    {
      id: "mountain",
      name: "Mountain Escape",
      subtitle: "Quiet terrain sample",
      category: "Nature",
      eta: "48 min",
      embed:
        "https://www.openstreetmap.org/export/embed.html?bbox=11.34%2C46.47%2C11.52%2C46.60&layer=mapnik",
      notes:
        "A calmer map preset that breaks the purely urban feel of the other samples.",
    },
  ];
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(places[0].id);
  const filtered = places.filter((place) =>
    `${place.name} ${place.subtitle} ${place.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const active =
    filtered.find((place) => place.id === activeId) ??
    places.find((place) => place.id === activeId) ??
    places[0];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr)",
        height: "100%",
        background: "#0b1220",
        color: "#e2e8f0",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid rgba(148,163,184,0.12)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Maps</div>
          <div
            style={{
              fontSize: 12,
              color: "rgba(226,232,240,0.55)",
              marginTop: 4,
            }}
          >
            Preset places with quick context, no heavy backend required.
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search preset places"
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.18)",
            background: "rgba(15,23,42,0.8)",
            color: "#e2e8f0",
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
          }}
        >
          {filtered.map((place) => (
            <button
              key={place.id}
              onClick={() => setActiveId(place.id)}
              style={{
                textAlign: "left",
                borderRadius: 14,
                border:
                  place.id === active.id
                    ? "1px solid rgba(96,165,250,0.5)"
                    : "1px solid rgba(148,163,184,0.12)",
                background:
                  place.id === active.id
                    ? "rgba(30,64,175,0.22)"
                    : "rgba(15,23,42,0.55)",
                color: "#e2e8f0",
                padding: 14,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <strong>{place.name}</strong>
                <span style={{ fontSize: 11, color: "#93c5fd" }}>
                  {place.eta}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(226,232,240,0.6)",
                  marginTop: 4,
                }}
              >
                {place.subtitle}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "rgba(148,163,184,0.9)",
                }}
              >
                {place.category}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(226,232,240,0.55)",
                padding: "8px 4px",
              }}
            >
              No preset place matched "{query}".
            </div>
          )}
        </div>
      </aside>

      <div
        style={{ display: "grid", gridTemplateRows: "1fr auto", minWidth: 0 }}
      >
        <iframe
          src={active.embed}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#111827",
          }}
          title={`Map for ${active.name}`}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 16,
            padding: 16,
            borderTop: "1px solid rgba(148,163,184,0.12)",
            background: "rgba(15,23,42,0.96)",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{active.name}</div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(226,232,240,0.64)",
                marginTop: 4,
              }}
            >
              {active.subtitle}
            </div>
            <p
              style={{
                margin: "10px 0 0",
                lineHeight: 1.5,
                color: "rgba(226,232,240,0.78)",
              }}
            >
              {active.notes}
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {[
              { label: "Mode", value: "Explore" },
              { label: "Travel", value: active.eta },
              { label: "Layer", value: "OpenStreetMap" },
              { label: "Focus", value: active.category },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(148,163,184,0.1)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgba(148,163,184,0.8)",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 600 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Minesweeper ─────────────────────────────────────────────────────────────

function buildMineGrid() {
  const newGrid = Array.from({ length: 100 }).map(() => ({
    v: 0,
    r: false,
    f: false,
    exploded: false,
  }));
  for (let i = 0; i < 15; i++) {
    let r = Math.floor(Math.random() * 100);
    while (newGrid[r].v === -1) r = Math.floor(Math.random() * 100);
    newGrid[r].v = -1;
  }
  for (let i = 0; i < 100; i++) {
    if (newGrid[i].v === -1) continue;
    const x = i % 10,
      y = Math.floor(i / 10);
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (
          nx >= 0 &&
          nx < 10 &&
          ny >= 0 &&
          ny < 10 &&
          newGrid[ny * 10 + nx].v === -1
        )
          count++;
      }
    }
    newGrid[i].v = count;
  }
  return newGrid;
}

function MinesweeperContent() {
  const [grid, setGrid] =
    useState<{ v: number; r: boolean; f: boolean; exploded: boolean }[]>(
      buildMineGrid,
    );
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const numberColors: Record<number, string> = {
    1: "#1d4ed8",
    2: "#15803d",
    3: "#b91c1c",
    4: "#312e81",
    5: "#92400e",
    6: "#0f766e",
    7: "#111827",
    8: "#475569",
  };

  const init = () => {
    setGrid(buildMineGrid());
    setGameOver(false);
    setWon(false);
  };

  const reveal = (i: number) => {
    if (gameOver || won || grid[i].r || grid[i].f) return;
    const newGrid = [...grid];
    if (newGrid[i].v === -1) {
      setGameOver(true);
      newGrid[i].exploded = true;
      newGrid.forEach((c) => {
        if (c.v === -1) c.r = true;
      });
    } else {
      const q = [i];
      while (q.length) {
        const curr = q.shift()!;
        if (newGrid[curr].r || newGrid[curr].f) continue;
        newGrid[curr].r = true;
        if (newGrid[curr].v === 0) {
          const x = curr % 10,
            y = Math.floor(curr / 10);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy;
              if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10)
                q.push(ny * 10 + nx);
            }
          }
        }
      }
    }
    const cleared = newGrid.filter((cell) => cell.r && cell.v !== -1).length;
    if (cleared === 85) setWon(true);
    setGrid(newGrid);
  };

  const toggleFlag = (i: number) => {
    if (gameOver || won || grid[i].r) return;
    const next = [...grid];
    next[i].f = !next[i].f;
    setGrid(next);
  };

  const minesLeft = 15 - grid.filter((cell) => cell.f).length;

  return (
    <div className="mine-root">
      <div className="mine-shell">
        <div className="mine-toolbar">
          <div className="mine-counter">
            {String(Math.max(0, minesLeft)).padStart(3, "0")}
          </div>
          <button className="mine-reset-btn" onClick={init} title="New game">
            {gameOver ? "☹" : won ? "😎" : "🙂"}
          </button>
          <div className="mine-counter">
            {String(grid.filter((cell) => cell.r).length).padStart(3, "0")}
          </div>
        </div>

        <div className="mine-grid">
          {grid.map((c, i) => (
            <button
              key={i}
              className={`mine-cell${c.r ? " revealed" : ""}${c.exploded ? " exploded" : ""}`}
              style={c.r && c.v > 0 ? { color: numberColors[c.v] } : undefined}
              onClick={() => reveal(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(i);
              }}
            >
              {c.r ? (c.v === -1 ? "✹" : c.v || "") : c.f ? "⚑" : ""}
            </button>
          ))}
        </div>

        <div className="mine-footer">
          <span>
            Left click reveals. Right click flags. Classic board, lighter
            chrome.
          </span>
          <button className="wg-btn" onClick={init}>
            Restart
          </button>
        </div>
      </div>
      {gameOver && (
        <div className="wg-overlay-card">
          <strong>Boom</strong>
          <span>The minefield blew up. Start a fresh board.</span>
          <button className="wg-btn" onClick={init}>
            Try Again
          </button>
        </div>
      )}
      {won && (
        <div className="wg-overlay-card">
          <strong>Cleared</strong>
          <span>You found every safe square.</span>
          <button className="wg-btn" onClick={init}>
            New Game
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tutorial ────────────────────────────────────────────────────────────────

function TutorialContent() {
  const [step, setStep] = useState(0);
  const { setHasSeenTutorial, openWindow, closeWindow, windows } =
    useShellStore();

  const steps = [
    {
      title: "Welcome to Limen",
      content:
        "Limen is a voice-first, AI-native desktop shell. This tour will show you the basics.",
    },
    {
      title: "Voice Control",
      content:
        "Say 'Hey Limen' to activate the AI. You can ask to open apps, change settings, or just chat.",
    },
    {
      title: "Apps & Paradigms",
      content:
        "You can change the look of your desktop in Settings. Try macOS, Unix, or even Retro DOS styles!",
    },
    {
      title: "Mobile Companion",
      content:
        "Connect your phone to use it as a remote control, microphone, or second screen.",
    },
  ];

  const finish = () => {
    setHasSeenTutorial(true);
    // Close this tutorial window
    const thisWin = windows.find((w) => w.contentType === "tutorial");
    if (thisWin) closeWindow(thisWin.id);
  };

  const openMind = () => {
    setHasSeenTutorial(true);
    // Close tutorial, open Limen Mind
    const thisWin = windows.find((w) => w.contentType === "tutorial");
    if (thisWin) closeWindow(thisWin.id);
    import("../../constants/apps").then(({ getApp }) => {
      const app = getApp("limen-mind");
      if (app) openWindow(app);
    });
  };

  return (
    <div className="win11-tutorial-app">
      <div className="win11-tutorial-card">
        <h2>{steps[step].title}</h2>
        <p>{steps[step].content}</p>
        <div className="win11-tutorial-nav">
          {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
          {step < steps.length - 1 ? (
            <button className="primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "flex-end",
              }}
            >
              <button className="primary" onClick={openMind}>
                🧠 Open Limen Mind
              </button>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: "2px 0",
                }}
                onClick={finish}
              >
                skip — just get started
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="win11-tutorial-dots">
        {steps.map((_, i) => (
          <span key={i} className={i === step ? "active" : ""} />
        ))}
      </div>
    </div>
  );
}

// ── Files ────────────────────────────────────────────────────────────────────

// ── Files helpers ─────────────────────────────────────────────────────────────

interface FsEntry {
  name: string;
  path: string;
  kind: string;
  ext: string;
  size?: number;
  modified?: number;
}

const SIDEBAR_PLACES = [
  { label: "Limen", icon: "🧠", path: "/opt/limen" },
  { label: "Home", icon: "🏠", path: "/root" },
  { label: "Config", icon: "⚙️", path: "/config" },
  { label: "Tmp", icon: "📥", path: "/tmp" },
  { label: "Root", icon: "💾", path: "/" },
];

const TEXT_EXTS = new Set([
  "txt",
  "md",
  "py",
  "rs",
  "ts",
  "js",
  "tsx",
  "jsx",
  "json",
  "toml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "css",
  "html",
  "htm",
  "xml",
  "csv",
  "log",
  "env",
  "cfg",
  "ini",
  "conf",
  "lock",
]);
const IMG_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"]);

function fileIcon(e: FsEntry): string {
  if (e.kind === "dir") return "📁";
  const x = e.ext;
  if (x === "waldiez") return "🌀";
  if (TEXT_EXTS.has(x))
    return x === "md"
      ? "📄"
      : x === "py"
        ? "🐍"
        : x === "rs"
          ? "⚙️"
          : x === "json"
            ? "📋"
            : "📝";
  if (IMG_EXTS.has(x)) return "🖼️";
  if (AUDIO_EXTS.has(x)) return "🎵";
  if (["zip", "tar", "gz", "bz2", "xz", "7z"].includes(x)) return "📦";
  if (["pdf"].includes(x)) return "📕";
  if (["mp4", "mkv", "webm", "avi", "mov"].includes(x)) return "🎬";
  return "📄";
}

function fmtSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function openFileWith(
  entry: FsEntry,
  openWindow: (a: import("../../store/shell").AppDef) => void,
  notify: (n: {
    title: string;
    body: string;
    kind: "info" | "warn" | "error" | "alert";
  }) => void,
) {
  const x = entry.ext;
  if (x === "waldiez") {
    openWindow({
      id: `waldiez-${entry.name}`,
      title: entry.name,
      icon: "🌀",
      contentType: "waldiez-native",
      contentUrl: entry.path,
      defaultWidth: 1380,
      defaultHeight: 900,
    });
    return;
  }
  if (TEXT_EXTS.has(x) || x === "") {
    openWindow({
      id: `edit-${entry.name}`,
      title: entry.name,
      icon: "📝",
      contentType: "text-editor",
      contentUrl: entry.path,
      defaultWidth: 900,
      defaultHeight: 680,
    });
    return;
  }
  if (IMG_EXTS.has(x)) {
    openWindow({
      id: `img-${entry.name}`,
      title: entry.name,
      icon: "🖼️",
      contentType: "photos",
      contentUrl: entry.path,
      defaultWidth: 900,
      defaultHeight: 680,
    });
    return;
  }
  if (AUDIO_EXTS.has(x)) {
    openWindow({
      id: `audio-${entry.name}`,
      title: entry.name,
      icon: "🎵",
      contentType: "music",
      contentUrl: entry.path,
      defaultWidth: 700,
      defaultHeight: 500,
    });
    return;
  }
  notify({
    title: "Files",
    body: `No app registered for .${x || "unknown"} files`,
    kind: "info",
  });
}

// ── FilesContent ──────────────────────────────────────────────────────────────

const FILES_DEFAULT_PATH = "/opt/limen";

function FilesContent() {
  const [path, setPath] = useState(FILES_DEFAULT_PATH);
  const [history, setHistory] = useState<string[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FsEntry | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const openWindow = useShellStore((s) => s.openWindow);
  const addNotification = useShellStore((s) => s.addNotification);
  const inTauri = isTauri();

  const loadDir = useCallback(
    async (dir: string) => {
      setLoading(true);
      setError(null);
      setSelected(null);
      setPreview(null);
      try {
        let result: FsEntry[];
        if (inTauri) {
          result = await tauriInvoke<FsEntry[]>("list_dir", { path: dir });
        } else {
          const res = await fetch(
            `/api/fs/list?path=${encodeURIComponent(dir)}`,
          );
          const data = (await res.json()) as FsEntry[] | { error: string };
          if (!res.ok || "error" in data)
            throw new Error("error" in data ? data.error : "Failed");
          result = data as FsEntry[];
        }
        setEntries(result);
      } catch (e) {
        setError(String(e));
        setEntries([]);
      }
      setLoading(false);
    },
    [inTauri],
  );

  useEffect(() => {
    void loadDir(path);
  }, [path, loadDir]);

  const navigate = (newPath: string) => {
    setHistory((h) => [...h, path]);
    setPath(newPath);
    setSearch("");
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setPath(prev);
    setSearch("");
  };

  const selectEntry = async (entry: FsEntry) => {
    setSelected(entry);
    setPreview(null);
    if (entry.kind === "file" && TEXT_EXTS.has(entry.ext)) {
      try {
        let text: string;
        if (inTauri) {
          text = await tauriInvoke<string>("read_text_file", {
            path: entry.path,
          });
        } else {
          const res = await fetch(
            `/api/fs/read?path=${encodeURIComponent(entry.path)}`,
          );
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
          text = data.text ?? "";
        }
        setPreview(text.slice(0, 3000));
      } catch {
        /* no preview */
      }
    }
  };

  const openEntry = (entry: FsEntry) => {
    if (entry.kind === "dir") {
      navigate(entry.path);
      return;
    }
    openFileWith(entry, openWindow, addNotification);
  };

  const filtered = entries.filter(
    (e) => !search || e.name.toLowerCase().includes(search.toLowerCase()),
  );
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="win11-files">
      {/* Toolbar */}
      <div className="win11-files-toolbar">
        <button
          className="win11-files-nav-btn"
          onClick={goBack}
          title="Back"
          disabled={history.length === 0}
        >
          ‹
        </button>
        <button
          className="win11-files-nav-btn"
          onClick={() => void loadDir(path)}
          title="Refresh"
        >
          ↻
        </button>
        {/* Breadcrumbs */}
        <div className="win11-files-path">
          <button
            className="win11-files-crumb"
            onClick={() => navigate("/")}
            title="Root"
          >
            /
          </button>
          {parts.map((p, i) => {
            const isLast = i === parts.length - 1;
            return (
              <span key={i} className="win11-files-crumb-seg">
                <span className="win11-files-crumb-sep">›</span>
                <button
                  className={`win11-files-crumb${isLast ? " active" : ""}`}
                  onClick={() =>
                    navigate("/" + parts.slice(0, i + 1).join("/"))
                  }
                >
                  {p}
                </button>
              </span>
            );
          })}
        </div>
        <div className="win11-files-view-toggle">
          <button
            className={`win11-files-nav-btn${view === "grid" ? " active" : ""}`}
            onClick={() => setView("grid")}
            title="Grid"
          >
            ▦
          </button>
          <button
            className={`win11-files-nav-btn${view === "list" ? " active" : ""}`}
            onClick={() => setView("list")}
            title="List"
          >
            ☰
          </button>
        </div>
        <input
          className="win11-files-search selectable"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Body */}
      <div className="win11-files-body">
        {/* Sidebar */}
        <aside className="win11-files-sidebar">
          {SIDEBAR_PLACES.map((p) => (
            <button
              key={p.path}
              className={`win11-files-sidebar-item${path === p.path ? " active" : ""}`}
              onClick={() => navigate(p.path)}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </aside>

        {/* Grid / list */}
        <div className={`win11-files-grid${view === "list" ? " list" : ""}`}>
          {loading && (
            <div className="win11-files-empty" style={{ gridColumn: "1/-1" }}>
              Loading…
            </div>
          )}
          {error && (
            <div
              className="win11-files-empty"
              style={{ color: "#f87171", gridColumn: "1/-1" }}
            >
              {error}
            </div>
          )}
          {filtered.map((entry) => (
            <button
              key={entry.path}
              className={`win11-files-item${selected?.path === entry.path ? " selected" : ""}`}
              onClick={() => void selectEntry(entry)}
              onDoubleClick={() => openEntry(entry)}
            >
              <span className="win11-files-item-icon">{fileIcon(entry)}</span>
              <span className="win11-files-item-name">{entry.name}</span>
              {view === "list" && (
                <span className="win11-files-item-meta">
                  {entry.kind === "file" ? fmtSize(entry.size) : ""}
                </span>
              )}
              {view === "list" && (
                <span className="win11-files-item-meta">
                  {fmtDate(entry.modified)}
                </span>
              )}
            </button>
          ))}
          {!loading && !error && filtered.length === 0 && (
            <div className="win11-files-empty" style={{ gridColumn: "1/-1" }}>
              Empty folder.
            </div>
          )}
        </div>

        {/* Preview panel */}
        <aside className="win11-files-preview">
          {selected ? (
            <>
              <div className="win11-files-preview-icon">
                {fileIcon(selected)}
              </div>
              <div className="win11-files-preview-name">{selected.name}</div>
              <div className="win11-files-preview-kind">
                {selected.kind === "dir"
                  ? "Folder"
                  : `.${selected.ext || "file"}`}
              </div>
              <div className="win11-files-preview-card">
                <div>
                  <strong>Size</strong>
                  <span>{fmtSize(selected.size)}</span>
                </div>
                <div>
                  <strong>Modified</strong>
                  <span>{fmtDate(selected.modified)}</span>
                </div>
              </div>
              {preview && (
                <pre
                  className="win11-files-preview-text"
                  style={{
                    fontSize: 10,
                    lineHeight: 1.4,
                    maxHeight: 180,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {preview}
                </pre>
              )}
              <button
                onClick={() => openEntry(selected)}
                style={{
                  marginTop: 8,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "1px solid rgba(100,160,255,0.3)",
                  background: "rgba(60,100,200,0.18)",
                  color: "rgba(180,210,255,0.9)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Open
              </button>
            </>
          ) : (
            <div className="win11-files-empty">Select a file to preview.</div>
          )}
        </aside>
      </div>

      {/* Status bar */}
      <div className="win11-files-statusbar">
        {selected
          ? `${selected.name} · ${selected.kind === "dir" ? "Folder" : fmtSize(selected.size)}`
          : `${filtered.length} items`}
      </div>
    </div>
  );
}

// ── Mail ─────────────────────────────────────────────────────────────────────

const DEMO_INBOX = [
  {
    id: 1,
    from: "LIMEN OS",
    subject: "Welcome to Limen!",
    preview:
      "Your AI-first desktop is ready. Explore voice commands, Waldiez, and Ammelie Reader.",
    ts: "10:01",
    read: false,
    star: true,
  },
  {
    id: 2,
    from: "AgentFlow Monitor",
    subject: "System health: ✓ nominal",
    preview: "All 4 agents running. No anomalies detected in the last 24h.",
    ts: "09:42",
    read: false,
    star: false,
  },
  {
    id: 3,
    from: "Ammelie",
    subject: "New .waldiez file detected",
    preview: "Drop your workflow file here to visualise and run it.",
    ts: "09:15",
    read: true,
    star: false,
  },
  {
    id: 4,
    from: "Home Assistant",
    subject: "Automation triggered",
    preview: "Scene 'Evening' activated at sunset (18:47).",
    ts: "Yesterday",
    read: true,
    star: false,
  },
  {
    id: 5,
    from: "Waldiez Studio",
    subject: "New release: v0.4.0",
    preview:
      "Drag-and-drop orchestration for AG2 agents. Now with voice control.",
    ts: "Mon",
    read: true,
    star: true,
  },
];

function MailContent() {
  const [selected, setSelected] = useState(DEMO_INBOX[0]);
  const [inbox, setInbox] = useState(DEMO_INBOX);

  const markRead = (id: number) =>
    setInbox((m) => m.map((e) => (e.id === id ? { ...e, read: true } : e)));

  return (
    <div className="win11-mail">
      {/* Folder sidebar */}
      <aside className="win11-mail-sidebar">
        {[
          ["📥", "Inbox", inbox.filter((m) => !m.read).length],
          ["⭐", "Starred", inbox.filter((m) => m.star).length],
          ["📤", "Sent", 0],
          ["🗑️", "Trash", 0],
        ].map(([icon, label, count]) => (
          <button key={String(label)} className="win11-mail-folder">
            <span>{icon}</span>
            <span>{label}</span>
            {Number(count) > 0 && (
              <span className="win11-mail-badge">{count}</span>
            )}
          </button>
        ))}
      </aside>
      {/* Message list */}
      <div className="win11-mail-list">
        {inbox.map((msg) => (
          <button
            key={msg.id}
            className={`win11-mail-row${selected?.id === msg.id ? " active" : ""}${!msg.read ? " unread" : ""}`}
            onClick={() => {
              setSelected(msg);
              markRead(msg.id);
            }}
          >
            <div className="win11-mail-row-from">{msg.from}</div>
            <div className="win11-mail-row-subject">{msg.subject}</div>
            <div className="win11-mail-row-preview">{msg.preview}</div>
            <div className="win11-mail-row-ts">{msg.ts}</div>
          </button>
        ))}
      </div>
      {/* Reading pane */}
      {selected && (
        <div className="win11-mail-reading">
          <div className="win11-mail-reading-header">
            <div className="win11-mail-reading-subject">{selected.subject}</div>
            <div className="win11-mail-reading-meta">
              <span>
                From: <strong>{selected.from}</strong>
              </span>
              <span>{selected.ts}</span>
            </div>
          </div>
          <div className="win11-mail-reading-body">{selected.preview}</div>
          <div className="win11-mail-reading-actions">
            <button className="win11-mail-action-btn">↩ Reply</button>
            <button className="win11-mail-action-btn">↪ Forward</button>
            <button className="win11-mail-action-btn">🗑 Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Native app placeholder ───────────────────────────────────────────────────

function NativeContent({ win }: { win: WindowInstance }) {
  const launch = () => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("launch_app", { appId: win.appId }))
      .catch(() => {});
  };

  return (
    <div className="win11-native-placeholder">
      <div className="win11-native-icon">{win.icon}</div>
      <div className="win11-native-title">{win.title}</div>
      <div className="win11-native-desc">
        This app opens natively on your system.
      </div>
      <button className="win11-native-launch" onClick={launch}>
        Launch {win.title}
      </button>
    </div>
  );
}

// ── Limen Fin ───────────────────────────────────────────────────────────────

function LimenFinContent() {
  const [wid] = useState(() => {
    const now = new Date();
    const d = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
    const t = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
    const otp = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${d}T${t}.0001Z-${otp}`;
  });

  const LEDGER = [
    {
      wid: "20260314T080012.0001Z-a3f9c2",
      label: "Morning coffee ☕",
      amount: "-3.50",
      mood: "dawn",
    },
    {
      wid: "20260314T091533.0002Z-b7e1d4",
      label: "Transport 🚌",
      amount: "-12.00",
      mood: "morning",
    },
    {
      wid: "20260314T120041.0003Z-c2a8f1",
      label: "Lunch 🥗",
      amount: "-14.80",
      mood: "afternoon",
    },
    {
      wid: "20260314T150000.0004Z-d9b3e7",
      label: "Salary deposit 💼",
      amount: "+3200.00",
      mood: "celebration",
    },
    {
      wid: "20260314T183022.0005Z-e4c6a9",
      label: "Groceries 🛒",
      amount: "-67.40",
      mood: "evening",
    },
  ];

  const moodColor: Record<string, string> = {
    dawn: "#f59e0b",
    morning: "#3b82f6",
    afternoon: "#3b82f6",
    evening: "#f97316",
    celebration: "#fbbf24",
  };

  return (
    <div
      className="selectable"
      style={{
        height: "100%",
        background: "#08080f",
        color: "#e2e8f0",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid rgba(251,191,36,0.12)",
          background: "rgba(251,191,36,0.03)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#92400e",
            letterSpacing: "0.15em",
            marginBottom: 4,
          }}
        >
          LIMEN FIN — WID LEDGER
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fbbf24" }}>
            $3,102.30
          </span>
          <span style={{ fontSize: 10, color: "#64748b" }}>{wid}</span>
        </div>
      </div>

      {/* Coming soon banner */}
      <div
        style={{
          margin: "12px 16px 0",
          padding: "10px 14px",
          background: "rgba(251,191,36,0.06)",
          border: "1px solid rgba(251,191,36,0.15)",
          borderRadius: 8,
          fontSize: 11,
          color: "#92400e",
          lineHeight: 1.6,
        }}
      >
        💰 <strong style={{ color: "#fbbf24" }}>Limen Fin</strong> is coming — a
        voice-first, WID-stamped financial layer. Every transaction gets a WID.
        Every budget entry is auditable. Self-healing reconciliation via Beacon
        MQTT.
        <br />
        <span style={{ color: "#64748b" }}>
          Clone <code>waldiez/bank</code> to unlock the full ledger engine.
        </span>
      </div>

      {/* Demo ledger */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        <div
          style={{
            fontSize: 10,
            color: "#475569",
            marginBottom: 8,
            letterSpacing: "0.1em",
          }}
        >
          RECENT TRANSACTIONS
        </div>
        {LEDGER.map((tx) => (
          <div
            key={tx.wid}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: moodColor[tx.mood] ?? "#475569",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#e2e8f0" }}>{tx.label}</div>
              <div
                style={{
                  fontSize: 9,
                  color: "#475569",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tx.wid}
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: tx.amount.startsWith("+") ? "#10b981" : "#94a3b8",
                flexShrink: 0,
              }}
            >
              {tx.amount}
            </div>
          </div>
        ))}
      </div>

      {/* Footer tags */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {[
          "WID ledger",
          "voice payments",
          "Beacon reconciliation",
          "mood-aware",
          "OTP receipts",
          "waldiez/bank",
        ].map((t) => (
          <span
            key={t}
            style={{
              fontSize: 10,
              color: "#92400e",
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.12)",
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
