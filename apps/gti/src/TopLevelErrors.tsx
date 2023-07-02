import { ErrorNotice } from "./ErrorNotice";
import { allDiffSummaries } from "./codeReview/CodeReviewInfo";
import platform from "./platform";
import { reconnectingStatus, repositoryInfo } from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { observer } from "mobx-react-lite";
import { useThrottledEffect } from "@withgraphite/gti-shared/hooks";
import { tracker } from "./analytics";
import type { ReactNode } from "react";
import type { TrackErrorName } from "@withgraphite/gti-server/src/analytics/eventNames";
import type { RepoInfo } from "./types";
import type { MessageBusStatus } from "./MessageBus";

type TopLevelErrorInfo = {
  title: ReactNode;
  error: Error;
  buttons?: Array<ReactNode>;
  trackErrorName?: TrackErrorName;
};

function computeTopLevelError(
  repoInfo: RepoInfo | undefined,
  reconnectStatus: MessageBusStatus,
  diffFetchError: Error | undefined
): TopLevelErrorInfo | undefined {
  if (reconnectStatus.type === "reconnecting") {
    return {
      title: <>Connection to server was lost</>,
      error: new Error("Attempting to reconnect..."),
    };
  } else if (reconnectStatus.type === "error") {
    if (reconnectStatus.error === "Invalid token") {
      return {
        title: (
          <>
            Unable to connect to server. Try closing this window and accessing
            GTI with a fresh link.
          </>
        ),
        error: new Error(
          "Invalid connection token. " +
            "For security, you need to open a new GTI window when the server is restarted."
        ),
      };
    }
    return {
      title: <>Error connecting to server</>,
      error: new Error(reconnectStatus.error),
      // no use tracking, since we can't reach the server anyway.
    };
  } else if (diffFetchError) {
    if (
      repoInfo?.type === "success" &&
      repoInfo.codeReviewSystem.type === "github"
    ) {
      const learnAboutGhButton = (
        <VSCodeButton
          appearance="secondary"
          onClick={(e) => {
            platform.openExternalLink("https://graphite.dev/docs/graphite-cli");
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <>Learn more</>
        </VSCodeButton>
      );
      if (diffFetchError.message.startsWith("NotAuthenticatedError")) {
        const error = new Error(
          "Log in to gh CLI with `gh auth login` to allow requests to GitHub"
        );
        error.stack = diffFetchError.stack;
        return {
          title: <>Not Authenticated to GitHub with `gh` CLI</>,
          error,
          buttons: [learnAboutGhButton],
          trackErrorName: "GhCliNotAuthenticated",
        };
      } else if (diffFetchError.message.startsWith("GhNotInstalledError")) {
        const error = new Error(
          "Install the `gh` CLI to make requests to GitHub"
        );
        error.stack = diffFetchError.stack;
        return {
          title: <>Unable to fetch data from Github</>,
          error,
          buttons: [learnAboutGhButton],
          trackErrorName: "GhCliNotInstalled",
        };
      }
    }
    return {
      title: <>Failed to fetch Diffs</>,
      error: diffFetchError,
      trackErrorName: "DiffFetchFailed",
    };
  }

  return undefined;
}

export const TopLevelErrors = observer(() => {
  const reconnectStatus = reconnectingStatus.get();
  const repoInfo = repositoryInfo.get();
  const diffFetchError = allDiffSummaries.get().error;

  const info = computeTopLevelError(repoInfo, reconnectStatus, diffFetchError);

  if (info == null) {
    return null;
  }

  return <TrackedError info={info} />;
});

const TrackedError = observer(({ info }: { info: TopLevelErrorInfo }) => {
  useThrottledEffect(
    () => {
      if (info.trackErrorName != null) {
        tracker.error("TopLevelErrorShown", info.trackErrorName, info.error);
      }
    },
    1_000,
    [info.trackErrorName, info.error]
  );
  return (
    <ErrorNotice title={info.title} error={info.error} buttons={info.buttons} />
  );
});
