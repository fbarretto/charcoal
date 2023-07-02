import type { ChangedFile } from "./changed-file";
import type { BranchName, PRNumber } from "./common";

export type BranchInfo = {
  title: string;
  description: string;
  branch: BranchName;
  /**
   * This matches the "parents" information from source control without the
   * "null" hash. Most of the time a commit has 1 parent. For merges there
   * could be 2 or more parents. The initial commit (and initial commits of
   * other merged-in repos) have no parents.
   */
  parents: string[];
  isHead: boolean;
  partOfTrunk: boolean;
  author: string;
  date: string;
  /** only a subset of the total files for this commit */
  filesSample: Array<ChangedFile>;
  totalFileCount: number;
  pr?: {
    number: PRNumber;
    isDraft: boolean;
  };
};
