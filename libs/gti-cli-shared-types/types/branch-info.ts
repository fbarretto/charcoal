import type { ChangedFile } from "./changed-file";
import type { BranchName, PRNumber } from "./common";

export type BranchInfo = {
  title: string;
  description: string;
  branch: BranchName;
  parents: [] | [string];
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
