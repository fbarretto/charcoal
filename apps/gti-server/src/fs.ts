import fs from "fs";
import path from "path";

/**
 * Check if file path exists.
 * May still throw non-ENOENT fs access errors.
 * Note: this works on Node 10.x
 */
export function exists(file: string): Promise<boolean> {
  return fs.promises
    .stat(file)
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return false;
      } else {
        throw error;
      }
    });
}

/**
 * Add a trailing path sep (/ or \) if one does not exist
 */
export function ensureTrailingPathSep(p: string): string {
  if (p.endsWith(path.sep)) {
    return p;
  }
  return p + path.sep;
}

/**
 * Add a trailing path sep (/ or \) if one does not exist
 */
export function removeLeadingPathSep(p: string): string {
  if (p.startsWith(path.sep)) {
    return p.slice(1);
  }
  return p;
}
