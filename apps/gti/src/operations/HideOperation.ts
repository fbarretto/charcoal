import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import type { ApplyPreviewsFuncType, PreviewContext } from "../previews";

import { CommitPreview } from "../previews";
import { Operation } from "./Operation";

export class HideOperation extends Operation {
  constructor(private source: BranchName) {
    super();
  }

  static opName = "Hide";

  getArgs() {
    return ["branch", "untrack", this.source];
  }

  makePreviewApplier(
    _context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const func: ApplyPreviewsFuncType = (tree, previewType) => {
      if (tree.info.branch === this.source) {
        return {
          info: tree.info,
          children: tree.children,
          previewType: CommitPreview.HIDDEN_ROOT,
          childPreviewType: CommitPreview.HIDDEN_DESCENDANT,
        };
      }
      return {
        info: tree.info,
        children: tree.children,
        previewType,
        childPreviewType: previewType,
      };
    };
    return func;
  }

  makeOptimisticApplier(
    context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const { treeMap } = context;
    const originalSourceNode = treeMap.get(this.source);
    if (originalSourceNode == null) {
      return undefined;
    }

    const func: ApplyPreviewsFuncType = (
      tree,
      previewType,
      childPreviewType
    ) => {
      if (tree.info.branch === this.source) {
        return {
          info: null,
        };
      }
      return {
        info: tree.info,
        children: tree.children,
        previewType,
        childPreviewType,
      };
    };
    return func;
  }
}
