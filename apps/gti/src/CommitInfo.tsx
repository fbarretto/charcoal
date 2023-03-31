import { ReactNode, useCallback } from "react";

import {
  VSCodeBadge,
  VSCodeButton,
  VSCodeDivider,
  VSCodeRadio,
  VSCodeRadioGroup,
} from "@vscode/webview-ui-toolkit/react";
import React, { useEffect } from "react";
import {
  allDiffSummaries,
  codeReviewProvider,
} from "./codeReview/CodeReviewInfo";
import { Commit, YouAreHere } from "./Commit";
import { OpenComparisonViewButton } from "./ComparisonView/OpenComparisonViewButton";
import { AmendMessageOperation } from "./operations/AmendMessageOperation";
import { AmendOperation } from "./operations/AmendOperation";
import { CommitOperation } from "./operations/CommitOperation";
import platform from "./platform";
import {
  CommitPreview,
  treeWithPreviews,
  uncommittedChangesWithPreviews,
} from "./previews";
import { RelativeDate } from "./relativeDate";
import { selectedCommitInfos, selectedCommits } from "./selection";
import {
  commitMessageTemplate,
  repositoryInfo,
  useRunOperation,
} from "./serverAPIState";
import { Subtle } from "./Subtle";
import { Tooltip } from "./Tooltip";
import {
  ChangedFiles,
  deselectedUncommittedChanges,
  UncommittedChanges,
} from "./UncommittedChanges";
import { assert, firstOfIterable } from "./utils";

import { ComparisonType } from "@withgraphite/gti-shared/Comparison";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { unwrap } from "@withgraphite/gti-shared/utils";

import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";
import {
  submitAsDraft,
  SubmitAsDraftCheckbox,
} from "./codeReview/DraftCheckbox";
import "./CommitInfo.scss";
import {
  commitFieldsBeingEdited,
  commitMode,
  editedCommitMessages,
  hasUnsavedEditedCommitMessage,
} from "./CommitInfoState";
import { Center } from "./ComponentUtils";
import { HighlightCommitsWhileHovering } from "./HighlightedCommits";
import { numPendingImageUploads } from "./ImageUpload";
import { CommitInfoField } from "./TextArea";

export type EditedMessage = { title: string; description: string };

/**
 * Which fields of the message should display as editors instead of rendered values.
 * This can be controlled outside of the commit info view, but it gets updated in an effect as well when commits are changed.
 * `forceWhileOnHead` can be used to prevent auto-updating when in amend mode to bypass this effect.
 * This value is removed whenever the next real update to the value is given.
 */
type FieldsBeingEdited = {
  title: boolean;
  description: boolean;
  forceWhileOnHead?: boolean;
};

type CommitInfoMode = "commit" | "amend";
type EditedMessageUnlessOptimistic =
  | (EditedMessage & { type?: undefined })
  | { type: "optimistic"; title?: undefined; description?: undefined };

/**
 * Throw if the edited message is of optimistic type.
 * We expect:
 *  - editedCommitMessage('head') should never be optimistic
 *  - editedCommitMessage(hashForCommitInTheTree) should not be optimistic
 *  - editedCommitMessage(hashForCommitNotInTheTree) should be optimistic
 */
function assertNonOptimistic(
  editedMessage: EditedMessageUnlessOptimistic
): EditedMessage {
  if (editedMessage.type === "optimistic") {
    throw new Error("Expected edited message to not be for optimistic commit");
  }
  return editedMessage;
}

export const CommitInfoSidebar = observer(() => {
  const { headCommit } = treeWithPreviews.get();
  const selected = selectedCommitInfos.get();

  // show selected commit, if there's exactly 1
  const selectedCommit = selected.length === 1 ? selected[0] : undefined;
  const commit = selectedCommit ?? headCommit;

  if (commit == null) {
    return (
      <div className="commit-info-view" data-testid="commit-info-view-loading">
        <Center>
          <Icon icon="loading" />
        </Center>
      </div>
    );
  } else {
    if (selected.length > 1) {
      return <MultiCommitInfo selectedCommits={selected} />;
    }

    // only one commit selected
    return <CommitInfoDetails commit={commit} />;
  }
});

