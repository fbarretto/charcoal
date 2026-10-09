import chalk from 'chalk';
import { TContext } from '../lib/context';
import { RebaseConflictError } from '../lib/errors';
import {
  applyToWorkingTree,
  createStashCommit,
  hardResetToHead,
} from '../lib/git/plumbing';
import { assertUnreachable } from '../lib/utils/assert_unreachable';
import { persistContinuation } from './persist_continuation';
import { printConflictStatus } from './print_conflict_status';

// pendingParents: re-parentings applied only right before each branch
// restacks (see continuation_spf.ts). branchesToDelete: deleted once every
// queued branch has restacked, so their children never point at a missing
// parent while a conflict is pending.
export type TRestackFollowUp = {
  pendingParents?: Record<string, string>;
  branchesToDelete?: string[];
};

export function restackBranches(
  branchNames: string[],
  context: TContext,
  { pendingParents = {}, branchesToDelete = [] }: TRestackFollowUp = {}
): void {
  context.splog.debug(
    branchNames.reduce((acc, curr) => `${acc}\n${curr}`, 'RESTACKING:')
  );
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

// Clears the working tree so `fn` can rewrite and restack branches, then
// reapplies `patches` (diffs captured beforehand) as unstaged changes. A backup
// of everything set aside is printed if `fn` or the reapply fails.
export function withChangesSetAside(
  patches: string[],
  context: TContext,
  fn: () => void
): void {
  const backup = createStashCommit();
  hardResetToHead();
  const recoveryHint = backup
    ? `Your uncommitted changes are saved in ${chalk.cyan(
        backup
      )}; recover them with \`git stash apply ${backup}\`.`
    : undefined;
  try {
    fn();
  } catch (e) {
    recoveryHint && context.splog.warn(recoveryHint);
    throw e;
  }
  try {
    patches.filter((p) => p).forEach(applyToWorkingTree);
  } catch {
    context.splog.warn(`Couldn't reapply your uncommitted changes.`);
    recoveryHint && context.splog.warn(recoveryHint);
  }
}
