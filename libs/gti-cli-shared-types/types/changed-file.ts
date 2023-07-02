import type { RepoRelativePath } from "./common";

export type ChangedFileType =
  // Added
  | "A"
  // Moved
  | "M"
  // Removed
  | "R"
  // Untracked (added)
  | "?"
  // Untracked (removed)
  | "!"
  // Unresolved
  | "U"
  // Resolved
  | "Resolved";
export type ChangedFile = {
  path: RepoRelativePath;
  status: ChangedFileType;
  /**
   * If this file is copied from another, this is the path of the original file
   * If this file is renamed from another, this is the path of the original file, and another change of type 'R' will exist.
   * */
  copy?: RepoRelativePath;
};
