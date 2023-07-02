import { BugButton } from "./BugButton";
import serverAPI from "./ClientToServerAPI";
import { CwdSelector } from "./CwdSelector";
import { PullButton } from "./PullButton";
import { SettingsGearButton } from "./SettingsTooltip";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { tracker } from "./analytics";
import {
  haveCommitsLoadedYet,
  haveRemotePath,
  isFetchingCommits,
  useClearAllOptimisticState,
} from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./TopBar.scss";
import { observer } from "mobx-react-lite";

export const TopBar = observer(() => {
  const loaded = haveCommitsLoadedYet.get();
  const canPush = haveRemotePath.get();
  if (!loaded) {
    return null;
  }
  return (
    <div className="top-bar">
      <span className="button-group">
        {canPush && <PullButton />}
        <CwdSelector />
        <FetchingDataIndicator />
      </span>
      <span className="button-group">
        <BugButton />
        <SettingsGearButton />
        <RefreshButton />
      </span>
    </div>
  );
});

const FetchingDataIndicator = observer(() => {
  const isFetching = isFetchingCommits.get();
  return isFetching ? <Icon icon="loading" /> : null;
});

function RefreshButton() {
  const clearOptimisticState = useClearAllOptimisticState();
  return (
    <Tooltip
      delayMs={DOCUMENTATION_DELAY}
      placement="bottom"
      title={"Re-fetch latest commits and uncommitted changes."}
    >
      <VSCodeButton
        appearance="secondary"
        onClick={() => {
          tracker.track("ClickedRefresh");
          clearOptimisticState();
          serverAPI.postMessage({ type: "refresh" });
        }}
        data-testid="refresh-button"
      >
        <Icon icon="refresh" />
      </VSCodeButton>
    </Tooltip>
  );
}
