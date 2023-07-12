import type { ChangedFileType } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export class SoftResetOperation extends Operation {
  constructor(private file: string) {
    super("SoftResetOperation");
  }

  static opName = "SoftReset";

  getArgs() {
    return [
      "reset",
      "--",
      {
        type: "repo-relative-file" as const,
        path: this.file,
      },
    ];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    if (
      context.uncommittedChanges.some(
        (change) =>
          change.path === this.file &&
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
      return changes.map((change) =>
        change.path === this.file
          ? {
              path: change.path,
              status: changeStatusToTracked(change.status),
            }
          : change
      );
    };
    return func;
  }
}

function changeStatusToTracked(status: ChangedFileType): ChangedFileType {
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
