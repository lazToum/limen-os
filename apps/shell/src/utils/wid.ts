import { HLCWidGen } from "@waldiez/wid";

const gen = new HLCWidGen({
  node: "shell",
  W: 4,
  Z: 6,
  timeUnit: "sec",
});

/**
 * Generate a monotonic HLC-WID for the shell.
 */
export function wid(): string {
  return gen.next();
}
