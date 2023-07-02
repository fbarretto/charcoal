import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import type { ApplyPreviewsFuncType, PreviewContext } from "../previews";
import type { CommandArg } from "../types";

import { Operation } from "./Operation";

export class AmendMessageOperation extends Operation {
  constructor(private branch: BranchName, private message: string) {
    super("AmendMessageOperation");
  }

  static opName = "Metaedit";

  getArgs() {
    const args: Array<CommandArg> = [
      "interactive",
      "metaedit",
      this.branch,
      "--title",
      this.message,
    ];
    return args;
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

    const [title] = this.message.split(/\n+/, 1);
    const description = this.message.slice(title.length);

    const func: ApplyPreviewsFuncType = (tree, _previewType) => {
      if (tree.info.branch === this.branch) {
        // use fake title/description on the changed commit
        return {
          info: {
            ...tree.info,
            title,
            description: description ?? "",
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
