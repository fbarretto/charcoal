import type { Operation } from "../operations/Operation";
import type { DiffSummary } from "../types";
import type { ReactNode } from "react";
import type { PRNumber } from "@withgraphite/gti-cli-shared-types";

/**
 * API to interact with Code Review for Repositories, e.g. GitHub.
 */
export interface UICodeReviewProvider {
  name: string;

  DiffBadgeContent(props: {
    diff?: DiffSummary;
    children?: ReactNode;
  }): JSX.Element | null;
  formatDiffNumber(diffId: PRNumber): string;

  submitOperation(): Operation;

  RepoInfo(): JSX.Element | null;
}
