/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PathTree } from "./pathTree";
import type {
  ChangedFile,
  ChangedFileType,
  RepoRelativePath,
} from "@withgraphite/gti-cli-shared-types";
import type { MergeConflicts } from "@withgraphite/gti-shared";
import type { MutableRefObject } from "react";
import type { Comparison } from "@withgraphite/gti-shared";
import type { EnsureAssignedTogether } from "@withgraphite/gti-shared";

import {
  ChangedFileDisplayTypePicker,
  type ChangedFilesDisplayType,
  changedFilesDisplayType,
} from "./ChangedFileDisplayTypePicker";
import serverAPI from "./ClientToServerAPI";
import {
  commitFieldsBeingEdited,
  commitMode,
  editedCommitMessages,
} from "./CommitInfoView/CommitInfoState";
import {
  allFieldsBeingEdited,
  commitMessageFieldsSchema,
} from "./CommitInfoView/CommitMessageFields";
import { OpenComparisonViewButton } from "./ComparisonView/OpenComparisonViewButton";
import { ErrorNotice } from "./ErrorNotice";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { gtiDrawerState } from "./drawerState";
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
import { buildPathTree } from "./pathTree";
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
import { useEffect, useRef, useState, useCallback } from "react";
import { ComparisonType } from "@withgraphite/gti-shared";
import { Icon } from "./Icon";
import { useDeepMemo } from "./hooks";
import { minimalDisambiguousPaths } from "@withgraphite/gti-shared";
import { notEmpty } from "@withgraphite/gti-shared";
import { observable, ObservableSet, runInAction } from "mobx";
import { observer } from "mobx-react-lite";

import "./UncommittedChanges.scss";

type UIChangedFile = {
  path: RepoRelativePath;
  // disambiguated path, or rename with arrow
  label: string;
  status: ChangedFileType;
  visualStatus: VisualChangedFileType;
  copiedFrom?: RepoRelativePath;
  renamedFrom?: RepoRelativePath;
  tooltip: string;
};

function processCopiesAndRenames(
  files: Array<ChangedFile>
): Array<UIChangedFile> {
  const disambiguousPaths = minimalDisambiguousPaths(
    files.map((file) => file.path)
  );
  const copySources = new Set(files.map((file) => file.copy).filter(notEmpty));
  const removedFiles = new Set(
    files
      .filter((file) => file.status === "TRACKED_REMOVE")
      .map((file) => file.path)
  );

  return (
    files
      .map((file, i) => {
        const minimalName = disambiguousPaths[i];
        let fileLabel = minimalName;
        let tooltip = file.path;
        let copiedFrom;
        let renamedFrom;
        let visualStatus: VisualChangedFileType = file.status;
        if (file.copy != null) {
          // Disambiguate between original file and the newly copy's name,
          // instead of disambiguating among all file names.
          const [originalName, copiedName] = minimalDisambiguousPaths([
            file.copy,
            file.path,
          ]);
          fileLabel = `${originalName} → ${copiedName}`;
          if (removedFiles.has(file.copy)) {
            renamedFrom = file.copy;
            tooltip = `${file.path}\n\nThis file was renamed from ${file.copy}`;
            visualStatus = "RENAMED";
          } else {
            copiedFrom = file.copy;
            tooltip = `${file.path}\n\nThis file was copied from ${file.copy}`;
            visualStatus = "COPIED";
          }
        }

        return {
          path: file.path,
          label: fileLabel,
          status: file.status,
          visualStatus,
          copiedFrom,
          renamedFrom,
          tooltip,
        };
      })
      // Hide files that were renamed. This comes after the map since we need to use the index to refer to minimalDisambiguousPaths
      .filter(
        (file) =>
          !(file.status === "TRACKED_REMOVE" && copySources.has(file.path))
      )
      .sort((a, b) =>
        a.visualStatus === b.visualStatus
          ? a.path.localeCompare(b.path)
          : sortKeyForStatus[a.visualStatus] - sortKeyForStatus[b.visualStatus]
      )
  );
}

type VisualChangedFileType = ChangedFileType | "RENAMED" | "COPIED";

