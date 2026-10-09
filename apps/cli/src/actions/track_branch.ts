import chalk from 'chalk';
import { TContext } from '../lib/context';
import { ExitFailedError, KilledError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { suggest } from '../lib/utils/prompts_helpers';
import { checkoutBranch } from './checkout_branch';

export async function trackBranchInteractive(
  context: TContext
): Promise<boolean> {
  const parentBranchName = context.engine.currentBranchPrecondition;
  const choices = context.engine.allBranchNames
    .filter(
      (branchName) =>
        !context.engine.isTrunk(branchName) &&
        !context.engine.isBranchTracked(branchName) &&
        (context.engine.isTrunk(parentBranchName) ||
          context.engine.isDescendantOf(branchName, parentBranchName))
    )
    .map((branchName) => ({ title: branchName, value: branchName }));

  if (!choices.length) {
    context.splog.info(
      `No branches available to track as children of ${chalk.blueBright(
        parentBranchName
      )}!`
    );
    return false;
  }

  const branchName = (
    await context.prompts({
      type: 'autocomplete',
      name: 'value',
      message: `Enter a branch to track as a child of ${parentBranchName} (autocomplete or arrow keys)`,
      choices,
      suggest,
    })
  ).value;

  if (!branchName) {
    throw new KilledError();
  }

  trackHelper({ branchName, parentBranchName }, context);
  await checkoutBranch({ branchName }, context);
  return true;
}

function getPotentialParents(
  branchName: string,
  exclude: Set<string>,
  context: TContext
): { title: string; value: string }[] {
  return context.engine.allBranchNames
    .filter(
      (potentialParentBranchName) =>
        !exclude.has(potentialParentBranchName) &&
        (context.engine.isTrunk(potentialParentBranchName) ||
          context.engine.isDescendantOf(branchName, potentialParentBranchName))
    )
    .sort((left, right) => {
      return left === right
        ? 0
        : context.engine.isTrunk(right) ||
          context.engine.isDescendantOf(left, right)
        ? -1 // left is a descendant of right
        : 1; // left is not a descendant of right
    })
    .map((parent) => {
      const count = countCommits(parent, branchName);
      return {
        title: `${parent} (${count} commit${count === 1 ? '' : 's'})`,
        value: parent,
      };
    });
}

function countCommits(base: string, head: string): number {
  return parseInt(
    runGitCommand({
      args: ['rev-list', '--count', `${base}..${head}`],
      onError: 'throw',
      resource: 'countCommits',
    }),
    10
  );
}

// Tracks the branch, first tracking each untracked ancestor chosen as a parent,
// until it reaches trunk or a tracked branch.
async function trackRecursively(
  {
    branchName,
    force,
    chain = new Set([branchName]),
  }: { branchName: string; force: boolean; chain?: Set<string> },
  context: TContext
): Promise<void> {
  const choices = getPotentialParents(branchName, chain, context);
  if (choices.length === 0) {
    throw new ExitFailedError(
      `No possible parents for ${branchName}. Try running \`git rebase ${context.engine.trunk} ${branchName}\``
    );
  }

  if (!force && choices.length > 1 && !context.interactive) {
    throw new ExitFailedError(
      `Multiple possible parents for ${branchName}; cannot prompt in non-interactive mode. Pass \`--parent\` or \`--force\`.`
    );
  }

  const parentBranchName =
    force || choices.length === 1
      ? choices[0].value
      : (
          await context.prompts({
            type: 'autocomplete',
            name: 'branch',
            message: `Select a parent for ${branchName} (autocomplete or arrow keys)`,
            choices,
            suggest,
          })
        ).branch;

  if (
    !context.engine.isTrunk(parentBranchName) &&
    !context.engine.isBranchTracked(parentBranchName)
  ) {
    await trackRecursively(
      {
        branchName: parentBranchName,
        force,
        chain: chain.add(parentBranchName),
      },
      context
    );
  }
  trackHelper({ branchName, parentBranchName }, context);
}

export async function trackBranch(
  args: {
    branchName: string | undefined;
    parentBranchName: string | undefined;
    force: boolean;
  },
  context: TContext
): Promise<void> {
  const branchName = args.branchName ?? context.engine.currentBranch;
  if (!branchName) {
    throw new ExitFailedError(`No branch checked out.`);
  }
  if (context.engine.isTrunk(branchName)) {
    throw new ExitFailedError(`Can't track trunk!`);
  }

  if (args.force || !args.parentBranchName) {
    await trackRecursively({ branchName, force: args.force }, context);
    return;
  }

  if (
    !context.engine.isTrunk(args.parentBranchName) &&
    !context.engine.isDescendantOf(branchName, args.parentBranchName)
  ) {
    context.splog.tip(
      `Are you sure that ${chalk.cyan(
        args.parentBranchName
      )} is the right parent for ${chalk.cyan(
        branchName
      )}?  If so, you can fix its history with ${chalk.cyan(
        `git rebase ${args.parentBranchName} ${branchName}`
      )} and then try again.`
    );

    throw new ExitFailedError(
      `${chalk.yellow(
        args.parentBranchName
      )} is not in the history of ${chalk.yellow(branchName)}.`
    );
  }

  trackHelper({ branchName, parentBranchName: args.parentBranchName }, context);
}

function trackHelper(
  {
    branchName,
    parentBranchName,
  }: {
    branchName: string;
    parentBranchName: string;
  },
  context: TContext
) {
  context.engine.trackBranch(branchName, parentBranchName);
  context.splog.info(
    `Tracked branch ${chalk.green(branchName)} with parent ${chalk.cyan(
      parentBranchName
    )}.`
  );
}
