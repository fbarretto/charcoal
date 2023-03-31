import type { AllDrawersState } from "@withgraphite/gti-shared/Drawers";
import type { RepositoryError } from "./types";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { ContextMenus } from "@withgraphite/gti-shared/ContextMenu";
import { Drawers } from "@withgraphite/gti-shared/Drawers";
import { useThrottledEffect } from "@withgraphite/gti-shared/hooks";
import { Icon } from "@withgraphite/gti-shared/Icon";
import React from "react";
import { CommandHistoryAndProgress } from "./CommandHistoryAndProgress";
import { CommitInfoSidebar } from "./CommitInfo";
import { CommitTreeList } from "./CommitTreeList";
import { ComparisonViewModal } from "./ComparisonView/ComparisonViewModal";
import { EmptyState } from "./EmptyState";
import { ErrorBoundary, ErrorNotice } from "./ErrorNotice";
import { GTICommandContext, useCommand } from "./GTIShortcuts";
import platform from "./platform";
import { repositoryInfo } from "./serverAPIState";
import { ThemeRoot } from "./theme";
import { TopBar } from "./TopBar";
import { TopLevelErrors } from "./TopLevelErrors";
import { ModalContainer } from "./useModal";

import { action, observable } from "mobx";
import { observer } from "mobx-react-lite";
import { tracker } from "./analytics";
import "./index.scss";
import { getWindowWidthInPixels } from "./utils";

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

export const gtiDrawerState = observable.box<AllDrawersState>(
  {
    right: {
      size: 500,
      // Collapse by default on small screens.
      collapsed: getWindowWidthInPixels() <= 500,
    },
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
        <CommitTreeList />
      )}
    </div>
  );
});

const GTINullState = observer(
  ({ repoError }: { repoError: RepositoryError }) => {
    useThrottledEffect(
      () => {
        if (repoError != null) {
          switch (repoError.type) {
            case "cwdNotARepository":
              tracker.track("UIEmptyState", {
                extras: { cwd: repoError.cwd },
                errorName: "InvalidCwd",
              });
              break;
            case "invalidCommand":
              tracker.track("UIEmptyState", {
                extras: { command: repoError.command },
                errorName: "InvalidCommand",
              });
              break;
            case "unknownError":
              tracker.error("UIEmptyState", "RepositoryError", repoError.error);
              break;
          }
        }
      },
      1_000,
      [repoError]
    );
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
);
