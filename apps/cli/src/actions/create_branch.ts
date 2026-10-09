import { TContext } from '../lib/context';
import { SCOPE } from '../lib/engine/scope_spec';
import { ExitFailedError } from '../lib/errors';
import { newBranchName } from '../lib/utils/branch_name';
import { restackBranches } from './restack';

export async function createBranchAction(
  opts: {
    branchName?: string;
    message?: string;
    all?: boolean;
    insert?: boolean;
    patch?: boolean;
    onto?: string;
  },
  context: TContext
): Promise<void> {
  const branchName = newBranchName(opts.branchName, opts.message, context);
  if (!branchName) {
    throw new ExitFailedError(
      `Must specify either a branch name or commit message.`
    );
  }

  const originalBranch = context.engine.currentBranch;
  if (opts.onto) {
    checkoutOntoCarryingChanges(opts.onto, context);
  }

  context.engine.checkoutNewBranch(branchName);

  if (opts.all) {
    context.engine.addAll();
  }

  if (context.engine.detectStagedChanges()) {
    try {
      context.engine.commit({
        message: opts.message,
        patch: !opts.all && opts.patch,
      });
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
  } else {
    context.splog.info(`No staged changes; created a branch with no commit.`);
  }

  // The reason we get the list of siblings here instead of having all
  // the `--insert` logic in a separate function is so that we only
  // show the tip if the user creates a branch with siblings.

  const siblings = context.engine
    .getChildren(context.engine.getParentPrecondition(branchName))
    .filter((childBranchName) => childBranchName !== branchName);

  if (siblings.length === 0) {
    return;
  }

  if (!opts.insert) {
    context.splog.tip(
      [
        'To insert a created branch into the middle of your stack, use the `--insert` flag.',
        "If you meant to insert this branch, you can rearrange your stack's dependencies with `ch move`",
      ].join('\n')
    );
    return;
  }

  // Now we actually handle the `insert` case.

  // Change the parent of each sibling to the new branch.
  siblings.forEach((siblingBranchName) =>
    context.engine.setParent(siblingBranchName, branchName)
  );

  // If we're restacking siblings onto this branch, we need to restack
  // all of their recursive children as well. Get all the upstacks!
  restackBranches(
    siblings.flatMap((siblingBranchName) =>
      context.engine.getRelativeStack(siblingBranchName, SCOPE.UPSTACK)
    ),
    context
  );
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
