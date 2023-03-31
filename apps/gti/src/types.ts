import type { TrackDataWithEventName } from "@withgraphite/gti-server/src/analytics/types";
import type { GitHubDiffSummary } from "@withgraphite/gti-server/src/github/githubCodeReviewProvider";
import type { Comparison } from "@withgraphite/gti-shared/Comparison";
import type { AllUndefined, Json } from "@withgraphite/gti-shared/typeUtils";
import type {
  RepoRelativePath,
  ChangedFile,
  BranchInfo,
  PRNumber,
} from "@withgraphite/gti-cli-shared-types";

export type Result<T> =
  | { value: T; error?: undefined }
  | { value?: undefined; error: Error };

/** known supported "Platforms" in which GTI may be embedded */
export type PlatformName = "browser" | "vscode";

export type AbsolutePath = string;

/**
 * cwd may be a subdirectory of the repository root.
 * Some commands expect cwd-relative paths,
 * but we generally prefer {@link RepoRelativePaths} when possible. */
export type CwdRelativePath = string;

/** Revsets are an eden concept that let you specify commits.
 * This could be a Hash, '.' for HEAD, .^ for parent of head, etc. See `eden help revset` */
export type Revset = string;

/**
 * "Diff" means a unit of Code Review according to your remote repo provider
 * For GitHub, this is a "Pull Request"
 */

/**
 * Short info about a Diff fetched in bulk for all diffs to render an overview
 */
export type DiffSummary = GitHubDiffSummary;

/**
 * Summary of CI test results for a Diff.
 * 'pass' if ALL signals succeed and not still running.
 * 'failed' if ANY signal doesn't suceed, even if some are still running.
 */
export type DiffSignalSummary =
  | "running"
  | "pass"
  | "failed"
  | "warning"
  | "no-signal";

/**
 * Detailed info about a Diff fetched individually when looking at the details
 */
// TODO: export type DiffDetails = {};

/** An error causing the entire Repository to not be accessible */
export type RepositoryError =
  | {
      type: "invalidCommand";
      command: string;
    }
  | { type: "cwdNotARepository"; cwd: string }
  | {
      type: "unknownError";
      error: Error;
    };

export type RepoInfo = RepositoryError | ValidatedRepoInfo;

/** Proven valid repositories with valid repoRoot / dotdir */
export type ValidatedRepoInfo = {
  type: "success";
  /** Which cli command name this repository should use for graphite, e.g. `gt`  */
  command: string;
  /**
   * Repo root, which cwd may be a subset of. `undefined` if the cwd is not a valid repository.
   */
  repoRoot: AbsolutePath;
  /**
   * Directory containing gt internal information for this repo, usually `${repoRoot}/.git`.
   */
  dotdir: AbsolutePath;
  codeReviewSystem: CodeReviewSystem;
  pullRequestDomain: string | undefined;
  preferredBranchEdit: "amend" | "commit";
};

export type CodeReviewSystem =
  | {
      type: "github";
      owner: string;
      repo: string;
      /** github enterprise may use a different hostname than 'github.com' */
      hostname: string;
    }
  | {
      type: "none";
    }
  | {
      type: "unknown";
      path?: string;
    };

export type SuccessorInfo = {
  hash: string;
  type: string;
};

/**
 * Most arguments to eden commands are literal `string`s, except:
 * - When specifying file paths, the server needs to know which args are files to convert them to be cwd-relative.
 * - When specifying commit hashes, you may be acting on optimistic version of those hashes.
 *   The server can re-write hashes using a revset that transforms into the latest successor instead.
 *   This allows you to act on the optimistic versions of commits in queued commands,
 *   without a race with the server telling you new versions of those hashes.
 *   TODO: what if you WANT to act on an obsolete commit?
 */
export type CommandArg =
  | string
  | { type: "repo-relative-file"; path: RepoRelativePath }
  | { type: "succeedable-revset"; revset: Revset };

/**
 * What process to execute a given operation in, such as `gt`
 */
export enum CommandRunner {
  Graphite = "gt",
  /**
   * Use the configured Code Review provider to run this command,
   * such as a non-graphite external submit command
   */
  CodeReviewProvider = "codeReviewProvider",
}

/**
 * {@link CommandArg} representing a hash or revset which should be re-written
 * to the latest successor of that revset when being run.
 * This enables queued commands to act on optimistic state without knowing
 * the optimistic commit's hashes directly.
 */
export function SucceedableRevset(revset: Revset): CommandArg {
  return { type: "succeedable-revset", revset };
}

/* uncommited changes */

export type SubscribeUncommittedChanges = {
  type: "subscribeUncommittedChanges";
  /** Identifier to include in each event published. */
  subscriptionID: string;
};

export type UncommittedChanges = Array<ChangedFile>;

export type UncommittedChangesEvent = {
  type: "uncommittedChanges";
  subscriptionID: string;
  files: Result<UncommittedChanges>;
};

export type BeganFetchingUncommittedChangesEvent = {
  type: "beganFetchingUncommittedChangesEvent";
};

/* smartlog commits */

export type SubscribeSmartlogCommits = {
  type: "subscribeSmartlogCommits";
  /** Identifier to include in each event published. */
  subscriptionID: string;
};

export type SmartlogCommits = Array<BranchInfo>;

