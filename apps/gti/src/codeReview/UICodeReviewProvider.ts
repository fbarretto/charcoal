import type { Operation } from "../operations/Operation";
import type { DiffId, DiffSummary } from "../types";
import type { ReactNode } from "react";

/**
 * API to interact with Code Review for Repositories, e.g. GitHub.
 */
export interface UICodeReviewProvider {
  name: string;

  DiffBadgeContent(props: {
    diff?: DiffSummary;
    children?: ReactNode;
  }): JSX.Element | null;
  formatDiffNumber(diffId: DiffId): string;

  submitOperation(): Operation;

  RepoInfo(): JSX.Element | null;
}
