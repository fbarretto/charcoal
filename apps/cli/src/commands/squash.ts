import yargs from 'yargs';
import { squashCurrentBranch } from '../actions/squash';
import { joinMessages } from '../lib/git/commit';
import { graphite } from '../lib/runner';

const args = {
  message: {
    type: 'string',
    alias: 'm',
    describe: 'The updated message for the commit.',
    demandOption: false,
  },
  edit: {
    type: 'boolean',
    describe: 'Modify the existing commit message.',
    demandOption: false,
    default: true,
  },
  'no-edit': {
    type: 'boolean',
    describe:
      "Don't modify the existing commit message. Takes precedence over --edit",
    demandOption: false,
    default: false,
    alias: 'n',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'squash';
export const canonical = 'squash';
export const aliases = ['sq'];
export const description =
  'Squash all commits in the current branch into a single commit and restack upstack branches. Does nothing if the branch has at most one commit.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    squashCurrentBranch(
      {
        message: joinMessages(argv.message),
        noEdit: argv['no-edit'] || !argv.edit,
      },
      context
    )
  );
