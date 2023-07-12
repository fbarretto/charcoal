import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

/**
 * "Discard" is not an actual command, but the effect of removing all uncommitted changes is accomplished by `goto --clean .`
 * This leaves behind untracked files, which may be separately removed by `purge --files`.
 */
export class DiscardOperation extends Operation {
  static opName = "Discard";

  constructor() {
    super("DiscardOperation");
  }

  getArgs() {
    return ["reset", "-q", "--hard"];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    const trackedChangeTypes = [
      "TRACKED_MODIFY",
      "TRACKED_ADD",
      "TRACKED_REMOVE",
      "TRACKED_COPY",
      "TRACKED_RENAME",
      "PARTIALLY_TRACKED_MODIFY",
      "PARTIALLY_TRACKED_ADD",
      "PARTIALLY_TRACKED_REMOVE",
      "PARTIALLY_TRACKED_COPY",
      "PARTIALLY_TRACKED_RENAME",
      "UNTRACKED_REMOVE",
    ];
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
