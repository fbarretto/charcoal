import type { CodeReviewSystem, DiffSummary } from "@withgraphite/gti-shared";
import type { ReactNode } from "react";

import { Icon } from "../../Icon";
import { Tooltip } from "../../Tooltip";

import type { PRNumber } from "@withgraphite/gti-cli-shared-types";
import "./GitHubPRBadge.scss";

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
