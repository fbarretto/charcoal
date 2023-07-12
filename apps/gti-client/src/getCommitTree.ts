import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import type { CommitPreview } from "./previews";

export type CommitTree = {
  info: BranchInfo;
  children: Array<CommitTree>;
};

export type CommitTreeWithPreviews = {
  info: BranchInfo;
  children: Array<CommitTreeWithPreviews>;
  previewType?: CommitPreview;
};

const byTimeDecreasing = (a: BranchInfo, b: BranchInfo) =>
  new Date(b.date).getTime() - new Date(a.date).getTime();

/**
 * Given a list of commits from disk, produce a tree capturing the
 * parent/child structure of the commits.
 *  - Public commits are always top level (on the main line)
 *  - Public commits are sorted by date
 *  - Draft commits are always offshoots of public commits (never on main line)
 *     - Caveat: if there are no public commits found, use the parent of everything
 *       as if it were a public commit
 *  - If a public commit has no draft children, it is hidden
 *     - ...unless it has a bookmark
 *  - If a commit has multiple children, they are sorted by date
 */
export function getCommitTree(commits: Array<BranchInfo>): Array<CommitTree> {
  const childNodesByParent = new Map<string, Set<BranchInfo>>();
  commits.forEach((commit) => {
    const [parent] = commit.parents;
    if (!parent) {
      return;
    }
    let set = childNodesByParent.get(parent);
    if (!set) {
      set = new Set();
      childNodesByParent.set(parent, set);
    }
    set.add(commit);
  });

  const makeTree = (revision: BranchInfo): CommitTree => {
    const { branch } = revision;
    const childrenSet = childNodesByParent.get(branch) ?? [];

    const childrenInfos = [...childrenSet].sort(byTimeDecreasing);

    const children: Array<CommitTree> =
      childrenInfos == null
        ? []
        : childrenInfos.filter((child) => !child.partOfTrunk).map(makeTree);

    return {
      info: revision,
      children,
    };
  };

  const initialCommits = commits.filter(
    (commit) => commit.partOfTrunk || commit.parents.length === 0
  );

  // build tree starting from public revisions
  return initialCommits.sort(byTimeDecreasing).map(makeTree);
}

export function* walkTreePostorder(
  commitTree: Array<CommitTree>
): IterableIterator<CommitTree> {
  for (const node of commitTree) {
    if (node.children.length > 0) {
      yield* walkTreePostorder(node.children);
    }
    yield node;
  }
}

export function isDescendant(hash: string, commitTree: CommitTree): boolean {
  for (const commit of walkTreePostorder([commitTree])) {
    if (commit.info.branch === hash) {
      return true;
    }
  }
  return false;
}

/** Test if a tree is linear - no merge or folds. */
export function isTreeLinear(tree: CommitTreeWithPreviews): boolean {
  if (tree.children.length > 1 || tree.info.parents.length > 1) {
    return false;
  }
  return tree.children.every((t) => isTreeLinear(t));
}
