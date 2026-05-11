import { AnimatePresence } from "framer-motion";
import { useShellStore } from "../../store/shell";
import { Window } from "./Window";

interface Props {
  insetTop?: number;
  insetBottom?: number;
}

export function WindowManager({ insetTop = 0, insetBottom = 48 }: Props) {
  const windows = useShellStore((s) => s.windows);

  return (
    <div
      style={
        {
          position: "fixed",
          inset: 0,
          top: insetTop,
          bottom: insetBottom,
          pointerEvents: "none",
          zIndex: 100,
          // CSS vars inherited by child Window components (even with position:fixed)
          "--wm-inset-top": `${insetTop}px`,
          "--wm-inset-bottom": `${insetBottom}px`,
        } as React.CSSProperties
      }
    >
      <AnimatePresence>
        {windows.map((win) => (
          <Window key={win.id} win={win} />
        ))}
      </AnimatePresence>
    </div>
  );
}
