import yargs from 'yargs';
import { foldAction } from '../actions/fold_branch';
import { graphite } from '../lib/runner';

const args = {
  keep: {
    describe: `Keeps the name of the current branch instead of using the name of its parent.`,
    demandOption: false,
    type: 'boolean',
    alias: 'k',
    default: false,
  },
  close: {
    describe: `Close the pull requests of the branches folded away.`,
    demandOption: false,
    type: 'boolean',
    alias: 'c',
    default: false,
  },
  stack: {
    describe: `Fold the current branch's entire stack (from the bottom branch through the top) into a single retained branch: the bottom one, or the current one with --keep.`,
    demandOption: false,
    type: 'boolean',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'fold';
export const aliases = ['f'];
export const canonical = 'fold';
export const description =
  "Fold a branch's changes into its parent, update dependencies of descendants of the new combined branch, and restack.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    foldAction(
      { keep: argv.keep, close: argv.close, stack: argv.stack },
      context
    )
  );
