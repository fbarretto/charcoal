import { useCallback } from "react";

import type {
  CommitMessageFields,
  FieldsBeingEdited,
} from "@withgraphite/gti-shared";
import {
  CommitInfoMode,
  EditedMessage,
  EditedMessageUnlessOptimistic,
  filesChangedForBranch,
} from "./CommitInfoState";

import {
  VSCodeBadge,
  VSCodeButton,
  VSCodeDivider,
  VSCodeRadio,
  VSCodeRadioGroup,
} from "@vscode/webview-ui-toolkit/react";
import { ComparisonType } from "@withgraphite/gti-shared";
import { useEffect } from "react";
import {
  allDiffSummariesByBranchName,
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
import { Icon } from "../Icon";
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
import {
  latestCommitsByBranchName,
  repositoryInfo,
  useRunOperation,
} from "../serverAPIState";
import { Subtle } from "../Subtle";
import { Tooltip } from "../Tooltip";
import { ChangedFiles, UncommittedChanges } from "../UncommittedChanges";
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
import type { DiffSummary } from "@withgraphite/gti-shared";
import { observer } from "mobx-react-lite";
import { PrSubmitOperation } from "../operations/PrSubmitOperation";
import { DownstackSubmitOperation } from "../operations/DownstackSubmitOperation";

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
    const repoInfo = repositoryInfo.get();
    const diffSummaries = allDiffSummariesByBranchName.get();
    const runOperation = useRunOperation();
    const shouldSubmitAsDraft = submitAsDraft.get();
    const diffSummaryValue = diffSummaries.value;
    const submittable =
      (provider && diffSummaryValue != null && repoInfo?.type === "success"
        ? selectedCommits.filter((commit) =>
            isBranchSubmittable(commit, diffSummaryValue, repoInfo.trunkBranch)
          )
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
                    for (const commit of submittable) {
                      runOperation(
                        new PrSubmitOperation(commit.branch, {
                          draft: shouldSubmitAsDraft,
                        })
                      );
                    }
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
);

export const CommitInfoDetails = observer(
  ({ commit }: { commit: BranchInfo }) => {
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
                <>Create a new branch</>
              </VSCodeRadio>
              <VSCodeRadio
                value="amend"
                checked={mode === "amend"}
                tabIndex={0}
              >
                <>Update the existing branch</>
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
                          [field.key]:
                            field.type === "field" ? [newVal] : newVal,
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
      Object.values(fieldsBeingEdited).some(Boolean);
    const uncommittedChanges = uncommittedChangesWithPreviews.get();
    const anythingToCommit =
      (!isCommitMode && isAnythingBeingEdited) || uncommittedChanges.length > 0;

    const repoInfo = repositoryInfo.get();
    const diffSummaries = allDiffSummariesByBranchName.get();
    const allCommits = latestCommitsByBranchName.get();
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

      const operation = isCommitMode
        ? new CommitOperation(message, commit.branch)
        : new AmendOperation(
            repoInfo?.type === "success"
              ? repoInfo.preferredBranchEdit
              : "amend",
            message
          );

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
    const canSubmit =
      diffSummaries.value &&
      repoInfo?.type === "success" &&
      isBranchSubmittable(commit, diffSummaries.value, repoInfo.trunkBranch);
    const canDownstackSubmit =
      diffSummaries.value && repoInfo?.type === "success"
        ? isBranchDownstackSubmittable({
            branch: commit,
            allCommitsByBranchName: allCommits,
            allDiffSummariesByBranchName: diffSummaries.value,
            mainBranch: repoInfo.trunkBranch,
          })
        : {
            canDownstackSubmit: "FALSE" as const,
          };
    // Don't show downstack submit if there is just one branch
    const showDownstackSubmit =
      canDownstackSubmit.canDownstackSubmit === "TRUE" &&
      canDownstackSubmit.impactedBranches.length > 1;

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
                  ? "No changes to commit"
                  : "No changes to amend"
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
                {isCommitMode ? <>Create</> : <>Update</>}
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
          {!anythingToCommit && canSubmit && (
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
                  return [
                    new PrSubmitOperation(commit.branch, {
                      draft: shouldSubmitAsDraft,
                    }),
                  ];
                }}
              >
                Submit
              </OperationDisabledButton>
            </Tooltip>
          )}
          {!anythingToCommit && showDownstackSubmit && (
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
              <HighlightCommitsWhileHovering
                toHighlight={canDownstackSubmit.impactedBranches}
              >
                <OperationDisabledButton
                  contextKey={`downstack-submit-${
                    commit.isHead ? "head" : commit.branch
                  }`}
                  disabled={
                    !canSubmitWithCodeReviewProvider || areImageUploadsOngoing
                  }
                  runOperation={async () => {
                    return [
                      new DownstackSubmitOperation(commit.branch, {
                        draft: shouldSubmitAsDraft,
                      }),
                    ];
                  }}
                >
                  Downstack Submit
                </OperationDisabledButton>
              </HighlightCommitsWhileHovering>
            </Tooltip>
          )}
        </div>
      </div>
    );
  }
);

function isBranchSubmittable(
  branch: BranchInfo,
  allDiffSummariesByBranchName: Map<string, DiffSummary>,
  mainBranch: string
): boolean {
  const prInfo = allDiffSummariesByBranchName.get(branch.branch);

  return (
    !branch.partOfTrunk &&
    (!prInfo || prInfo?.state === "OPEN") &&
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
}

// Typescript having some weirdness where if I leave it as a boolean it doesn't allow me
// to treat it as a ADT
type TBranchDownstackSubmittable =
  | { canDownstackSubmit: "TRUE"; impactedBranches: BranchInfo[] }
  | { canDownstackSubmit: "FALSE" };

function isBranchDownstackSubmittable({
  branch,
  allCommitsByBranchName,
  allDiffSummariesByBranchName,
  mainBranch,
}: {
  branch: BranchInfo;
  allCommitsByBranchName: Map<string, BranchInfo>;
  allDiffSummariesByBranchName: Map<string, DiffSummary>;
  mainBranch: string;
}): TBranchDownstackSubmittable {
  const prInfo = allDiffSummariesByBranchName.get(branch.branch);

  if (branch.branch === mainBranch) {
    return { canDownstackSubmit: "TRUE", impactedBranches: [] };
  }

  if (branch.partOfTrunk || (prInfo && prInfo?.state !== "OPEN")) {
    return {
      canDownstackSubmit: "FALSE",
    };
  }

  const parents = branch.parents.map((parentBranchName) => {
    const parentInfo = allCommitsByBranchName.get(parentBranchName);
    if (!parentInfo) {
      return {
        canDownstackSubmit: "FALSE",
      };
    }

    return isBranchDownstackSubmittable({
      branch: parentInfo,
      allCommitsByBranchName,
      allDiffSummariesByBranchName,
      mainBranch,
    });
  });

  let canSubmit = true;
  const impactedBranches: BranchInfo[] = [branch];

  for (const parent of parents) {
    if (parent.canDownstackSubmit === "TRUE") {
      impactedBranches.push(
        ...(parent as Extract<typeof parent, { canDownstackSubmit: "TRUE" }>)
          .impactedBranches
      );
    } else {
      canSubmit = false;
      break;
    }
  }

  if (canSubmit) {
    return {
      canDownstackSubmit: "TRUE",
      impactedBranches,
    };
  }

  return {
    canDownstackSubmit: "FALSE",
  };
}
