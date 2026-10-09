import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  BlockedDuringRebaseError,
  PreconditionsFailedError,
} from '../lib/errors';
import {
  commitTree,
  getCommitAuthorEnv,
  getCommitMessage,
  getStagedPatch,
  getTree,
  treeWithPatch,
} from '../lib/git/plumbing';
import { worktreeOf } from '../lib/git/worktrees';
import { stageChanges, TStageOpts } from '../lib/preconditions';
import { restackBranches, withChangesSetAside } from './restack';

// Commits the staged changes into another branch without checking it out:
// the new commit is built from the target's tree in a throwaway index.
export async function modifyIntoAction(
  opts: TStageOpts & {
    into: string;
    commit: boolean;
    message?: string;
    resetAuthor?: boolean;
  },
  context: TContext
): Promise<void> {
  const target = opts.into;
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }
  if (
    !context.engine
      .getRelativeStack(
        context.engine.currentBranchPrecondition,
        SCOPE.DOWNSTACK
      )
      .includes(target)
  ) {
    throw new PreconditionsFailedError(
      `${chalk.yellow(target)} is not downstack of the current branch.`
    );
  }
  const worktree = worktreeOf(target);
  if (worktree) {
    throw new PreconditionsFailedError(
      `${chalk.yellow(
        target
      )} is checked out in another worktree (${worktree}).`
    );
  }
  // setBranchRevision would refuse too, but only after the working tree reset.
  context.engine.assertNotFrozen(target);
  if (opts.commit && !opts.message) {
    throw new PreconditionsFailedError(
      'Pass a message with `-m` when using `--commit` with `--into`.'
    );
  }
  if (!opts.commit && context.engine.isBranchEmpty(target)) {
    throw new PreconditionsFailedError(
      `No commits in ${chalk.yellow(target)} to amend.`
    );
  }
  await stageChanges(opts, context);

  const staged = getStagedPatch();
  if (!staged && (opts.commit || !opts.message)) {
    throw new PreconditionsFailedError('No staged changes to commit.');
  }
  const newRevision = buildCommit(target, staged, opts);

  // The staged changes now live in `newRevision`; only the unstaged ones
  // come back.
  withChangesSetAside('UNSTAGED', context, () => {
    context.engine.setBranchRevision(target, newRevision);
    restackBranches(
      context.engine.getRelativeStack(target, SCOPE.UPSTACK_EXCLUSIVE),
      context
    );
  });
  context.splog.info(
    `${opts.commit ? 'Committed' : 'Amended'} staged changes into ${chalk.green(
      target
    )}.`
  );
}

function buildCommit(
  target: string,
  staged: string,
  opts: { commit: boolean; message?: string; resetAuthor?: boolean }
): string {
  const tip = `refs/heads/${target}`;
  let tree: string;
  try {
    tree = staged ? treeWithPatch(tip, staged) : getTree(tip);
  } catch {
    throw new PreconditionsFailedError(
      `The staged changes don't apply cleanly to ${chalk.yellow(target)}.`
    );
  }
  return opts.commit
    ? commitTree({ tree, parents: [tip], message: opts.message as string })
    : commitTree({
        tree,
        parents: [`${tip}~`],
        message: opts.message ?? getCommitMessage(tip),
        authorEnv: opts.resetAuthor ? undefined : getCommitAuthorEnv(tip),
      });
}