export const MultiCommitInfo = observer(
  ({ selectedCommits }: { selectedCommits: Array<BranchInfo> }) => {
    const provider = codeReviewProvider.get();
    const diffSummaries = allDiffSummaries.get();
    const runOperation = useRunOperation();
    const submittable =
      (diffSummaries.value != null
        ? provider?.getSubmittableDiffs(selectedCommits, diffSummaries.value)
        : undefined) ?? [];
    return (
      <div
        className="commit-info-view-multi-commit"
        data-testid="commit-info-view"
      >
        <strong className="commit-list-header">
          <Icon icon="layers" size="M" />
          {selectedCommits.length} Commits Selected
        </strong>
        <VSCodeDivider />
        <div className="commit-list">
          {selectedCommits.map((commit) => (
            <Commit
              key={commit.branch}
              commit={commit}
              hasChildren={false}
              previewType={CommitPreview.NON_ACTIONABLE_COMMIT}
            />
          ))}
        </div>
        <div className="commit-info-actions-bar">
          {submittable.length === 0 ? null : (
            <HighlightCommitsWhileHovering toHighlight={submittable}>
              <VSCodeButton
                onClick={() => {
                  runOperation(
                    unwrap(provider).submitOperation(selectedCommits)
                  );
                }}
              >
                Submit Selected Commits
              </VSCodeButton>
            </HighlightCommitsWhileHovering>
          )}
        </div>
      </div>
    );
  }
);

