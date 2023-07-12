import type { CommitTreeWithPreviews } from "./getCommitTree";

import type { ContextMenuItem } from "./ContextMenu";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { ErrorShortMessages } from "@withgraphite/gti-shared";
import { useContextMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import { notEmpty } from "@withgraphite/gti-shared";
import { BranchIndicator } from "./BranchIndicator";
import serverAPI from "./ClientToServerAPI";
import {
  allDiffSummariesByBranchName,
  codeReviewProvider,
} from "./codeReview/CodeReviewInfo";
import { Commit } from "./Commit";
import { Center, FlexRow, LargeSpinner } from "./ComponentUtils";
import { ErrorNotice } from "./ErrorNotice";
import { HighlightCommitsWhileHovering } from "./HighlightedCommits";
import { CreateEmptyInitialCommitOperation } from "./operations/CreateEmptyInitialCommitOperation";
import { treeWithPreviews, useMarkOperationsCompleted } from "./previews";
import { useArrowKeysToChangeSelection } from "./selection";
import {
  commitFetchError,
  commitsShownRange,
  isFetchingAdditionalCommits,
  useRunOperation,
} from "./serverAPIState";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";

import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";
import "./CommitTreeList.scss";
import { BannerNotice } from "./BannerNotice";
import { repoMessage } from "./repoMessage";

export const CommitTreeList = observer(() => {
  useMarkOperationsCompleted();

  useArrowKeysToChangeSelection();

  const { trees } = treeWithPreviews.get();
  const fetchError = commitFetchError.get();
  const repoMessageValue = repoMessage.get();
  return fetchError == null && trees.length === 0 ? (
    <Center>
      <LargeSpinner />
    </Center>
  ) : (
    <>
      {repoMessageValue ? <BannerNotice title={repoMessageValue} /> : null}
      {fetchError ? <CommitFetchError error={fetchError} /> : null}
      <div
        className="commit-tree-root commit-group with-vertical-line"
        data-testid="commit-tree-root"
      >
        <MainLineEllipsis />
        {trees.map((tree) => (
          <SubTree key={tree.info.branch} tree={tree} depth={0} />
        ))}
        <MainLineEllipsis>
          <FetchingAdditionalCommitsButton />
          <FetchingAdditionalCommitsIndicator />
        </MainLineEllipsis>
      </div>
    </>
  );
});

const CommitFetchError = observer(({ error }: { error: Error }) => {
  const runOperation = useRunOperation();
  if (error.message === ErrorShortMessages.NoCommitsFetched) {
    return (
      <ErrorNotice
        title={"No commits found"}
        description={
          "If this is a new repository, try adding an initial commit first."
        }
        error={error}
        buttons={[
          <VSCodeButton
            appearance="secondary"
            onClick={() => {
              runOperation(new CreateEmptyInitialCommitOperation());
            }}
          >
            Create empty initial commit
          </VSCodeButton>,
        ]}
      />
    );
  }
  return <ErrorNotice title={"Failed to fetch commits"} error={error} />;
});

function SubTree({
  tree,
  depth,
}: {
  tree: CommitTreeWithPreviews;
  depth: number;
}): React.ReactElement {
  const { info, children, previewType } = tree;
  const isPublic = info.partOfTrunk;

  const stackActions =
    !isPublic && depth === 1 ? (
      <StackActions key="stack-actions" tree={tree} />
    ) : null;

  const renderedChildren = (children ?? [])
    .map((tree) => (
      <SubTree key={`tree-${tree.info.branch}`} tree={tree} depth={depth + 1} />
    ))
    .map((components, i) => {
      if (!isPublic && i === 0) {
        // first child can be rendered without branching, so single-child lineages render in the same branch
        return components;
      }
      // any additional children render with branches
      return [
        <Branch key={`branch-${info.branch}-${i}`} descendsFrom={info.branch}>
          {components}
        </Branch>,
      ];
    })
    .flat();

  const rendered = [
    ...renderedChildren,
    <Commit
      commit={info}
      key={info.branch}
      previewType={previewType}
      hasChildren={renderedChildren.length > 0}
    />,
    stackActions,
  ].filter(notEmpty);

  return <>{rendered}</>;
}

function Branch({
  children,
  descendsFrom,
  className,
}: {
  children: React.ReactElement;
  descendsFrom: BranchName;
  className?: string;
}) {
  return (
    <div
      className={`commit-group ${className ?? "with-vertical-line"}`}
      data-testid={`branch-from-${descendsFrom}`}
    >
      {children}
      <BranchIndicator />
    </div>
  );
}

/**
 * Vertical ellipsis to be rendered on top of the branch line.
 * Expects to rendered as a child of commit-tree-root.
 * Optionally accepts children to render next to the "..."
 */
function MainLineEllipsis({ children }: { children?: React.ReactNode }) {
  return (
    <div className="commit-ellipsis">
      <Icon icon="kebab-vertical" />
      <div className="commit-ellipsis-children">{children}</div>
    </div>
  );
}

const FetchingAdditionalCommitsIndicator = observer(() => {
  const isFetching = isFetchingAdditionalCommits.get();
  return isFetching ? <Icon icon="loading" /> : null;
});

const FetchingAdditionalCommitsButton = observer(() => {
  const shownRange = commitsShownRange.get();
  const isFetching = isFetchingAdditionalCommits.get();
  if (shownRange === undefined) {
    return null;
  }
  const commitsShownMessage = `Showing comits from the last ${shownRange.toString()} days`;
  return (
    <Tooltip
      placement="bottom"
      delayMs={DOCUMENTATION_DELAY}
      title={commitsShownMessage}
    >
      <VSCodeButton
        key="load-more-commit-button"
        disabled={isFetching}
        onClick={() => {
          serverAPI.postMessage({
            type: "loadMoreCommits",
          });
        }}
        appearance="icon"
      >
        <Icon icon="unfold" slot="start" />
        <>Load more commits</>
      </VSCodeButton>
    </Tooltip>
  );
});

const StackActions = observer(
  ({ tree }: { tree: CommitTreeWithPreviews }): React.ReactElement | null => {
    const reviewProvider = codeReviewProvider.get();
    const diffMap = allDiffSummariesByBranchName.get();
    const runOperation = useRunOperation();

    // buttons at the bottom of the stack
    const actions = [];
    // additional actions hidden behind [...] menu.
    // Non-empty only when actions is non-empty.
    const moreActions: Array<ContextMenuItem> = [];

    const contextMenu = useContextMenu(() => moreActions);
    if (reviewProvider !== null) {
      const reviewActions =
        diffMap.value == null
          ? {
              resubmittableStack: [],
              submittableStack: [],
            }
          : reviewProvider?.getSupportedStackActions(tree, diffMap.value);
      const resubmittableStack = reviewActions?.resubmittableStack;
      const submittableStack = reviewActions?.submittableStack;
      const MIN_STACK_SIZE_TO_SUGGEST_SUBMIT = 2; // don't show "submit stack" on single commits... they're not really "stacks".

      // any existing diffs -> show resubmit stack,
      if (
        resubmittableStack != null &&
        resubmittableStack.length >= MIN_STACK_SIZE_TO_SUGGEST_SUBMIT
      ) {
        actions.push(
          <HighlightCommitsWhileHovering
            key="resubmit-stack"
            toHighlight={resubmittableStack}
          >
            <VSCodeButton
              appearance="icon"
              onClick={() => {
                runOperation(
                  reviewProvider.submitOperation(resubmittableStack, {})
                );
              }}
            >
              <Icon icon="cloud-upload" slot="start" />
              <>Resubmit stack</>
            </VSCodeButton>
          </HighlightCommitsWhileHovering>
        );
        //     any non-submitted diffs -> "submit all commits this stack" in hidden group
        if (submittableStack != null && submittableStack.length > 0) {
          moreActions.push({
            label: (
              <HighlightCommitsWhileHovering
                key="submit-entire-stack"
                toHighlight={[...resubmittableStack, ...submittableStack]}
              >
                <FlexRow>
                  <Icon icon="cloud-upload" slot="start" />
                  <>Submit entire stack</>
                </FlexRow>
              </HighlightCommitsWhileHovering>
            ),
            onClick: () => {
              runOperation(
                reviewProvider.submitOperation(
                  [...resubmittableStack, ...submittableStack],
                  {}
                )
              );
            },
          });
        }
        //     NO non-submitted diffs -> nothing in hidden group
      } else if (
        submittableStack != null &&
        submittableStack.length >= MIN_STACK_SIZE_TO_SUGGEST_SUBMIT
      ) {
        // NO existing diffs -> show submit stack ()
        actions.push(
          <HighlightCommitsWhileHovering
            key="submit-stack"
            toHighlight={submittableStack}
          >
            <VSCodeButton
              appearance="icon"
              onClick={() => {
                runOperation(
                  reviewProvider.submitOperation(submittableStack, {})
                );
              }}
            >
              <Icon icon="cloud-upload" slot="start" />
              <>Submit stack</>
            </VSCodeButton>
          </HighlightCommitsWhileHovering>
        );
      }
    }

    if (actions.length === 0) {
      return null;
    }
    const moreActionsButton =
      moreActions.length === 0 ? null : (
        <VSCodeButton
          key="more-actions"
          appearance="icon"
          onClick={contextMenu}
        >
          <Icon icon="ellipsis" />
        </VSCodeButton>
      );
    return (
      <div className="commit-tree-stack-actions">
        {actions}
        {moreActionsButton}
      </div>
    );
  }
);
