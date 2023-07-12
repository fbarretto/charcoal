import type { ReactNode } from "react";
import type { DiffSummary } from "@withgraphite/gti-shared";

import { useContextMenu } from "../ContextMenu";
import { Icon } from "../Icon";
import { Component, Suspense, useState } from "react";
import { ExternalLink } from "../ExternalLink";
import platform from "../platform";
import { Tooltip } from "../Tooltip";
import { codeReviewProvider, diffSummary } from "./CodeReviewInfo";

import type { PRNumber } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";
import "./DiffBadge.scss";
import type { GithubUICodeReviewProvider } from "./github/github";
import { repositoryInfo } from "../serverAPIState";

/**
 * Component that shows inline summary information about a Diff,
 * such as its status, number of comments, CI state, etc.
 */
export const DiffInfo = observer(({ diffId }: { diffId: string }) => {
  const repo = codeReviewProvider.get();
  if (repo == null) {
    return null;
  }
  return (
    <DiffErrorBoundary provider={repo} diffId={diffId}>
      <Suspense fallback={<DiffSpinner diffId={diffId} provider={repo} />}>
        <DiffInfoInner diffId={diffId} provider={repo} />
      </Suspense>
    </DiffErrorBoundary>
  );
});

export const DiffBadge = observer(
  ({
    diff,
    children,
    url,
    provider,
  }: {
    diff?: DiffSummary;
    url?: string;
    children?: ReactNode;
    provider: GithubUICodeReviewProvider;
  }) => {
    const contextMenu = useContextMenu(() => {
      return [
        {
          label: <>Copy Diff Number "{diff?.number}"</>,
          onClick: () => platform.clipboardCopy(diff?.number ?? ""),
        },
      ];
    });
    return (
      <ExternalLink
        href={url}
        className={`diff-badge github-diff-badge`}
        onContextMenu={contextMenu}
      >
        <provider.DiffBadgeContent diff={diff} children={children} />
      </ExternalLink>
    );
  }
);

function DiffSpinner({
  diffId,
  provider,
}: {
  diffId: PRNumber;
  provider: GithubUICodeReviewProvider;
}) {
  return (
    <span className="diff-spinner" data-testid="diff-spinner">
      <DiffBadge provider={provider}>
        <Icon icon="loading" />
      </DiffBadge>
      {provider.formatDiffNumber(diffId)}
    </span>
  );
}

const DiffInfoInner = observer(
  ({
    diffId,
    provider,
  }: {
    diffId: PRNumber;
    provider: GithubUICodeReviewProvider;
  }) => {
    const repoInfo = repositoryInfo.get();
    const diffInfoResult = diffSummary(diffId).get();
    if (
      diffInfoResult.error ||
      (repoInfo != null && repoInfo?.type !== "success")
    ) {
      return (
        <DiffLoadError
          number={provider.formatDiffNumber(diffId)}
          provider={provider}
        />
      );
    }
    if (diffInfoResult?.value == null || repoInfo == null) {
      return <DiffSpinner diffId={diffId} provider={provider} />;
    }
    if (repoInfo.codeReviewSystem.type === "none") {
      return null;
    }
    const info = diffInfoResult.value;
    return (
      <div
        className={`diff-info github-diff-info`}
        data-testid={`github-diff-info`}
      >
        <DiffSignalSummary diff={info} />
        <DiffBadge
          provider={provider}
          diff={info}
          url={`${repoInfo.profile.appUrl}/github/pr/${repoInfo.codeReviewSystem.owner}/${repoInfo.codeReviewSystem.repo}/${info.number}`}
        />
        <DiffComments diff={info} />
        <DiffNumber>{provider.formatDiffNumber(diffId)}</DiffNumber>
      </div>
    );
  }
);

function DiffNumber({ children }: { children: string }) {
  const [showing, setShowing] = useState(false);
  if (!children) {
    return null;
  }

  return (
    <Tooltip
      trigger="manual"
      shouldShow={showing}
      title={`Copied ${children} to the clipboard`}
    >
      <span
        className="diff-number"
        onClick={() => {
          platform.clipboardCopy(children);
          setShowing(true);
          setTimeout(() => setShowing(false), 2000);
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}

function DiffComments({ diff: _diff }: { diff: DiffSummary }) {
  return null;
  // if (!diff.commentCount) {
  //   return null;
  // }
  // return (
  //   <div className="diff-comments-count">
  //     {diff.commentCount}
  //     <Icon
  //       icon={diff.anyUnresolvedComments ? "comment-unresolved" : "comment"}
  //     />
  //   </div>
  // );
}

function DiffSignalSummary({ diff: _diff }: { diff: DiffSummary }) {
  return null;
  // if (!diff.signalSummary) {
  //   return null;
  // }
  // let icon;
  // let tooltip;
  // switch (diff.signalSummary) {
  //   case "running":
  //     icon = <CircleEllipsisIcon />;
  //     tooltip = "Test Signals are still running for this Diff.";
  //     break;
  //   case "pass":
  //     icon = "check";
  //     tooltip = "Test Signals completed successfully for this Diff.";
  //     break;
  //   case "failed":
  //     icon = "error";
  //     tooltip =
  //       "An error was encountered during the test signals on this Diff. See Diff for more details.";
  //     break;
  //   case "no-signal":
  //     icon = "question";
  //     tooltip = "No signal from test run on this Diff.";
  //     break;
  //   case "warning":
  //     icon = "question";
  //     tooltip =
  //       "Test Signals were not fully successful for this Diff. See Diff for more details.";
  //     break;
  // }
  // return (
  //   <div className={`diff-signal-summary diff-signal-${diff.signalSummary}`}>
  //     <Tooltip title={tooltip}>
  //       {typeof icon === "string" ? <Icon icon={icon} /> : icon}
  //     </Tooltip>
  //   </div>
  // );
}

export class DiffErrorBoundary extends Component<
  {
    children: React.ReactNode;
    diffId: string;
    provider: GithubUICodeReviewProvider;
  },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error != null) {
      return (
        <DiffLoadError
          provider={this.props.provider}
          number={this.props.provider.formatDiffNumber(this.props.diffId)}
        />
      );
    }
    return this.props.children;
  }
}

function DiffLoadError({
  number,
  provider,
}: {
  number: string;
  provider: GithubUICodeReviewProvider;
}) {
  return (
    <span className="diff-error diff-info" data-testid={`github-error`}>
      <DiffBadge provider={provider}>
        <Icon icon="error" />
      </DiffBadge>{" "}
      {number}
    </span>
  );
}
