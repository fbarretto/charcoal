import { useCallback } from "react";

import {
  CommitInfoMode,
  EditedMessage,
  EditedMessageUnlessOptimistic,
  filesChangedForBranch,
} from "./CommitInfoState";
import type {
  CommitMessageFields,
  FieldsBeingEdited,
} from "@withgraphite/gti-shared";

import {
  VSCodeBadge,
  VSCodeButton,
  VSCodeDivider,
  VSCodeRadio,
  VSCodeRadioGroup,
} from "@vscode/webview-ui-toolkit/react";
import { ComparisonType } from "@withgraphite/gti-shared";
import { Icon } from "../Icon";
import { notEmpty, unwrap } from "@withgraphite/gti-shared";
import { useEffect } from "react";
import {
  allDiffSummaries,
  codeReviewProvider,
} from "../codeReview/CodeReviewInfo";
import {
  submitAsDraft,
  SubmitAsDraftCheckbox,
} from "../codeReview/DraftCheckbox";
import { Commit } from "../Commit";
import { OpenComparisonViewButton } from "../ComparisonView/OpenComparisonViewButton";
import { Center, LargeSpinner } from "../ComponentUtils";
import { HighlightCommitsWhileHovering } from "../HighlightedCommits";
import { numPendingImageUploads } from "../ImageUpload";
import { OperationDisabledButton } from "../OperationDisabledButton";
import { AmendMessageOperation } from "../operations/AmendMessageOperation";
import { AmendOperation } from "../operations/AmendOperation";
import { CommitOperation } from "../operations/CommitOperation";
import platform from "../platform";
import {
  CommitPreview,
  treeWithPreviews,
  uncommittedChangesWithPreviews,
} from "../previews";
import { selectedCommitInfos, selectedCommits } from "../selection";
import { repositoryInfo, useRunOperation } from "../serverAPIState";
import { Subtle } from "../Subtle";
import { Tooltip } from "../Tooltip";
import {
  ChangedFiles,
  deselectedUncommittedChanges,
  UncommittedChanges,
} from "../UncommittedChanges";
import { assert, firstOfIterable } from "../utils";
import { CommitInfoField } from "./CommitInfoField";
import {
  commitFieldsBeingEdited,
  commitMode,
  editedCommitMessages,
  hasUnsavedEditedCommitMessage,
} from "./CommitInfoState";
import {
  allFieldsBeingEdited,
  commitMessageFieldsSchema,
  commitMessageFieldsToString,
  findFieldsBeingEdited,
  noFieldsBeingEdited,
  parseCommitMessageFields,
} from "./CommitMessageFields";
import {
  CommitTitleByline,
  getTopmostEditedField,
  Section,
  SmallCapsTitle,
} from "./utils";

import "./CommitInfoView.scss";

import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import { observer } from "mobx-react-lite";

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

