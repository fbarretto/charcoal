import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyUncommittedChangesPreviewsFuncType,
  UncommittedChangesPreviewContext,
} from "../previews";
import type { UncommittedChanges } from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export class ForgetOperation extends Operation {
  constructor(private filePath: RepoRelativePath) {
    super("ForgetOperation");
  }

  static opName = "Forget";

  getArgs() {
    return [
      "forget",
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
        (change) => change.path === this.filePath && change.status === "?"
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      return changes.map((change) =>
        change.path === this.filePath
          ? { path: change.path, status: "?" }
          : change
      );
    };
    return func;
  }
}
