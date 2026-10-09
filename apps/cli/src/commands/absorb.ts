import yargs from 'yargs';
import { absorbAction } from '../actions/absorb';
import { graphite } from '../lib/runner';

const args = {
  all: {
    describe: `Stage all changes before absorbing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  'dry-run': {
    describe: `Print which commits the staged hunks would be absorbed into, and change nothing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  force: {
    describe: `Don't ask for confirmation before absorbing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
  patch: {
    describe: `Pick hunks to stage before absorbing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'absorb';
export const canonical = 'absorb';
export const aliases = ['ab'];
export const description =
  'Amend staged changes into the commits of the current stack that last touched those lines (via git-absorb), then restack.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    absorbAction(
      {
        all: argv.all,
        dryRun: argv['dry-run'],
        force: argv.force,
        patch: argv.patch,
      },
      context
    )
  );
