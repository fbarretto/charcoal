import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";
import { changeStatusToTracked } from "./AddAllOperation";

export class AddOperation extends Operation {
  constructor(private filePath: RepoRelativePath) {
    super("AddOperation");
  }

  static opName = "Add";

  getArgs() {
    return [
      "add",
      {
        type: "repo-relative-file" as const,
        path: this.filePath,
      },
    ];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    if (
      context.uncommittedChanges.some(
        (change) =>
          change.path === this.filePath &&
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
      return changes.map((change) =>
        change.path === this.filePath
          ? { path: change.path, status: changeStatusToTracked(change.status) }
          : change
      );
    };
    return func;
  }
}
