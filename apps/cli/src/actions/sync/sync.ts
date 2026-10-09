import chalk from 'chalk';
import { TContext } from '../../lib/context';
import { SCOPE } from '../../lib/engine/scope_spec';
import { KilledError } from '../../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../../lib/preconditions';
import { cleanBranches } from './clean_branches';
import { syncPrInfo } from '../sync_pr_info';

export async function syncAction(
  opts: {
    pull: boolean;
    force: boolean;
    delete: boolean;
    deleteAll?: boolean;
    showDeleteProgress: boolean;
    restack: boolean;
  },
  context: TContext
): Promise<void> {
  uncommittedTrackedChangesPrecondition();

  if (opts.pull) {
    await pullTrunk(opts.force, context);
    context.splog.tip('You can skip pulling trunk with the `--no-pull` flag.');
  }

  await syncPrInfo(context.engine.allBranchNames, context);

  if (opts.delete) {
    context.splog.info(
      `🧹 Checking if any branches have been merged/closed and can be deleted...`
    );
    await cleanBranches(
      {
        showDeleteProgress: opts.showDeleteProgress,
        force: opts.force || !!opts.deleteAll,
      },
      context
    );
    context.splog.tip(
      [
        'You can skip deleting branches with the `--no-delete` flag.',
        ...(opts.force || opts.deleteAll
          ? []
          : [
              'Try the `--delete-all` (`-d`) flag to delete merged branches without prompting for each.',
            ]),
      ].join('\n')
    );
  }

  if (opts.restack) {
    restackWithoutConflicts(
      context.engine.getRelativeStack(context.engine.trunk, SCOPE.STACK),
      context
    );
  }
}

export async function pullTrunk(
  force: boolean,
  context: TContext
): Promise<void> {
  context.splog.info(
    `🌲 Pulling ${chalk.cyan(context.engine.trunk)} from remote...`
  );
  const pullResult = context.engine.pullTrunk();
  if (pullResult !== 'PULL_CONFLICT') {
    context.splog.info(
      pullResult === 'PULL_UNNEEDED'
        ? `${chalk.green(context.engine.trunk)} is up to date.`
        : `${chalk.green(context.engine.trunk)} fast-forwarded to ${chalk.gray(
            context.engine.getRevision(context.engine.trunk)
          )}.`
    );
    return;
  }

  // If trunk cannot be fast-forwarded, prompt the user to reset to remote
  context.splog.warn(
    `${chalk.blueBright(context.engine.trunk)} could not be fast-forwarded.`
  );
  if (
    force ||
    (context.interactive &&
      (
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message: `Overwrite ${chalk.yellow(
            context.engine.trunk
          )} with the version from remote?`,
          initial: true,
        })
      ).value)
  ) {
    context.engine.resetTrunkToRemote();
    context.splog.info(
      `${chalk.green(context.engine.trunk)} set to ${chalk.gray(
        context.engine.getRevision(context.engine.trunk)
      )}.`
    );
  } else {
    throw new KilledError();
  }
}

// Restacks every branch that rebases cleanly and leaves the rest, conflicts
// aborted, for `ch restack` (gt's sync/get/submit --restack). Returns those.
export function restackWithoutConflicts(
  branchNames: string[],
  context: TContext
): string[] {
  const conflicted: string[] = [];
  for (const branchName of branchNames) {
    if (
      context.engine.isTrunk(branchName) ||
      context.engine.isBranchFrozen(branchName)
    ) {
      continue;
    }
    const result = context.engine.restackBranch(branchName).result;
    if (result === 'REBASE_CONFLICT') {
      context.engine.abortRebase();
      conflicted.push(branchName);
    } else if (result === 'REBASE_DONE') {
      context.splog.info(
        `Restacked ${chalk.green(branchName)} on ${chalk.cyan(
          context.engine.getParentPrecondition(branchName)
        )}.`
      );
    }
  }
  if (conflicted.length) {
    context.splog.warn(
      [
        'All branches restacked cleanly, except for:',
        ...conflicted.map(
          (b) =>
            `▸ ${b}${b === context.engine.currentBranch ? ' (current)' : ''}`
        ),
        `You can fix these conflicts with ${chalk.cyan('ch restack')}.`,
      ].join('\n')
    );
  }
  return conflicted;
}
