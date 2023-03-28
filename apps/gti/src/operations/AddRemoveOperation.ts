import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "../types";

import { Operation } from "./Operation";

/**
 * `git add --all` adds all untracked files, and forgets all missing files.
 * If filepaths are passed, only those file paths will be used, like doing a bulk `git add` or `git forget`.
 * If filepaths is empty array, all untracked/missing files will be affected.
 */
export class AddRemoveOperation extends Operation {
  constructor(private paths: Array<RepoRelativePath>) {
    super();
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
          change.status !== "?" &&
          change.status !== "!"
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
                change.status === "?"
                  ? "A"
                  : change.status === "!"
                  ? "R"
                  : change.status,
            }
          : change
      );
    };
    return func;
  }
}
