import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import type { ApplyPreviewsFuncType, PreviewContext } from "../previews";

import { CommitPreview } from "../previews";
import { SucceedableRevset } from "../types";
import { Operation } from "./Operation";

export class GotoOperation extends Operation {
  constructor(private destination: BranchName) {
    super();
  }

  static opName = "Goto";

  getArgs() {
    const args = ["goto", "--rev", SucceedableRevset(this.destination)];
    return args;
  }

  makeOptimisticApplier(
    context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const headCommitHash = context.headCommit?.branch;
    if (headCommitHash === this.destination) {
      // head is destination => the goto completed
      return undefined;
    }

    const func: ApplyPreviewsFuncType = (tree, _previewType) => {
      if (tree.info.branch === this.destination) {
        const modifiedInfo = { ...tree.info, isHead: true };
        // this is the commit we're moving to
        return {
          info: modifiedInfo,
          children: tree.children,
          previewType: CommitPreview.GOTO_DESTINATION,
        };
      } else if (tree.info.branch === headCommitHash) {
        const modifiedInfo = { ...tree.info, isHead: false };
        // this is the previous head commit, where we used to be
        return {
          info: modifiedInfo,
          children: tree.children,
          previewType: CommitPreview.GOTO_PREVIOUS_LOCATION,
        };
      } else {
        return { info: tree.info, children: tree.children };
      }
    };
    return func;
  }
}
