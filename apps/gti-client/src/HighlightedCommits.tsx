import type {
  BranchInfo,
  BranchName,
} from "@withgraphite/gti-cli-shared-types";
import { observable, runInAction } from "mobx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const highlightedCommits = observable.set<BranchName>();

export function HighlightCommitsWhileHovering({
  toHighlight,
  children,
  ...rest
}: {
  toHighlight: Array<BranchInfo>;
  children: React.ReactNode;
} & React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLDivElement>,
  HTMLDivElement
>) {
  const ref = useRef<HTMLDivElement>(null);

  const [isSourceOfHighlight, setIsSourceOfHighlight] = useState(false);

  // Using onMouseLeave directly on the div is unreliable if the component rerenders: https://github.com/facebook/react/issues/4492
  // Use a manually managed subscription instead.
  useLayoutEffect(() => {
    // Do not change visible if 'click' shows the content.
    const onMouseEnter = () => {
      runInAction(() => {
        highlightedCommits.clear();
        toHighlight.map((commit) => highlightedCommits.add(commit.branch));
      });
      setIsSourceOfHighlight(true);
    };
    const onMouseLeave = () => {
      highlightedCommits.clear();
      setIsSourceOfHighlight(false);
    };
    const div = ref.current;
    div?.addEventListener("mouseenter", onMouseEnter);
    div?.addEventListener("mouseleave", onMouseLeave);
    return () => {
      div?.removeEventListener("mouseenter", onMouseEnter);
      div?.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [toHighlight]);

  useEffect(() => {
    return () => {
      if (isSourceOfHighlight) {
        // if we started the highlight, make sure to unhighlight when unmounting
        highlightedCommits.clear();
      }
    };
  }, [isSourceOfHighlight]);

  return (
    <div {...rest} ref={ref}>
      {children}
    </div>
  );
}
