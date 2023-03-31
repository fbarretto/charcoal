import type React from "react";

import { latestCommitTreeMap } from "./serverAPIState";
import { computed, observable } from "mobx";
import { useCallback } from "react";
import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import { treeWithPreviews } from "./previews";
import { notEmpty } from "@withgraphite/gti-shared/utils";
import { GTICommandName, useCommand } from "./GTIShortcuts";

/**
 * See {@link selectedCommitInfos}
 * Note: it is possible to be selecting a commit that stops being rendered, and thus has no associated commit info.
 * Prefer to use `selectedCommitInfos` to get the subset of the selection that is visible.
 */
export const selectedCommits = observable.set<string>([], { deep: false });

const previouslySelectedCommit = observable.box<undefined | string>(undefined);

/**
 * Clicking on commits will select them in the UI.
 * Selected commits can be acted on in bulk, and appear in the commit info sidebar for editing / details.
 * Invariant: Selected commits are non-public.
 *
 * See {@link selectedCommits} for setting underlying storage
 */
export const selectedCommitInfos = computed<Array<BranchInfo>>(() => {
  const selected = selectedCommits;
  const { treeMap } = treeWithPreviews.get();
  const commits = [...selected]
    .map((hash) => {
      const tree = treeMap.get(hash);
      if (tree == null) {
        return null;
      }
      return tree.info;
    })
    .filter(notEmpty);
  return commits;
});

export function useCommitSelection(hash: string): {
  isSelected: boolean;
  onClickToSelect: (
    _e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
  ) => unknown;
} {
  const selected = selectedCommits;
  const onClickToSelect = useCallback(
    (
      e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>
    ) => {
      // previews won't change a commit from draft -> public, so we don't need
      // to use previews here
      const loadable = latestCommitTreeMap.get();
      if (loadable.get(hash)?.info.partOfTrunk) {
        // don't bother selecting public commits
        return;
      }

      if (e.shiftKey) {
        const previouslySelected = previouslySelectedCommit.get();
        const linearHistory = linearizedCommitHistory.get();
        if (linearHistory != null && previouslySelected != null) {
          const prevIdx = linearHistory.findIndex(
            (val) => val.branch === previouslySelected
          );
          const nextIdx = linearHistory.findIndex((val) => val.branch === hash);

          const [fromIdx, toIdx] =
            prevIdx > nextIdx ? [nextIdx, prevIdx] : [prevIdx, nextIdx];
          const slice = linearHistory.slice(fromIdx, toIdx + 1);

          for (const commit of [
            ...slice
              .filter((commit) => commit.partOfTrunk)
              .map((commit) => commit.branch),
          ]) {
            selected.add(commit);
          }
          previouslySelectedCommit.set(hash);
          return;
        } else {
          // Holding shift, but we don't have a previous selected commit.
          // Fall through to treat it like a normal click.
        }
      }

      if (selected.has(hash)) {
        // multiple selected, then click an existing selected:
        //   if cmd, unselect just that one commit
        //   if not cmd, reset selection to just that one commit
        // only one selected, then click on it
        //   if cmd, unselect it
        //   it not cmd, unselect it
        if (!e.metaKey && selected.size > 1) {
          // only select this commit
          selected.clear();
          selected.add(hash);
        } else {
          // unselect
          selected.delete(hash);
          previouslySelectedCommit.set(undefined);
        }
      } else {
        if (!e.metaKey) {
          // clear if not holding cmd key
          selected.clear();
        }
        selected.add(hash);
      }

      previouslySelectedCommit.set(hash);
    },
    [hash]
  );
  return { isSelected: selected.has(hash), onClickToSelect };
}

/**
 * Convert commit tree to linear history, where commits are neighbors in the array
 * if they are visually next to each other when rendered as a tree
 * c            c
 * b            b
 * | e    ->    e
 * | d          d
 * |/           a
 * a
 * in bottom to top order: [a,d,e,b,c]
 */
export const linearizedCommitHistory = computed(() => {
  const { trees } = treeWithPreviews.get();

  const toProcess = [...trees];
  const accum = [];

  while (toProcess.length > 0) {
    const next = toProcess.pop();
    if (!next) {
      break;
    }

    accum.push(next.info);
    toProcess.push(...next.children);
  }

  return accum;
});

export function useArrowKeysToChangeSelection() {
  const cb = useCallback((which: GTICommandName) => {
    const lastSelected = previouslySelectedCommit.get();
    const linearHistory = linearizedCommitHistory.get();
    if (lastSelected == null || linearHistory == null) {
      return;
    }

    const linearNonPublicHistory = linearHistory.filter(
      (commit) => !commit.partOfTrunk
    );

    let currentIndex = linearNonPublicHistory.findIndex(
      (commit) => commit.branch === lastSelected
    );
    if (currentIndex === -1) {
      return;
    }

    let extendSelection = false;

    switch (which) {
      case "SelectUpwards": {
        if (currentIndex < linearNonPublicHistory.length - 1) {
          currentIndex++;
        }
        break;
      }
      case "SelectDownwards": {
        if (currentIndex > 0) {
          currentIndex--;
        }
        break;
      }
      case "ContinueSelectionUpwards": {
        if (currentIndex < linearNonPublicHistory.length - 1) {
          currentIndex++;
        }
        extendSelection = true;
        break;
      }
      case "ContinueSelectionDownwards": {
        if (currentIndex > 0) {
          currentIndex--;
        }
        extendSelection = true;
        break;
      }
    }

    const newSelected = linearNonPublicHistory[currentIndex];
    if (!extendSelection) {
      selectedCommits.clear();
    }
    selectedCommits.add(newSelected.branch);
    previouslySelectedCommit.set(newSelected.branch);
  }, []);

  useCommand("SelectUpwards", () => cb("SelectUpwards"));
  useCommand("SelectDownwards", () => cb("SelectDownwards"));
  useCommand("ContinueSelectionUpwards", () => cb("ContinueSelectionUpwards"));
  useCommand("ContinueSelectionDownwards", () =>
    cb("ContinueSelectionDownwards")
  );
}
