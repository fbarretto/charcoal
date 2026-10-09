import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';

// Freezing walks downstack and unfreezing walks upstack, so frozen branches
// always form an unbroken chain up from trunk.
export function setFrozenAction(
  args: { branchName: string; frozen: boolean },
  context: TContext
): void {
  if (context.engine.isTrunk(args.branchName)) {
    throw new ExitFailedError(
      `Cannot ${args.frozen ? 'freeze' : 'unfreeze'} trunk.`
    );
  }
  context.engine
    .getRelativeStack(
      args.branchName,
      args.frozen ? SCOPE.DOWNSTACK : SCOPE.UPSTACK
    )
    .forEach((branchName) => {
      context.engine.setBranchFrozen(branchName, args.frozen);
      context.splog.info(
        `${args.frozen ? 'Froze' : 'Unfroze'} ${chalk.cyan(branchName)}.`
      );
    });
}
