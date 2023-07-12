import type { ChangedFileType } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

/**
 * `git add --all` adds all untracked files, and forgets all missing files.
 * If filepaths are passed, only those file paths will be used, like doing a bulk `git add` or `git forget`.
 * If filepaths is empty array, all untracked/missing files will be affected.
 */
export class AddAllOperation extends Operation {
  constructor() {
    super("AddAllOperation");
  }

  static opName = "AddAll";

  getArgs() {
    return ["add", "--all"];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    if (
      context.uncommittedChanges.every(
        (change) =>
          ![
            "UNTRACKED_ADD",
            "UNTRACKED_MODIFY",
            "UNTRACKED_REMOVE",
            "UNTRACKED_COPY",
            "UNTRACKED_RENAME",
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
  if (["UNTRACKED_ADD", "PARTIALLY_TRACKED_ADD"].includes(status)) {
    return "TRACKED_ADD";
  }

  if (["UNTRACKED_REMOVE", "PARTIALLY_TRACKED_REMOVE"].includes(status)) {
    return "TRACKED_REMOVE";
  }

  if (["UNTRACKED_MODIFY", "PARTIALLY_TRACKED_MODIFY"].includes(status)) {
    return "TRACKED_MODIFY";
  }

  if (["UNTRACKED_COPY", "PARTIALLY_TRACKED_COPY"].includes(status)) {
    return "TRACKED_COPY";
  }

  if (["UNTRACKED_RENAME", "PARTIALLY_TRACKED_RENAME"].includes(status)) {
    return "TRACKED_RENAME";
  }

  return status;
}
