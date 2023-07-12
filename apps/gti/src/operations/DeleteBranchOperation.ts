import {
  ApplyPreviewsFuncType,
  CommitPreview,
  PreviewContext,
} from "../previews";
import { Operation } from "./Operation";

export class DeleteBranchOperation extends Operation {
  constructor(private branch: string) {
    super("DeleteBranchOperation");
  }

  static opName = "DeleteBranch";

  getArgs() {
    return ["branch", "delete", this.branch];
  }

  makePreviewApplier(
    _context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const func: ApplyPreviewsFuncType = (tree, previewType) => {
      if (tree.info.branch === this.branch) {
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
    const originalSourceNode = treeMap.get(this.branch);
    if (originalSourceNode == null) {
      return undefined;
    }

    const func: ApplyPreviewsFuncType = (
      tree,
      previewType,
      childPreviewType
    ) => {
      if (tree.info.branch === this.branch) {
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
