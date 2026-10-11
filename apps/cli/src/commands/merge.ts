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
    describe: `Ask for confirmation before merging. Merge always asks if local branches differ from remote.`,
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
    describe: `Unstacked PRs: enable GitHub auto-merge on each PR in turn and wait for GitHub to merge it, so checks and reviews gate each merge. GitHub stacks have no auto-merge: wait for them, then make the same async merge request as without --auto.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  wait: {
    describe: `Wait for each PR's required checks (and, with --auto, reviews) before merging it. --no-wait stops at the first PR that isn't ready; with --auto it enables auto-merge on the bottom PR and exits.`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
  timeout: {
    describe: `Minutes to wait for each PR before giving up.`,
    demandOption: false,
    default: 30,
    type: 'number',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'merge';
export const canonical = 'merge';
export const aliases = ['mg'];
export const description =
  'Merge the PRs from trunk to the current branch, bottom-up, via gh, waiting for each to be ready.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    mergeAction(
      {
        dryRun: argv['dry-run'],
        confirm: argv.confirm,
        method: argv.method as 'squash' | 'merge' | 'rebase',
        auto: argv.auto,
        wait: argv.wait,
        timeoutMinutes: argv.timeout,
      },
      context
    )
  );
