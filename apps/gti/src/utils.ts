import type { Hash } from "./types";

/**
 * Given a multi-line string, return the first line excluding '\n'.
 * If no newlines in the string, return the whole string.
 */
export function firstLine(s: string): string {
  return s.split("\n", 1)[0];
}

export function firstOfIterable<T>(it: IterableIterator<T>): T | undefined {
  return it.next().value;
}

/** Get the short 12-character hash from a full hash. */
export function short(hash: Hash): string {
  return hash.slice(0, 12);
}

export function assert(
  shouldBeTrue: boolean,
  error: string
): asserts shouldBeTrue {
  if (!shouldBeTrue) {
    throw new Error(error);
  }
}

export type NonNullReactElement = React.ReactElement | React.ReactFragment;

/**
 * name of the gti platform being used,
 * for example 'browser' or 'vscode'.
 * Note: This is exposed outisde of gti/platform.ts to prevent import cycles.
 */
export function gtiPlatformName(): string {
  return window.gtiPlatform?.platformName ?? "browser";
}

export function getWindowWidthInPixels(): number {
  if (process.env.NODE_ENV === "test") {
    return 1000;
  }
  // Use client width and not screen width to handle embedding as an iframe.
  return document.body.clientWidth;
}