const sortKeyForStatus: Record<VisualChangedFileType, number> = {
  MODIFIED: 0,
  RENAMED: 1,
  TRACKED_ADD: 2,
  COPIED: 3,
  TRACKED_REMOVE: 4,
  UNTRACKED_REMOVE: 5,
  UNTRACKED_ADD: 6,
  UNRESOLVED: 7,
  RESOLVED: 8,
};

export function ChangedFiles(
  props: {
    files: Array<ChangedFile>;
    comparison: Comparison;
  } & EnsureAssignedTogether<{
    deselectedFiles?: Set<string>;
    setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
  }>
) {
  const displayType = changedFilesDisplayType.get();
  const { files, ...rest } = props;
  const processedFiles = useDeepMemo(
    () => processCopiesAndRenames(files),
    [files]
  );
  return (
    <div className="changed-files">
      {displayType === "tree" ? (
        <FileTree {...rest} files={processedFiles} displayType={displayType} />
      ) : (
        <LinearFileList
          {...rest}
          files={processedFiles}
          displayType={displayType}
        />
      )}
    </div>
  );
}

function LinearFileList(props: {
  files: Array<UIChangedFile>;
  displayType: ChangedFilesDisplayType;
  comparison: Comparison;
  deselectedFiles?: Set<string>;
  setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
}) {
  const { files, ...rest } = props;

  return (
    <>
      {files.map((file) => (
        <File key={file.path} {...rest} file={file} />
      ))}
    </>
  );
}

function FileTree(props: {
  files: Array<UIChangedFile>;
  displayType: ChangedFilesDisplayType;
  comparison: Comparison;
  deselectedFiles?: Set<string>;
  setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
}) {
  const { files, ...rest } = props;

  const tree = useDeepMemo(
    () =>
      buildPathTree(Object.fromEntries(files.map((file) => [file.path, file]))),
    [files]
  );

  const [collapsed, setCollapsed] = useState(new Set());

  function renderTree(tree: PathTree<UIChangedFile>, accumulatedPath = "") {
    return (
      <>
        {[...tree.entries()].map(([folder, inner]) => {
          const folderKey = `${accumulatedPath}/${folder}`;
          const isCollapsed = collapsed.has(folderKey);
          return (
            <div className="file-tree-level" key={folderKey}>
              {inner instanceof Map ? (
                <>
                  <span className="file-tree-folder-path">
                    <VSCodeButton
                      appearance="icon"
                      onClick={() => {
                        setCollapsed((last) =>
                          isCollapsed
                            ? new Set([...last].filter((v) => v !== folderKey))
                            : new Set([...last, folderKey])
                        );
                      }}
                    >
                      <Icon
                        icon={isCollapsed ? "chevron-right" : "chevron-down"}
                        slot="start"
                      />
                      {folder}
                    </VSCodeButton>
                  </span>
                  {isCollapsed ? null : renderTree(inner, folderKey)}
                </>
              ) : (
                <File key={inner.path} {...rest} file={inner} />
              )}
            </div>
          );
        })}
      </>
    );
  }

  return renderTree(tree);
}

function File({
  file,
  displayType,
  comparison,
  deselectedFiles,
  setDeselectedFiles,
}: {
  file: UIChangedFile;
  displayType: ChangedFilesDisplayType;
  comparison: Comparison;
  deselectedFiles?: Set<string>;
  setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
}) {
  // Renamed files are files which have a copy field, where that path was also removed.
  // Visually show renamed files as if they were modified, even though sl treats them as added.
  const [statusName, icon] = nameAndIconForFileStatus[file.visualStatus];

  return (
    <div
      className={`changed-file file-${statusName}`}
      data-testid={`changed-file-${file.path}`}
      key={file.path}
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === "Enter") {
          platform.openFile(file.path);
        }
      }}
    >
      <FileSelectionCheckbox
        file={file}
        deselectedFiles={deselectedFiles}
        setDeselectedFiles={setDeselectedFiles}
      />
      <span
        className="changed-file-path"
        onClick={() => {
          platform.openFile(file.path);
        }}
      >
        <Icon icon={icon} />
        <Tooltip title={file.tooltip} delayMs={2_000} placement="right">
          <span className="changed-file-path-text">
            {displayType === "fish"
              ? file.path
                  .split("/")
                  .map((a, i, arr) => (i === arr.length - 1 ? a : a[0]))
                  .join("/")
              : displayType === "fullPaths"
              ? file.path
              : displayType === "tree"
              ? file.path.slice(file.path.lastIndexOf("/") + 1)
              : file.label}
          </span>
        </Tooltip>
      </span>
      <FileActions file={file} comparison={comparison} />
    </div>
  );
}

