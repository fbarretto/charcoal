import type { Tracker } from "@withgraphite/gti-server/src/analytics/tracker";

declare global {
  interface Window {
    globalGtiClientTracker: Tracker<Record<string, never>>;
  }
}
/**
 * Globally access analytics tracker, to prevent cyclical imports.
 * Should technically only be nullable if used at the top level.
 */
export function getTracker(): Tracker<Record<string, never>> | undefined {
  return window.globalGtiClientTracker;
}
