import { TContext } from '../lib/context';
import { NoGraphiteContinue } from '../lib/errors';
import { clearContinuation } from './persist_continuation';
import { restoreSetAsideChanges } from './restack';

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
  if (!confirmed) {
    context.splog.info('Did not abort. Pass --force to skip confirmation.');
    return;
  }

  context.engine.abortRebase();
  const stash = context.continueConfig.data.stashToRestore;
  clearContinuation(context);
  if (stash) {
    restoreSetAsideChanges(stash, context);
  }
  context.splog.info('Aborted the halted Charcoal command.');
}
