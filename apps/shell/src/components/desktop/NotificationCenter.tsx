import { useEffect, useRef } from "react";
import { useShellStore } from "../../store/shell";

interface Props {
  onClose: () => void;
}

export function NotificationCenter({ onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const notifications = useShellStore((s) => s.notifications);
  const dismissNotification = useShellStore((s) => s.dismissNotification);
  const clearNotifications = useShellStore((s) => s.clearNotifications);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={panelRef} className="win11-notification-center">
      <div className="win11-notification-center-header">
        <div>
          <div className="win11-notification-center-title">Notifications</div>
          <div className="win11-notification-center-subtitle">
            {notifications.length === 0
              ? "No recent activity"
              : `${notifications.length} in history`}
          </div>
        </div>
        <button
          className="win11-notification-center-clear"
          onClick={() => clearNotifications()}
          disabled={notifications.length === 0}
        >
          Clear all
        </button>
      </div>

      <div className="win11-notification-center-list">
        {notifications.length === 0 ? (
          <div className="win11-notification-center-empty">
            New alerts, replies, and system notices will land here.
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`win11-notification-card ${n.kind}`}>
              <button
                className="win11-notification-dismiss"
                onClick={() => dismissNotification(n.id)}
                title="Dismiss"
              >
                ×
              </button>
              <div className="win11-notification-card-title">{n.title}</div>
              <div className="win11-notification-card-body">{n.body}</div>
              <div className="win11-notification-card-time">
                {new Date(n.ts).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
