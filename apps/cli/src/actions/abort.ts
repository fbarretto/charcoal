import chalk from 'chalk';
import { TContext } from '../lib/context';
import { ExitFailedError, NoGraphiteContinue } from '../lib/errors';
import { clearContinuation } from './persist_continuation';
import { restoreSetAsideChanges } from './restack';
import { popUndoSnapshot, restoreUndoSnapshot } from './undo';

export async function abortAction(
  opts: { force: boolean },
  context: TContext
): Promise<void> {
  if (
    !context.engine.rebaseInProgress() ||
    !context.continueConfig.data.rebasedBranchBase
  ) {
    clearContinuation(context);
    throw new NoGraphiteContinue('git rebase --abort');
  }

  const confirmed =
    opts.force ||
    (context.interactive &&
      (
        await context.prompts({
          type: 'confirm',
          name: 'value',
          message: 'Abort the current Charcoal command and its rebase?',
          initial: false,
        })
      ).value);
  if (!confirmed && !context.interactive) {
    throw new ExitFailedError(
      `Cannot confirm the abort without an interactive terminal. Pass ${chalk.cyan(
        '--force'
      )} to abort.`
    );
  }
  if (!confirmed) {
    context.splog.info('Did not abort. Pass --force to skip confirmation.');
    return;
  }

  context.engine.abortRebase();
  const { stashToRestore: stash, undoSnapshot } = context.continueConfig.data;
  if (undoSnapshot) {
    restoreUndoSnapshot(undoSnapshot, context);
    popUndoSnapshot(undoSnapshot);
  }
  clearContinuation(context);
  if (stash) {
    restoreSetAsideChanges(stash, context);
  }
  context.splog.info(
    undoSnapshot
      ? `Aborted ${chalk.cyan(
          `ch ${undoSnapshot.command}`
        )} and restored the state from before it ran.`
      : 'Aborted the halted Charcoal command.'
  );
}
