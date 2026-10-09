import yargs from 'yargs';
import { setFrozenAction } from '../actions/freeze';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to freeze. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'freeze [branch]';
export const canonical = 'freeze';
export const description =
  'Freeze a branch and the branches downstack of it, preventing local modifications, restacks, and submits. Defaults to the current branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    setFrozenAction(
      {
        branchName: argv.branch ?? context.engine.currentBranchPrecondition,
        frozen: true,
      },
      context
    )
  );
