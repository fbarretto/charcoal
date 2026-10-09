import yargs from 'yargs';
import { setFrozenAction } from '../actions/freeze';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to unfreeze. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'unfreeze [branch]';
export const canonical = 'unfreeze';
export const description =
  'Unfreeze a branch and the branches upstack of it. Defaults to the current branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    setFrozenAction(
      {
        branchName: argv.branch ?? context.engine.currentBranchPrecondition,
        frozen: false,
      },
      context
    )
  );
