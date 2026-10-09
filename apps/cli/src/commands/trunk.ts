import yargs from 'yargs';
import { graphite } from '../lib/runner';

const args = {
  all: {
    describe: `Show all configured trunks. Charcoal supports a single trunk, so this prints it.`,
    demandOption: false,
    type: 'boolean',
    alias: 'a',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'trunk';
export const canonical = 'trunk';
export const description = 'Print the trunk branch name.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    context.splog.info(context.engine.trunk)
  );
