import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "../types";

import { Operation } from "./Operation";

export class RevertOperation extends Operation {
  static opName = "Revert";

  constructor(private files: Array<RepoRelativePath>) {
    super();
  }

  getArgs() {
    const args = [
      "interactive",
      "restore",
      ...this.files.map((file) =>
        // tag file arguments specialy so the remote repo can convert them to the proper cwd-relative format.
        ({
          type: "repo-relative-file" as const,
          path: file,
        })
      ),
    ];
    return args;
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    const filesToHide = new Set(this.files);
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
