import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';
import { suggest } from '../lib/utils/prompts_helpers';
import { checkoutBranch } from './checkout_branch';

type TBranchNavigation =
  | {
      direction: 'UP' | 'DOWN';
      numSteps: number;
      to?: string;
    }
  | { direction: 'TOP' | 'BOTTOM' };
export async function switchBranchAction(
  branchNavigation: TBranchNavigation,
  context: TContext
): Promise<void> {
  const currentBranchName = context.engine.currentBranchPrecondition;
  if (
    'to' in branchNavigation &&
    branchNavigation.to &&
    !context.engine
      .getRelativeStack(currentBranchName, SCOPE.UPSTACK_EXCLUSIVE)
      .includes(branchNavigation.to)
  ) {
    throw new ExitFailedError(
      `${chalk.yellow(branchNavigation.to)} is not upstack of ${chalk.yellow(
        currentBranchName
      )}.`
    );
  }
  context.splog.info(chalk.blueBright(currentBranchName));
  const newBranchName = await traverseBranches(
    branchNavigation,
    currentBranchName,
    context
  );
  if (newBranchName !== currentBranchName) {
    await checkoutBranch({ branchName: newBranchName }, context);
    return;
  }
  const message = `Already at the ${
    branchNavigation.direction === 'DOWN' ||
    branchNavigation.direction === 'BOTTOM'
      ? 'bottom most'
      : 'top most'
  } branch in the stack.`;
  // gt exits non-zero when up/down can't move; top/bottom stay a no-op.
  if (
    branchNavigation.direction === 'UP' ||
    branchNavigation.direction === 'DOWN'
  ) {
    throw new ExitFailedError(message);
  }
  context.splog.info(message);
}

async function traverseBranches(
  branchNavigation: TBranchNavigation,
  fromBranchName: string,
  context: TContext
): Promise<string> {
  switch (branchNavigation.direction) {
    case 'BOTTOM': {
      return traverseDownward(fromBranchName, context);
    }
    case 'DOWN': {
      return traverseDownward(
        fromBranchName,
        context,
        branchNavigation.numSteps > 1 ? branchNavigation.numSteps : 1
      );
    }
    case 'TOP': {
      return await traverseUpward(fromBranchName, context);
    }
    case 'UP': {
      return await traverseUpward(
        fromBranchName,
        context,
        branchNavigation.numSteps > 1 ? branchNavigation.numSteps : 1,
        branchNavigation.to
      );
    }
  }
}

function traverseDownward(
  currentBranchName: string,
  context: TContext,
  stepsRemaining: number | 'bottom' = 'bottom'
): string {
  if (stepsRemaining === 0 || context.engine.isTrunk(currentBranchName)) {
    return currentBranchName;
  }
  const parentBranchName =
    context.engine.getParentPrecondition(currentBranchName);
  if (stepsRemaining === 'bottom' && context.engine.isTrunk(parentBranchName)) {
    return currentBranchName;
  }
  context.splog.info('⮑  ' + parentBranchName);
  return traverseDownward(
    parentBranchName,
    context,
    stepsRemaining === 'bottom' ? 'bottom' : stepsRemaining - 1
  );
}

async function traverseUpward(
  currentBranchName: string,
  context: TContext,
  stepsRemaining: number | 'top' = 'top',
  to?: string
): Promise<string> {
  if (stepsRemaining === 0) {
    return currentBranchName;
  }
  const children = context.engine.getChildren(currentBranchName);
  if (children.length === 0) {
    return currentBranchName;
  }
  const towardTo =
    to &&
    children.find((c) =>
      context.engine.getRelativeStack(c, SCOPE.UPSTACK).includes(to)
    );
  const childBranchName =
    children.length === 1
      ? children[0]
      : towardTo || (await handleMultipleChildren(children, context));
  context.splog.info('⮑  ' + childBranchName);
  return await traverseUpward(
    childBranchName,
    context,
    stepsRemaining === 'top' ? 'top' : stepsRemaining - 1,
    to
  );
}

async function handleMultipleChildren(children: string[], context: TContext) {
  if (!context.interactive) {
    throw new ExitFailedError(
      `Cannot get upstack branch in non-interactive mode; multiple choices available:\n${children.join(
        '\n'
      )}`
    );
  }
  return (
    await context.prompts({
      type: 'autocomplete',
      name: 'value',
      message:
        'Multiple branches found at the same level. Select a branch to guide the navigation (autocomplete or arrow keys)',
      choices: children.map((b) => {
        return { title: b, value: b };
      }),
      suggest,
    })
  ).value;
}
