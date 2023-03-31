import { Tooltip } from "../Tooltip";
import { observableConfig } from "../config_observable";
import { codeReviewProvider } from "./CodeReviewInfo";
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";

export const submitAsDraft = observableConfig<boolean>({
  config: "gti.submitAsDraft",
  default: false,
});

export const SubmitAsDraftCheckbox = observer(
  ({ commitsToBeSubmit }: { commitsToBeSubmit: Array<BranchInfo> }) => {
    const isDraft = submitAsDraft.get();
    const provider = codeReviewProvider.get();
    if (
      provider == null ||
      (provider?.supportSubmittingAsDraft === "newDiffsOnly" &&
        // empty array => commit to submit is not yet created (this counts as a new Diff)
        commitsToBeSubmit.length > 0 &&
        // some commits don't have a diff ID => those are "new" Diffs
        commitsToBeSubmit.some((commit) => commit.pr != null))
    ) {
      // hide draft button for diffs being resubmitted, if the provider doesn't support drafts on resubmission
      return null;
    }
    return (
      <VSCodeCheckbox
        className="submit-as-draft-checkbox"
        checked={isDraft}
        onChange={(e) =>
          submitAsDraft.set((e.target as HTMLInputElement).checked)
        }
      >
        <Tooltip title={"Whether to submit this diff as a draft"}>
          Submit as Draft
        </Tooltip>
      </VSCodeCheckbox>
    );
  }
);
