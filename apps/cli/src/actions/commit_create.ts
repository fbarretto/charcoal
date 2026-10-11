import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  editorPrecondition,
  ensureSomeStagedChangesPrecondition,
  stageChanges,
  TStageOpts,
} from '../lib/preconditions';
import { BlockedDuringRebaseError } from '../lib/errors';
import { restackBranches, withChangesSetAside } from './restack';

export async function commitCreateAction(
  opts: TStageOpts & { message?: string; verbose?: number },
  context: TContext
): Promise<void> {
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }

  // Refuse before staging, or the staged changes ride into the next commit.
  context.engine.assertNotFrozen(context.engine.currentBranchPrecondition);
  if (!opts.message) {
    editorPrecondition(context, 'Pass the commit message with `-m`.');
  }
  await stageChanges(opts, context);
  ensureSomeStagedChangesPrecondition(context);
  context.engine.commit({ message: opts.message, verbose: opts.verbose });

  withChangesSetAside('UNSTAGED', context, () =>
    restackBranches(
      context.engine.getRelativeStack(
        context.engine.currentBranchPrecondition,
        SCOPE.UPSTACK_EXCLUSIVE
      ),
      context
    )
  );
}
