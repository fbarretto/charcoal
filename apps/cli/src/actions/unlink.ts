import chalk from 'chalk';
import { TContext } from '../lib/context';
import {
  BadTrunkOperationError,
  NoBranchError,
  UntrackedBranchError,
} from '../lib/errors';

export function unlinkAction(branchName: string, context: TContext): void {
  if (!context.engine.branchExists(branchName)) {
    throw new NoBranchError(branchName);
  }
  if (context.engine.isTrunk(branchName)) {
    throw new BadTrunkOperationError();
  }
  if (!context.engine.isBranchTracked(branchName)) {
    throw new UntrackedBranchError(branchName);
  }
  const prNumber = context.engine.getPrInfo(branchName)?.number;
  context.engine.clearPrInfo(branchName);
  context.splog.info(
    prNumber === undefined
      ? `${chalk.green(branchName)} has no linked PR.`
      : `Unlinked ${chalk.green(branchName)} from PR #${prNumber}.`
  );
}
