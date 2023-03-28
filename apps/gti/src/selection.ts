import type React from "react";

import { latestCommitTreeMap } from "./serverAPIState";
import { observable } from "mobx";
import { useCallback } from "react";

/**
 * Clicking on commits will select them in the UI.
 * Selected commits can be acted on in bulk, and appear in the commit info sidebar for editing / details.
 * Invariant: Selected commits are non-public.
 */
export const selectedCommits = observable.set<string>([], { deep: false });

export function useCommitSelection(hash: string): {
  isSelected: boolean;
  onClickToSelect: (
    _e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
  ) => unknown;
} {
  const selected = selectedCommits;
  const onClickToSelect = useCallback(
    (
      _e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
    ) => {
      // TODO: cmd-click, shift-click to select multiple.
      // previews won't change a commit from draft -> public, so we don't need
      // to use previews here
      const loadable = latestCommitTreeMap.get();
      if (loadable.get(hash)?.info.partOfTrunk) {
        // don't bother selecting public commits
        return;
      }
      if (selected.has(hash)) {
        selected.delete(hash);
      } else {
        selected.clear();
        selected.add(hash);
      }
    },
    [hash]
  );
  return { isSelected: selected.has(hash), onClickToSelect };
}
