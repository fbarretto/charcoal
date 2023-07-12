import type { Operation } from "../../operations/Operation";
import type { CodeReviewSystem, DiffSummary } from "@withgraphite/gti-shared";
import type { ReactNode } from "react";

import { Tooltip } from "../../Tooltip";
import { PrSubmitOperation } from "../../operations/PrSubmitOperation";
import { Icon } from "../../Icon";

import "./GitHubPRBadge.scss";
import type { BranchInfo, PRNumber } from "@withgraphite/gti-cli-shared-types";
import type { CommitTreeWithPreviews } from "../../getCommitTree";

export class GithubUICodeReviewProvider {
  constructor(private system: CodeReviewSystem & { type: "github" }) {}

  DiffBadgeContent({
    diff,
    children,
  }: {
    diff?: DiffSummary;
    children?: ReactNode;
  }): JSX.Element | null {
    return (
      <div
        className={
          "github-diff-status" +
          (diff?.state ? ` github-diff-status-${diff.state}` : "")
        }
      >
        <Tooltip title={"Click to open Pull Request in Graphite"} delayMs={500}>
          {diff && <Icon icon={iconForPRState(diff.state)} />}
          {diff?.state && <PRStateLabel state={diff.state} />}
          {children}
        </Tooltip>
      </div>
    );
  }

  formatDiffNumber(diffId: PRNumber): string {
    return `#${diffId}`;
  }

  RepoInfo = () => {
    return (
      <span>
        {this.system.hostname !== "github.com" ? this.system.hostname : ""}{" "}
        {this.system.owner}/{this.system.repo}
      </span>
    );
  };

  submitOperation(
    _commits: Array<BranchInfo>,
    options: { draft?: boolean; updateMessage?: string }
  ): Operation {
    // @nocommit TODO: either we need to submit a stack or do something here
    return new PrSubmitOperation(options);
  }

  getSupportedStackActions(
    tree: CommitTreeWithPreviews,
    allDiffSummariesByBranchName: Map<string, DiffSummary>
  ): {
    resubmittableStack: Array<BranchInfo>;
    submittableStack: Array<BranchInfo>;
  } {
    const children = tree.children.map((child) =>
      this.getSupportedStackActions(child, allDiffSummariesByBranchName)
    );

    if (tree.info.pr) {
      return {
        resubmittableStack: [
          tree.info,
          ...children.flatMap((child) => [...child.resubmittableStack]),
        ],
        submittableStack: [
          ...children.flatMap((child) => [...child.submittableStack]),
        ],
      };
    } else {
      return {
        resubmittableStack: [],
        submittableStack: [
          tree.info,
          ...children.flatMap((child) => [
            ...child.submittableStack,
            ...child.resubmittableStack,
          ]),
        ],
      };
    }
  }

  getSubmittableDiffs(
    branches: Array<BranchInfo>,
    allDiffSummariesByBranchName: Map<string, DiffSummary>,
    mainBranch: string
  ): Array<BranchInfo> {
    return branches.filter((branch) => {
      const prInfo = allDiffSummariesByBranchName.get(branch.branch);

      return (
        !branch.partOfTrunk &&
        prInfo?.state !== "MERGED" &&
        branch.parents.every((parentBranchName) => {
          /**
           * The branch needs to be on main or the parents need to be submitted
           */
          return (
            parentBranchName === mainBranch ||
            allDiffSummariesByBranchName.get(parentBranchName)
          );
        })
      );
    });
  }

  isDiffClosed(diff: DiffSummary): boolean {
    return diff.state === "CLOSED";
  }
}

type BadgeState = "OPEN" | "MERGED" | "CLOSED" | "ERROR" | "DRAFT";

function iconForPRState(state?: BadgeState) {
  switch (state) {
    case "ERROR":
      return "error";
    case "OPEN":
      return "git-pull-request";
    case "MERGED":
      return "git-merge";
    case "CLOSED":
      return "git-pull-request-closed";
    case "DRAFT":
      return "git-pull-request";
    default:
      return "git-pull-request";
  }
}

function PRStateLabel({ state }: { state: BadgeState }) {
  switch (state) {
    case "OPEN":
      return <>Open</>;
    case "MERGED":
      return <>Merged</>;
    case "CLOSED":
      return <>Closed</>;
    case "ERROR":
      return <>Error</>;
    case "DRAFT":
      return <>Draft</>;
    default:
      return <>{state}</>;
  }
}
