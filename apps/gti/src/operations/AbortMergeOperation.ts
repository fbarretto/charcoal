import type { MergeConflicts } from "../types";

import { Operation } from "./Operation";

export class AbortMergeOperation extends Operation {
  constructor(private conflicts: MergeConflicts) {
    super();
  }

  static opName = "Abort";

  // `gt abort` isn't a real command like `gt continue` is.
  // however, the merge conflict data we've fetched includes the command to abort
  getArgs() {
    if (this.conflicts.toAbort == null) {
      // if conflicts are still loading we don't know the right command...
      // just try `rebase --abort`...
      return ["rebase", "--abort"];
    }
    return this.conflicts.toAbort.split(" ");
  }
}