export const CommitInfoDetails = observer(
  ({ commit }: { commit: BranchInfo }) => {
    const mode = commitMode.get();
    const isCommitMode = commit.isHead && mode === "commit";
    const editedMessageState = editedCommitMessages(
      isCommitMode ? "head" : commit.branch
    );
    const setEditedCommitMesage = (value: EditedMessageUnlessOptimistic) => {
      editedMessageState.set(value);
    };
    const editedMessage = editedMessageState.get();
    const uncommittedChanges = uncommittedChangesWithPreviews.get();

    const fieldsBeingEdited: FieldsBeingEdited = commitFieldsBeingEdited.get();

    const startEditingField = (field: "title" | "description") => {
      assert(
        editedMessage.type !== "optimistic",
        "Cannot start editing fields when viewing optimistic commit"
      );
      commitFieldsBeingEdited.set({ ...fieldsBeingEdited, [field]: true });
    };

    useEffect(() => {
      if (editedMessage.type === "optimistic") {
        // invariant: if mode === 'commit', editedMessage.type !== 'optimistic'.
        assert(
          !isCommitMode,
          "Should not be in commit mode while editedMessage.type is optimistic"
        );

        // no fields are edited during optimistic state
        commitFieldsBeingEdited.set({
          title: false,
          description: false,
        });
        return;
      }
      if (fieldsBeingEdited.forceWhileOnHead && commit.isHead) {
        // `forceWhileOnHead` is used to allow fields to be marked as edited externally,
        // even though they would get reset here after rendering.
        // This will get reset when the user cancels or changes to a different commit.
        return;
      }
      // If the selected commit is changed, the fields being edited should reset;
      // except for fields that are being edited on this commit, too
      commitFieldsBeingEdited.set({
        title: isCommitMode || editedMessage.title !== commit.title,
        description:
          isCommitMode || editedMessage.description !== commit.description,
      });

      // We only want to recompute this when the commit/mode changes.
      // we expect the edited message to change constantly.
    }, [commit.branch, isCommitMode]);

    const templates = commitMessageTemplate.get();

    return (
      <div className="commit-info-view" data-testid="commit-info-view">
        {!commit.isHead ? null : (
          <div
            className="commit-info-view-toolbar-top"
            data-testid="commit-info-toolbar-top"
          >
            <VSCodeRadioGroup
              value={mode}
              onChange={(e) =>
                commitMode.set(
                  (e.target as HTMLOptionElement).value as CommitInfoMode
                )
              }
            >
              <VSCodeRadio
                value="commit"
                checked={mode === "commit"}
                tabIndex={0}
              >
                <>Commit</>
              </VSCodeRadio>
              <VSCodeRadio
                value="amend"
                checked={mode === "amend"}
                tabIndex={0}
              >
                <>Amend</>
              </VSCodeRadio>
            </VSCodeRadioGroup>
          </div>
        )}
        <div className="commit-info-view-main-content">
          {fieldsBeingEdited.title ? (
            <Section className="commit-info-title-field-section">
              <SmallCapsTitle>
                <Icon icon="milestone" />
                <>Title</>
              </SmallCapsTitle>
              <CommitInfoField
                which="title"
                autoFocus={true}
                editedMessage={assertNonOptimistic(editedMessage)}
                setEditedCommitMessage={setEditedCommitMesage}
                // remount this component if we switch commit mode
                key={mode}
              />
            </Section>
          ) : (
            <>
              <ClickToEditField
                startEditingField={
                  editedMessage.type === "optimistic"
                    ? undefined
                    : startEditingField
                }
                which="title"
              >
                <span>{commit.title}</span>
                {editedMessage.type === "optimistic" ? null : (
                  <span className="hover-edit-button">
                    <Icon icon="edit" />
                  </span>
                )}
              </ClickToEditField>
              <CommitTitleByline commit={commit} />
            </>
          )}
          {fieldsBeingEdited.description ? (
            <Section>
              <SmallCapsTitle>
                <Icon icon="note" />
                <>Description</>
              </SmallCapsTitle>
              <CommitInfoField
                which="description"
                autoFocus={!fieldsBeingEdited.title}
                editedMessage={assertNonOptimistic(editedMessage)}
                setEditedCommitMessage={setEditedCommitMesage}
                // remount this component if we switch commit mode
                key={mode}
              />
              {templates &&
                Object.keys(templates).length > 1 &&
                Object.entries(templates).map(([file, contents]) => {
                  return (
                    <VSCodeButton
                      appearance="icon"
                      onClick={() => {
                        setEditedCommitMesage({
                          ...assertNonOptimistic(editedMessage),
                          description: contents,
                        });
                      }}
                    >
                      <Icon icon="files" slot="start" />
                      {file}
                    </VSCodeButton>
                  );
                })}
            </Section>
          ) : (
            <Section>
              <ClickToEditField
                startEditingField={
                  editedMessage.type === "optimistic"
                    ? undefined
                    : startEditingField
                }
                which="description"
              >
                <SmallCapsTitle>
                  <Icon icon="note" />
                  <>Description</>
                  <span className="hover-edit-button">
                    <Icon icon="edit" />
                  </span>
                </SmallCapsTitle>
                {commit.description ? (
                  <div>{commit.description}</div>
                ) : (
                  <span className="empty-description subtle">
                    {editedMessage.type === "optimistic" ? (
                      <>
                        <>No description</>
                      </>
                    ) : (
                      <>
                        <Icon icon="add" />
                        <> Click to add description</>
                      </>
                    )}
                  </span>
                )}
              </ClickToEditField>
            </Section>
          )}
          <VSCodeDivider />
          {commit.isHead ? (
            <Section data-testid="changes-to-amend">
              <SmallCapsTitle>
                {isCommitMode ? <>Changes to Commit</> : <>Changes to Amend</>}
                <VSCodeBadge>{uncommittedChanges.length}</VSCodeBadge>
              </SmallCapsTitle>
              {uncommittedChanges.length === 0 ? (
                <Subtle>
                  {isCommitMode ? (
                    <>No changes to commit</>
                  ) : (
                    <>No changes to amend</>
                  )}
                </Subtle>
              ) : (
                <UncommittedChanges
                  place={isCommitMode ? "commit sidebar" : "amend sidebar"}
                />
              )}
            </Section>
          ) : null}
          {isCommitMode ? null : (
            <Section>
              <SmallCapsTitle>
                <>Files Changed</>
                <VSCodeBadge>{commit.totalFileCount}</VSCodeBadge>
              </SmallCapsTitle>
              <div className="changed-file-list">
                <OpenComparisonViewButton
                  comparison={{
                    type: ComparisonType.Committed,
                    hash: commit.branch,
                  }}
                />
                <ChangedFiles
                  files={commit.filesSample}
                  showFileActions={false}
                />
              </div>
            </Section>
          )}
        </div>
        <div className="commit-info-view-toolbar-bottom">
          <ActionsBar
            commit={commit}
            editedMessage={editedMessage}
            fieldsBeingEdited={fieldsBeingEdited}
            isCommitMode={isCommitMode}
          />
        </div>
      </div>
    );
  }
);

