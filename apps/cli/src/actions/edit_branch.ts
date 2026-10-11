import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { RebaseConflictError } from '../lib/errors';
import { editorPrecondition } from '../lib/preconditions';
import { persistContinuation } from './persist_continuation';
import { printConflictStatus } from './print_conflict_status';
import { restackBranches } from './restack';

export function editBranchAction(context: TContext): void {
  const currentBranchName = context.engine.currentBranchPrecondition;
  editorPrecondition(
    context,
    'Interactive rebases need one; use `ch modify`, `ch squash` or `ch split --by-file` instead.'
  );

  const result = context.engine.rebaseInteractive(currentBranchName);

  if (result.result === 'REBASE_CONFLICT') {
    persistContinuation(
      {
        branchesToRestack: context.engine.getRelativeStack(
          currentBranchName,
          SCOPE.UPSTACK_EXCLUSIVE
        ),
        rebasedBranchBase: result.rebasedBranchBase,
      },
      context
    );
    printConflictStatus(
      `Hit conflict during interactive rebase of ${chalk.yellow(
        currentBranchName
      )}.`,
      context
    );
    throw new RebaseConflictError();
  }

  restackBranches(
    context.engine.getRelativeStack(
      context.engine.currentBranchPrecondition,
      SCOPE.UPSTACK_EXCLUSIVE
    ),
    context
  );
}
