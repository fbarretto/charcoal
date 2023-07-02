

import type { TypeaheadKind, TypeaheadResult } from '@withgraphite/gti/src/CommitInfoView/types';
import type { PRNumber } from "@withgraphite/gti-cli-shared-types";
import type {
  DiffSummary,
  Disposable,
  Result,
  OperationCommandProgressReporter,
} from "@withgraphite/gti/src/types";

type DiffSummaries = Map<PRNumber, DiffSummary>;
/**
 * API to fetch data from Remote Code Review system, like GitHub.
 */
export interface CodeReviewProvider {
  triggerDiffSummariesFetch(diffs: Array<PRNumber>): unknown;

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

  typeahead?(kind: TypeaheadKind, query: string): Promise<Array<TypeaheadResult>>;
}
