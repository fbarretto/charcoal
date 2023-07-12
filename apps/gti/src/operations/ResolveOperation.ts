import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";
import type {
  ApplyMergeConflictsPreviewsFuncType,
  ApplyUncommittedChangesPreviewsFuncType,
  MergeConflictsPreviewContext,
  UncommittedChangesPreviewContext,
} from "../previews";
import type {
  CommandArg,
  MergeConflicts,
  UncommittedChanges,
} from "@withgraphite/gti-shared";

import { Operation } from "./Operation";

export enum ResolveTool {
  mark = "mark",
  unmark = "unmark",
  both = "internal:union",
  local = "internal:merge-local",
  other = "internal:merge-other",
}

export class ResolveOperation extends Operation {
  constructor(private filePath: RepoRelativePath, private tool: ResolveTool) {
    super("ResolveOperation");
  }

  static opName = "Resolve";

  getArgs() {
    const args: Array<CommandArg> = ["resolve"];

    switch (this.tool) {
      case ResolveTool.mark:
        args.push("--mark");
        break;
      case ResolveTool.unmark:
        args.push("--unmark");
        break;
      case ResolveTool.both:
      case ResolveTool.local:
      case ResolveTool.other:
        args.push("--tool", this.tool);
        break;
    }

    args.push({
      type: "repo-relative-file" as const,
      path: this.filePath,
    });
    return args;
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
