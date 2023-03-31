import type {
  BranchInfo,
  BranchName,
} from "@withgraphite/gti-cli-shared-types";
import { observable, runInAction } from "mobx";
import { useEffect, useState } from "react";

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
  const [isSourceOfHighlight, setIsSourceOfHighlight] = useState(false);

  useEffect(() => {
    return () => {
      if (isSourceOfHighlight) {
        // if we started the highlight, make sure to unhighlight when unmounting
        highlightedCommits.clear();
      }
    };
  }, [isSourceOfHighlight]);

  return (
    <div
      {...rest}
      onMouseEnter={() => {
        runInAction(() => {
          highlightedCommits.clear();
          toHighlight.map((commit) => highlightedCommits.add(commit.branch));
        });
        setIsSourceOfHighlight(true);
      }}
      onMouseLeave={() => {
        highlightedCommits.clear();
        setIsSourceOfHighlight(false);
      }}
    >
      {children}
    </div>
  );
}
