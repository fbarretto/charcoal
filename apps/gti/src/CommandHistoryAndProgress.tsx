import type { Operation } from "./operations/Operation";
import type { ValidatedRepoInfo } from "./types";

import { Delayed } from "./Delayed";
import { Tooltip } from "./Tooltip";
import {
  operationList,
  queuedOperations,
  repositoryInfo,
  useAbortRunningOperation,
} from "./serverAPIState";
import { CommandRunner } from "./types";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import "./CommandHistoryAndProgress.scss";
import { observer } from "mobx-react-lite";

function displayOperationArgs(info: ValidatedRepoInfo, operation: Operation) {
  const commandName =
    operation.runner === CommandRunner.Graphite
      ? /[^\\/]+$/.exec(info.command)?.[0] ?? "gt"
      : // TODO: we currently don't know the command name when it's not graphite
        "";
  return (
    commandName +
    " " +
    operation
      .getArgs()
      .map((arg) => {
        if (typeof arg === "object") {
          switch (arg.type) {
            case "repo-relative-file":
              return arg.path;
            case "succeedable-revset":
              return arg.revset;
          }
        }
        return arg;
      })
      .join(" ")
  );
}

export const CommandHistoryAndProgress = observer(() => {
  const list = operationList.get();
  const queued = queuedOperations.get();
  const abortRunningOperation = useAbortRunningOperation();

  const info = repositoryInfo.get();
  if (info?.type !== "success") {
    return null;
  }

  const progress = list.currentOperation;
  if (progress == null) {
    return null;
  }

  const commandForDisplay = displayOperationArgs(info, progress.operation);
  const command = (
    <code className="progress-container-command">{commandForDisplay}</code>
  );

  let label;
  let icon;
  let abort = null;
  let showLastLineOfOutput = false;
  if (progress.exitCode == null) {
    label = <>Running {command}</>;
    icon = <Icon icon="loading" />;
    showLastLineOfOutput = true;
    // Only show "Abort" for slow commands, since "Abort" might leave modified
    // files or pending commits around.
    const slowThreshold = 10000;
    const hideUntil = new Date(
      (progress.startTime?.getTime() || 0) + slowThreshold
    );
    abort = (
      <Delayed hideUntil={hideUntil}>
        <VSCodeButton
          appearance="secondary"
          data-testid="abort-button"
          disabled={progress.aborting}
          onClick={() => {
            abortRunningOperation(progress.operation.id);
          }}
        >
          <Icon
            slot="start"
            icon={progress.aborting ? "loading" : "stop-circle"}
          />
          <>Abort</>
        </VSCodeButton>
      </Delayed>
    );
  } else if (progress.exitCode === 0) {
    label = <span>{command}</span>;
    icon = <Icon icon="pass" aria-label={"Command exited successfully"} />;
  } else if (progress.aborting) {
    // Exited (tested above) by abort.
    label = <>Aborted {command}</>;
    icon = <Icon icon="stop-circle" aria-label={"Command aborted"} />;
  } else {
    label = <span>{command}</span>;
    icon = <Icon icon="error" aria-label={"Command exited unsuccessfully"} />;
    showLastLineOfOutput = true;
  }

  return (
    <div className="progress-container" data-testid="progress-container">
      <Tooltip
        component={() => (
          <div className="progress-command-tooltip">
            <div className="progress-command-tooltip-command">
              <strong>Command: </strong>
              {commandForDisplay}
            </div>
            <br />
            <b>Command output:</b>
            <br />
            <pre>{progress.commandOutput?.join("") || "No output"}</pre>
          </div>
        )}
      >
        {queued.length > 0 ? (
          <div
            className="queued-operations-container"
            data-testid="queued-commands"
          >
            <strong>Next to run</strong>
            {queued.map((op) => (
              <div key={op.id} id={op.id} className="queued-operation">
                <code>{displayOperationArgs(info, op)}</code>
              </div>
            ))}
          </div>
        ) : null}

        <div className="progress-container-row">
          {icon}
          {label}
        </div>
        {showLastLineOfOutput ? (
          <div className="progress-container-row">
            <div>
              {progress.commandOutput?.slice(-1).map((line, i) => (
                <code key={i}>{line}</code>
              ))}
            </div>
          </div>
        ) : null}
        {abort}
      </Tooltip>
    </div>
  );
});
