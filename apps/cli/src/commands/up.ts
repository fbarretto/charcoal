import yargs from 'yargs';
import { switchBranchAction } from '../actions/branch_traversal';
import { graphite } from '../lib/runner';

const args = {
  steps: {
    describe: `The number of levels to traverse upstack.`,
    demandOption: false,
    default: 1,
    type: 'number',
    alias: 'n',
  },
  to: {
    describe: `Target branch to navigate towards. When multiple children exist, selects the path leading to this branch.`,
    demandOption: false,
    type: 'string',
  },
} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'up [steps]';
export const canonical = 'up';
export const aliases = ['u'];
export const description =
  'Switch to the child of the current branch. Prompts if ambiguous.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(
    argv,
    canonical,
    async (context) =>
      await switchBranchAction(
        {
          direction: 'UP',
          numSteps: argv.steps,
          to: argv.to,
        },
        context
      )
  );
