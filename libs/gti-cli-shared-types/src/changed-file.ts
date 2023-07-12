import type { RepoRelativePath } from "./common";

export type ChangedFileType =
  | "TRACKED_ADD"
  | "MODIFIED"
  | "TRACKED_REMOVE"
  | "UNTRACKED_ADD"
  | "UNTRACKED_REMOVE"
  | "UNRESOLVED"
  | "RESOLVED";
export type ChangedFile = {
  path: RepoRelativePath;
  status: ChangedFileType;
  /**
   * If this file is copied from another, this is the path of the original file
   * If this file is renamed from another, this is the path of the original file, and another change of type 'R' will exist.
   * */
  copy?: RepoRelativePath;
};

export type ChangedFiles = {
  files: ChangedFile[];
  total: number;
};
