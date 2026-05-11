import { useState, useEffect } from "react";

export type DeviceSize = "mobile" | "tablet" | "desktop";

/** px thresholds (exclusive upper bound) */
const BREAKPOINTS = { mobile: 768, tablet: 1280 } as const;

function classify(width: number): DeviceSize {
  if (width < BREAKPOINTS.mobile) return "mobile";
  if (width < BREAKPOINTS.tablet) return "tablet";
  return "desktop";
}

/**
 * Returns the current viewport breakpoint using multiple signals
 * (window resize, visualViewport resize, and document resize observer).
 * mobile  < 768 px
 * tablet  768 – 1279 px
 * desktop ≥ 1280 px
 */
export function useDeviceSize(): DeviceSize {
  const [size, setSize] = useState<DeviceSize>(() =>
    typeof window !== "undefined" ? classify(window.innerWidth) : "desktop",
  );

  useEffect(() => {
    const getWidth = () =>
      window.visualViewport?.width ??
      document.documentElement.clientWidth ??
      window.innerWidth;

    const update = () => setSize(classify(getWidth()));
    update();

    const obs = new ResizeObserver(update);
    obs.observe(document.documentElement);
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update, {
      passive: true,
    });

    return () => {
      obs.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return size;
}
