import type { ChangedFileType } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export class SoftResetAllOperation extends Operation {
  constructor() {
    super("SoftResetAllOperation");
  }

  static opName = "SoftResetAll";

  getArgs() {
    return ["reset", "--soft", "-q"];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    if (
      context.uncommittedChanges.every(
        (change) =>
          ![
            "TRACKED_ADD",
            "TRACKED_MODIFY",
            "TRACKED_REMOVE",
            "TRACKED_COPY",
            "TRACKED_RENAME",
            "PARTIALLY_TRACKED_ADD",
            "PARTIALLY_TRACKED_MODIFY",
            "PARTIALLY_TRACKED_REMOVE",
            "PARTIALLY_TRACKED_COPY",
            "PARTIALLY_TRACKED_RENAME",
          ].includes(change.status)
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      return changes.map((change) => ({
        path: change.path,
        status: changeStatusToTracked(change.status),
      }));
    };
    return func;
  }
}

export function changeStatusToTracked(
  status: ChangedFileType
): ChangedFileType {
  if (["TRACKED_ADD", "PARTIALLY_TRACKED_ADD"].includes(status)) {
    return "UNTRACKED_ADD";
  }

  if (["TRACKED_REMOVE", "PARTIALLY_TRACKED_REMOVE"].includes(status)) {
    return "UNTRACKED_REMOVE";
  }

  if (["TRACKED_MODIFY", "PARTIALLY_TRACKED_MODIFY"].includes(status)) {
    return "UNTRACKED_MODIFY";
  }

  if (["TRACKED_COPY", "PARTIALLY_TRACKED_COPY"].includes(status)) {
    return "UNTRACKED_COPY";
  }

  if (["TRACKED_RENAME", "PARTIALLY_TRACKED_RENAME"].includes(status)) {
    return "UNTRACKED_RENAME";
  }

  return status;
}
