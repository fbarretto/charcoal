import type { Operation } from "../operations/Operation";
import type { DiffSummary } from "../types";
import type { ReactNode } from "react";
import type { BranchInfo, PRNumber } from "@withgraphite/gti-cli-shared-types";
import type { CommitTreeWithPreviews } from "../getCommitTree";

/**
 * API to interact with Code Review for Repositories, e.g. GitHub.
 */
export interface UICodeReviewProvider {
  name: string;

  DiffBadgeContent(props: {
    diff?: DiffSummary;
    children?: ReactNode;
  }): JSX.Element | null;
  formatDiffNumber(diffId: PRNumber): string;

  submitOperation(
    commits: Array<BranchInfo>,
    options?: {
      /** Whether to submit this diff as a draft. Note: some review providers only allow submitting new Diffs as drafts */
      draft?: boolean;
      /** If this diff is being resubmitted, this message will be added as a comment to explain what has changed */
      updateMessage?: string;
    }
  ): Operation;

  RepoInfo(): JSX.Element | null;

  isDiffClosed(summary: DiffSummary): boolean;

  /**
   * Defines when this review provider can submit diffs as drafts,
   * submitting for the first time or also when resubmitting.
   */
  supportSubmittingAsDraft: "always" | "newDiffsOnly";

  getSupportedStackActions(
    tree: CommitTreeWithPreviews,
    diffSummaries: Map<string, DiffSummary>
  ): {
    resubmittableStack?: Array<BranchInfo>;
    submittableStack?: Array<BranchInfo>;
  };

  /**
   * Given a set of a DiffSummaries, return which ones are ad-hoc submittable by this provider,
   * meaning you don't need to change the working copy to submit them.
   */
  getSubmittableDiffs(
    commits: Array<BranchInfo>,
    allDiffSummaries: Map<string, DiffSummary>
  ): Array<BranchInfo>;
}
