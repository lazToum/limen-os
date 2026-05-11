// Lightweight HLC-WID generator for games (no external dep required in limen-os)
let _counter = 0;
let _lastMs = 0;

/** Generate a simple HLC-WID compatible timestamp string. */
export const nextWid = (): string => {
  const now = Date.now();
  if (now === _lastMs) {
    _counter++;
  } else {
    _counter = 0;
    _lastMs = now;
  }
  const d = new Date(now);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  const pad4 = (n: number) => String(n).padStart(4, "0");
  const ts = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}${pad3(d.getUTCMilliseconds())}.${pad4(_counter)}Z-games`;
  return ts;
};
