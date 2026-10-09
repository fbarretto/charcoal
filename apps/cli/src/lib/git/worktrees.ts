import fs from 'fs-extra';
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
    const branch = lines
      .find((l) => l.startsWith('branch refs/heads/'))
      ?.slice('branch refs/heads/'.length);
    if (worktree && branch && realpath(worktree) !== here) {
      result.set(branch, worktree);
    }
  }
  return result;
}

/** The path of another worktree that has `branch` checked out, if any. */
export function worktreeOf(branch: string): string | undefined {
  return branchesInOtherWorktrees().get(branch);
}