function FileSelectionCheckbox({
  file,
  deselectedFiles,
  setDeselectedFiles,
}: {
  file: UIChangedFile;
  deselectedFiles?: Set<string>;
  setDeselectedFiles?: (newDeselected: Set<string>) => unknown;
}) {
  return deselectedFiles == null ? null : (
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
            if (file.renamedFrom != null) {
              newDeselected.delete(file.renamedFrom); // checkbox applies to original part of renamed files too
            }
            setDeselectedFiles?.(newDeselected);
          }
        } else {
          if (!newDeselected.has(file.path)) {
            newDeselected.add(file.path);
            if (file.renamedFrom != null) {
              newDeselected.add(file.renamedFrom); // checkbox applies to original part of renamed files too
            }
            setDeselectedFiles?.(newDeselected);
          }
        }
      }}
    />
  );
}

export const UncommittedChanges = observer(function ({
  place,
}: {
  place: "main" | "amend sidebar" | "commit sidebar";
}) {
  const uncommittedChanges = uncommittedChangesWithPreviews.get();
  const error = uncommittedChangesFetchError.get();
  // TODO: use treeWithPreviews instead, and update CommitOperation
  const headCommit = latestHeadCommit.get();
  const schema = commitMessageFieldsSchema.get();

  const conflicts = optimisticMergeConflicts.get();

  const deselectedFiles = useDeselectedFiles(uncommittedChanges);
  const commitTitleRef = useRef<HTMLTextAreaElement | undefined>(null);

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
          ...allFieldsBeingEdited(schema),
          // we have to explicitly keep this change to fieldsBeingEdited because otherwise it would be reset by effects.
          forceWhileOnHead: true,
        });
      }

      const quickCommitTyped = commitTitleRef.current?.value;
      if (
        which === "commit" &&
        quickCommitTyped != null &&
        quickCommitTyped != ""
      ) {
        const value = editedCommitMessages("head").get();
        editedCommitMessages("head").set({
          ...value,
          fields: { ...value.fields, Title: quickCommitTyped },
        });
        // delete what was written in the quick commit form
        commitTitleRef.current != null && (commitTitleRef.current.value = "");
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
    conflicts?.files?.every((conflict) => conflict.status === "RESOLVED") ??
    false;

  // only show addremove button if some files are untracked/missing
  const UNTRACKED_OR_MISSING = ["UNTRACKED_ADD", "UNTRACKED_REMOVE"];
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
            <ChangedFileDisplayTypePicker />
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
                deselectedUncommittedChanges.clear();
              }}
            >
              <Icon slot="start" icon="check-all" />
              <>Select All</>
            </VSCodeButton>
            <VSCodeButton
              appearance="icon"
              key="deselect-all"
              data-testid="deselect-all-button"
              disabled={noFilesSelected}
              onClick={() => {
                deselectedUncommittedChanges.replace(
                  uncommittedChanges.map((file) => file.path)
                );
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
              } selected uncommitted change${
                uncommittedChanges.length - deselectedFiles.size === 1
                  ? ""
                  : "s"
              }, including untracked files.\n\nNote: Changes will be irreversably lost.`}
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
                        for (const selectedFile of selectedFiles) {
                          runOperation(new RevertOperation(selectedFile));
                        }
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
      {conflicts != null ? (
        <ChangedFiles
          files={conflicts.files ?? []}
          comparison={{
            type: ComparisonType.UncommittedChanges,
          }}
        />
      ) : (
        <ChangedFiles
          files={uncommittedChanges}
          deselectedFiles={deselectedFiles}
          comparison={{
            type: ComparisonType.UncommittedChanges,
          }}
        />
      )}
      {conflicts != null || place !== "main" ? null : (
        <div className="button-rows">
          <div className="button-row">
            <span className="quick-commit-inputs">
              <VSCodeButton
                appearance="icon"
                disabled={noFilesSelected}
                data-testid="quick-commit-button"
                onClick={() => {
                  const title =
                    (commitTitleRef.current as HTMLInputElement | null)
                      ?.value || "Temporary Commit";
                  runOperation(
                    new CommitOperation(
                      title, // just the title, no description / other fields
                      headCommit?.branch ?? ""
                    )
                  );
                }}
              >
                <Icon slot="start" icon="plus" />
                <>Commit</>
              </VSCodeButton>
              <VSCodeTextField
                data-testid="quick-commit-title"
                placeholder="Title"
                ref={commitTitleRef as MutableRefObject<null>}
              />
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
                <>Amend</>
              </VSCodeButton>
              <VSCodeButton
                appearance="icon"
                className="show-on-hover"
                onClick={() => {
                  openCommitForm("amend");
                }}
              >
                <Icon slot="start" icon="edit" />
                <>Amend as...</>
              </VSCodeButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function MergeConflictButtons({
  conflicts,
  allConflictsResolved,
}: {
  conflicts: MergeConflicts;
  allConflictsResolved: boolean;
}) {
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
  const isRunningContinue = !!useIsOperationRunningOrQueued(ContinueOperation);
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
        <>Continue</>
      </VSCodeButton>
      <VSCodeButton
        appearance="icon"
        key="abort"
        disabled={shouldDisableButtons}
        onClick={() => {
          runOperation(new AbortMergeOperation(conflicts));
        }}
      >
        <Icon slot="start" icon={isRunningAbort ? "loading" : "circle-slash"} />
        <>Abort</>
      </VSCodeButton>
    </>
  );
}

const revertableStatues = new Set([
  "MODIFIED",
  "TRACKED_REMOVE",
  "UNTRACKED_REMOVE",
]);
const conflictStatuses = new Set<ChangedFileType>(["UNRESOLVED", "RESOLVED"]);
function FileActions({
  comparison,
  file,
}: {
  comparison: Comparison;
  file: UIChangedFile;
}) {
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
            platform.openDiff?.(file.path, comparison);
          }}
        >
          <Icon icon="git-pull-request-go-to-changes" />
        </VSCodeButton>
      </Tooltip>
    );
  }

  if (
    revertableStatues.has(file.status) &&
    comparison.type === ComparisonType.UncommittedChanges
  ) {
    actions.push(
      <Tooltip title={"Revert back to last commit"} key="revert" delayMs={1000}>
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
                runOperation(new RevertOperation(file.path));
              });
          }}
        >
          <Icon icon="discard" />
        </VSCodeButton>
      </Tooltip>
    );
  }

  if (comparison.type === ComparisonType.UncommittedChanges) {
    if (file.status === "TRACKED_ADD") {
      actions.push(
        <Tooltip
          title={
            "Stop tracking this file, without removing from the filesystem"
          }
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
    } else if (file.status === "UNTRACKED_ADD") {
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
              // There's no `sl` command that will delete an untracked file, we need to do it manually.
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
    } else if (file.status === "RESOLVED") {
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
    } else if (file.status === "UNRESOLVED") {
      actions.push(
        <Tooltip title={"Mark as resolved"} key="resolve-mark">
          <VSCodeButton
            className="file-show-on-hover"
            data-testid="file-action-resolve"
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
  }
  return (
    <div className="file-actions" data-testid="file-actions">
      {actions}
    </div>
  );
}

/**
 * The subset of uncommitted changes which have been unchecked in the list.
 * Deselected files won't be committed or amended.
 */
export const deselectedUncommittedChanges = observable.set<RepoRelativePath>(
  []
);
serverAPI.onCwdChanged(() => deselectedUncommittedChanges.clear());

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
const nameAndIconForFileStatus: Record<
  VisualChangedFileType,
  [string, string]
> = {
  TRACKED_ADD: ["added", "diff-added"],
  MODIFIED: ["modified", "diff-modified"],
  TRACKED_REMOVE: ["removed", "diff-removed"],
  UNTRACKED_ADD: ["ignored", "question"],
  UNTRACKED_REMOVE: ["ignored", "warning"],
  UNRESOLVED: ["unresolved", "diff-ignored"],
  RESOLVED: ["resolved", "pass"],
  RENAMED: ["modified", "diff-renamed"],
  COPIED: ["added", "diff-added"],
};
