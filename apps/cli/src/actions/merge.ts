import chalk from 'chalk';
import {
  findStackForPr,
  getAsyncMerge,
  GhApiError,
  mergeAsync,
  openPrNumbersOf,
  TAsyncMerge,
  TGhStack,
} from '../lib/api/gh_stacks';
import { githubRepoSlug } from '../lib/api/github_repo';
import {
  getPrBase,
  getPrMergeState,
  mergePr,
  setPrBase,
} from '../lib/api/pr_info';
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
  const stack = opts.auto ? undefined : ghStackOf(prs, repo);
  if (stack) {
    await mergeStack({ prs, stack, repo, method: opts.method }, context);
    context.splog.tip(
      `Run ${chalk.cyan('ch sync')} to delete the merged branches locally.`
    );
    return;
  }
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
      await retarget(number, repo, trunk);
      context.engine.pushBranch(branch, false);
    }
    try {
      const mergeOpts = { method: opts.method, auto: opts.auto };
      if (i > 0) {
        await mergeAfterRetarget(number, repo, mergeOpts);
      } else {
        await mergePr(number, repo, mergeOpts);
      }
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

// The GitHub stack holding these PRs, if they are stacked. Its open PRs must
// start with them, since GitHub merges a stack bottom-up.
function ghStackOf(
  prs: { number: number }[],
  repo: string
): TGhStack | undefined {
  let stack: TGhStack | undefined;
  try {
    stack = findStackForPr(repo, prs[0].number);
  } catch (err) {
    if (err instanceof GhApiError && err.status === 404) {
      return undefined; // stacked PRs are not enabled for this repo
    }
    throw err;
  }
  if (!stack) {
    return undefined;
  }
  const open = openPrNumbersOf(stack);
  if (!prs.every((pr, i) => open[i] === pr.number)) {
    throw new PreconditionsFailedError(
      `GitHub stack #${stack.number} (${prList(
        open
      )}) does not match this stack (${prList(
        prs.map((pr) => pr.number)
      )}). Run ${chalk.cyan('ch submit --stack')} to relink it, then retry.`
    );
  }
  return stack;
}

// GitHub refuses `gh pr merge` on a stacked PR; its async merge API merges
// the whole stack up to and including the PR it is called on.
async function mergeStack(
  opts: {
    prs: { branch: string; number: number }[];
    stack: TGhStack;
    repo: string;
    method: 'squash' | 'merge' | 'rebase';
  },
  context: TContext
): Promise<void> {
  const { prs, stack } = opts;
  const top = prs[prs.length - 1].number;
  const fail = (reason: string) =>
    new ExitFailedError(
      `GitHub stack #${stack.number} (${prList(
        prs.map((p) => p.number)
      )}) ${reason}`
    );
  let result: TAsyncMerge;
  try {
    result = mergeAsync(opts.repo, top, opts.method);
  } catch (err) {
    throw fail(`was not merged: ${err instanceof Error ? err.message : err}`);
  }
  const uuid = result.details?.uuid;
  if (result.status === 'pending' && uuid) {
    context.splog.info(`Waiting for GitHub to merge stack #${stack.number}...`);
    result = await poll(
      () => getAsyncMerge(opts.repo, top, uuid),
      (r) => r.status !== 'pending',
      STACK_MERGE_TIMEOUT_MS
    );
  }
  switch (result.status) {
    case 'merged':
      prs.forEach(({ branch, number }) =>
        context.splog.info(`Merged #${number} (${chalk.green(branch)}).`)
      );
      return;
    case 'enqueued':
      context.splog.info(
        `Added ${prList(prs.map((p) => p.number))} to the merge queue.`
      );
      return;
    case 'pending':
      throw fail(
        `was still merging after ${
          STACK_MERGE_TIMEOUT_MS / 1000
        }s; check the PRs on GitHub.`
      );
    default:
      throw fail(
        `was not merged: ${result.details?.message ?? result.status}.`
      );
  }
}

// GitHub can still refuse with "Base branch was modified" when its own
// retarget lands after mergeability was computed; wait again and retry.
async function mergeAfterRetarget(
  number: number,
  repo: string,
  opts: { method: 'squash' | 'merge' | 'rebase'; auto: boolean }
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await waitUntilMergeable(number, repo);
    try {
      return await mergePr(number, repo, opts);
    } catch (err) {
      const baseModified =
        err instanceof Error && /Base branch was modified/.test(err.message);
      if (!baseModified || attempt === 3) {
        throw err;
      }
      await sleep(attempt * 2000); // let GitHub's retarget settle
    }
  }
}

// With delete-branch-on-merge, GitHub retargets the next PR itself once its
// base branch is deleted, and then refuses the same edit from us.
async function retarget(
  number: number,
  repo: string,
  base: string
): Promise<void> {
  try {
    await setPrBase(number, repo, base);
  } catch (err) {
    if ((await getPrBase(number, repo)) !== base) {
      throw err;
    }
  }
}

// Right after a retarget and push GitHub reports mergeability as UNKNOWN
// while it recomputes, and refuses to merge until it knows.
async function waitUntilMergeable(number: number, repo: string): Promise<void> {
  const state = await poll(
    () => getPrMergeState(number, repo),
    (s) => s.mergeable !== 'UNKNOWN' && s.mergeStateStatus !== 'UNKNOWN',
    MERGEABLE_TIMEOUT_MS
  );
  if (state.mergeable === 'UNKNOWN' || state.mergeStateStatus === 'UNKNOWN') {
    throw new ExitFailedError(
      `GitHub was still computing whether #${number} is mergeable after ${
        MERGEABLE_TIMEOUT_MS / 1000
      }s; run \`ch merge\` again.`
    );
  }
  if (state.mergeable === 'CONFLICTING' || state.mergeStateStatus === 'DIRTY') {
    throw new ExitFailedError(`#${number} has conflicts with its base.`);
  }
  if (state.mergeStateStatus === 'BLOCKED') {
    throw new ExitFailedError(
      `#${number} is blocked by required checks or reviews; run \`ch merge\` again once they pass, or \`ch merge --auto\`.`
    );
  }
}

const MERGEABLE_TIMEOUT_MS = 2 * 60 * 1000;
const STACK_MERGE_TIMEOUT_MS = 5 * 60 * 1000;

const prList = (prs: number[]) => prs.map((n) => `#${n}`).join(', ');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls `get` with exponential backoff (1s doubling, capped at 10s) until
// `done` or the timeout, returning the last value either way.
async function poll<T>(
  get: () => T | Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (let delay = 1000; ; delay = Math.min(delay * 2, 10000)) {
    const value = await get();
    if (done(value) || Date.now() + delay > deadline) {
      return value;
    }
    await sleep(delay);
  }
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
