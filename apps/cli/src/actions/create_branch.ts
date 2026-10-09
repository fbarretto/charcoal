import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { stageChanges, TStageOpts } from '../lib/preconditions';
import { newBranchName } from '../lib/utils/branch_name';
import { canPrompt } from '../lib/utils/prompts_helpers';
import { restackBranches } from './restack';

export async function createBranchAction(
  opts: {
    branchName?: string;
    message?: string;
    insert?: boolean;
    onto?: string;
    verbose?: number;
  } & TStageOpts,
  context: TContext
): Promise<void> {
  // With no name and no message, the name comes from the message typed in
  // the commit editor, which needs interactive mode.
  if (!opts.branchName && !opts.message && !context.interactive) {
    throw new ExitFailedError(
      `Must specify either a branch name or commit message.`
    );
  }

  const originalBranch = context.engine.currentBranch;
  if (opts.onto) {
    checkoutOntoCarryingChanges(opts.onto, context);
  }

  await stageChanges(opts, context);
  const hasStagedChanges = context.engine.detectStagedChanges();
  const branchName =
    newBranchName(opts.branchName, opts.message, context) ??
    (hasStagedChanges ? undefined : await promptForBranchName(context));

  context.engine.checkoutNewBranch(
    branchName ?? `ch-create-${process.pid}-${Date.now()}`
  );

  if (hasStagedChanges) {
    commitOrRollBack(opts, originalBranch, context);
  } else {
    context.splog.info(`No staged changes; created a branch with no commit.`);
  }
  if (!branchName) {
    context.engine.renameCurrentBranch(nameFromLastCommit(context));
  }

  await insertOrTip(
    context.engine.currentBranchPrecondition,
    opts.insert,
    context
  );
}

function commitOrRollBack(
  opts: { message?: string; verbose?: number },
  originalBranch: string | undefined,
  context: TContext
): void {
  const branchName = context.engine.currentBranchPrecondition;
  try {
    context.engine.commit({ message: opts.message, verbose: opts.verbose });
  } catch (e) {
    try {
      context.engine.deleteBranch(branchName);
    } catch {
      // pass
    }
    if (originalBranch) {
      try {
        context.engine.checkoutBranch(originalBranch);
      } catch {
        // pass
      }
    }
    throw e;
  }
}

async function promptForBranchName(context: TContext): Promise<string> {
  if (!canPrompt(context)) {
    throw new ExitFailedError(
      `Must specify either a branch name or commit message.`
    );
  }
  const { branchName } = await context.prompts({
    type: 'text',
    name: 'branchName',
    message: 'Name for the new (empty) branch',
    validate: (name: string) => {
      const calculated = newBranchName(name, undefined, context);
      return !calculated
        ? 'Enter a branch name.'
        : context.engine.allBranchNames.includes(calculated)
        ? 'Branch name is already in use, choose a different name.'
        : true;
    },
  });
  return newBranchName(branchName, undefined, context) as string;
}

function nameFromLastCommit(context: TContext): string {
  const subject = runGitCommand({
    args: ['log', '-1', '--format=%s'],
    onError: 'throw',
    resource: 'nameFromLastCommit',
  });
  const name = newBranchName(undefined, subject, context) || 'branch';
  let unique = name;
  for (let i = 2; context.engine.allBranchNames.includes(unique); i++) {
    unique = `${name}_${i}`;
  }
  return unique;
}

// The siblings are gathered here, rather than in a separate `--insert` step,
// so that the tip only shows when the new branch actually has siblings.
async function insertOrTip(
  branchName: string,
  insert: boolean | undefined,
  context: TContext
): Promise<void> {
  const siblings = context.engine
    .getChildren(context.engine.getParentPrecondition(branchName))
    .filter((childBranchName) => childBranchName !== branchName);

  if (siblings.length === 0) {
    return;
  }

  if (!insert) {
    context.splog.tip(
      [
        'To insert a created branch into the middle of your stack, use the `--insert` flag.',
        "If you meant to insert this branch, you can rearrange your stack's dependencies with `ch move`",
      ].join('\n')
    );
    return;
  }

  const toMove =
    siblings.length > 1 && canPrompt(context)
      ? await selectSiblings(siblings, context)
      : siblings;

  toMove.forEach((siblingBranchName) =>
    context.engine.setParent(siblingBranchName, branchName)
  );

  // Moved siblings bring their whole upstacks along.
  restackBranches(
    toMove.flatMap((siblingBranchName) =>
      context.engine.getRelativeStack(siblingBranchName, SCOPE.UPSTACK)
    ),
    context
  );
}

async function selectSiblings(
  siblings: string[],
  context: TContext
): Promise<string[]> {
  const { value } = await context.prompts({
    type: 'multiselect',
    name: 'value',
    message: 'Which branches should be moved onto the new branch?',
    choices: siblings.map((b) => ({ title: b, value: b, selected: true })),
    instructions: false,
    hint: 'Space to toggle, return to confirm.',
  });
  return value ?? [];
}

// `git switch` refuses (and changes nothing) if a carried change would be
// overwritten, so a conflict leaves the repo exactly as it was.
function checkoutOntoCarryingChanges(onto: string, context: TContext): void {
  if (
    !context.engine.branchExists(onto) ||
    (!context.engine.isTrunk(onto) && !context.engine.isBranchTracked(onto))
  ) {
    throw new ExitFailedError(
      `Cannot create onto ${onto}: it is not trunk or a tracked branch.`
    );
  }
  try {
    context.engine.checkoutBranch(onto);
  } catch {
    throw new ExitFailedError(
      [
        `Cannot check out ${onto} without overwriting your uncommitted changes.`,
        `Nothing was changed. Commit or stash the conflicting changes, or create from ${onto} directly.`,
      ].join('\n')
    );
  }
}
