import yargs from 'yargs';
import { undoAction } from '../actions/undo';
import { graphite } from '../lib/runner';

const args = {
  force: {
    describe: `Undo without asking for confirmation.`,
    demandOption: false,
    type: 'boolean',
    alias: 'f',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'undo';
export const canonical = 'undo';
export const description =
  'Undo the most recent Charcoal mutation (create, modify, restack, delete, ...) in this repo by restoring branches, metadata and the checked-out branch. Run repeatedly to step further back. Only local state is restored; remote branches and PRs are not touched.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    undoAction({ force: argv.force }, context)
  );
