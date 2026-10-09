import fs from 'fs-extra';
import path from 'path';
import { runGitCommand } from './runner';

const realpath = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * Branches checked out in a worktree other than the current one, mapped to
 * that worktree's path.
 */
export function branchesInOtherWorktrees(): Map<string, string> {
  const here = realpath(
    runGitCommand({
      args: ['rev-parse', '--show-toplevel'],
      onError: 'ignore',
      resource: 'worktreeToplevel',
    })
  );
  const result = new Map<string, string>();
  const porcelain = runGitCommand({
    args: ['worktree', 'list', '--porcelain'],
    onError: 'ignore',
    resource: 'worktreeList',
  });
  for (const block of porcelain.split('\n\n')) {
    const lines = block.split('\n');
    const worktree = lines
      .find((l) => l.startsWith('worktree '))
      ?.slice('worktree '.length);
    const branch =
      lines
        .find((l) => l.startsWith('branch refs/heads/'))
        ?.slice('branch refs/heads/'.length) ??
      (worktree && branchBeingRebased(worktree));
    if (worktree && branch && realpath(worktree) !== here) {
      result.set(branch, worktree);
    }
  }
  return result;
}

// A rebase detaches HEAD, so `worktree list` shows no branch; the branch
// being rebased is recorded in the worktree's git dir.
function branchBeingRebased(worktree: string): string | undefined {
  try {
    const dotGit = path.join(worktree, '.git');
    const gitDir = fs.statSync(dotGit).isDirectory()
      ? dotGit
      : path.resolve(
          worktree,
          fs
            .readFileSync(dotGit, 'utf-8')
            .replace(/^gitdir:\s*/, '')
            .trim()
        );
    for (const dir of ['rebase-merge', 'rebase-apply']) {
      const headName = path.join(gitDir, dir, 'head-name');
      if (fs.existsSync(headName)) {
        const ref = fs.readFileSync(headName, 'utf-8').trim();
        // "detached HEAD" when the rebase started without a branch.
        return ref.startsWith('refs/heads/')
          ? ref.slice('refs/heads/'.length)
          : undefined;
      }
    }
  } catch {
    // Missing or bare worktree.
  }
  return undefined;
}

/** The path of another worktree that has `branch` checked out, if any. */
export function worktreeOf(branch: string): string | undefined {
  return branchesInOtherWorktrees().get(branch);
}
