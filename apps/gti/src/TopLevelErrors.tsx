import { ErrorNotice } from "./ErrorNotice";
import { allDiffSummaries } from "./codeReview/CodeReviewInfo";
import platform from "./platform";
import { reconnectingStatus, repositoryInfo } from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { observer } from "mobx-react-lite";

export const TopLevelErrors = observer(() => {
  const reconnectStatus = reconnectingStatus.get();
  const repoInfo = repositoryInfo.get();

  const diffFetchError = allDiffSummaries.get().error;

  if (reconnectStatus.type === "reconnecting") {
    return (
      <ErrorNotice
        title={<>Connection to server was lost</>}
        error={new Error("Attempting to reconnect...")}
      />
    );
  } else if (reconnectStatus.type === "error") {
    if (reconnectStatus.error === "Invalid token") {
      return (
        <ErrorNotice
          title={
            <>
              Unable to connect to server. Try closing this window and accessing
              GTI with a fresh link.
            </>
          }
          error={
            new Error(
              "Invalid connection token. For security, you need to open a new GTI window when the server is restarted."
            )
          }
        />
      );
    }
    return (
      <ErrorNotice
        title={<>Error connecting to server</>}
        error={new Error(reconnectStatus.error)}
      />
    );
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
        const err = new Error(
          "Log in to gh CLI with `gh auth login` to allow requests to GitHub"
        );
        err.stack = diffFetchError.stack;
        return (
          <ErrorNotice
            title={<>Not Authenticated to GitHub with `gh` CLI</>}
            error={err}
            buttons={[learnAboutGhButton]}
          />
        );
      } else if (diffFetchError.message.startsWith("GhNotInstalledError")) {
        const err = new Error(
          "Install the `gh` CLI to make requests to GitHub"
        );
        err.stack = diffFetchError.stack;
        return (
          <ErrorNotice
            title={<>Unable to fetch data from Github</>}
            error={err}
            buttons={[learnAboutGhButton]}
          />
        );
      }
    }
    return (
      <ErrorNotice title={<>Failed to fetch Diffs</>} error={diffFetchError} />
    );
  }
  return null;
});
