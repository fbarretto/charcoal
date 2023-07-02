import { useRef, useEffect } from "react";
import { computed, observable } from "mobx";

export const mainContentWidthState = observable.box<number>(500);

export function useMainContentWidth() {
  const mainContentRef = useRef<null | HTMLDivElement>(null);
  useEffect(() => {
    const element = mainContentRef.current;
    if (element == null) {
      return;
    }

    const obs = new ResizeObserver((entries) => {
      const [entry] = entries;
      mainContentWidthState.set(entry.contentRect.width);
    });
    obs.observe(element);
    return () => obs.unobserve(element);
  }, [mainContentRef]);

  return mainContentRef;
}

export const NARROW_COMMIT_TREE_WIDTH = 800;

export const isNarrowCommitTree = computed(
  () => mainContentWidthState.get() < NARROW_COMMIT_TREE_WIDTH
);
