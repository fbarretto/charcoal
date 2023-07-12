import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyMergeConflictsPreviewsFuncType,
  ApplyUncommittedChangesPreviewsFuncType,
  MergeConflictsPreviewContext,
  UncommittedChangesPreviewContext,
} from "../previews";
import type {
  MergeConflicts,
  UncommittedChanges,
} from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export enum ResolveTool {
  mark = "mark",
  unmark = "unmark",
}

export class ResolveOperation extends Operation {
  constructor(private filePath: RepoRelativePath, private tool: ResolveTool) {
    super("ResolveOperation");
  }

  static opName = "Resolve";

  getArgs() {
    switch (this.tool) {
      case ResolveTool.mark:
        return [
          "add",
          {
            type: "repo-relative-file" as const,
            path: this.filePath,
          },
        ];
        break;
      case ResolveTool.unmark:
        return [
          "restore",
          "--conflict=merge",
          "--",
          {
            type: "repo-relative-file" as const,
            path: this.filePath,
          },
        ];
    }
  }

  makeOptimisticUncommittedChangesApplier?(
    context: UncommittedChangesPreviewContext
  ): ApplyUncommittedChangesPreviewsFuncType | undefined {
    if (
      context.uncommittedChanges.some(
        (change) =>
          change.path === this.filePath && change.status !== "UNRESOLVED"
      )
    ) {
      return undefined;
    }

    const func: ApplyUncommittedChangesPreviewsFuncType = (
      changes: UncommittedChanges
    ) => {
      return changes.map((change) =>
        change.path === this.filePath
          ? { path: change.path, status: "RESOLVED" }
          : change
      );
    };
    return func;
  }

  makeOptimisticMergeConflictsApplier?(
    context: MergeConflictsPreviewContext
  ): ApplyMergeConflictsPreviewsFuncType | undefined {
    if (
      context.conflicts?.files?.some(
        (change) =>
          change.path === this.filePath && change.status !== "UNRESOLVED"
      ) === true
    ) {
      return undefined;
    }

    const func: ApplyMergeConflictsPreviewsFuncType = (
      conflicts?: MergeConflicts
    ) => {
      if (conflicts?.state !== "loaded") {
        return conflicts;
      }
      return {
        ...conflicts,
        files:
          conflicts?.files?.map((change) =>
            change.path === this.filePath
              ? { path: change.path, status: "RESOLVED" as const }
              : change
          ) ?? [],
      };
    };
    return func;
  }
}
