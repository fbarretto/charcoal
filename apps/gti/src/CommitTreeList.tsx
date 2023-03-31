import type { CommitTreeWithPreviews } from "./getCommitTree";

import { Commit } from "./Commit";
import { ErrorNotice } from "./ErrorNotice";
import { treeWithPreviews, useMarkOperationsCompleted } from "./previews";
import {
  commitFetchError,
  commitsShownRange,
  isFetchingAdditionalCommits,
  useRunOperation,
} from "./serverAPIState";
import { Icon } from "@withgraphite/gti-shared/Icon";
import serverAPI from "./ClientToServerAPI";

import "./CommitTreeList.scss";
import { observer } from "mobx-react-lite";
import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import { useArrowKeysToChangeSelection } from "./selection";
import { FlexRow, LargeSpinner } from "./ComponentUtils";
import { notEmpty } from "@withgraphite/gti-shared/utils";
import { ErrorShortMessages } from "@withgraphite/gti-server/src/constants";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { CreateEmptyInitialCommitOperation } from "./operations/CreateEmptyInitialCommitOperation";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { HighlightCommitsWhileHovering } from "./HighlightedCommits";
import {
  ContextMenuItem,
  useContextMenu,
} from "@withgraphite/gti-shared/ContextMenu";
import {
  allDiffSummaries,
  codeReviewProvider,
} from "./codeReview/CodeReviewInfo";

export const CommitTreeList = observer(() => {
  useMarkOperationsCompleted();

  useArrowKeysToChangeSelection();

  const { trees } = treeWithPreviews.get();
  const fetchError = commitFetchError.get();
  return fetchError == null && trees.length === 0 ? (
    <Center>
      <LargeSpinner />
    </Center>
  ) : (
    <>
      {fetchError ? <CommitFetchError error={fetchError} /> : null}
      <div
        className="commit-tree-root commit-group"
        data-testid="commit-tree-root"
      >
        <MainLineEllipsis />
        {trees.map((tree) => createSubtree(tree, /* depth */ 0))}
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

function createSubtree(
  tree: CommitTreeWithPreviews,
  depth: number
): Array<React.ReactElement> {
  const { info, children, previewType } = tree;
  const isPublic = info.partOfTrunk;

  const renderedChildren = (children ?? [])
    .map((tree) => createSubtree(tree, depth + 1))
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

  return [
    ...renderedChildren,
    <Commit
      commit={info}
      key={info.branch}
      previewType={previewType}
      hasChildren={renderedChildren.length > 0}
    />,
    depth === 1 ? <StackActions key="stack-actions" tree={tree} /> : null,
  ].filter(notEmpty);
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="center-container">{children}</div>;
}

function Branch({
  children,
  descendsFrom,
}: {
  children: Array<React.ReactElement>;
  descendsFrom: BranchName;
}) {
  return (
    <div className="commit-group" data-testid={`branch-from-${descendsFrom}`}>
      {children}
      <BranchIndicator />
    </div>
  );
}

const COMPONENT_PADDING = 10;
export const BranchIndicator = () => {
  const width = COMPONENT_PADDING * 2;
  const height = COMPONENT_PADDING * 3;
  // Compensate for line width
  const startX = width + 1;
  const startY = 0;
  const endX = 0;
  const endY = height;
  const verticalLead = height * 0.75;
  const path =
    // start point
    `M${startX} ${startY}` +
    // cubic bezier curve to end point
    `C ${startX} ${startY + verticalLead}, ${endX} ${
      endY - verticalLead
    }, ${endX} ${endY}`;
  return (
    <svg
      className="branch-indicator"
      width={width + 2 /* avoid border clipping */}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={path} strokeWidth="2px" fill="transparent" />
    </svg>
  );
};

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
    const diffMap = allDiffSummaries.get();
    const runOperation = useRunOperation();

    // buttons at the bottom of the stack
    const actions = [];
    // additional actions hidden behind [...] menu.
    // Non-empty only when actions is non-empty.
    const moreActions: Array<ContextMenuItem> = [];

    const reviewActions =
      diffMap.value == null
        ? {}
        : reviewProvider?.getSupportedStackActions(tree, diffMap.value);
    const resubmittableStack = reviewActions?.resubmittableStack;
    const submittableStack = reviewActions?.submittableStack;
    const MIN_STACK_SIZE_TO_SUGGEST_SUBMIT = 2; // don't show "submit stack" on single commits... they're not really "stacks".

    const contextMenu = useContextMenu(() => moreActions);
    if (reviewProvider == null) {
      return null;
    }
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
              runOperation(reviewProvider.submitOperation(resubmittableStack));
            }}
          >
            <Icon icon="cloud-upload" slot="start" />
            Resubmit stack
          </VSCodeButton>
        </HighlightCommitsWhileHovering>
      );
      //     any non-submitted diffs -> "submit all commits this stack" in hidden group
      if (
        submittableStack != null &&
        submittableStack.length > 0 &&
        submittableStack.length > resubmittableStack.length
      ) {
        moreActions.push({
          label: (
            <HighlightCommitsWhileHovering
              key="submit-entire-stack"
              toHighlight={submittableStack}
            >
              <FlexRow>
                <Icon icon="cloud-upload" slot="start" />
                Submit entire stack
              </FlexRow>
            </HighlightCommitsWhileHovering>
          ),
          onClick: () => {
            runOperation(
              reviewProvider.submitOperation([
                ...resubmittableStack,
                ...submittableStack,
              ])
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
              runOperation(reviewProvider.submitOperation(submittableStack));
            }}
          >
            <Icon icon="cloud-upload" slot="start" />
            Submit stack
          </VSCodeButton>
        </HighlightCommitsWhileHovering>
      );
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
