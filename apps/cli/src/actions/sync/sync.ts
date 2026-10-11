import chalk from 'chalk';
import { TContext } from '../../lib/context';
import { SCOPE } from '../../lib/engine/scope_spec';
import { ExitFailedError, KilledError } from '../../lib/errors';
import { branchesInOtherWorktrees } from '../../lib/git/worktrees';
import { uncommittedTrackedChangesPrecondition } from '../../lib/preconditions';
import { skippedInWorktreeMessage } from '../restack';
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
    context.splog.tip(
      'You can skip pulling from remote with the `--no-pull` flag.'
    );
  }

  await syncPrInfo(context.engine.allBranchNames, context);

  let kept: string[] = [];
  if (opts.delete) {
    context.splog.info(
      `🧹 Checking if any branches have been merged/closed and can be deleted...`
    );
    kept = await cleanBranches(
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

  if (opts.pull) {
    await pullBranches(opts.force, context);
  }

  if (opts.restack) {
    restackWithoutConflicts(
      context.engine
        .getRelativeStack(context.engine.trunk, SCOPE.STACK)
        .filter((b) => !kept.includes(b)),
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
  if (typeof pullResult === 'object') {
    context.splog.warn(
      `Skipped pulling ${chalk.cyan(
        context.engine.trunk
      )}: it is checked out in another worktree (${
        pullResult.skippedInWorktree
      }) and can't be fast-forwarded there without touching uncommitted changes or local commits. Pull it in that worktree.`
    );
    return;
  }
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
  if (!force && !context.interactive) {
    throw new ExitFailedError(
      `${chalk.blueBright(
        context.engine.trunk
      )} could not be fast-forwarded. Pass ${chalk.cyan(
        '--force'
      )} to overwrite it with the version from remote.`
    );
  }
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

// gt 1.3.0: pull remote changes into every tracked branch, parents first. A
// branch that is only behind (or whose remote is a rebase of commits it already
// has) takes the remote version; one with local commits the remote lacks is
// kept unless the user agrees, or passes --force, to overwrite it.
async function pullBranches(force: boolean, context: TContext): Promise<void> {
  const startedOn = context.engine.currentBranch;
  const otherWorktrees = branchesInOtherWorktrees();
  await context.engine.populateRemoteShas();
  for (const branchName of context.engine.getRelativeStack(
    context.engine.trunk,
    SCOPE.UPSTACK_EXCLUSIVE
  )) {
    if (
      !context.engine.hasRemoteBranch(branchName) ||
      context.engine.branchMatchesRemote(branchName)
    ) {
      continue;
    }
    const worktree = otherWorktrees.get(branchName);
    if (worktree) {
      context.splog.info(skippedInWorktreeMessage(branchName, worktree));
      continue;
    }
    const parentBranchName = context.engine.getParentPrecondition(branchName);
    context.engine.fetchBranch(branchName, parentBranchName, {
      baseIsMergeBaseWithParent: true,
    });
    const relation = context.engine.compareBranchToFetched(branchName);
    if (
      relation === 'AHEAD' ||
      (relation === 'DIVERGED' &&
        !context.engine.isBranchFrozen(branchName) &&
        !(await shouldOverwriteDiverged(branchName, force, context)))
    ) {
      continue;
    }
    context.engine.checkoutBranchFromFetched(branchName, parentBranchName);
    context.splog.info(`Synced ${chalk.cyan(branchName)} from remote.`);
  }
  if (startedOn && context.engine.currentBranch !== startedOn) {
    context.engine.checkoutBranch(startedOn);
  }
}

async function shouldOverwriteDiverged(
  branchName: string,
  force: boolean,
  context: TContext
): Promise<boolean> {
  if (force) {
    return true;
  }
  if (!context.interactive) {
    context.splog.info(
      [
        `${chalk.yellow(
          branchName
        )} has diverged from remote; kept your local version.`,
        `Pass ${chalk.cyan(
          '--force'
        )} to overwrite it with the remote version, or run ${chalk.cyan(
          `ch get ${branchName}`
        )} to rebase your changes onto it.`,
      ].join('\n')
    );
    return false;
  }
  return (
    await context.prompts({
      type: 'confirm',
      name: 'value',
      message: `${branchName} has diverged from remote. Overwrite it with the remote version? Local commits not on remote will be lost.`,
      initial: false,
    })
  ).value;
}

// Restacks every branch that rebases cleanly and leaves the rest, conflicts
// aborted, for `ch restack` (gt's sync/get/submit --restack). Returns those.
export function restackWithoutConflicts(
  branchNames: string[],
  context: TContext
): string[] {
  const conflicted: string[] = [];
  const otherWorktrees = branchesInOtherWorktrees();
  for (const branchName of branchNames) {
    if (
      context.engine.isTrunk(branchName) ||
      context.engine.isBranchFrozen(branchName)
    ) {
      continue;
    }
    const worktree = otherWorktrees.get(branchName);
    if (worktree) {
      context.splog.info(skippedInWorktreeMessage(branchName, worktree));
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
