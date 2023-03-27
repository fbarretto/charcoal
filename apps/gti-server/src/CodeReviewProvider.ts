import type {
  DiffId,
  DiffSummary,
  Disposable,
  Result,
  OperationCommandProgressReporter,
} from "@withgraphite/gti/src/types";

type DiffSummaries = Map<DiffId, DiffSummary>;
/**
 * API to fetch data from Remote Code Review system, like GitHub.
 */
export interface CodeReviewProvider {
  triggerDiffSummariesFetch(diffs: Array<DiffId>): unknown;

  onChangeDiffSummaries(
    callback: (result: Result<DiffSummaries>) => unknown
  ): Disposable;

  /** Run a command not handled within graphite, such as a separate submit handler */
  runExternalCommand?(
    cwd: string,
    args: Array<string>,
    onProgress: OperationCommandProgressReporter,
    signal: AbortSignal
  ): Promise<void>;

  dispose: () => void;

  /** Convert Code Review Provider info into a short summary string, usable in analytics */
  getSummaryName(): string;
}
