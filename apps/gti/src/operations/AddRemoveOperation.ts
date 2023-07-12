import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
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
export class AddRemoveOperation extends Operation {
  constructor(private paths: Array<RepoRelativePath>) {
    super("AddRemoveOperation");
  }

  static opName = "AddRemove";

  getArgs() {
    return [
      "addremove",
      ...this.paths.map((path) => ({
        type: "repo-relative-file" as const,
        path,
      })),
    ];
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    const allFiles = this.paths.length === 0;
    if (
      context.uncommittedChanges.every(
        (change) =>
          (allFiles || this.paths.includes(change.path)) &&
          change.status !== "UNTRACKED_ADD" &&
          change.status !== "UNTRACKED_REMOVE"
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      return changes.map((change) =>
        allFiles || this.paths.includes(change.path)
          ? {
              path: change.path,
              status:
                change.status === "UNTRACKED_ADD"
                  ? "TRACKED_ADD"
                  : change.status === "UNTRACKED_REMOVE"
                  ? "TRACKED_REMOVE"
                  : change.status,
            }
          : change
      );
    };
    return func;
  }
}
