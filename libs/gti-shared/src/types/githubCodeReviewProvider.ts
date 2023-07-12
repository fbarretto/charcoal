import type { PRNumber } from "@withgraphite/gti-cli-shared-types";
import type { DiffSignalSummary } from "./client";

export type GitHubDiffSummary = {
  type: "github";
  title: string;
  state: "Open" | "Merged" | "Closed" | "Draft";
  number: PRNumber;
  url: string;
  commentCount: number;
  anyUnresolvedComments: false;
  signalSummary?: DiffSignalSummary;
};
