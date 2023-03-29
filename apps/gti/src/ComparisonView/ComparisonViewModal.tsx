import type { Comparison } from "@withgraphite/gti-shared/Comparison";

import { useCommand } from "../GTIShortcuts";
import { Modal } from "../Modal";
import { currentComparisonMode } from "./atoms";
import { lazy, Suspense } from "react";
import "./ComparisonView.scss";
import { ComparisonType } from "@withgraphite/gti-shared/Comparison";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";

const ComparisonView = lazy(() => import("./ComparisonView"));

export const ComparisonViewModal = observer(() => {
  const mode = currentComparisonMode.get();

  function toggle(newComparison: Comparison) {
    runInAction(() => {
      const lastMode = currentComparisonMode.get();
      currentComparisonMode.set(
        lastMode.comparison === newComparison
          ? // If the comparison mode hasn't changed, then we want to toggle the view visibility.
            { visible: !mode.visible, comparison: newComparison }
          : // If the comparison changed, then force it to open, regardless of if it was open before.
            { visible: true, comparison: newComparison }
      );
    });
  }

  useCommand("Escape", () => {
    runInAction(() => {
      const lastMode = currentComparisonMode.get();
      currentComparisonMode.set({ ...lastMode, visible: false });
    });
  });
  useCommand("OpenUncommittedChangesComparisonView", () => {
    toggle({ type: ComparisonType.UncommittedChanges });
  });
  useCommand("OpenHeadChangesComparisonView", () => {
    toggle({ type: ComparisonType.HeadChanges });
  });

  if (!mode.visible) {
    return null;
  }

  return (
    <Modal className="comparison-view-modal">
      <Suspense fallback={<Icon icon="loading" />}>
        <ComparisonView comparison={mode.comparison} />
      </Suspense>
    </Modal>
  );
});