export type SmartlogCommitsEvent = {
  type: "smartlogCommits";
  subscriptionID: string;
  commits: Result<SmartlogCommits>;
};

export type BeganFetchingSmartlogCommitsEvent = {
  type: "beganFetchingSmartlogCommitsEvent";
};

/* merge conflicts */

type ConflictInfo = {
  files: Array<ChangedFile>;
};
export type MergeConflicts =
  | ({ state: "loading" } & AllUndefined<ConflictInfo>)
  | ({
      state: "loaded";
    } & ConflictInfo);

export type SubscribeMergeConflicts = {
  type: "subscribeMergeConflicts";
  /** Identifier to include in each event published. */
  subscriptionID: string;
};

export type MergeConflictsEvent = {
  type: "mergeConflicts";
  subscriptionID: string;
  conflicts: MergeConflicts | undefined;
};

/* Operations */

export type RunnableOperation = {
  args: Array<CommandArg>;
  id: string;
  runner: CommandRunner;
};

export type OperationProgress =
  // another operation is running, so this one has been queued to run. Also include full state of the queue.
  | { id: string; kind: "queue"; queue: Array<string> }
  // the server has started the process. This also servers as a "dequeue" notification. Also include full state of the queue.
  | { id: string; kind: "spawn"; queue: Array<string> }
  | { id: string; kind: "stderr"; message: string }
  | { id: string; kind: "stdout"; message: string }
  | { id: string; kind: "exit"; exitCode: number | null }
  | { id: string; kind: "error"; error: string };

export type OperationCommandProgressReporter = (
  ...args:
    | ["spawn"]
    | ["stdout", string]
    | ["stderr", string]
    | ["exit", number | null]
) => void;

export type OperationProgressEvent = {
  type: "operationProgress";
} & OperationProgress;

/* protocol */

/**
 * messages sent by platform-specific (browser, vscode, electron) implementations
 * to be handled uniquely per server type.
 */
export type PlatformSpecificClientToServerMessages =
  | { type: "platform/openFile"; path: RepoRelativePath }
  | { type: "platform/openExternal"; url: string }
  | { type: "platform/confirm"; message: string; details?: string | undefined };

/**
 * messages returned by platform-specific (browser, vscode, electron) server implementation,
 * usually in response to a platform-specific ClientToServer message
 */
export type PlatformSpecificServerToClientMessages = {
  type: "platform/confirmResult";
  result: boolean;
};

export type PageVisibility = "focused" | "visible" | "hidden";

export type FileABugFields = {
  title: string;
  description: string;
  repro: string;
};
export type FileABugProgress =
  | { status: "starting" }
  | { status: "inProgress"; message: string }
  | { status: "success"; taskNumber: string; taskLink: string }
  | { status: "error"; error: Error };
export type FileABugProgressMessage = {
  type: "fileBugReportProgress";
} & FileABugProgress;

export type ClientToServerMessage =
  | {
      type: "refresh";
    }
  | { type: "track"; data: TrackDataWithEventName }
  | { type: "fileBugReport"; data: FileABugFields; uiState?: Json }
  | { type: "runOperation"; operation: RunnableOperation }
  | { type: "abortRunningOperation"; operationId: string }
  | { type: "deleteFile"; filePath: RepoRelativePath }
  | { type: "fetchCommitMessageTemplate" }
  | { type: "requestRepoInfo" }
  | { type: "requestApplicationInfo" }
  | { type: "fetchDiffSummaries" }
  | { type: "pageVisibility"; state: PageVisibility }
  | {
      type: "requestComparison";
      comparison: Comparison;
    }
  | {
      type: "requestComparisonContextLines";
      id: {
        comparison: Comparison;
        path: RepoRelativePath;
      };
      start: number;
      numLines: number;
    }
  | { type: "loadMoreCommits" }
  | SubscribeUncommittedChanges
  | SubscribeSmartlogCommits
  | SubscribeMergeConflicts
  | PlatformSpecificClientToServerMessages;

export type ServerToClientMessage =
  | UncommittedChangesEvent
  | SmartlogCommitsEvent
  | MergeConflictsEvent
  | BeganFetchingSmartlogCommitsEvent
  | BeganFetchingUncommittedChangesEvent
  | FileABugProgressMessage
  | { type: "fetchedCommitMessageTemplate"; templates: Record<string, string> }
  | { type: "applicationInfo"; platformName: string; version: string }
  | { type: "repoInfo"; info: RepoInfo; cwd?: string }
  | { type: "repoError"; error: RepositoryError | undefined }
  | {
      type: "fetchedDiffSummaries";
      summaries: Result<Map<PRNumber, DiffSummary>>;
    }
  | { type: "comparison"; comparison: Comparison; data: ComparisonData }
  | {
      type: "comparisonContextLines";
      path: RepoRelativePath;
      lines: Array<string>;
    }
  | { type: "beganLoadingMoreCommits" }
  | { type: "commitsShownRange"; rangeInDays: number | undefined }
  | { type: "additionalCommitAvailability"; moreAvailable: boolean }
  | OperationProgressEvent
  | PlatformSpecificServerToClientMessages;

export type Disposable = {
  dispose(): void;
};

export type ComparisonData = {
  diff: Result<string>;
};
