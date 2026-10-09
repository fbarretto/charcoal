import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { PreconditionsFailedError } from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { restackBranches } from './restack';

export function currentBranchOnto(
  ontoBranchName: string,
  context: TContext,
  opts: { only?: boolean } = {}
): void {
  uncommittedTrackedChangesPrecondition();

  const currentBranch = context.engine.currentBranchPrecondition;

  if (!opts.only) {
    context.engine.setParent(currentBranch, ontoBranchName);
    restackBranches(
      context.engine.getRelativeStack(currentBranch, SCOPE.UPSTACK),
      context
    );
    return;
  }

  if (currentBranch === ontoBranchName) {
    throw new PreconditionsFailedError(
      `Cannot move ${chalk.yellow(currentBranch)} onto itself!`
    );
  }
  if (
    !context.engine.isTrunk(ontoBranchName) &&
    !context.engine.isBranchTracked(ontoBranchName)
  ) {
    throw new PreconditionsFailedError(
      `${chalk.yellow(ontoBranchName)} is not a tracked branch.`
    );
  }

  // Parents are written lazily, right before each branch restacks (see
  // pendingParents in continuation_spf.ts). Children keep their stored
  // parentBranchRevision (the source's old tip), so restacking them onto the
  // old parent cuts the source's commits out.
  const oldParent = context.engine.getParentPrecondition(currentBranch);
  const children = context.engine.getChildren(currentBranch);
  restackBranches(
    [
      ...children.flatMap((child) =>
        context.engine.getRelativeStack(child, SCOPE.UPSTACK)
      ),
      currentBranch,
    ],
    context,
    {
      pendingParents: {
        ...Object.fromEntries(children.map((child) => [child, oldParent])),
        [currentBranch]: ontoBranchName,
      },
    }
  );
}
