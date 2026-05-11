import { AnimatePresence, motion } from "framer-motion";
import { useShellStore, type Notification } from "../store/shell";

const KIND_COLORS: Record<Notification["kind"], string> = {
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#ef4444",
  alert: "#8b5cf6",
};

/**
 * NotificationTray — spatial notifications anchored top-right.
 * Each toast auto-dismisses after 6s. Click to dismiss immediately.
 */
export function NotificationTray() {
  const { notifications, dismissNotification } = useShellStore();
  const recent = notifications.slice(0, 5);

  return (
    <div className="pointer-events-none fixed top-4 right-4 flex flex-col gap-2 w-80">
      <AnimatePresence initial={false}>
        {recent.map((n) => (
          <NotificationToast
            key={n.id}
            notification={n}
            onDismiss={() => dismissNotification(n.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotificationToast({
  notification: n,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void;
}) {
  const color = KIND_COLORS[n.kind];

  // Auto-dismiss.
  const handleMount = (el: HTMLDivElement | null) => {
    if (!el) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  };

  return (
    <motion.div
      ref={handleMount}
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={onDismiss}
      className="pointer-events-auto cursor-pointer glass px-4 py-3"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <p className="font-medium text-sm text-white truncate">{n.title}</p>
      {n.body && (
        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
      )}
    </motion.div>
  );
}