const ActionsBar = observer(
  ({
    commit,
    editedMessage,
    fieldsBeingEdited,
    isCommitMode,
  }: {
    commit: BranchInfo;
    editedMessage: EditedMessageUnlessOptimistic;
    fieldsBeingEdited: FieldsBeingEdited;
    isCommitMode: boolean;
  }) => {
    const isAnythingBeingEdited =
      fieldsBeingEdited.title || fieldsBeingEdited.description;
    const uncommittedChanges = uncommittedChangesWithPreviews.get();
    const deselected = deselectedUncommittedChanges;
    const anythingToCommit =
      !(deselected.size > 0 && deselected.size === uncommittedChanges.length) &&
      ((!isCommitMode && isAnythingBeingEdited) ||
        uncommittedChanges.length > 0);

    const provider = codeReviewProvider.get();
    const repoInfo = repositoryInfo.get();
    const diffSummaries = allDiffSummaries.get();
    const shouldSubmitAsDraft = submitAsDraft.get();

    // after committing/amending, if you've previously selected the head commit,
    // we should show you the newly amended/committed commit instead of the old one.
    const deselectIfHeadIsSelected = useCallback(() => {
      if (!commit.isHead) {
        return;
      }
      const selected = selectedCommits;
      // only reset if selection exactly matches our expectation
      if (
        selected &&
        selected.size === 1 &&
        firstOfIterable(selected.values()) === commit.branch
      ) {
        selectedCommits.clear();
      }
    }, []);

    const clearEditedCommitMessage = useCallback(
      async (skipConfirmation?: boolean) => {
        if (!skipConfirmation) {
          const hasUnsavedEditsLoadable = hasUnsavedEditedCommitMessage(
            isCommitMode ? "head" : commit.branch
          ).get();
          const hasUnsavedEdits = hasUnsavedEditsLoadable === true;
          if (hasUnsavedEdits) {
            const confirmed = await platform.confirm(
              "Are you sure you want to discard your edited message?"
            );
            if (confirmed === false) {
              return;
            }
          }
        }

        editedCommitMessages(isCommitMode ? "head" : commit.branch).set(
          editedCommitMessages(commit.branch).get()
        );
        commitFieldsBeingEdited.set({ title: false, description: false });
      },
      []
    );
    const runOperation = useRunOperation();
    const doAmendOrCommit = () => {
      const filesToCommit =
        deselected.size === 0
          ? // all files
            undefined
          : // only files not unchecked
            uncommittedChanges
              .filter((file) => !deselected.has(file.path))
              .map((file) => file.path);
      runOperation(
        isCommitMode
          ? new CommitOperation(
              assertNonOptimistic(editedMessage),
              commit.branch,
              filesToCommit
            )
          : new AmendOperation(
              filesToCommit,
              assertNonOptimistic(editedMessage)
            )
      );
      void clearEditedCommitMessage(/* skip confirmation */ true);
      // reset to amend mode now that the commit has been made
      commitMode.set("amend");
      deselectIfHeadIsSelected();
    };

    const codeReviewProviderName =
      repoInfo?.type === "success" ? repoInfo.codeReviewSystem.type : "unknown";
    const canSubmitWithCodeReviewProvider =
      codeReviewProviderName !== "none" && codeReviewProviderName !== "unknown";

    const submittable =
      diffSummaries.value &&
      provider?.getSubmittableDiffs([commit], diffSummaries.value);
    const canSubmitIndividualDiffs = submittable && submittable.length > 0;

    const ongoingImageUploads = numPendingImageUploads.get();
    const areImageUploadsOngoing = ongoingImageUploads > 0;

    return (
      <div
        className="commit-info-actions-bar"
        data-testid="commit-info-actions-bar"
      >
        <div className="commit-info-actions-bar-left">
          <SubmitAsDraftCheckbox
            commitsToBeSubmit={isCommitMode ? [] : [commit]}
          />
        </div>
        <div className="commit-info-actions-bar-right">
          {isAnythingBeingEdited && !isCommitMode ? (
            <VSCodeButton
              appearance="secondary"
              onClick={() => clearEditedCommitMessage()}
            >
              Cancel
            </VSCodeButton>
          ) : null}

          {commit.isHead ? (
            <Tooltip
              title={
                areImageUploadsOngoing
                  ? "Image uploads are still pending"
                  : isCommitMode
                  ? deselected.size === 0
                    ? "No changes to commit"
                    : "No selected changes to commit"
                  : deselected.size === 0
                  ? "No changes to amend"
                  : "No selected changes to amend"
              }
              trigger={
                areImageUploadsOngoing || !anythingToCommit
                  ? "hover"
                  : "disabled"
              }
            >
              <VSCodeButton
                appearance="secondary"
                disabled={
                  !anythingToCommit ||
                  editedMessage == null ||
                  areImageUploadsOngoing
                }
                onClick={doAmendOrCommit}
              >
                {isCommitMode ? <>Commit</> : <>Amend</>}
              </VSCodeButton>
            </Tooltip>
          ) : (
            <Tooltip
              title={"Image uploads are still pending"}
              trigger={areImageUploadsOngoing ? "hover" : "disabled"}
            >
              <VSCodeButton
                appearance="secondary"
                disabled={
                  !isAnythingBeingEdited ||
                  editedMessage == null ||
                  areImageUploadsOngoing
                }
                onClick={() => {
                  runOperation(
                    new AmendMessageOperation(
                      commit.branch,
                      assertNonOptimistic(editedMessage)
                    )
                  );
                  void clearEditedCommitMessage(/* skip confirmation */ true);
                }}
              >
                <>Amend Message</>
              </VSCodeButton>
            </Tooltip>
          )}
          {commit.isHead || canSubmitIndividualDiffs ? (
            <Tooltip
              title={
                areImageUploadsOngoing
                  ? "Image uploads are still pending"
                  : canSubmitWithCodeReviewProvider
                  ? "Submit for code review"
                  : "Submitting for code review is currently only supported for GitHub-backed repos"
              }
              placement="top"
            >
              <VSCodeButton
                disabled={
                  !canSubmitWithCodeReviewProvider || areImageUploadsOngoing
                }
                onClick={async () => {
                  if (anythingToCommit) {
                    doAmendOrCommit();
                  }

                  runOperation(
                    unwrap(provider).submitOperation(
                      commit.isHead ? [] : [commit], // [] means to submit the head commit
                      {
                        draft: shouldSubmitAsDraft,
                      }
                    )
                  );
                }}
              >
                {commit.isHead && anythingToCommit ? (
                  isCommitMode ? (
                    <>Commit and Submit</>
                  ) : (
                    <>Amend and Submit</>
                  )
                ) : (
                  <>Submit</>
                )}
              </VSCodeButton>
            </Tooltip>
          ) : null}
        </div>
      </div>
    );
  }
);

