import chalk from 'chalk';
import { TContext } from '../lib/context';
import { ExitFailedError } from '../lib/errors';
import { getMergeBase } from '../lib/git/merge_base';
import { runGitCommand } from '../lib/git/runner';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { newBranchName } from '../lib/utils/branch_name';

export function revertAction(
  { sha, edit }: { sha: string; edit: boolean },
  context: TContext
): void {
  uncommittedTrackedChangesPrecondition();
  const trunk = context.engine.trunk;
  const commit = resolveTrunkCommit(sha, trunk);
  const subject = runGitCommand({
    args: ['log', '-1', '--format=%s', commit],
    onError: 'throw',
    resource: 'revertSubject',
  });
  const branchName = newBranchName(undefined, `revert ${subject}`, context);
  if (!branchName) {
    throw new ExitFailedError(`Could not name a branch for ${sha}.`);
  }

  const originalBranch = context.engine.currentBranch;
  context.engine.checkoutBranch(trunk);
  context.engine.checkoutNewBranch(branchName);
  try {
    runGitCommand({
      args: ['revert', '--no-commit', commit],
      onError: 'throw',
      resource: 'revert',
    });
    context.engine.commit(edit ? { edit: true } : { noEdit: true });
  } catch (e) {
    runGitCommand({
      args: ['revert', '--abort'],
      onError: 'ignore',
      resource: 'revertAbort',
    });
    context.engine.deleteBranch(branchName);
    if (originalBranch) {
      context.engine.checkoutBranch(originalBranch);
    }
    throw new ExitFailedError(
      `Could not revert ${sha} cleanly onto ${trunk}; nothing was changed.`
    );
  }
  context.splog.info(
    `Created ${chalk.green(branchName)} reverting ${chalk.yellow(
      commit.slice(0, 7)
    )} on ${chalk.cyan(trunk)}.`
  );
}

function resolveTrunkCommit(sha: string, trunk: string): string {
  const commit = runGitCommand({
    args: ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`],
    onError: 'ignore',
    resource: 'revertResolveSha',
  });
  if (!commit || getMergeBase(commit, trunk) !== commit) {
    throw new ExitFailedError(`${sha} is not a commit on ${trunk}.`);
  }
  return commit;
}
