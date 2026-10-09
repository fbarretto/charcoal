import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { BlockedDuringRebaseError } from '../lib/errors';
import { stageChanges, TStageOpts } from '../lib/preconditions';
import { restackBranches } from './restack';

export async function commitAmendAction(
  opts: TStageOpts & {
    message?: string;
    edit: boolean;
    verbose?: number;
    resetAuthor?: boolean;
  },
  context: TContext
): Promise<void> {
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }

  await stageChanges(opts, context);

  context.engine.commit({
    amend: true,
    message: opts.message,
    edit: opts.edit,
    noEdit: !opts.edit && !opts.message,
    verbose: opts.verbose,
    resetAuthor: opts.resetAuthor,
  });

  restackBranches(
    context.engine.getRelativeStack(
      context.engine.currentBranchPrecondition,
      SCOPE.UPSTACK_EXCLUSIVE
    ),
    context
  );
}
