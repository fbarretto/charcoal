import type { CodeReviewProvider } from "../CodeReviewProvider";
import type { Logger } from "../logger";
import type {
  CodeReviewSystem,
  DiffSignalSummary,
  Disposable,
  Result,
} from "@withgraphite/gti/src/types";

import { TypedEventEmitter } from "@withgraphite/gti-shared/TypedEventEmitter";
import type { PRNumber } from "@withgraphite/gti-cli-shared-types";

export type GitHubDiffSummary = {
  type: "github";
  title: string;
  state: "Open" | "Merged" | "Closed";
  number: PRNumber;
  url: string;
  commentCount: number;
  anyUnresolvedComments: false;
  signalSummary?: DiffSignalSummary;
};

type GitHubCodeReviewSystem = CodeReviewSystem & { type: "github" };
export class GitHubCodeReviewProvider implements CodeReviewProvider {
  constructor(
    private codeReviewSystem: GitHubCodeReviewSystem,
    private logger: Logger
  ) {}
  private diffSummaries = new TypedEventEmitter<
    "data",
    Map<PRNumber, GitHubDiffSummary>
  >();

  onChangeDiffSummaries(
    callback: (result: Result<Map<PRNumber, GitHubDiffSummary>>) => unknown
  ): Disposable {
    const handleData = (data: Map<PRNumber, GitHubDiffSummary>) =>
      callback({ value: data });
    const handleError = (error: Error) => callback({ error });
    this.diffSummaries.on("data", handleData);
    this.diffSummaries.on("error", handleError);
    return {
      dispose: () => {
        this.diffSummaries.off("data", handleData);
        this.diffSummaries.off("error", handleError);
      },
    };
  }

  public triggerDiffSummariesFetch() {
    // no-op?
  }

  public dispose() {
    this.diffSummaries.removeAllListeners();
  }

  public getSummaryName(): string {
    return `github:${this.codeReviewSystem.hostname}/${this.codeReviewSystem.owner}/${this.codeReviewSystem.repo}`;
  }
}

// function githubCheckSuitesToCIStatus(
//   checkSuites: CheckSuiteConnection | undefined | null,
// ): DiffSignalSummary {
//   let anyInProgress = false;
//   let anyWarning = false;
//   for (const checkSuite of checkSuites?.nodes ?? []) {
//     switch (checkSuite?.status) {
//       case CheckStatusState.Completed:
//         {
//           switch (checkSuite?.conclusion) {
//             case CheckConclusionState.Success:
//               break;
//             case CheckConclusionState.Neutral:
//             case CheckConclusionState.Stale:
//             case CheckConclusionState.Skipped:
//               anyWarning = true;
//               break;
//             case CheckConclusionState.ActionRequired:
//             case CheckConclusionState.StartupFailure:
//             case CheckConclusionState.Cancelled:
//             case CheckConclusionState.TimedOut:
//             case CheckConclusionState.Failure:
//               return 'failed'; // no need to look at other signals
//           }
//         }
//         break;
//       case CheckStatusState.Waiting:
//       case CheckStatusState.Requested:
//       case CheckStatusState.Queued:
//       case CheckStatusState.Pending:
//       case CheckStatusState.InProgress:
//         anyInProgress = true;
//         break;
//     }
//   }
//   return anyWarning ? 'warning' : anyInProgress ? 'running' : 'pass';
// }
