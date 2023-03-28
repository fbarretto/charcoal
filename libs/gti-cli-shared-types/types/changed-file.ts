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
};
