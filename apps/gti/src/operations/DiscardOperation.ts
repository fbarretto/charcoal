import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "../types";

import { Operation } from "./Operation";

/**
 * "Discard" is not an actual command, but the effect of removing all uncommitted changes is accomplished by `goto --clean .`
 * This leaves behind untracked files, which may be separately removed by `purge --files`.
 */
export class DiscardOperation extends Operation {
  static opName = "Discard";

  getArgs() {
    return ["interactive", "discard"];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    const trackedChangeTypes = ["M", "A", "R", "!"];
    if (
      context.uncommittedChanges.length === 0 ||
      // some files may become untracked after clean goto
      context.uncommittedChanges.every(
        (change) => !trackedChangeTypes.includes(change.status)
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      // clean goto leaves behind untracked files
      return changes.filter(
        (change) => !trackedChangeTypes.includes(change.status)
      );
    };
    return func;
  }
}
