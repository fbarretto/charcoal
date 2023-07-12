import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export class RevertOperation extends Operation {
  static opName = "Revert";

  constructor(private file: RepoRelativePath) {
    super("RevertOperation");
  }

  getArgs() {
    const args = [
      "restore",
      "-SW",
      {
        type: "repo-relative-file" as const,
        path: this.file,
      },
    ];
    return args;
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    const filesToHide = new Set(this.file);
    if (
      context.uncommittedChanges.every(
        (change) => !filesToHide.has(change.path)
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      return changes.filter((change) => !filesToHide.has(change.path));
    };
    return func;
  }
}
