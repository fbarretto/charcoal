import yargs from 'yargs';
import { unlinkAction } from '../actions/unlink';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to unlink. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'unlink [branch]';
export const canonical = 'unlink';
export const description =
  'Remove the PR associated with a branch, so the next submit creates a new PR.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    unlinkAction(
      argv.branch ?? context.engine.currentBranchPrecondition,
      context
    )
  );
