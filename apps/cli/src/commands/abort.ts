import yargs from 'yargs';
import { abortAction } from '../actions/abort';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Do not prompt for confirmation.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'abort';
export const canonical = 'abort';
export const description =
  'Abort the most recent Charcoal command halted by a merge conflict.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(
    argv,
    canonical,
    async (context) => await abortAction({ force: argv.force }, context)
  );
