import type { Comparison } from "@withgraphite/gti-shared/Comparison";

import { ComparisonType } from "@withgraphite/gti-shared/Comparison";
import { observable } from "mobx";

export type ComparisonMode = { comparison: Comparison; visible: boolean };
export const currentComparisonMode = observable.box<ComparisonMode>(
  { comparison: { type: ComparisonType.UncommittedChanges }, visible: false },
  { deep: false }
);
