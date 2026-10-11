import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { TCommitOpts } from '../lib/git/commit';
import { editorPrecondition } from '../lib/preconditions';
import { restackBranches } from './restack';

export function squashCurrentBranch(
  opts: Pick<TCommitOpts, 'message' | 'noEdit'>,
  context: TContext
): void {
  const branchName = context.engine.currentBranchPrecondition;
  context.engine.assertNotFrozen(branchName);
  if (context.engine.getAllCommits(branchName, 'SHA').length < 2) {
    context.splog.info('Nothing to squash: the branch has at most one commit.');
    return;
  }
  if (!opts.message && !opts.noEdit) {
    editorPrecondition(
      context,
      "Pass `-m <message>`, or `--no-edit` to keep the first commit's message."
    );
  }
  context.engine.squashCurrentBranch({
    noEdit: opts.noEdit,
    message: opts.message,
  });
  restackBranches(
    context.engine.getRelativeStack(branchName, SCOPE.UPSTACK_EXCLUSIVE),
    context,
    { leaveConflicts: true }
  );
}
