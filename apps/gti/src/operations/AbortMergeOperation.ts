import type { MergeConflicts } from "../types";

import { Operation } from "./Operation";

export class AbortMergeOperation extends Operation {
  constructor(private conflicts: MergeConflicts) {
    super("AbortMergeOperation");
  }

  static opName = "Abort";

  // `gt abort` isn't a real command like `gt continue` is.
  // however, the merge conflict data we've fetched includes the command to abort
  getArgs() {
    return ["rebase", "--abort"];
  }

  // It's tempting to add makeOptimisticMergeConflictsApplier to `abort`,
  // but hiding optimistic conflicts may reveal temporary uncommitted changes
  // we could use optimistic uncommitted changes to hide those as well,
  // but it gets complicated. More robust is to just show a spinner on the abort button instead.
  // Abort should be relatively quick.
  // TODO: if this is a slow point in workflows, we could make this experience smoother.
}
