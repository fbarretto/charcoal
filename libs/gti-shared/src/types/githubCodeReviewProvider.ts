import type { PRInfo } from "@withgraphite/gti-cli-shared-types";

export type GitHubDiffSummary = Exclude<PRInfo, "branchName">;