export function MultiCommitInfo({
  selectedCommits,
}: {
  selectedCommits: Array<BranchInfo>;
}) {
  const provider = codeReviewProvider.get();
  const diffSummaries = allDiffSummaries.get();
  const runOperation = useRunOperation();
  const shouldSubmitAsDraft = submitAsDraft.get();
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
        <>{selectedCommits.length} Commits Selected</>
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
        <div className="commit-info-actions-bar-left">
          <SubmitAsDraftCheckbox commitsToBeSubmit={selectedCommits} />
        </div>
        <div className="commit-info-actions-bar-right">
          {submittable.length === 0 ? null : (
            <HighlightCommitsWhileHovering toHighlight={submittable}>
              <VSCodeButton
                onClick={() => {
                  runOperation(
                    unwrap(provider).submitOperation(selectedCommits, {
                      draft: shouldSubmitAsDraft,
                    })
                  );
                }}
              >
                <>Submit Selected Commits</>
              </VSCodeButton>
            </HighlightCommitsWhileHovering>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommitInfoDetails({ commit }: { commit: BranchInfo }) {
  const mode = commitMode.get();
  const isCommitMode = commit.isHead && mode === "commit";
  const editedMessageState = editedCommitMessages(
    isCommitMode ? "head" : commit.branch
  );
  const editedMessage = editedMessageState.get();
  const uncommittedChanges = uncommittedChangesWithPreviews.get();
  const schema = commitMessageFieldsSchema.get();

  const isPublic = mode === "amend" && commit.partOfTrunk;

  const fieldsBeingEdited = commitFieldsBeingEdited.get();

  const startEditingField = (field: string) => {
    assert(
      editedMessage.type !== "optimistic",
      "Cannot start editing fields when viewing optimistic commit"
    );
    commitFieldsBeingEdited.set({ ...fieldsBeingEdited, [field]: true });
  };

  const parsedFields = parseCommitMessageFields(
    schema,
    commit.title,
    commit.description
  );

  useEffect(() => {
    if (editedMessage.type === "optimistic") {
      // invariant: if mode === 'commit', editedMessage.type !== 'optimistic'.
      assert(
        !isCommitMode,
        "Should not be in commit mode while editedMessage.type is optimistic"
      );

      // no fields are edited during optimistic state
      commitFieldsBeingEdited.set(noFieldsBeingEdited(schema));
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
    commitFieldsBeingEdited.set(
      isCommitMode
        ? allFieldsBeingEdited(schema)
        : findFieldsBeingEdited(schema, editedMessage.fields, parsedFields)
    );

    // We only want to recompute this when the commit/mode changes.
    // we expect the edited message to change constantly.
  }, [commit.branch, isCommitMode]);

  const filesChangedData = filesChangedForBranch(commit.branch);
  const filesChanged = filesChangedData.get();
  useEffect(() => {
    filesChangedData.set({
      ...filesChangedData.get(),
      // triggers a refresh
      isLoading: true,
    });
  }, [commit.date]);

  const topmostEditedField = getTopmostEditedField(schema, fieldsBeingEdited);

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
            <VSCodeRadio value="amend" checked={mode === "amend"} tabIndex={0}>
              <>Amend</>
            </VSCodeRadio>
          </VSCodeRadioGroup>
        </div>
      )}

      <div
        className="commit-info-view-main-content"
        // remount this if we change to commit mode
        key={mode}
      >
        {schema.map((field) => (
          <CommitInfoField
            key={field.key}
            field={field}
            content={parsedFields[field.key as keyof CommitMessageFields]}
            autofocus={topmostEditedField === field.key}
            readonly={editedMessage.type === "optimistic" || isPublic}
            isBeingEdited={fieldsBeingEdited[field.key]}
            startEditingField={() => startEditingField(field.key)}
            editedField={editedMessage.fields?.[field.key]}
            setEditedField={(newVal: string) =>
              editedMessageState.set(
                editedMessage.type === "optimistic"
                  ? editedMessage
                  : {
                      fields: {
                        ...editedMessage.fields,
                        [field.key]: field.type === "field" ? [newVal] : newVal,
                      },
                    }
              )
            }
            extra={
              mode !== "commit" && field.key === "Title" ? (
                <CommitTitleByline commit={commit} />
              ) : undefined
            }
          />
        ))}
        <VSCodeDivider />
        {commit.isHead && !isPublic ? (
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
        {isCommitMode ? null : filesChanged.data === null ? (
          <Center>
            <LargeSpinner />
          </Center>
        ) : (
          <Section>
            <SmallCapsTitle>
              <>Files Changed</>
              <VSCodeBadge>{filesChanged.data?.total}</VSCodeBadge>
            </SmallCapsTitle>
            <div className="changed-file-list">
              <OpenComparisonViewButton
                comparison={{
                  type: ComparisonType.Committed,
                  hash: commit.branch,
                }}
              />
              <ChangedFiles
                files={filesChanged.data?.files || []}
                comparison={
                  commit.isHead
                    ? { type: ComparisonType.HeadChanges }
                    : {
                        type: ComparisonType.Committed,
                        hash: commit.branch,
                      }
                }
              />
            </div>
          </Section>
        )}
      </div>
      {!isPublic && (
        <div className="commit-info-view-toolbar-bottom">
          <ActionsBar
            commit={commit}
            editedMessage={editedMessage}
            fieldsBeingEdited={fieldsBeingEdited}
            isCommitMode={isCommitMode}
          />
        </div>
      )}
    </div>
  );
}

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
      Object.values(fieldsBeingEdited).some(Boolean);
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
    const schema = commitMessageFieldsSchema.get();

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
    const doAmendOrCommit = () => {
      const message = commitMessageFieldsToString(
        schema,
        assertNonOptimistic(editedMessage).fields
      );
      const filesToCommit =
        deselected.size === 0
          ? // all files
            undefined
          : // only files not unchecked
            uncommittedChanges
              .filter((file) => !deselected.has(file.path))
              .map((file) => file.path);

      const operation = isCommitMode
        ? new CommitOperation(message, commit.branch)
        : new AmendOperation(filesToCommit, message);

      void clearEditedCommitMessage(/* skip confirmation */ true);
      // reset to amend mode now that the commit has been made
      commitMode.set("amend");
      deselectIfHeadIsSelected();

      return operation;
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
              <>Cancel</>
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
              <OperationDisabledButton
                contextKey={isCommitMode ? "commit" : "amend"}
                appearance="secondary"
                disabled={
                  !anythingToCommit ||
                  editedMessage == null ||
                  areImageUploadsOngoing
                }
                runOperation={doAmendOrCommit}
              >
                {isCommitMode ? <>Commit</> : <>Amend</>}
              </OperationDisabledButton>
            </Tooltip>
          ) : (
            <Tooltip
              title={"Image uploads are still pending"}
              trigger={areImageUploadsOngoing ? "hover" : "disabled"}
            >
              <OperationDisabledButton
                contextKey={`amend-message-${commit.branch}`}
                appearance="secondary"
                data-testid="amend-message-button"
                disabled={
                  !isAnythingBeingEdited ||
                  editedMessage == null ||
                  areImageUploadsOngoing
                }
                runOperation={() => {
                  const operation = new AmendMessageOperation(
                    commit.branch,
                    commitMessageFieldsToString(
                      schema,
                      assertNonOptimistic(editedMessage).fields
                    )
                  );
                  void clearEditedCommitMessage(/* skip confirmation */ true);
                  return operation;
                }}
              >
                <>Amend Message</>
              </OperationDisabledButton>
            </Tooltip>
          )}
          {commit.isHead || canSubmitIndividualDiffs ? (
            <Tooltip
              title={
                areImageUploadsOngoing
                  ? "Image uploads are still pending"
                  : canSubmitWithCodeReviewProvider
                  ? `Submit for code review with ${codeReviewProviderName}`
                  : "Submitting for code review is currently only supported for GitHub-backed repos"
              }
              placement="top"
            >
              <OperationDisabledButton
                contextKey={`submit-${commit.isHead ? "head" : commit.branch}`}
                disabled={
                  !canSubmitWithCodeReviewProvider || areImageUploadsOngoing
                }
                runOperation={async () => {
                  let amendOrCommitOp;
                  if (anythingToCommit) {
                    amendOrCommitOp = doAmendOrCommit();
                  }

                  const submitOp = unwrap(provider).submitOperation(
                    commit.isHead ? [] : [commit], // [] means to submit the head commit
                    {
                      draft: shouldSubmitAsDraft,
                    }
                  );
                  return [amendOrCommitOp, submitOp].filter(notEmpty);
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
              </OperationDisabledButton>
            </Tooltip>
          ) : null}
        </div>
      </div>
    );
  }
);
