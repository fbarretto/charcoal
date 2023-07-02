import type { CommitTreeWithPreviews } from "./getCommitTree";

import type { ContextMenuItem } from "@withgraphite/gti-shared/ContextMenu";
import type { Hash } from "./types";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { ErrorShortMessages } from "@withgraphite/gti-server/src/constants";
import { useContextMenu } from "@withgraphite/gti-shared/ContextMenu";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { generatorContains, notEmpty } from "@withgraphite/gti-shared/utils";
import { BranchIndicator } from "./BranchIndicator";
import serverAPI from "./ClientToServerAPI";
import {
  allDiffSummaries,
  codeReviewProvider,
} from "./codeReview/CodeReviewInfo";
import { Commit } from "./Commit";
import { Center, FlexRow, LargeSpinner } from "./ComponentUtils";
import { ErrorNotice } from "./ErrorNotice";
import { isTreeLinear, walkTreePostorder } from "./getCommitTree";
import { HighlightCommitsWhileHovering } from "./HighlightedCommits";
import { CreateEmptyInitialCommitOperation } from "./operations/CreateEmptyInitialCommitOperation";
import { ImportStackOperation } from "./operations/ImportStackOperation";
import { treeWithPreviews, useMarkOperationsCompleted } from "./previews";
import { useArrowKeysToChangeSelection } from "./selection";
import {
  commitFetchError,
  commitsShownRange,
  isFetchingAdditionalCommits,
  latestHeadCommit,
  latestUncommittedChangesData,
  useRunOperation,
} from "./serverAPIState";
import { StackEditIcon } from "./StackEditIcon";
import {
  bumpStackEditMetric,
  editingStackHashes,
  loadingStackState,
  sendStackEditMetrics,
  setEditingStackHashes,
  useStackEditState,
} from "./stackEditState";
import { StackEditSubTree, UndoDescription } from "./StackEditSubTree";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";

