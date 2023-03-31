import type { EnsureAssignedTogether } from "@withgraphite/gti-shared/EnsureAssignedTogether";

import { gtiDrawerState } from "./App";
import serverAPI from "./ClientToServerAPI";
import { OpenComparisonViewButton } from "./ComparisonView/OpenComparisonViewButton";
import { ErrorNotice } from "./ErrorNotice";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { AbortMergeOperation } from "./operations/AbortMergeOperation";
import { AddOperation } from "./operations/AddOperation";
import { AddRemoveOperation } from "./operations/AddRemoveOperation";
import { AmendOperation } from "./operations/AmendOperation";
import { CommitOperation } from "./operations/CommitOperation";
import { ContinueOperation } from "./operations/ContinueMergeOperation";
import { DiscardOperation } from "./operations/DiscardOperation";
import { ForgetOperation } from "./operations/ForgetOperation";
import { PurgeOperation } from "./operations/PurgeOperation";
import { ResolveOperation, ResolveTool } from "./operations/ResolveOperation";
import { RevertOperation } from "./operations/RevertOperation";
import platform from "./platform";
import {
  optimisticMergeConflicts,
  uncommittedChangesWithPreviews,
  useIsOperationRunningOrQueued,
} from "./previews";
import { selectedCommits } from "./selection";
import {
  latestHeadCommit,
  operationList,
  uncommittedChangesFetchError,
  useRunOperation,
} from "./serverAPIState";
import {
  VSCodeButton,
  VSCodeCheckbox,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { useCallback, useEffect, useRef } from "react";
import { ComparisonType } from "@withgraphite/gti-shared/Comparison";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { minimalDisambiguousPaths } from "@withgraphite/gti-shared/minimalDisambiguousPaths";

import "./UncommittedChanges.scss";
import { observable, ObservableSet, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import type {
  ChangedFile,
  ChangedFileType,
  RepoRelativePath,
} from "@withgraphite/gti-cli-shared-types";
import type { MergeConflicts } from "./types";
import { commitFieldsBeingEdited, commitMode } from "./CommitInfoState";

export function ChangedFiles({
  files,
  deselectedFiles,
  setDeselectedFiles,
  showFileActions,
}: {
  files: Array<ChangedFile>;
  showFileActions: boolean;
} & EnsureAssignedTogether<{
  deselectedFiles?: Set<string>;
  setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
}>) {
  const disambiguousPaths = minimalDisambiguousPaths(
    files.map((file) => file.path)
  );
  return (
    <div className="changed-files">
      {files.map((file, i) => {
        const [statusName, icon] = nameAndIconForFileStatus[file.status];
        const minimalName = disambiguousPaths[i];
        return (
          <div
            className={`changed-file file-${statusName}`}
            key={file.path}
            tabIndex={0}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                platform.openFile(file.path);
              }
            }}
          >
            {deselectedFiles == null ? null : (
              <VSCodeCheckbox
                checked={!deselectedFiles.has(file.path)}
                // Note: Using `onClick` instead of `onChange` since onChange apparently fires when the controlled `checked` value changes,
                // which means this fires when using "select all" / "deselect all"
                onClick={(e) => {
                  const newDeselected = new Set(deselectedFiles);
                  const checked = (e.target as HTMLInputElement).checked;
                  if (checked) {
                    if (newDeselected.has(file.path)) {
                      newDeselected.delete(file.path);
                      setDeselectedFiles?.(newDeselected);
                    }
                  } else {
                    if (!newDeselected.has(file.path)) {
                      newDeselected.add(file.path);
                      setDeselectedFiles?.(newDeselected);
                    }
                  }
                }}
              />
            )}
            <span
              className="changed-file-path"
              onClick={() => {
                platform.openFile(file.path);
              }}
              title={file.path}
            >
              <Icon icon={icon} />
              <span className="changed-file-path-text">{minimalName}</span>
            </span>
            {showFileActions ? <FileActions file={file} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export const UncommittedChanges = observer(
  ({ place }: { place: "main" | "amend sidebar" | "commit sidebar" }) => {
    const uncommittedChanges = uncommittedChangesWithPreviews.get();
    const error = uncommittedChangesFetchError.get();
    // TODO: use treeWithPreviews instead, and update CommitOperation
    const headCommit = latestHeadCommit.get();

    const conflicts = optimisticMergeConflicts.get();

    const deselectedFiles = useDeselectedFiles(uncommittedChanges);
    const commitTitleRef = useRef(null);

    const runOperation = useRunOperation();

    const openCommitForm = useCallback((which: "commit" | "amend") => {
      // make sure view is expanded
      runInAction(() => {
        const val = gtiDrawerState.get();
        gtiDrawerState.set({
          ...val,
          right: { ...val.right, collapsed: false },
        });

        // show head commit & set to correct mode
        selectedCommits.clear();
        commitMode.set(which);

        // Start editing fields when amending so you can go right into typing.
        if (which === "amend") {
          commitFieldsBeingEdited.set({
            title: true,
            description: true,
            // we have to explicitly keep this change to fieldsBeingEdited because otherwise it would be reset by effects.
            forceWhileOnHead: true,
          });
        }
      });
    }, []);

    if (error) {
      return (
        <ErrorNotice
          title={"Failed to fetch Uncommitted Changes"}
          error={error}
        />
      );
    }
    if (uncommittedChanges.length === 0) {
      return null;
    }
    const allFilesSelected = deselectedFiles.size === 0;
    const noFilesSelected = deselectedFiles.size === uncommittedChanges.length;

    const allConflictsResolved =
      conflicts?.files?.every((conflict) => conflict.status === "Resolved") ??
      false;

    // only show addremove button if some files are untracked/missing
    const UNTRACKED_OR_MISSING = ["?", "!"];
    const addremoveButton = uncommittedChanges.some((file) =>
      UNTRACKED_OR_MISSING.includes(file.status)
    ) ? (
      <Tooltip
        delayMs={DOCUMENTATION_DELAY}
        title={"Add all untracked files and remove all missing files."}
      >
        <VSCodeButton
          appearance="icon"
          key="addremove"
          data-testid="addremove-button"
          onClick={() => {
            // If all files are selected, no need to pass specific files to addremove.
            const filesToAddRemove = allFilesSelected
              ? []
              : uncommittedChanges
                  .filter((file) => UNTRACKED_OR_MISSING.includes(file.status))
                  .filter((file) => !deselectedFiles.has(file.path))
                  .map((file) => file.path);
            runOperation(new AddRemoveOperation(filesToAddRemove));
          }}
        >
          <Icon slot="start" icon="expand-all" />
          <>Add/Remove</>
        </VSCodeButton>
      </Tooltip>
    ) : null;

    return (
      <div className="uncommitted-changes">
        {conflicts != null ? (
          <div className="conflicts-header">
            <strong>
              {allConflictsResolved ? (
                <>All Merge Conflicts Resolved</>
              ) : (
                <>Unresolved Merge Conflicts</>
              )}
            </strong>
            {conflicts.state === "loading" ? (
              <div data-testid="merge-conflicts-spinner">
                <Icon icon="loading" />
              </div>
            ) : null}
            {allConflictsResolved ? null : <>Resolve conflicts to continue</>}
          </div>
        ) : null}
        <div className="button-row">
          {conflicts != null ? (
            <MergeConflictButtons
              allConflictsResolved={allConflictsResolved}
              conflicts={conflicts}
            />
          ) : (
            <>
              <OpenComparisonViewButton
                comparison={{
                  type:
                    place === "amend sidebar"
                      ? ComparisonType.HeadChanges
                      : ComparisonType.UncommittedChanges,
                }}
              />
              <VSCodeButton
                appearance="icon"
                key="select-all"
                disabled={allFilesSelected}
                onClick={() => {
                  deselectedFiles.clear();
                }}
              >
                <Icon slot="start" icon="check-all" />
                <>Select All</>
              </VSCodeButton>
              <VSCodeButton
                appearance="icon"
                key="deselect-all"
                disabled={noFilesSelected}
                onClick={() => {
                  for (const file of uncommittedChanges) {
                    deselectedFiles.add(file.path);
                  }
                }}
              >
                <Icon slot="start" icon="close-all" />
                <>Deselect All</>
              </VSCodeButton>
              {addremoveButton}
              <Tooltip
                delayMs={DOCUMENTATION_DELAY}
                title={`Discard ${
                  uncommittedChanges.length - deselectedFiles.size
                } selected uncommitted changes, including untracked files.\n\nNote: Changes will be irreversably lost.`}
              >
                <VSCodeButton
                  appearance="icon"
                  disabled={noFilesSelected}
                  onClick={() => {
                    const selectedFiles = uncommittedChanges
                      .filter((file) => !deselectedFiles.has(file.path))
                      .map((file) => file.path);
                    void platform
                      .confirm(
                        `Are you sure you want to discard your ${
                          selectedFiles.length
                        } selected change${
                          selectedFiles.length === 1 ? "" : "s"
                        }? Discarded changes cannot be recovered.`
                      )
                      .then((ok) => {
                        if (!ok) {
                          return;
                        }
                        if (deselectedFiles.size === 0) {
                          // all changes selected -> use clean goto rather than reverting each file. This is generally faster.

                          // to "discard", we need to both remove uncommitted changes
                          runOperation(new DiscardOperation());
                          // ...and delete untracked files.
                          // Technically we only need to do the purge when we have untracked files, though there's a chance there's files we don't know about yet while status is running.
                          runOperation(new PurgeOperation());
                        } else {
                          // only a subset of files selected -> we need to revert selected files individually
                          runOperation(new RevertOperation(selectedFiles));
                        }
                      });
                  }}
                >
                  <Icon slot="start" icon="trashcan" />
                  <>Discard</>
                </VSCodeButton>
              </Tooltip>
            </>
          )}
        </div>
        {conflicts?.files != null ? (
          <ChangedFiles files={conflicts.files ?? []} showFileActions={true} />
        ) : (
          <ChangedFiles
            files={uncommittedChanges}
            deselectedFiles={deselectedFiles}
            showFileActions={true}
          />
        )}
        {conflicts != null || place !== "main" ? null : (
          <div className="button-rows">
            <div className="button-row">
              <span className="quick-commit-inputs">
                <VSCodeButton
                  appearance="icon"
                  disabled={noFilesSelected}
                  onClick={() => {
                    const title =
                      (commitTitleRef.current as HTMLInputElement | null)
                        ?.value || "Temporary Commit";
                    const filesToCommit =
                      deselectedFiles.size === 0
                        ? // all files
                          undefined
                        : // only files not unchecked
                          uncommittedChanges
                            .filter((file) => !deselectedFiles.has(file.path))
                            .map((file) => file.path);
                    runOperation(
                      new CommitOperation(
                        { title, description: "" },
                        headCommit?.branch ?? "",
                        filesToCommit
                      )
                    );
                  }}
                >
                  <Icon slot="start" icon="plus" />
                  <>Commit</>
                </VSCodeButton>
                <VSCodeTextField placeholder="Title" ref={commitTitleRef} />
              </span>
              <VSCodeButton
                appearance="icon"
                className="show-on-hover"
                onClick={() => {
                  openCommitForm("commit");
                }}
              >
                <Icon slot="start" icon="edit" />
                <>Commit as...</>
              </VSCodeButton>
            </div>
            {headCommit?.partOfTrunk ? null : (
              <div className="button-row">
                <VSCodeButton
                  appearance="icon"
                  disabled={noFilesSelected}
                  data-testid="uncommitted-changes-quick-amend-button"
                  onClick={() => {
                    const filesToCommit =
                      deselectedFiles.size === 0
                        ? // all files
                          undefined
                        : // only files not unchecked
                          uncommittedChanges
                            .filter((file) => !deselectedFiles.has(file.path))
                            .map((file) => file.path);
                    runOperation(new AmendOperation(filesToCommit));
                  }}
                >
                  <Icon slot="start" icon="debug-step-into" />
                  Amend
                </VSCodeButton>
                <VSCodeButton
                  appearance="icon"
                  className="show-on-hover"
                  onClick={() => {
                    openCommitForm("amend");
                  }}
                >
                  <Icon slot="start" icon="edit" />
                  Amend as...
                </VSCodeButton>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

const MergeConflictButtons = observer(
  ({
    conflicts,
    allConflictsResolved,
  }: {
    conflicts: MergeConflicts;
    allConflictsResolved: boolean;
  }) => {
    const runOperation = useRunOperation();
    // usually we only care if the operation is queued or actively running,
    // but since we don't use optimistic state for continue/abort,
    // we also need to consider recently run commands to disable the buttons.
    // But only if the abort/continue command succeeded.
    // TODO: is this reliable? Is it possible to get stuck with buttons disabled because
    // we think it's still running?
    const lastRunOperation = operationList.get().currentOperation;
    const justFinishedContinue =
      lastRunOperation?.operation instanceof ContinueOperation &&
      lastRunOperation.exitCode === 0;
    const justFinishedAbort =
      lastRunOperation?.operation instanceof AbortMergeOperation &&
      lastRunOperation.exitCode === 0;
    const isRunningContinue =
      !!useIsOperationRunningOrQueued(ContinueOperation);
    const isRunningAbort = !!useIsOperationRunningOrQueued(AbortMergeOperation);
    const shouldDisableButtons =
      isRunningContinue ||
      isRunningAbort ||
      justFinishedContinue ||
      justFinishedAbort;
    return (
      <>
        <VSCodeButton
          appearance={allConflictsResolved ? "primary" : "icon"}
          key="continue"
          disabled={!allConflictsResolved || shouldDisableButtons}
          data-testid="conflict-continue-button"
          onClick={() => {
            runOperation(new ContinueOperation());
          }}
        >
          <Icon
            slot="start"
            icon={isRunningContinue ? "loading" : "debug-continue"}
          />
          Continue
        </VSCodeButton>
        <VSCodeButton
          appearance="icon"
          key="abort"
          disabled={shouldDisableButtons}
          onClick={() => {
            runOperation(new AbortMergeOperation(conflicts));
          }}
        >
          <Icon
            slot="start"
            icon={isRunningAbort ? "loading" : "circle-slash"}
          />
          Abort
        </VSCodeButton>
      </>
    );
  }
);

const revertableStatues = new Set(["M", "R", "!"]);
const conflictStatuses = new Set<ChangedFileType>(["U", "Resolved"]);
const FileActions = observer(({ file }: { file: ChangedFile }) => {
  const runOperation = useRunOperation();
  const actions: Array<React.ReactNode> = [];

  if (platform.openDiff != null && !conflictStatuses.has(file.status)) {
    actions.push(
      <Tooltip title={"Open diff view"} key="revert" delayMs={1000}>
        <VSCodeButton
          className="file-show-on-hover"
          appearance="icon"
          data-testid="file-revert-button"
          onClick={() => {
            platform.openDiff?.(
              file.path,
              // TODO: also show diff button on other commits
              { type: ComparisonType.UncommittedChanges }
            );
          }}
        >
          <Icon icon="git-pull-request-go-to-changes" />
        </VSCodeButton>
      </Tooltip>
    );
  }

  if (revertableStatues.has(file.status)) {
    actions.push(
      <Tooltip title={"Revert back to original"} key="revert" delayMs={1000}>
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          data-testid="file-revert-button"
          onClick={() => {
            void platform
              .confirm(`Are you sure you want to revert ${file.path}?`)
              .then((ok) => {
                if (!ok) {
                  return;
                }
                runOperation(new RevertOperation([file.path]));
              });
          }}
        >
          <Icon icon="discard" />
        </VSCodeButton>
      </Tooltip>
    );
  }

  if (file.status === "A") {
    actions.push(
      <Tooltip
        title={"Stop tracking this file, without removing from the filesystem"}
        key="forget"
        delayMs={1000}
      >
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() => {
            runOperation(new ForgetOperation(file.path));
          }}
        >
          <Icon icon="circle-slash" />
        </VSCodeButton>
      </Tooltip>
    );
  } else if (file.status === "?") {
    actions.push(
      <Tooltip title={"Start tracking this file"} key="add" delayMs={1000}>
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() => runOperation(new AddOperation(file.path))}
        >
          <Icon icon="add" />
        </VSCodeButton>
      </Tooltip>,
      <Tooltip
        title={"Remove this file from the filesystem"}
        key="remove"
        delayMs={1000}
      >
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={async () => {
            const ok = await platform.confirm(
              `Are you sure you want to delete ${file.path}?`
            );
            if (!ok) {
              return;
            }
            // There's no `gt` command that will delete an untracked file, we need to do it manually.
            serverAPI.postMessage({
              type: "deleteFile",
              filePath: file.path,
            });
          }}
        >
          <Icon icon="trash" />
        </VSCodeButton>
      </Tooltip>
    );
  } else if (file.status === "Resolved") {
    actions.push(
      <Tooltip title={"Mark as unresolved"} key="unresolve-mark">
        <VSCodeButton
          key={file.path}
          appearance="icon"
          onClick={() =>
            runOperation(new ResolveOperation(file.path, ResolveTool.unmark))
          }
        >
          <Icon icon="circle-slash" />
        </VSCodeButton>
      </Tooltip>
    );
  } else if (file.status === "U") {
    actions.push(
      <Tooltip title={"Mark as resolved"} key="resolve-mark">
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() =>
            runOperation(new ResolveOperation(file.path, ResolveTool.mark))
          }
        >
          <Icon icon="check" />
        </VSCodeButton>
      </Tooltip>,
      <Tooltip title={"Take local version"} key="resolve-local">
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() =>
            runOperation(new ResolveOperation(file.path, ResolveTool.local))
          }
        >
          <Icon icon="fold-up" />
        </VSCodeButton>
      </Tooltip>,
      <Tooltip title={"Take incoming version"} key="resolve-other">
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() =>
            runOperation(new ResolveOperation(file.path, ResolveTool.other))
          }
        >
          <Icon icon="fold-down" />
        </VSCodeButton>
      </Tooltip>,
      <Tooltip title={"Combine both incoming and local"} key="resolve-both">
        <VSCodeButton
          className="file-show-on-hover"
          key={file.path}
          appearance="icon"
          onClick={() =>
            runOperation(new ResolveOperation(file.path, ResolveTool.both))
          }
        >
          <Icon icon="fold" />
        </VSCodeButton>
      </Tooltip>
    );
  }
  return (
    <div className="file-actions" data-testid="file-actions">
      {actions}
    </div>
  );
});

/**
 * The subset of uncommitted changes which have been unchecked in the list.
 * Deselected files won't be committed or amended.
 */
export const deselectedUncommittedChanges = observable.set<RepoRelativePath>(
  [],
  {
    deep: true,
  }
);

function useDeselectedFiles(
  files: Array<ChangedFile>
): ObservableSet<RepoRelativePath> {
  const deselectedFiles = deselectedUncommittedChanges;
  useEffect(() => {
    runInAction(() => {
      const allPaths = new Set(files.map((file) => file.path));
      for (const deselected of deselectedFiles) {
        if (!allPaths.has(deselected)) {
          // invariant: deselectedFiles is a subset of uncommittedChangesWithPreviews
          deselectedFiles.delete(deselected);
        }
      }
    });
  }, [files, deselectedFiles]);
  return deselectedFiles;
}

/**
 * Map for changed files statuses into classNames (for color & styles) and icon names.
 */
const nameAndIconForFileStatus: Record<ChangedFileType, [string, string]> = {
  A: ["added", "diff-added"],
  M: ["modified", "diff-modified"],
  R: ["removed", "diff-removed"],
  "?": ["ignored", "question"],
  "!": ["ignored", "warning"],
  U: ["unresolved", "diff-ignored"],
  Resolved: ["resolved", "pass"],
};
