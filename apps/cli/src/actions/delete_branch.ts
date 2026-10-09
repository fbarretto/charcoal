import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { githubRepoSlug } from '../lib/api/github_repo';
import { TContext } from '../lib/context';
import { SCOPE, TScopeSpec } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';
import { interactiveBranchSelection } from './log';
import { restackBranches } from './restack';
import { unstackPrs } from './submit/link_gh_stack';

export function deleteBranchAction(
  args: {
    branchName: string;
    force?: boolean;
  },
  context: TContext
): void {
  assertDeletable([args.branchName], context);
  assertSafeToDelete(
    args.force ? [] : unsafeBranches([args.branchName], context)
  );
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
  const branchName = args.branchName ?? (await selectBranchToDelete(context));
  const branchNames = context.engine.getRelativeStack(branchName, args.scope);
  assertDeletable(branchNames, context);
  const unsafe = args.force ? [] : unsafeBranches(branchNames, context);
  if (!context.interactive) {
    assertSafeToDelete(unsafe);
  }

  if (
    (branchNames.length > 1 || unsafe.length > 0) &&
    !args.force &&
    !(await confirmDelete(branchNames, unsafe, context))
  ) {
    context.splog.info('Delete cancelled.');
    return;
  }

  const prNumbers = args.close ? openPrNumbers(branchNames, context) : [];
  deleteBranches(branchNames, context);
  closePrs(prNumbers, context);
}

async function selectBranchToDelete(context: TContext): Promise<string> {
  if (!context.interactive) {
    throw new ExitFailedError(
      'No branch specified. Pass the name of the branch to delete.'
    );
  }
  return interactiveBranchSelection(
    { message: 'Select a branch to delete (autocomplete or arrow keys)' },
    context
  );
}

function assertDeletable(branchNames: string[], context: TContext): void {
  if (branchNames.some((b) => context.engine.isTrunk(b))) {
    throw new ExitFailedError('Cannot delete trunk!');
  }
  branchNames.forEach((b) =>
    context.engine.assertNotFrozen(b, { allowLanded: true })
  );
}

function unsafeBranches(branchNames: string[], context: TContext): string[] {
  return branchNames.filter((b) => !isSafeToDelete(b, context).result);
}

function assertSafeToDelete(unsafe: string[]): void {
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
  unsafe: string[],
  context: TContext
): Promise<boolean> {
  context.splog.info('Branches to delete:');
  branchNames.forEach((b) =>
    context.splog.info(
      `  - ${chalk.red(b)}${
        unsafe.includes(b) ? chalk.yellow(' (not merged or closed)') : ''
      }`
    )
  );
  return (
    !context.interactive ||
    (
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: unsafe.length
          ? `${unsafe.join(', ')} ${
              unsafe.length === 1 ? 'is' : 'are'
            } neither merged nor closed; ${
              unsafe.length === 1 ? 'its' : 'their'
            } changes will be lost. Delete ${
              branchNames.length === 1
                ? 'it'
                : `these ${branchNames.length} branches`
            } anyway?`
          : `Delete these ${branchNames.length} branches?`,
        initial: unsafe.length === 0,
      })
    ).value
  );
}

// Surviving children are restacked onto their nearest surviving ancestor
// before anything is deleted (see TRestackFollowUp).
function deleteBranches(branchNames: string[], context: TContext): void {
  const deleted = new Set(branchNames);
  const branchesToRestack = [
    ...new Set(
      branchNames.flatMap((b) =>
        context.engine.getRelativeStack(b, SCOPE.UPSTACK_EXCLUSIVE)
      )
    ),
  ].filter((b) => !deleted.has(b));

  const survivingAncestor = (b: string): string => {
    const parent = context.engine.getParentPrecondition(b);
    return deleted.has(parent) ? survivingAncestor(parent) : parent;
  };
  const pendingParents = Object.fromEntries(
    branchesToRestack
      .filter((b) => deleted.has(context.engine.getParentPrecondition(b)))
      .map((b) => [b, survivingAncestor(b)])
  );

  restackBranches(branchesToRestack, context, {
    pendingParents,
    branchesToDelete: [...branchNames].reverse(),
  });
}

export function openPrNumbers(
  branchNames: string[],
  context: TContext
): number[] {
  return branchNames.flatMap((b) => {
    const prInfo = context.engine.getPrInfo(b);
    return prInfo?.number && prInfo.state === 'OPEN' ? [prInfo.number] : [];
  });
}

// Closes the PRs, then dissolves the GitHub stacks that held them: GitHub
// keeps closed PRs listed in a stack. The next submit relinks the rest.
export function closePrs(prNumbers: number[], context: TContext): void {
  prNumbers.forEach((prNumber) => closePr(prNumber, context));
  if (!prNumbers.length || !context.repoConfig.getGithubStacks()) {
    return;
  }
  try {
    unstackPrs(prNumbers, context).forEach((n) =>
      context.splog.info(
        `Dissolved GitHub stack #${n}, which held a closed PR; ${chalk.cyan(
          'ch submit --stack'
        )} relinks the rest.`
      )
    );
  } catch (err) {
    context.splog.warn(
      `Could not update the GitHub stack: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
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
