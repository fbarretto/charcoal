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

export function restackBranches(
  branchNames: string[],
  context: TContext,
  pendingParents: Record<string, string> = {}
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

    if (branchName in pendingParents) {
      context.engine.setParent(branchName, pendingParents[branchName]);
      delete pendingParents[branchName];
    }

    const result = context.engine.restackBranch(branchName);
    context.splog.debug(`${result}: ${branchName}`);
    switch (result.result) {
      case 'REBASE_DONE':
        context.splog.info(
          `Restacked ${chalk.green(branchName)} on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}.`
        );
        continue;

      case 'REBASE_CONFLICT':
        persistContinuation(
          {
            branchesToRestack: branchNames,
            pendingParents,
            rebasedBranchBase: result.rebasedBranchBase,
          },
          context
        );
        printConflictStatus(
          `Hit conflict restacking ${chalk.yellow(branchName)} on ${chalk.cyan(
            context.engine.getParentPrecondition(branchName)
          )}.`,
          context
        );
        throw new RebaseConflictError();

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
