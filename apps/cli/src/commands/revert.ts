import yargs from 'yargs';
import { revertAction } from '../actions/revert';
import { graphite } from '../lib/runner';

const args = {
  sha: {
    type: 'string',
    positional: true,
    demandOption: true,
    describe: 'The trunk commit to revert.',
    hidden: true,
  },
  edit: {
    describe: `Edit the commit message of the revert.`,
    demandOption: false,
    type: 'boolean',
    alias: 'e',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'revert <sha>';
export const canonical = 'revert';
export const description =
  '(Experimental) Create a branch off trunk that reverts a trunk commit, and check it out.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    revertAction({ sha: argv.sha, edit: argv.edit }, context)
  );
