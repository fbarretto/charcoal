import chalk from 'chalk';
import { githubRepoSlug } from '../lib/api/github_repo';
import { mergePr, setPrBase } from '../lib/api/pr_info';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  ExitFailedError,
  KilledError,
  PreconditionsFailedError,
} from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { restackBranches } from './restack';

type TMergeOpts = {
  dryRun: boolean;
  confirm: boolean;
  method: 'squash' | 'merge' | 'rebase';
  auto: boolean;
};

// Merges trunk -> current bottom-up. Before each PR after the first, its
// branch is reparented onto the freshly pulled trunk, restacked (the stored
// parent revision drops the merged parent's commits even after a squash),
// retargeted and pushed, so GitHub sees exactly that branch's changes.
export async function mergeAction(
  opts: TMergeOpts,
  context: TContext
): Promise<void> {
  const prs = stackPrs(context);
  context.splog.info(
    [
      `${opts.dryRun ? 'Would merge' : 'Merging'} (${opts.method}):`,
      ...prs.map(({ branch, number }) => `  #${number} ${chalk.cyan(branch)}`),
    ].join('\n')
  );
  if (opts.dryRun) {
    return;
  }
  await context.engine.populateRemoteShas();
  const diverged = prs
    .map(({ branch }) => branch)
    .filter((branch) => !context.engine.branchMatchesRemote(branch));
  if (diverged.length) {
    context.splog.warn(
      `Local branches differ from remote: ${diverged
        .map((b) => chalk.yellow(b))
        .join(', ')}. GitHub merges the remote version; run ${chalk.cyan(
        'ch submit'
      )} first to merge your local changes.`
    );
    if (!context.interactive) {
      throw new ExitFailedError('Aborting non-interactive merge.');
    }
  }
  // Like gt, divergence asks for confirmation even without --confirm.
  if (
    (opts.confirm || diverged.length) &&
    context.interactive &&
    !(await confirm(context))
  ) {
    throw new KilledError();
  }
  uncommittedTrackedChangesPrecondition();

  const repo = githubRepoSlug(context);
  const trunk = context.engine.trunk;
  for (const [i, { branch, number }] of prs.entries()) {
    if (i > 0) {
      if (context.engine.pullTrunk() === 'PULL_CONFLICT') {
        throw new ExitFailedError(
          `${chalk.yellow(trunk)} could not be fast-forwarded; run ${chalk.cyan(
            'ch sync'
          )} and retry.`
        );
      }
      context.engine.setParent(branch, trunk);
      restackBranches([branch], context);
      await setPrBase(number, repo, trunk);
      context.engine.pushBranch(branch, false);
    }
    try {
      await mergePr(number, repo, {
        method: opts.method,
        auto: opts.auto,
      });
    } catch (e) {
      const rest = prs.slice(i + 1).map((pr) => `#${pr.number}`);
      context.splog.error(
        `Stopped at #${number} (${branch})${
          rest.length ? `; left untouched: ${rest.join(', ')}` : ''
        }.`
      );
      throw e;
    }
    if (opts.auto) {
      context.splog.info(
        `Enabled auto-merge for #${number} (${chalk.cyan(branch)}).${
          prs.length > 1
            ? ' Run `ch merge` again once it lands to merge the rest.'
            : ''
        }`
      );
      return;
    }
    context.splog.info(`Merged #${number} (${chalk.green(branch)}).`);
  }
  context.splog.tip(
    `Run ${chalk.cyan('ch sync')} to delete the merged branches locally.`
  );
}

function stackPrs(context: TContext): { branch: string; number: number }[] {
  const current = context.engine.currentBranchPrecondition;
  if (context.engine.isTrunk(current)) {
    throw new PreconditionsFailedError('Nothing to merge from trunk.');
  }
  const prs = context.engine
    .getRelativeStack(current, SCOPE.DOWNSTACK)
    .map((branch) => ({ branch, info: context.engine.getPrInfo(branch) }));
  const notOpen = prs.filter(
    ({ info }) =>
      info?.number === undefined ||
      (info.state !== undefined && info.state !== 'OPEN')
  );
  if (notOpen.length > 0) {
    throw new PreconditionsFailedError(
      [
        `No open PR for: ${notOpen
          .map(({ branch }) => chalk.yellow(branch))
          .join(', ')}.`,
        `Run ${chalk.cyan('ch submit')} (or ${chalk.cyan(
          'ch sync'
        )} if some already merged) first.`,
      ].join('\n')
    );
  }
  return prs.map(({ branch, info }) => ({
    branch,
    number: info?.number as number,
  }));
}

async function confirm(context: TContext): Promise<boolean> {
  return (
    (
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: 'Merge these PRs?',
        initial: true,
      })
    ).value === true
  );
}
