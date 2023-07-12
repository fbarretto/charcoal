import type { RepoRelativePath } from "@withgraphite/gti-cli-shared-types";

import { Operation } from "./Operation";

export enum AutoResolveTool {
  theirs = "theirs",
  ours = "ours",
}

export class AutoResolveOperation extends Operation {
  constructor(
    private filePath: RepoRelativePath,
    private tool: AutoResolveTool
  ) {
    super("AutoResolveOperation");
  }

  static opName = "AutoResolve";

  getArgs() {
    switch (this.tool) {
      case AutoResolveTool.theirs:
        return [
          "restore",
          "--theirs",
          "--",
          {
            type: "repo-relative-file" as const,
            path: this.filePath,
          },
        ];
        break;
      case AutoResolveTool.ours:
        return [
          "restore",
          "--ours",
          "--",
          {
            type: "repo-relative-file" as const,
            path: this.filePath,
          },
        ];
    }
  }
}