function CommitTitleByline({ commit }: { commit: BranchInfo }) {
  const createdByInfo = (
    // TODO: determine if you're the author to say "you"
    <>Created by {commit.author}</>
  );
  const commitDate = new Date(commit.date);
  return (
    <Subtle className="commit-info-title-byline">
      {commit.isHead ? <YouAreHere hideSpinner /> : null}
      <OverflowEllipsis shrink>
        <Tooltip trigger="hover" component={() => createdByInfo}>
          {createdByInfo}
        </Tooltip>
      </OverflowEllipsis>
      <OverflowEllipsis>
        <Tooltip trigger="hover" title={commitDate.toLocaleString()}>
          <RelativeDate date={commitDate} />
        </Tooltip>
      </OverflowEllipsis>
    </Subtle>
  );
}

function OverflowEllipsis({
  children,
  shrink,
}: {
  children: ReactNode;
  shrink?: boolean;
}) {
  return (
    <div className={`overflow-ellipsis${shrink ? " overflow-shrink" : ""}`}>
      {children}
    </div>
  );
}

function SmallCapsTitle({ children }: { children: ReactNode }) {
  return <div className="commit-info-small-title">{children}</div>;
}

function Section({
  children,
  className,
  ...rest
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>) {
  return (
    <section
      {...rest}
      className={"commit-info-section" + (className ? " " + className : "")}
    >
      {children}
    </section>
  );
}

function ClickToEditField({
  children,
  startEditingField,
  which,
}: {
  children: ReactNode;
  /** function to run when you click to edit. If null, the entire field will be non-editable. */
  startEditingField?: (which: keyof EditedMessage) => void;
  which: keyof EditedMessage;
}) {
  const editable = startEditingField != null;
  return (
    <div
      className={`commit-info-rendered-${which}${
        editable ? "" : " non-editable"
      }`}
      data-testid={`commit-info-rendered-${which}`}
      onClick={
        startEditingField != null
          ? () => {
              startEditingField(which);
            }
          : undefined
      }
      onKeyPress={
        startEditingField != null
          ? (e) => {
              if (e.key === "Enter") {
                startEditingField(which);
              }
            }
          : undefined
      }
      tabIndex={0}
    >
      {children}
    </div>
  );
}