import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";
import "./CommitTreeList.scss";

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

  const stackHashes = editingStackHashes.get();
  const loadingState = loadingStackState.get();
  const isStackEditing =
    depth > 0 &&
    stackHashes.has(info.branch) &&
    loadingState.state === "hasValue";

  const stackActions =
    !isPublic && depth === 1 ? (
      <StackActions key="stack-actions" tree={tree} />
    ) : null;

  if (isStackEditing) {
    return (
      <>
        <StackEditSubTree />
        {stackActions}
      </>
    );
  }

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
    const diffMap = allDiffSummaries.get();
    const stackHashes = editingStackHashes.get();
    const loadingState = loadingStackState.get();
    const runOperation = useRunOperation();

    // buttons at the bottom of the stack
    const actions = [];
    // additional actions hidden behind [...] menu.
    // Non-empty only when actions is non-empty.
    const moreActions: Array<ContextMenuItem> = [];

    const isStackEditingActivated =
      stackHashes.size > 0 &&
      loadingState.state === "hasValue" &&
      generatorContains(walkTreePostorder([tree]), (v) =>
        stackHashes.has(v.info.branch)
      );

    const contextMenu = useContextMenu(() => moreActions);
    if (reviewProvider !== null && !isStackEditingActivated) {
      const reviewActions =
        diffMap.value == null
          ? {}
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
                  reviewProvider.submitOperation(resubmittableStack)
                );
              }}
            >
              <Icon icon="cloud-upload" slot="start" />
              <>Resubmit stack</>
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
                  <>Submit entire stack</>
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
              <>Submit stack</>
            </VSCodeButton>
          </HighlightCommitsWhileHovering>
        );
      }
    }

    if (tree.children.length > 0) {
      actions.push(<StackEditButton key="edit-stack" tree={tree} />);
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

const StackEditConfirmButtons = observer((): React.ReactElement => {
  const originalHead = latestHeadCommit.get();
  const runOperation = useRunOperation();
  const stackEdit = useStackEditState();

  const canUndo = stackEdit.canUndo();
  const canRedo = stackEdit.canRedo();

  const handleUndo = () => {
    stackEdit.undo();
    bumpStackEditMetric("undo");
  };

  const handleRedo = () => {
    stackEdit.redo();
    bumpStackEditMetric("redo");
  };

  const handleSaveChanges = () => {
    const importStack = stackEdit.commitStack.calculateImportStack({
      goto: originalHead?.branch,
      rewriteDate: Date.now() / 1000,
    });
    const op = new ImportStackOperation(importStack);
    runOperation(op);
    sendStackEditMetrics(true);
    // Exit stack editing.
    setEditingStackHashes(new Set());
  };

  const handleCancel = () => {
    sendStackEditMetrics(false);
    setEditingStackHashes(new Set<Hash>());
  };

  // Show [Cancel] [Save changes] [Undo] [Redo].
  return (
    <>
      <Tooltip
        title={"Discard stack editing changes"}
        delayMs={DOCUMENTATION_DELAY}
        placement="bottom"
      >
        <VSCodeButton
          className="cancel-edit-stack-button"
          appearance="secondary"
          onClick={handleCancel}
        >
          <>Cancel</>
        </VSCodeButton>
      </Tooltip>
      <Tooltip
        title={"Save stack editing changes"}
        delayMs={DOCUMENTATION_DELAY}
        placement="bottom"
      >
        <VSCodeButton
          className="confirm-edit-stack-button"
          appearance="primary"
          onClick={handleSaveChanges}
        >
          <>Save changes</>
        </VSCodeButton>
      </Tooltip>
      <Tooltip
        component={() =>
          canUndo ? (
            <>
              Undo <UndoDescription op={stackEdit.undoOperationDescription()} />
            </>
          ) : (
            <>No operations to undo</>
          )
        }
        placement="bottom"
      >
        <VSCodeButton
          appearance="icon"
          disabled={!canUndo}
          onClick={handleUndo}
        >
          <Icon icon="discard" />
        </VSCodeButton>
      </Tooltip>
      <Tooltip
        component={() =>
          canRedo ? (
            <>
              Redo <UndoDescription op={stackEdit.redoOperationDescription()} />
            </>
          ) : (
            <>No operations to redo</>
          )
        }
        placement="bottom"
      >
        <VSCodeButton
          appearance="icon"
          disabled={!canRedo}
          onClick={handleRedo}
        >
          <Icon icon="redo" />
        </VSCodeButton>
      </Tooltip>
    </>
  );
});

const StackEditButton = observer(
  ({ tree }: { tree: CommitTreeWithPreviews }): React.ReactElement | null => {
    const uncommitted = latestUncommittedChangesData.get();
    const stackHashes = editingStackHashes.get();
    const loadingState = loadingStackState.get();

    const stackCommits = [...walkTreePostorder([tree])].map((t) => t.info);
    const isEditing =
      stackHashes.size > 0 &&
      stackCommits.some((c) => stackHashes.has(c.branch));
    const isLoaded = isEditing && loadingState.state === "hasValue";
    if (isLoaded) {
      return <StackEditConfirmButtons />;
    }

    const isPreview = tree.previewType != null;
    const isLoading = isEditing && loadingState.state === "loading";
    const isError = isEditing && loadingState.state === "hasError";
    const isLinear = isTreeLinear(tree);
    const isDirty =
      stackCommits.some((c) => c.isHead) && uncommitted.files.length > 0;
    const hasPublic = stackCommits.some((c) => c.partOfTrunk);
    const disabled =
      isDirty || !isLinear || isLoading || isError || isPreview || hasPublic;
    const title = isError
      ? `Failed to load stack: ${loadingState.error}`
      : isLoading
      ? loadingState.exportedStack === undefined
        ? "Reading stack content"
        : "Analyzing stack content"
      : isDirty
      ? "Cannot edit stack when there are uncommitted changes.\nCommit or amend your changes first."
      : isPreview
      ? "Cannot edit pending changes"
      : hasPublic
      ? "Cannot edit public commits"
      : isLinear
      ? "Reorder, fold, or drop commits"
      : "Cannot edit non-linear stack";
    const highlight = disabled ? [] : stackCommits;
    const tooltipDelay =
      disabled && !isLoading ? undefined : DOCUMENTATION_DELAY;
    const icon = isLoading ? (
      <Icon icon="loading" slot="start" />
    ) : (
      <StackEditIcon slot="start" />
    );

    return (
      <HighlightCommitsWhileHovering key="submit-stack" toHighlight={highlight}>
        <Tooltip title={title} delayMs={tooltipDelay} placement="bottom">
          <VSCodeButton
            className={`edit-stack-button ${disabled && "disabled"}`}
            disabled={disabled}
            appearance="icon"
            onClick={() => {
              setEditingStackHashes(
                new Set<Hash>(stackCommits.map((c) => c.branch))
              );
            }}
          >
            {icon}
            <>Edit stack</>
          </VSCodeButton>
        </Tooltip>
      </HighlightCommitsWhileHovering>
    );
  }
);
