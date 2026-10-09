import yargs from 'yargs';
import { mergeAction } from '../actions/merge';
import { graphite } from '../lib/runner';

const args = {
  'dry-run': {
    describe: `Print which PRs would be merged, in order, and exit.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  confirm: {
    describe: `Ask for confirmation before merging.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'c',
  },
  method: {
    describe: `How GitHub merges each PR.`,
    demandOption: false,
    default: 'squash',
    choices: ['squash', 'merge', 'rebase'],
    type: 'string',
  },
  auto: {
    describe: `Enable auto-merge on the bottom PR instead of merging it now, then stop.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'merge';
export const canonical = 'merge';
export const description =
  'Merge the PRs from trunk to the current branch, bottom-up, via gh.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    mergeAction(
      {
        dryRun: argv['dry-run'],
        confirm: argv.confirm,
        method: argv.method as 'squash' | 'merge' | 'rebase',
        auto: argv.auto,
      },
      context
    )
  );
