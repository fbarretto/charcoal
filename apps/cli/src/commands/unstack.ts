import yargs from 'yargs';
import { unstackAction } from '../actions/unstack';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Don't ask for confirmation.`,
    type: 'boolean',
    default: false,
    alias: 'f',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'unstack';
export const canonical = 'unstack';
export const description =
  "Dissolve the GitHub stack containing the current branch's PR. The PRs and local branches are untouched.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    unstackAction({ force: argv.force }, context)
  );
