import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { PullOperation } from "./operations/PullOperation";
import { relativeDate, RelativeDate } from "./relativeDate";
import { latestCommitTree, useRunOperation } from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "./Icon";

import "./PullButton.scss";
import { observer } from "mobx-react-lite";
import { useIsOperationRunningOrQueued } from "./previews";

export const PullButton = observer(() => {
  const runOperation = useRunOperation();
  // no need to use previews here, we only need the latest commits to find the last pull timestamp.
  const latestCommits = latestCommitTree.get();
  // assuming master is getting updated frequently, last pull time should equal the newest commit in the history.
  const lastSync =
    latestCommits.length === 0
      ? null
      : Math.max(
          ...latestCommits.map((commit) => new Date(commit.info.date).valueOf())
        );

  let title =
    "Pull trunk branch from remote." +
    "\n\n" +
    (lastSync == null
      ? ""
      : `Latest fetched commit is ${relativeDate(lastSync, {})} old`);

  const isRunningPull = useIsOperationRunningOrQueued(PullOperation);
  if (isRunningPull === "queued") {
    title += "\n\n" + "Pull is currently running.";
  } else if (isRunningPull === "running") {
    title += "\n\n" + "Pull is already scheduled.";
  }

  return (
    <Tooltip placement="bottom" delayMs={DOCUMENTATION_DELAY} title={title}>
      <div className="pull-info">
        <VSCodeButton
          appearance="secondary"
          disabled={!!isRunningPull}
          onClick={() => {
            runOperation(new PullOperation());
          }}
        >
          <Icon
            slot="start"
            icon={isRunningPull ? "loading" : "cloud-download"}
          />
          <>Pull</>
        </VSCodeButton>
        {lastSync && <RelativeDate date={lastSync} useShortVariant />}
      </div>
    </Tooltip>
  );
});
