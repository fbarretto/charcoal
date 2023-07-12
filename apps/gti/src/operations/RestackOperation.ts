import type { ApplyPreviewsFuncType, PreviewContext } from "../previews";
import { Operation } from "./Operation";

export class RestackOperation extends Operation {
  static opName = "restack";

  constructor(private branch: string) {
    super("RestackOperation");
  }

  getArgs() {
    return ["stack", "restack", "--branch", this.branch];
  }

  makeOptimisticApplier(
    context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const branchToMetaEdit = context.treeMap.get(this.branch);
    if (branchToMetaEdit == null) {
      // metaedit succeeds when we no longer see original commit
      // Note: this assumes we always restack children and never render old commit as obsolete.
      return undefined;
    }

    const func: ApplyPreviewsFuncType = (tree, _previewType) => {
      if (tree.info.branch === this.branch) {
        // use fake title/description on the changed commit
        return {
          info: {
            ...tree.info,
            needsRestack: false,
          },
          children: tree.children,
        };
      } else {
        return { info: tree.info, children: tree.children };
      }
    };
    return func;
  }
}
