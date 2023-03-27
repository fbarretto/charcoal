// Compatibility utilities

import { AbortController as AbortControllerCompat } from "node-abort-controller";

/**
 * Like `new AbortController()` but works on older nodejs < 14.
 */
export function newAbortController(): AbortController {
  if (typeof AbortController === "function") {
    // Prefer native AbortController.
    return new AbortController();
  } else {
    return new AbortControllerCompat() as AbortController;
  }
}
