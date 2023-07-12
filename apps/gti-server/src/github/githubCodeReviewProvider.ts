import type {
  CodeReviewSystem,
  Disposable,
  Result,
  GitHubDiffSummary,
  OperationCommandProgressReporter,
} from "@withgraphite/gti-shared";

import { TypedEventEmitter } from "@withgraphite/gti-shared";
import type { PRInfo, PRNumber } from "@withgraphite/gti-cli-shared-types";
import type { TypeaheadKind, TypeaheadResult } from "@withgraphite/gti-shared";
import type execa from "execa";

type GitHubCodeReviewSystem = CodeReviewSystem & { type: "github" };
export class GitHubCodeReviewProvider {
  constructor(
    private codeReviewSystem: GitHubCodeReviewSystem,
    private runCommand: (
      args: Array<string>,
      cwd?: string,
      options?: execa.Options
    ) => execa.ExecaChildProcess<string>
  ) {}
  private diffSummaries = new TypedEventEmitter<"data", GitHubDiffSummary[]>();

  onChangeDiffSummaries(
    callback: (result: Result<GitHubDiffSummary[]>) => unknown
  ): Disposable {
    const handleData = (data: GitHubDiffSummary[]) => callback({ value: data });
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

  public async triggerDiffSummariesFetch(_diffs: Array<PRNumber>) {
    const value = await this.runCommand(["internal-only", "prs"]);
    const prs = JSON.parse(value.stdout) as PRInfo[];
    this.diffSummaries.emit("data", prs);
  }

  public dispose() {
    this.diffSummaries.removeAllListeners();
  }

  public getSummaryName(): string {
    return `github:${this.codeReviewSystem.hostname}/${this.codeReviewSystem.owner}/${this.codeReviewSystem.repo}`;
  }

  /** Run a command not handled within graphite, such as a separate submit handler */
  public runExternalCommand(
    _cwd: string,
    _args: Array<string>,
    _onProgress: OperationCommandProgressReporter,
    _signal: AbortSignal
  ): Promise<void> {
    throw new Error(
      "GitHub code review provider does not support running external commands"
    );
  }

  public async typeahead(
    _kind: TypeaheadKind,
    _query: string
  ): Promise<Array<TypeaheadResult>> {
    return [];
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
