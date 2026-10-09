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
import { restackBranches, withChangesSetAside } from './restack';

// Commits the staged changes into another branch without checking it out:
// the new commit is built from the target's tree in a throwaway index.
export function modifyIntoAction(
  opts: {
    into: string;
    addAll: boolean;
    patch: boolean;
    commit: boolean;
    message?: string;
  },
  context: TContext
): void {
  const target = opts.into;
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }
  if (
    !context.engine.isBranchTracked(target) ||
    context.engine.isTrunk(target)
  ) {
    throw new PreconditionsFailedError(
      `${chalk.yellow(target)} is not a tracked branch other than trunk.`
    );
  }
  // setBranchRevision would refuse too, but only after the working tree reset.
  context.engine.assertNotFrozen(target);
  if (opts.patch) {
    throw new PreconditionsFailedError(
      'Stage hunks with `git add -p` before `--into`; `--patch` is not supported.'
    );
  }
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
  if (opts.addAll) {
    context.engine.addAll();
  }

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
  opts: { commit: boolean; message?: string }
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
        authorEnv: getCommitAuthorEnv(tip),
      });
}
