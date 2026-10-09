import chalk from 'chalk';
import { TContext } from '../lib/context';
import { RebaseConflictError } from '../lib/errors';
import {
  createStashCommit,
  hardResetToHead,
  keepStashCommit,
  restoreFromStash,
  TStashPart,
} from '../lib/git/plumbing';
import { branchesInOtherWorktrees } from '../lib/git/worktrees';
import { assertUnreachable } from '../lib/utils/assert_unreachable';
import { persistContinuation } from './persist_continuation';
import { printConflictStatus } from './print_conflict_status';

// pendingParents: re-parentings applied only right before each branch
// restacks (see continuation_spf.ts). branchesToDelete: deleted once every
// queued branch has restacked, so their children never point at a missing
// parent while a conflict is pending. leaveConflicts: abort a conflicting
// restack and leave that branch needing a restack instead of halting.
export type TRestackFollowUp = {
  pendingParents?: Record<string, string>;
  branchesToDelete?: string[];
  leaveConflicts?: boolean;
};

export function restackBranches(
  branchNames: string[],
  context: TContext,
  {
    pendingParents = {},
    branchesToDelete = [],
    leaveConflicts = false,
  }: TRestackFollowUp = {}
): void {
  context.splog.debug(
    branchNames.reduce((acc, curr) => `${acc}\n${curr}`, 'RESTACKING:')
  );
  const otherWorktrees = branchesInOtherWorktrees();
  while (branchNames.length > 0) {
    const branchName = branchNames.shift() as string;

    if (context.engine.isTrunk(branchName)) {
      context.splog.info(
        `${chalk.cyan(branchName)} does not need to be restacked.`
      );
      continue;
    }

    if (context.engine.isBranchFrozen(branchName)) {
      context.splog.info(`Skipped frozen branch ${chalk.cyan(branchName)}.`);
      continue;
    }

    const worktree = otherWorktrees.get(branchName);
    if (worktree) {
      context.splog.info(skippedInWorktreeMessage(branchName, worktree));
      continue;
    }

    const oldParent =
      branchName in pendingParents
        ? context.engine.getParentPrecondition(branchName)
        : undefined;
    if (oldParent) {
      context.engine.setParent(branchName, pendingParents[branchName]);
    }

    const result = context.engine.restackBranch(branchName);
    if (oldParent && result.result !== 'REBASE_CONFLICT') {
      delete pendingParents[branchName];
    }
    context.splog.debug(`${result}: ${branchName}`);
    switch (result.result) {
      case 'REBASE_DONE':
        context.splog.info(
          `Restacked ${chalk.green(branchName)} on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}.`
        );
        continue;

      case 'REBASE_CONFLICT': {
        if (leaveConflicts) {
          context.engine.abortRebase();
          context.splog.info(
            `${chalk.yellow(
              branchName
            )} conflicts with its parent; left it needing a restack (${chalk.cyan(
              'ch restack'
            )}).`
          );
          continue;
        }
        const message = `Hit conflict restacking ${chalk.yellow(
          branchName
        )} on ${chalk.cyan(context.engine.getParentPrecondition(branchName))}.`;
        // Keep the old parent until the rebase completes (continue applies
        // the pending one), so an abort leaves this branch where it was.
        if (oldParent) {
          context.engine.setParent(branchName, oldParent);
        }
        persistContinuation(
          {
            branchesToRestack: branchNames,
            pendingParents,
            branchesToDelete,
            rebasedBranchBase: result.rebasedBranchBase,
          },
          context
        );
        printConflictStatus(message, context);
        throw new RebaseConflictError();
      }

      case 'REBASE_UNNEEDED':
        context.splog.info(
          `${chalk.cyan(
            branchName
          )} does not need to be restacked${` on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}`}.`
        );
        continue;

      default:
        assertUnreachable(result);
    }
  }

  branchesToDelete.forEach((b) => {
    context.engine.deleteBranch(b);
    context.splog.info(`Deleted branch ${chalk.red(b)}`);
  });
}

export function skippedInWorktreeMessage(
  branchName: string,
  worktree: string
): string {
  return `Skipped ${chalk.cyan(
    branchName
  )}: it is checked out in another worktree (${worktree}). Run this command there to update it.`;
}

// Clears the working tree so `fn` can rewrite and restack branches, then
// reapplies `part` of what was set aside as unstaged changes. The set-aside
// stash commit is kept under refs/charcoal/stash/ until reapplied; if `fn`
// stops on a restack conflict, `ch continue` / `ch abort` reapply it.
export function withChangesSetAside(
  part: TStashPart,
  context: TContext,
  fn: () => void
): void {
  const sha = createStashCommit();
  if (!sha) {
    fn();
    return;
  }
  keepStashCommit(sha);
  hardResetToHead();
  try {
    fn();
  } catch (e) {
    if (e instanceof RebaseConflictError) {
      context.continueConfig.update((data) => {
        data.stashToRestore = { sha, part };
      });
      context.splog.info(
        'Your uncommitted changes will be reapplied after `ch continue` or `ch abort`.'
      );
    } else {
      context.splog.warn(recoveryHint(sha));
    }
    throw e;
  }
  restoreSetAsideChanges({ sha, part }, context);
}

export function restoreSetAsideChanges(
  stash: { sha: string; part: TStashPart },
  context: TContext
): void {
  try {
    restoreFromStash(stash.sha, stash.part);
  } catch {
    context.splog.warn(`Couldn't reapply your uncommitted changes.`);
    context.splog.warn(recoveryHint(stash.sha));
  }
}

function recoveryHint(sha: string): string {
  return `Your uncommitted changes are saved in ${chalk.cyan(
    sha
  )}; recover them with \`git stash apply ${sha}\`.`;
}
