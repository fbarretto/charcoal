export enum ComparisonType {
  UncommittedChanges = "UNCOMMITTED",
  HeadChanges = "HEAD",
  StackChanges = "STACK",
  Committed = "InCommit",
}

export type Comparison =
  | {
      type: ComparisonType.Committed;
      hash: string;
    }
  | {
      type:
        | ComparisonType.UncommittedChanges
        | ComparisonType.HeadChanges
        | ComparisonType.StackChanges;
    };

/** Arguments for a comparison */
export function revsetArgsForComparison(comparison: Comparison): Array<string> {
  switch (comparison.type) {
    case ComparisonType.UncommittedChanges:
      return ["uncommitted"];
    case ComparisonType.HeadChanges:
      return ["head"];
    case ComparisonType.StackChanges:
      return ["stack"];
    case ComparisonType.Committed:
      return ["stack", "--ref", comparison.hash];
  }
}

/** Revset for a comparison */
export function revsetForComparison(comparison: Comparison): string {
  switch (comparison.type) {
    case ComparisonType.UncommittedChanges:
      return ".";
    case ComparisonType.HeadChanges:
      return ".^";
    case ComparisonType.StackChanges:
      return "ancestor(.,interestingmaster())";
    case ComparisonType.Committed:
      return comparison.hash;
  }
}

/**
 * English description of comparison.
 * Note: non-localized. Don't forget to run this through `t()` for a given client.
 */
export function labelForComparison(comparison: Comparison): string {
  switch (comparison.type) {
    case ComparisonType.UncommittedChanges:
      return "Uncommitted Changes";
    case ComparisonType.HeadChanges:
      return "Head Changes";
    case ComparisonType.StackChanges:
      return "Stack Changes";
    case ComparisonType.Committed:
      return `In ${comparison.hash}`;
  }
}

export function comparisonIsAgainstHead(comparison: Comparison): boolean {
  switch (comparison.type) {
    case ComparisonType.UncommittedChanges:
    case ComparisonType.HeadChanges:
    case ComparisonType.StackChanges:
      return true;
    case ComparisonType.Committed:
      return false;
  }
}
