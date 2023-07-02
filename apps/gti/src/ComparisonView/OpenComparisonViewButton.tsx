import type { Comparison } from "@withgraphite/gti-shared/Comparison";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { ComparisonType } from "@withgraphite/gti-shared/Comparison";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { currentComparisonMode } from "./atoms";

import { short } from "../utils";

export function OpenComparisonViewButton({
  comparison,
}: {
  comparison: Comparison;
}) {
  return (
    <VSCodeButton
      data-testid={`open-comparison-view-button-${comparison.type}`}
      appearance="icon"
      onClick={() => {
        currentComparisonMode.set({ comparison, visible: true });
      }}
    >
      <Icon icon="files" slot="start" />
      {buttonLabelForComparison(comparison)}
    </VSCodeButton>
  );
}

function buttonLabelForComparison(comparison: Comparison): string {
  switch (comparison.type) {
    case ComparisonType.UncommittedChanges:
      return "View Changes";
    case ComparisonType.HeadChanges:
      return "View Head Changes";
    case ComparisonType.StackChanges:
      return "View Stack Changes";
    case ComparisonType.Committed:
      return `View Changes in ${short(comparison.hash)}`;
  }
}
