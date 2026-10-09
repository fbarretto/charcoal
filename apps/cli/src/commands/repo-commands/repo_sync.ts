import yargs from 'yargs';
import { syncAction } from '../../actions/sync/sync';
import { graphite } from '../../lib/runner';

const args = {
  pull: {
    describe: `Pull the trunk branch from remote.`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
  delete: {
    describe: `Delete branches which have been merged or closed, prompting for each (default on; skip with --no-delete).`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
  'delete-all': {
    describe: `Delete all merged or closed branches without prompting.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  'show-delete-progress': {
    describe: `Show progress through merged branches.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  force: {
    describe: `Don't prompt for confirmation before deleting a branch or resetting trunk to remote.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
  restack: {
    describe: `Restack every branch that can be restacked without conflicts (default on; skip with --no-restack). Branches that would conflict are listed for \`ch restack\`.`,
    demandOption: false,
    default: true,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'sync';
export const canonical = 'repo sync';
export const aliases = ['s'];
export const description =
  'Pull the trunk branch from remote, prompt to delete any branches whose PRs have been merged or closed, and restack every branch that can be restacked without conflicts. If trunk cannot be fast-forwarded to match remote, overwrites trunk with the remote version.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await syncAction(
      {
        pull: argv.pull,
        force: argv.force,
        delete: argv.delete,
        deleteAll: argv['delete-all'],
        showDeleteProgress: argv['show-delete-progress'],
        restack: argv.restack,
      },
      context
    );
  });
};
