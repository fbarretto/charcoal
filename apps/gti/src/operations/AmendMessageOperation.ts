import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import type { EditedMessage } from "../CommitInfo";
import type { ApplyPreviewsFuncType, PreviewContext } from "../previews";
import type { CommandArg } from "../types";

import { SucceedableRevset } from "../types";
import { Operation } from "./Operation";

export class AmendMessageOperation extends Operation {
  constructor(private branch: BranchName, private message: EditedMessage) {
    super();
  }

  static opName = "Metaedit";

  getArgs() {
    const args: Array<CommandArg> = [
      "metaedit",
      "--rev",
      SucceedableRevset(this.branch),
      "--message",
      `${this.message.title}\n${this.message.description}`,
    ];
    return args;
  }

  makeOptimisticApplier(
    context: PreviewContext
  ): ApplyPreviewsFuncType | undefined {
    const commitToMetaedit = context.treeMap.get(this.branch);
    if (commitToMetaedit == null) {
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
            title: this.message.title,
            description: this.message.description,
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
