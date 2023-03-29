import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { PullOperation } from "./operations/PullOperation";
import { relativeDate, RelativeDate } from "./relativeDate";
import {
  latestCommitTree,
  operationList,
  queuedOperations,
  useRunOperation,
} from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./PullButton.scss";
import { observer } from "mobx-react-lite";

export const PullButton = observer(() => {
  const list = operationList.get();
  const queued = queuedOperations.get();
  const runOperation = useRunOperation();
  // no need to use previews here, we only need the latest commits to find the last pull timestamp.
  const latestCommits = latestCommitTree.get();
  // assuming master is getting updated frequently, last pull time should equal the newest commit in the history.
  const lastSync = Math.max(
    ...latestCommits.map((commit) => new Date(commit.info.date).valueOf())
  );

  let title =
    "Pull trunk branch from remote." +
    "\n\n" +
    "Last synced with remote:" +
    " " +
    relativeDate(lastSync, {});
  let inProgress = false;

  if (
    list.currentOperation?.operation instanceof PullOperation &&
    list.currentOperation?.exitCode == null
  ) {
    inProgress = true;
    title += "\n\n" + "Pull is currently running.";
  } else if (queued.some((op) => op instanceof PullOperation)) {
    inProgress = true;
    title += "\n\n" + "Pull is already scheduled.";
  }

  return (
    <Tooltip placement="bottom" delayMs={DOCUMENTATION_DELAY} title={title}>
      <div className="pull-info">
        <VSCodeButton
          appearance="secondary"
          disabled={inProgress}
          onClick={() => {
            runOperation(new PullOperation());
          }}
        >
          <Icon slot="start" icon={inProgress ? "loading" : "cloud-download"} />
          <>Pull</>
        </VSCodeButton>
        <RelativeDate date={lastSync} useShortVariant />
      </div>
    </Tooltip>
  );
});
