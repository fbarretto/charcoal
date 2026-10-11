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
  getPrStatus,
  getRequiredChecks,
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
  wait: boolean;
  timeoutMinutes: number;
};

type TPr = { branch: string; number: number };

// What the run has done so far, for the summary when it stops or is
// interrupted. `armed`: auto-merge is enabled on `current`.
type TProgress = { merged: number[]; current?: TPr; armed: boolean };

// Merges trunk -> current bottom-up. Before each PR after the first, its
// branch is reparented onto the freshly pulled trunk, restacked (the stored
// parent revision drops the merged parent's commits even after a squash),
// retargeted and pushed, so GitHub sees exactly that branch's changes.
// Each PR is merged once GitHub says it is ready: under strict branch
// protection that push restarts its checks, so merge waits for them.
export async function mergeAction(
  opts: TMergeOpts,
  context: TContext
): Promise<void> {
  if (!(opts.timeoutMinutes > 0)) {
    throw new PreconditionsFailedError(
      '--timeout must be a positive number of minutes.'
    );
  }
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
  const progress: TProgress = { merged: [], armed: false };
  const run = { prs, repo, opts, progress, wait: waitOptsOf(opts, context) };
  // Runs before the runner's own SIGINT handler, which exits.
  const onInterrupt = () =>
    context.splog.warn(
      `${summary('Interrupted', prs, progress)} Run ${chalk.cyan(
        'ch sync'
      )}, then ${chalk.cyan('ch merge')} again to continue.`
    );
  process.prependListener('SIGINT', onInterrupt);
  try {
    const stack = ghStackOf(prs, repo);
    if (stack) {
      await mergeStackWhenReady({ ...run, stack }, context);
    } else {
      await mergeEach(run, context);
    }
  } catch (e) {
    if (progress.current) {
      context.splog.error(summary('Stopped', prs, progress));
    }
    throw e;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
  if (!progress.merged.length) {
    return;
  }
  context.splog.tip(
    `Run ${chalk.cyan('ch sync')} to delete the merged branches locally.`
  );
}

type TRun = {
  prs: TPr[];
  repo: string;
  opts: TMergeOpts;
  progress: TProgress;
  wait: TWaitOpts;
};

async function mergeEach(run: TRun, context: TContext): Promise<void> {
  const { prs, repo, opts, progress } = run;
  const trunk = context.engine.trunk;
  for (const [i, pr] of prs.entries()) {
    progress.current = pr;
    if (i > 0) {
      if (context.engine.pullTrunk() === 'PULL_CONFLICT') {
        throw new ExitFailedError(
          `${chalk.yellow(trunk)} could not be fast-forwarded; run ${chalk.cyan(
            'ch sync'
          )} and retry.`
        );
      }
      context.engine.setParent(pr.branch, trunk);
      restackBranches([pr.branch], context);
      await retarget(pr.number, repo, trunk);
      context.engine.pushBranch(pr.branch, false);
    }
    if (!opts.auto) {
      await mergeWhenReady(pr.number, repo, { ...run.wait, opts });
    } else {
      // GitHub refuses to arm auto-merge on a draft, or while mergeability
      // is unknown.
      const status = await poll(
        () => getPrStatus(pr.number, repo),
        (s) => s.mergeable !== 'UNKNOWN' && s.mergeStateStatus !== 'UNKNOWN',
        MERGEABLE_TIMEOUT_MS
      );
      if (status.isDraft) {
        throw new ExitFailedError(draftMessage(pr.number));
      }
      await mergePr(pr.number, repo, { method: opts.method, auto: true });
      progress.armed = true;
      const enabled = `Enabled auto-merge for #${pr.number} (${chalk.cyan(
        pr.branch
      )})`;
      if (!opts.wait) {
        context.splog.info(
          `${enabled}.${
            prs.length > 1
              ? ' Run `ch merge` again once it lands to merge the rest.'
              : ''
          }`
        );
        progress.current = undefined;
        return;
      }
      context.splog.info(`${enabled}; waiting for GitHub to merge it.`);
      await waitForPr(pr.number, repo, { ...run.wait, armed: true });
      progress.armed = false;
    }
    progress.merged.push(pr.number);
    context.splog.info(`Merged #${pr.number} (${chalk.green(pr.branch)}).`);
  }
  progress.current = undefined;
}

// GitHub's async merge refuses a stack whose PRs aren't ready yet, so wait
// for each of them first.
async function mergeStackWhenReady(
  run: TRun & { stack: TGhStack },
  context: TContext
): Promise<void> {
  const { prs, repo, opts, progress } = run;
  if (opts.wait) {
    for (const pr of prs) {
      progress.current = pr;
      await waitForPr(pr.number, repo, run.wait);
    }
  }
  progress.current = undefined;
  await mergeStack(
    { prs, stack: run.stack, repo, method: opts.method, auto: opts.auto },
    context
  );
  progress.merged = prs.map((pr) => pr.number);
}

// "Stopped at #2 (b); left untouched: #3; already merged: #1."
function summary(verb: string, prs: TPr[], progress: TProgress): string {
  const { current, merged, armed } = progress;
  if (!current) {
    return `${verb}${
      merged.length ? `; already merged: ${prList(merged)}` : ''
    }.`;
  }
  const rest = prs.slice(prs.indexOf(current) + 1).map((pr) => pr.number);
  return (
    [
      `${verb} at #${current.number} (${current.branch})`,
      ...(rest.length ? [`left untouched: ${prList(rest)}`] : []),
      ...(merged.length ? [`already merged: ${prList(merged)}`] : []),
      ...(armed ? [`auto-merge is still enabled on #${current.number}`] : []),
    ].join('; ') + '.'
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

// GitHub refuses `gh pr merge` (and auto-merge) on a stacked PR; its async
// merge API merges the whole stack up to and including the PR it is called
// on, or adds it to the merge queue if the base branch has one.
async function mergeStack(
  opts: {
    prs: TPr[];
    stack: TGhStack;
    repo: string;
    method: 'squash' | 'merge' | 'rebase';
    auto: boolean;
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
    default: {
      const reason = (result.details?.message ?? result.status).replace(
        /\.$/,
        ''
      );
      const hint = opts.auto
        ? ' GitHub does not support auto-merge for stacked PRs (only a merge queue on the base branch); run `ch merge` again once checks and reviews pass.'
        : '';
      throw fail(`was not merged: ${reason}.${hint}`);
    }
  }
}

// GitHub can still refuse with "Base branch was modified" when its own
// retarget lands after mergeability was computed; wait again and retry.
async function mergeWhenReady(
  number: number,
  repo: string,
  w: TWaitOpts & { opts: TMergeOpts }
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await waitForPr(number, repo, w);
    try {
      return await mergePr(number, repo, {
        method: w.opts.method,
        auto: false,
      });
    } catch (err) {
      const baseModified =
        err instanceof Error && /Base branch was modified/.test(err.message);
      if (!baseModified || attempt === 3) {
        throw err;
      }
      await sleep(pollDelay(attempt * 2000)); // let GitHub's retarget settle
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

// wait: false stops instead of waiting on checks or reviews. waitForReview:
// keep waiting on a missing approval instead of stopping. armed: auto-merge
// is enabled, so the wait ends when GitHub has merged the PR.
type TWaitOpts = {
  wait: boolean;
  timeoutMs: number;
  waitForReview: boolean;
  armed?: boolean;
  log: (message: string) => void;
};

const waitOptsOf = (opts: TMergeOpts, context: TContext): TWaitOpts => ({
  wait: opts.wait,
  timeoutMs: opts.timeoutMinutes * 60 * 1000,
  waitForReview: opts.auto,
  log: (message) => context.splog.info(message),
});

// A wait with a `limit` is GitHub catching up (recomputing mergeability,
// checks not started yet): it is quiet, and gives up after limit.ms.
type TVerdict =
  | { kind: 'done' }
  | { kind: 'stop'; message: string }
  | { kind: 'wait'; reason: string; limit?: { ms: number; message: string } };

// Polls until the PR is ready to merge (armed: merged), printing what it
// waits on whenever that changes and once a minute.
async function waitForPr(
  number: number,
  repo: string,
  w: TWaitOpts
): Promise<void> {
  const start = Date.now();
  let reason: string | undefined;
  let since = start;
  let printed = 0;
  for (let delay = 1000; ; delay = Math.min(delay * 2, 10000)) {
    const verdict = await assess(number, repo, w);
    if (verdict.kind === 'done') {
      return;
    }
    if (verdict.kind === 'stop') {
      throw new ExitFailedError(verdict.message);
    }
    const now = Date.now();
    if (verdict.reason !== reason) {
      [reason, since, printed] = [verdict.reason, now, 0];
    }
    const { limit } = verdict;
    if (limit && now - since >= limit.ms) {
      throw new ExitFailedError(limit.message);
    }
    if (!limit && !w.wait) {
      throw new ExitFailedError(
        `#${number} is still ${reason}; run \`ch merge\` again later, or without --no-wait to wait.`
      );
    }
    if (now - start + pollDelay(delay) > w.timeoutMs) {
      throw new ExitFailedError(
        `#${number} was still ${reason} after ${
          w.timeoutMs / 60000
        } minutes; run \`ch merge\` again to keep waiting.`
      );
    }
    if (!limit && now - printed >= 60 * 1000) {
      const elapsed = printed ? ` (${Math.round((now - start) / 60000)}m)` : '';
      w.log(`#${number} ${reason}${elapsed}`);
      printed = now;
    }
    await sleep(pollDelay(delay));
  }
}

async function assess(
  number: number,
  repo: string,
  w: TWaitOpts
): Promise<TVerdict> {
  const s = await getPrStatus(number, repo);
  const stop = (message: string): TVerdict => ({ kind: 'stop', message });
  if (s.state === 'MERGED') {
    return w.armed
      ? { kind: 'done' }
      : stop(`#${number} is already merged; run \`ch sync\`.`);
  }
  if (s.state === 'CLOSED') {
    return stop(`#${number} was closed.`);
  }
  if (s.isDraft) {
    return stop(draftMessage(number));
  }
  if (s.mergeable === 'CONFLICTING' || s.mergeStateStatus === 'DIRTY') {
    return stop(`#${number} has conflicts with its base.`);
  }
  if (s.mergeable === 'UNKNOWN' || s.mergeStateStatus === 'UNKNOWN') {
    // Right after a retarget and push, while GitHub recomputes.
    return {
      kind: 'wait',
      reason: 'being checked for mergeability by GitHub',
      limit: {
        ms: MERGEABLE_TIMEOUT_MS,
        message: `GitHub was still computing whether #${number} is mergeable after ${
          MERGEABLE_TIMEOUT_MS / 1000
        }s; run \`ch merge\` again.`,
      },
    };
  }
  if (s.mergeStateStatus === 'BEHIND') {
    return stop(
      `#${number} is behind its base branch; run \`ch sync\` and \`ch submit\`, then \`ch merge\` again.`
    );
  }
  if (w.armed && !s.autoMergeRequest) {
    return stop(`#${number} no longer has auto-merge enabled.`);
  }
  if (s.mergeStateStatus !== 'BLOCKED') {
    // CLEAN, UNSTABLE (only optional checks failing), HAS_HOOKS
    return w.armed
      ? { kind: 'wait', reason: 'waiting for GitHub to merge it' }
      : { kind: 'done' };
  }
  return assessBlocked(number, repo, { ...w, status: s });
}

async function assessBlocked(
  number: number,
  repo: string,
  w: TWaitOpts & { status: { reviewDecision: string } }
): Promise<TVerdict> {
  const stop = (message: string): TVerdict => ({ kind: 'stop', message });
  if (w.status.reviewDecision === 'CHANGES_REQUESTED') {
    return stop(`#${number} has changes requested.`);
  }
  const checks = await getRequiredChecks(number, repo);
  const named = (bucket: string[]) =>
    checks
      .filter((c) => bucket.includes(c.bucket))
      .map((c) => `${c.name} (${c.state.toLowerCase().replace(/_/g, ' ')})`);
  const failed = named(['fail', 'cancel']);
  if (failed.length) {
    return stop(`#${number} failed required checks: ${failed.join(', ')}.`);
  }
  const pending = named(['pending']);
  if (pending.length) {
    return {
      kind: 'wait',
      reason: `waiting on required checks: ${pending.join(', ')}`,
    };
  }
  if (w.status.reviewDecision === 'REVIEW_REQUIRED') {
    return w.waitForReview
      ? { kind: 'wait', reason: 'waiting on an approving review' }
      : stop(
          `#${number} needs an approving review; run \`ch merge\` again once it is approved, or \`ch merge --auto\` to wait for it.`
        );
  }
  if (w.armed) {
    return { kind: 'wait', reason: 'waiting for GitHub to merge it' };
  }
  // Right after a push, required checks can take a moment to appear.
  return {
    kind: 'wait',
    reason: 'blocked by branch protection',
    limit: {
      ms: MERGEABLE_TIMEOUT_MS,
      message: `#${number} is blocked by branch protection, not by a check or review ch can see; check the PR on GitHub.`,
    },
  };
}

const MERGEABLE_TIMEOUT_MS = 2 * 60 * 1000;
const STACK_MERGE_TIMEOUT_MS = 5 * 60 * 1000;

const draftMessage = (number: number) =>
  `#${number} is a draft; run \`ch submit --publish\` to mark it ready, then \`ch merge\` again.`;

const prList = (prs: number[]) => prs.map((n) => `#${n}`).join(', ');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tests shorten every poll and retry delay.
const pollDelay = (ms: number): number =>
  process.env.TEST_CH_MERGE_POLL_MS === undefined
    ? ms
    : Number(process.env.TEST_CH_MERGE_POLL_MS);

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
    await sleep(pollDelay(delay));
  }
}

function stackPrs(context: TContext): TPr[] {
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
