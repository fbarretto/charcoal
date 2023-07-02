import type { Operation } from "./operations/Operation";
import type { ValidatedRepoInfo } from "./types";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { truncate } from "@withgraphite/gti-shared/utils";
import { observer } from "mobx-react-lite";
import "./CommandHistoryAndProgress.scss";
import { Delayed } from "./Delayed";
import {
  operationList,
  queuedOperations,
  repositoryInfo,
  useAbortRunningOperation,
} from "./serverAPIState";
import { Tooltip } from "./Tooltip";
import { CommandRunner } from "./types";
import { short } from "./utils";

function OperationDescription(props: {
  info: ValidatedRepoInfo;
  operation: Operation;
  className?: string;
  long?: boolean;
}): React.ReactElement {
  const { info, operation, className } = props;
  const desc = operation.getDescriptionForDisplay();

  if (desc?.description) {
    return <span className={className}>{desc.description}</span>;
  }

  const commandName =
    operation.runner === CommandRunner.Graphite
      ? /[^\\/]+$/.exec(info.command)?.[0] ?? "gt"
      : // TODO: we currently don't know the command name when it's not graphite
        "";
  return (
    <code className={className}>
      {commandName +
        " " +
        operation
          .getArgs()
          .map((arg) => {
            if (typeof arg === "object") {
              switch (arg.type) {
                case "repo-relative-file":
                  return arg.path;
                case "succeedable-revset":
                  return props.long
                    ? arg.revset
                    : // truncate full commit hashes to short representation visually
                    // revset could also be a remote bookmark, so only do this if it looks like a hash
                    /[a-z0-9]{40}/.test(arg.revset)
                    ? short(arg.revset)
                    : arg.revset;
              }
            }
            if (/\s/.test(arg)) {
              return `"${props.long ? arg : truncate(arg, 30)}"`;
            }
            return arg;
          })
          .join(" ")}
    </code>
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

  const desc = progress.operation.getDescriptionForDisplay();
  const command = (
    <OperationDescription
      info={info}
      operation={progress.operation}
      className="progress-container-command"
    />
  );

  let label;
  let icon;
  let abort = null;
  let showLastLineOfOutput = false;
  if (progress.exitCode == null) {
    label = desc?.description ? command : <>Running {command}</>;
    icon = <Icon icon="loading" />;
    showLastLineOfOutput = desc?.tooltip == null;
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
            {desc?.tooltip || (
              <>
                <div className="progress-command-tooltip-command">
                  <strong>Command: </strong>
                  <OperationDescription
                    info={info}
                    operation={progress.operation}
                    long
                  />
                </div>
                <br />
                <b>Command output:</b>
                <br />
                <pre>{progress.commandOutput?.join("") || "No output"}</pre>
              </>
            )}
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
                <OperationDescription info={info} operation={op} />
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
