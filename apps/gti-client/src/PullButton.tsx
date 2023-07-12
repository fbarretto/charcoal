import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { PullOperation } from "./operations/PullOperation";
import { relativeDate, RelativeDate } from "./relativeDate";
import {
  latestCommitTree,
  latestUncommittedChanges,
  useRunOperation,
} from "./serverAPIState";
import { Icon } from "./Icon";

import "./PullButton.scss";
import { observer } from "mobx-react-lite";
import { useMostRecentPendingOperation } from "./previews";
import type { Operation } from "./operations/Operation";
import { VSCodeButtonDropdown } from "./VSCodeButtonDropdown";
import { observableConfig } from "./config_observable";

const PULL_OPTIONS = [
  {
    id: "pull",
    label: <>Pull</>,
    getOperation: () =>
      new PullOperation({ restack: false, deleteBranches: false }),
    isRunning: (op: Operation) => op instanceof PullOperation,
    tooltip: "Fetch latest repository and branch information from remote.",
  },
  {
    id: "pr",
    label: <>Pull and restack</>,
    getOperation: () =>
      new PullOperation({ restack: true, deleteBranches: false }),
    isRunning: (op: Operation) => op instanceof PullOperation,
    tooltip: "Fetch latest repository and branch information from remote.",
  },
  {
    id: "pd",
    label: <>Pull and delete merged/closed branches</>,
    getOperation: () =>
      new PullOperation({ restack: false, deleteBranches: true }),
    isRunning: (op: Operation) => op instanceof PullOperation,
    tooltip: "Fetch latest repository and branch information from remote.",
  },
  {
    id: "prd",
    label: <>Pull, restack, and delete merged/closed branches</>,
    getOperation: () =>
      new PullOperation({ restack: true, deleteBranches: true }),
    isRunning: (op: Operation) => op instanceof PullOperation,
    tooltip: "Fetch latest repository and branch information from remote.",
  },
];
const pullButtonChoiceKey = observableConfig({
  config: "gti.pull-button-choice",
  default: PULL_OPTIONS[0].id,
});

export type PullButtonOption = {
  id: string;
  label: React.ReactNode;
  getOperation: () => Operation;
  isRunning: (op: Operation) => boolean;
  tooltip: string;
};

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

  const hasUncommittedChanges = latestUncommittedChanges.get().length > 0;

  const currentChoice =
    PULL_OPTIONS.find((option) => option.id === pullButtonChoiceKey.get()) ??
    PULL_OPTIONS[0];

  let tooltip =
    currentChoice.tooltip +
    "\n\n" +
    (lastSync == null
      ? ""
      : `Latest fetched commit is ${relativeDate(lastSync, {})} old`);

  const pendingOperation = useMostRecentPendingOperation();
  const isRunningPull =
    pendingOperation != null && currentChoice.isRunning(pendingOperation);
  if (isRunningPull) {
    tooltip += "\n\n" + "Pull is already running.";
  }

  return (
    <Tooltip placement="bottom" delayMs={DOCUMENTATION_DELAY} title={tooltip}>
      <div className="pull-info">
        <VSCodeButtonDropdown
          appearance="secondary"
          buttonDisabled={!!isRunningPull || hasUncommittedChanges}
          options={PULL_OPTIONS}
          onClick={() => runOperation(currentChoice.getOperation())}
          onChangeSelected={(choice) => pullButtonChoiceKey.set(choice.id)}
          selected={currentChoice}
          icon={<Icon slot="start" icon={isRunningPull ? "loading" : "repo"} />}
        />
        {lastSync && <RelativeDate date={lastSync} useShortVariant />}
      </div>
    </Tooltip>
  );
});
