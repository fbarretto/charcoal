import chalk from 'chalk';
import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError, PreconditionsFailedError } from '../lib/errors';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { closePrs, openPrNumbers } from './delete_branch';
import { restackBranches } from './restack';

export async function foldAction(
  opts: { keep: boolean; close: boolean; stack: boolean },
  context: TContext
): Promise<void> {
  const current = context.engine.currentBranchPrecondition;
  const parent = context.engine.getParentPrecondition(current);
  const stack = opts.stack ? await stackPath(current, context) : undefined;
  const retained = stack
    ? opts.keep
      ? current
      : stack[0]
    : opts.keep
    ? current
    : parent;
  const folded = (stack ?? [parent, current]).filter((b) => b !== retained);
  const prNumbers = opts.close ? openPrNumbers(folded, context) : [];

  if (stack) {
    foldStack(stack, retained, context);
  } else {
    context.engine.foldCurrentBranch(opts.keep);
  }
  context.splog.info(
    stack
      ? `Folded ${stack.length} branches into ${chalk.green(retained)}.`
      : `Folded ${chalk.blueBright(current)} into ${chalk.blueBright(
          parent
        )}, keeping the name ${chalk.green(retained)}.`
  );
  if (!opts.keep) {
    context.splog.tip(
      `To keep the name of the current branch, use the \`--keep\` flag.`
    );
  }
  closePrs(prNumbers, context);
  restackBranches(
    context.engine.getRelativeStack(retained, SCOPE.UPSTACK_EXCLUSIVE),
    context
  );
}

// Bottom (child of trunk) through the tip `ch top` would reach.
async function stackPath(
  current: string,
  context: TContext
): Promise<string[]> {
  const path = context.engine.getRelativeStack(current, SCOPE.DOWNSTACK);
  for (
    let children = context.engine.getChildren(current);
    children.length > 0;
    children = context.engine.getChildren(path[path.length - 1])
  ) {
    path.push(
      children.length === 1 ? children[0] : await pickChild(children, context)
    );
  }
  if (path.length < 2) {
    throw new PreconditionsFailedError('There is no other branch to fold.');
  }
  const unfixed = path.filter((b) => !context.engine.isBranchFixed(b));
  if (unfixed.length > 0) {
    throw new PreconditionsFailedError(
      `${unfixed
        .map((b) => chalk.yellow(b))
        .join(', ')} need restacking; run ${chalk.cyan('ch restack')} first.`
    );
  }
  return path;
}

async function pickChild(
  children: string[],
  context: TContext
): Promise<string> {
  if (!context.interactive) {
    throw new ExitFailedError(
      `Cannot pick the top of the stack; multiple children:\n${children.join(
        '\n'
      )}`
    );
  }
  return (
    await context.prompts({
      type: 'select',
      name: 'value',
      message:
        'Multiple branches found at the same level. Which stack should be folded?',
      choices: children.map((b) => ({ title: b, value: b })),
    })
  ).value;
}

// Folds the branches above `retained` down into it (keeping its name), then
// folds `retained` into each branch below it with --keep. Restacking the
// branches that hang off the stack is left to the caller.
function foldStack(stack: string[], retained: string, context: TContext): void {
  const tip = stack[stack.length - 1];
  if (tip !== context.engine.currentBranch) {
    uncommittedTrackedChangesPrecondition();
  }
  context.engine.checkoutBranch(tip);
  while (context.engine.currentBranchPrecondition !== retained) {
    context.engine.foldCurrentBranch(false);
  }
  while (
    !context.engine.isTrunk(context.engine.getParentPrecondition(retained))
  ) {
    context.engine.foldCurrentBranch(true);
  }
}
