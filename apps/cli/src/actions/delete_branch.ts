import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { githubRepoSlug } from '../lib/api/github_repo';
import { TContext } from '../lib/context';
import { SCOPE, TScopeSpec } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';
import { restackBranches } from './restack';

export function deleteBranchAction(
  args: {
    branchName: string;
    force?: boolean;
  },
  context: TContext
): void {
  assertDeletable([args.branchName], args.force, context);
  deleteBranches([args.branchName], context);
}

export async function deleteStackAction(
  args: {
    branchName?: string;
    force: boolean;
    scope: TScopeSpec;
    close: boolean;
  },
  context: TContext
): Promise<void> {
  const branchName =
    args.branchName ?? context.engine.currentBranchPrecondition;
  const branchNames = context.engine.getRelativeStack(branchName, args.scope);
  assertDeletable(branchNames, args.force, context);

  if (
    branchNames.length > 1 &&
    !args.force &&
    !(await confirmDelete(branchNames, context))
  ) {
    context.splog.info('Delete cancelled.');
    return;
  }

  const prNumbers = args.close ? openPrNumbers(branchNames, context) : [];
  deleteBranches(branchNames, context);
  prNumbers.forEach((prNumber) => closePr(prNumber, context));
}

function assertDeletable(
  branchNames: string[],
  force: boolean | undefined,
  context: TContext
): void {
  if (branchNames.some((b) => context.engine.isTrunk(b))) {
    throw new ExitFailedError('Cannot delete trunk!');
  }
  const unsafe = force
    ? []
    : branchNames.filter((b) => !isSafeToDelete(b, context).result);
  if (unsafe.length === 1) {
    throw new ExitFailedError(
      [
        `The branch ${unsafe[0]} is neither merged nor closed.  Use the \`--force\` option to delete it.`,
        `Note that its changes will be lost, as its children will be restacked onto its parent.`,
      ].join('\n')
    );
  }
  if (unsafe.length > 1) {
    throw new ExitFailedError(
      [
        `These branches are neither merged nor closed: ${unsafe.join(', ')}.`,
        `Use the \`--force\` option to delete them. Their changes will be lost.`,
      ].join('\n')
    );
  }
}

async function confirmDelete(
  branchNames: string[],
  context: TContext
): Promise<boolean> {
  context.splog.info('Branches to delete:');
  branchNames.forEach((b) => context.splog.info(`  - ${chalk.red(b)}`));
  return (
    !context.interactive ||
    (
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: `Delete these ${branchNames.length} branches?`,
        initial: true,
      })
    ).value
  );
}

// Children of deleted branches that survive are restacked once at the end,
// onto whatever ancestor survives.
function deleteBranches(branchNames: string[], context: TContext): void {
  const deleted = new Set(branchNames);
  const branchesToRestack = [
    ...new Set(
      branchNames.flatMap((b) =>
        context.engine.getRelativeStack(b, SCOPE.UPSTACK_EXCLUSIVE)
      )
    ),
  ].filter((b) => !deleted.has(b));

  [...branchNames].reverse().forEach((b) => {
    context.engine.deleteBranch(b);
    context.splog.info(`Deleted branch ${chalk.red(b)}`);
  });

  restackBranches(branchesToRestack, context);
}

function openPrNumbers(branchNames: string[], context: TContext): number[] {
  return branchNames.flatMap((b) => {
    const prInfo = context.engine.getPrInfo(b);
    return prInfo?.number && prInfo.state === 'OPEN' ? [prInfo.number] : [];
  });
}

function closePr(prNumber: number, context: TContext): void {
  try {
    execFileSync(
      'gh',
      ['pr', 'close', `${prNumber}`, '--repo', githubRepoSlug(context)],
      { stdio: 'pipe' }
    );
    context.splog.info(`Closed PR #${prNumber}`);
  } catch {
    context.splog.warn(`Failed to close PR #${prNumber}.`);
  }
}

// Where did we merge this? If it was merged on GitHub, we see where it was
// merged into. If we don't detect that it was merged in GitHub but we do
// see the code in trunk, we fallback to say that it was merged into trunk.
// This extra check (rather than just saying trunk) is used to catch the
// case where one feature branch is merged into another on GitHub.
export function isSafeToDelete(
  branchName: string,
  context: TContext
): { result: true; reason: string } | { result: false } {
  const prInfo = context.engine.getPrInfo(branchName);

  const reason =
    prInfo?.state === 'CLOSED'
      ? `${chalk.redBright(branchName)} is closed on GitHub`
      : prInfo?.state === 'MERGED'
      ? `${chalk.green(branchName)} is merged into ${chalk.cyan(
          prInfo?.base ?? context.engine.trunk
        )}`
      : context.engine.isMergedIntoTrunk(branchName)
      ? `${chalk.green(branchName)} is merged into ${chalk.cyan(
          context.engine.trunk
        )}`
      : context.engine.isBranchEmpty(branchName)
      ? `${chalk.yellow(branchName)} is empty`
      : undefined;

  return reason ? { result: true, reason } : { result: false };
}
