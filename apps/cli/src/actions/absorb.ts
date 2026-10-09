import chalk from 'chalk';
import { spawnSync } from 'child_process';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import {
  BlockedDuringRebaseError,
  ExitFailedError,
  PreconditionsFailedError,
} from '../lib/errors';
import { detachAt } from '../lib/git/plumbing';
import { runGitCommand } from '../lib/git/runner';
import {
  ensureSomeStagedChangesPrecondition,
  stageChanges,
} from '../lib/preconditions';
import { restackBranches, withChangesSetAside } from './restack';

// git-absorb writes `fixup!` commits onto a detached HEAD; an autosquash rebase
// folds them into their targets in one linear history from trunk. Autosquash
// only removes the fixups, so the N-th surviving commit is the rewrite of the
// N-th original one, which is how each downstack branch finds its new tip.
export async function absorbAction(
  opts: { all: boolean; dryRun: boolean; force: boolean; patch: boolean },
  context: TContext
): Promise<void> {
  const downstack = absorbPreconditions(context);
  const current = downstack[downstack.length - 1];
  const base = context.engine.getBaseRevision(downstack[0]);

  // `--all` here leaves untracked files out: a new file is never absorbed.
  await stageChanges(opts, context, { untracked: false });
  ensureSomeStagedChangesPrecondition(context);

  if (opts.dryRun || (!opts.force && context.interactive)) {
    runAbsorb(['--dry-run', '--base', base]);
    if (opts.dryRun || !(await confirm(context))) {
      return;
    }
  }

  const original = context.engine.getRevision(current);
  const before = revList(base, original);
  detachAt(original);
  try {
    runAbsorb(['--force-detach', '--base', base]);
  } catch (e) {
    context.engine.checkoutBranch(current);
    throw e;
  }
  const unabsorbed = stagedHunkCount();
  if (git(['rev-parse', 'HEAD']) === original) {
    context.engine.checkoutBranch(current);
    context.splog.info('Nothing could be absorbed.');
    return;
  }

  // Whatever git-absorb couldn't place stays uncommitted and comes back.
  withChangesSetAside('ALL', context, () => {
    const after = squashFixups(base, original, before.length);
    if (!after) {
      context.engine.checkoutBranch(current);
      throw new ExitFailedError(
        'The absorbed changes did not squash cleanly into the stack; nothing was changed and they are staged again.'
      );
    }
    downstack.forEach((branch, i) =>
      context.engine.setBranchRevision(
        branch,
        after[before.indexOf(context.engine.getRevision(branch))],
        i === 0 ? base : context.engine.getRevision(downstack[i - 1])
      )
    );
    context.engine.checkoutBranch(current);
    restackBranches(
      context.engine.getRelativeStack(downstack[0], SCOPE.UPSTACK_EXCLUSIVE),
      context
    );
  });
  context.splog.info(
    `Absorbed staged changes into ${chalk.green(current)}'s stack.`
  );
  if (unabsorbed > 0) {
    context.splog.info(
      `${unabsorbed} hunk${
        unabsorbed === 1 ? ' was' : 's were'
      } not absorbed and left uncommitted.`
    );
  }
}

function stagedHunkCount(): number {
  return git(['diff', '--cached', '--no-ext-diff', '-U0'])
    .split('\n')
    .filter((l) => l.startsWith('@@')).length;
}

function absorbPreconditions(context: TContext): string[] {
  if (context.engine.rebaseInProgress()) {
    throw new BlockedDuringRebaseError();
  }
  if (spawnSync('git-absorb', ['--version']).error) {
    throw new ExitFailedError(
      `\`git-absorb\` is not installed. Install it with ${chalk.cyan(
        'brew install git-absorb'
      )} (or see https://github.com/tummychow/git-absorb).`
    );
  }
  const current = context.engine.currentBranchPrecondition;
  if (context.engine.isTrunk(current)) {
    throw new PreconditionsFailedError('Cannot absorb into trunk.');
  }
  const downstack = context.engine.getRelativeStack(current, SCOPE.DOWNSTACK);
  downstack.forEach((b) => context.engine.assertNotFrozen(b));
  const unfixed = downstack.filter((b) => !context.engine.isBranchFixed(b));
  if (unfixed.length > 0) {
    throw new PreconditionsFailedError(
      `${unfixed
        .map((b) => chalk.yellow(b))
        .join(', ')} need restacking; run ${chalk.cyan('ch restack')} first.`
    );
  }
  const base = context.engine.getBaseRevision(downstack[0]);
  if (
    git(['log', '--format=%s', `${base}..HEAD`])
      .split('\n')
      .some((s) => /^(fixup|squash|amend)! /.test(s))
  ) {
    throw new PreconditionsFailedError(
      'The stack already has fixup!/squash!/amend! commits; squash them first.'
    );
  }
  return downstack;
}

// Returns the rewritten commits base..HEAD, oldest first. On failure, puts the
// absorbed changes back in the index on top of `original`.
function squashFixups(
  base: string,
  original: string,
  expectedCount: number
): string[] | undefined {
  let after: string[] | undefined;
  try {
    git(['rebase', '-i', '--autosquash', base], {
      env: { ...process.env, GIT_SEQUENCE_EDITOR: 'true' },
    });
    after = revList(base, 'HEAD');
  } catch {
    git(['rebase', '--abort'], {}, 'ignore');
  }
  if (after?.length === expectedCount) {
    return after;
  }
  git(['reset', '--soft', original]);
  return undefined;
}

async function confirm(context: TContext): Promise<boolean> {
  return (
    (
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: 'Absorb these changes?',
        initial: true,
      })
    ).value === true
  );
}

function runAbsorb(args: string[]): void {
  const result = spawnSync('git', ['absorb', ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new ExitFailedError('`git absorb` failed.');
  }
}

function revList(base: string, head: string): string[] {
  return git(['rev-list', '--reverse', `${base}..${head}`])
    .split('\n')
    .filter((l) => l);
}

function git(
  args: string[],
  options: Parameters<typeof runGitCommand>[0]['options'] = {},
  onError: 'throw' | 'ignore' = 'throw'
): string {
  return runGitCommand({ args, options, onError, resource: 'absorb' });
}
