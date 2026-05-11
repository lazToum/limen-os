import { useShellStore } from "../store/shell";

/**
 * Full-screen Flutter web companion app overlay.
 *
 * In dev:  proxied at /mobile/ → http://localhost:4174
 *          (set VITE_FLUTTER_URL=http://localhost:4174 to point directly)
 * In prod: Flutter web build served at /mobile/ alongside the shell dist.
 */
const FLUTTER_URL: string =
  (import.meta.env.VITE_FLUTTER_URL as string | undefined) ??
  "/mobile/index.html";

export function MobileCompanion() {
  const { setDeviceOverride, setParadigm } = useShellStore();

  const exitMobile = () => {
    setDeviceOverride("desktop");
    setParadigm("win11");
  };

  return (
    <div className="mobile-companion">
      {/* Thin header bar — escape hatch back to desktop */}
      <div className="mobile-companion-bar">
        <span className="mobile-companion-title">
          <span className="mobile-companion-logo">⬡</span>
          Limen Mobile
        </span>
        <div className="mobile-companion-bar-actions">
          <button
            className="mobile-companion-btn"
            title="Switch to desktop view"
            onClick={exitMobile}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect
                x="1"
                y="3"
                width="12"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M4 12.5h6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M7 12v.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Desktop
          </button>
        </div>
      </div>

      {/* Flutter web iframe */}
      <iframe
        src={FLUTTER_URL}
        className="mobile-companion-frame"
        title="Limen Mobile Companion"
        allow="camera; microphone; geolocation"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
