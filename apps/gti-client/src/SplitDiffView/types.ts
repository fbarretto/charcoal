import type { IComputedValue } from "mobx";
import type { IPromiseBasedObservable } from "mobx-utils";
import type { OneIndexedLineNumber } from "@withgraphite/gti-shared";

export type LineRangeParams<Id> = {
  // 1-based line number.
  start: number;
  numLines: number;
  id: Id;
};

/**
 * Context used to render SplitDiffView
 */
export type Context<T> = {
  /**
   * Arbitrary identifying information for a given SplitDiffView, usually
   * information like a hash or revset + path.
   */
  id: T;
  atoms: {
    lineRange: (
      params: LineRangeParams<T>
    ) => IComputedValue<IPromiseBasedObservable<string[]>>;
  };
  translate?: (s: string) => string;
  copy?: (s: string) => void;
  openFileToLine?: (line: OneIndexedLineNumber) => unknown;
};
