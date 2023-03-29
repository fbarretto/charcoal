import type { RepositoryError } from "./types";
import type { AllDrawersState } from "@withgraphite/gti-shared/Drawers";

import serverAPI from "./ClientToServerAPI";
import { CommandHistoryAndProgress } from "./CommandHistoryAndProgress";
import { CommitInfoSidebar } from "./CommitInfo";
import { CommitTreeList } from "./CommitTreeList";
import { ComparisonViewModal } from "./ComparisonView/ComparisonViewModal";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary, ErrorNotice } from "./ErrorNotice";
import { GTICommandContext, useCommand } from "./GTIShortcuts";
import { DOCUMENTATION_DELAY, Tooltip } from "./Tooltip";
import { TopBar } from "./TopBar";
import { TopLevelErrors } from "./TopLevelErrors";
import platform from "./platform";
import {
  commitsShownRange,
  isFetchingAdditionalCommits,
  repositoryInfo,
} from "./serverAPIState";
import { ThemeRoot } from "./theme";
import { ModalContainer } from "./useModal";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import React from "react";
import { ContextMenus } from "@withgraphite/gti-shared/ContextMenu";
import { Drawers } from "@withgraphite/gti-shared/Drawers";
import { Icon } from "@withgraphite/gti-shared/Icon";

import "./index.scss";
import { action, observable } from "mobx";
import { observer } from "mobx-react-lite";

export default function App() {
  return (
    <React.StrictMode>
      <ThemeRoot>
        <GTICommandContext>
          <ErrorBoundary>
            <GTIDrawers />
            <div
              className="tooltip-root-container"
              data-testid="tooltip-root-container"
            />
            <ComparisonViewModal />
            <ModalContainer />
            <ContextMenus />
          </ErrorBoundary>
        </GTICommandContext>
      </ThemeRoot>
    </React.StrictMode>
  );
}

const FetchingAdditionalCommitsIndicator = observer(() => {
  const isFetching = isFetchingAdditionalCommits.get();
  return isFetching ? <Icon icon="loading" /> : null;
});

const FetchingAdditionalCommitsButton = observer(() => {
  const shownRange = commitsShownRange.get();
  const isFetching = isFetchingAdditionalCommits.get();
  if (shownRange === undefined) {
    return null;
  }
  const commitsShownMessage = `Showing comits from the last ${shownRange.toString()} days`;
  return (
    <Tooltip
      placement="bottom"
      delayMs={DOCUMENTATION_DELAY}
      title={commitsShownMessage}
    >
      <VSCodeButton
        key="load-more-commit-button"
        disabled={isFetching}
        onClick={() => {
          serverAPI.postMessage({
            type: "loadMoreCommits",
          });
        }}
        appearance="icon"
      >
        <Icon icon="unfold" slot="start" />
        <>Load more commits</>
      </VSCodeButton>
    </Tooltip>
  );
});

export const gtiDrawerState = observable.box<AllDrawersState>(
  {
    right: { size: 500, collapsed: false },
    left: { size: 200, collapsed: true },
    top: { size: 200, collapsed: true },
    bottom: { size: 200, collapsed: true },
  },
  { deep: false }
);
const GTIDrawers = observer(() => {
  useCommand(
    "ToggleSidebar",
    action(() => {
      const state = gtiDrawerState.get();
      gtiDrawerState.set({
        ...state,
        right: { ...state.right, collapsed: !state.right.collapsed },
      });
    })
  );

  return (
    <Drawers
      drawerState={gtiDrawerState}
      rightLabel={
        <>
          <Icon icon="edit" />
          <>Commit Info</>
        </>
      }
      right={<CommitInfoSidebar />}
      errorBoundary={ErrorBoundary}
    >
      <MainContent />
      <CommandHistoryAndProgress />
    </Drawers>
  );
});

const MainContent = observer(() => {
  const repoInfo = repositoryInfo.get();

  return (
    <div className="main-content-area">
      <TopBar />
      <TopLevelErrors />
      {repoInfo != null && repoInfo.type !== "success" ? (
        <GTINullState repoError={repoInfo} />
      ) : (
        <>
          <CommitTreeList />
          <span className="load-more">
            <FetchingAdditionalCommitsButton />
            <FetchingAdditionalCommitsIndicator />
          </span>
        </>
      )}
    </div>
  );
});

function GTINullState({ repoError }: { repoError: RepositoryError }) {
  let content;
  if (repoError != null) {
    if (repoError.type === "cwdNotARepository") {
      content = (
        <EmptyState>
          <div>
            <>Not a valid repository</>
          </div>
          <p>
            <code>{repoError.cwd}</code> is not a valid Graphite repository.
            Clone or init a repository to use GTI.
          </p>
        </EmptyState>
      );
    } else if (repoError.type === "invalidCommand") {
      content = (
        <ErrorNotice
          title={
            <>Invalid Graphite command. Is Graphite installed correctly?</>
          }
          error={new Error(`Command "${repoError.command}" was not found.`)}
          buttons={[
            <VSCodeButton
              key="help-button"
              appearance="secondary"
              onClick={(e) => {
                platform.openExternalLink(
                  "https://graphite.dev/docs/installing-the-cli"
                );
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <>See installation docs</>
            </VSCodeButton>,
          ]}
        />
      );
    } else {
      content = (
        <ErrorNotice
          title={<>Something went wrong</>}
          error={repoError.error}
        />
      );
    }
  }

  return <div className="empty-app-state">{content}</div>;
}
