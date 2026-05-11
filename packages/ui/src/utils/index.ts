/** Map a value from one range to another. */
export const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);

/** Clamp a value to [min, max]. */
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * clamp(t, 0, 1);

/** Return a stable CSS-style hex string from a Color3. */
export const toHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
