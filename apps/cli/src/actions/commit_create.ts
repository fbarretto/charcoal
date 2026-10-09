import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  ensureSomeStagedChangesPrecondition,
  stageChanges,
  TStageOpts,
} from '../lib/preconditions';
import { BlockedDuringRebaseError } from '../lib/errors';
import { restackBranches } from './restack';

export async function commitCreateAction(
  opts: TStageOpts & { message?: string; verbose?: number },
  context: TContext
): Promise<void> {
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }

  await stageChanges(opts, context);
  ensureSomeStagedChangesPrecondition(context);
  context.engine.commit({ message: opts.message, verbose: opts.verbose });

  restackBranches(
    context.engine.getRelativeStack(
      context.engine.currentBranchPrecondition,
      SCOPE.UPSTACK_EXCLUSIVE
    ),
    context
  );
}
