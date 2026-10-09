import yargs from 'yargs';
import { getAction } from '../actions/sync/get';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch or PR number to get from remote`,
    demandOption: false,
    type: 'string',
    positional: true,
    hidden: true,
  },
  force: {
    describe: 'Overwrite all fetched branches with remote source of truth',
    demandOption: false,
    type: 'boolean',
    default: false,
    alias: 'f',
  },
  unfrozen: {
    describe:
      'Check out new branches as unfrozen (allow local edits). By default, new branches authored by someone else are frozen.',
    demandOption: false,
    type: 'boolean',
    default: false,
    alias: 'U',
  },
  checkout: {
    describe:
      'Check out the target branch after syncing (true by default; skip with --no-checkout).',
    demandOption: false,
    type: 'boolean',
    default: true,
  },
  downstack: {
    describe:
      "When syncing a branch that already exists locally, don't sync upstack branches.",
    demandOption: false,
    type: 'boolean',
    default: false,
    alias: 'd',
  },
  restack: {
    describe:
      'Restack any branches in the stack that can be restacked without conflicts (true by default; skip with --no-restack).',
    demandOption: false,
    type: 'boolean',
    default: true,
  },
  'remote-upstack': {
    describe:
      'Also get the open PRs stacked above the branch on remote (from its GitHub stack, else by walking PR bases).',
    demandOption: false,
    type: 'boolean',
    default: false,
    alias: 'u',
  },
  'delete-all': {
    describe:
      'Delete all merged or closed branches of the stack during get without prompting.',
    demandOption: false,
    type: 'boolean',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'get [branch]';
export const canonical = 'get';
export const description =
  'For a given branch or PR number, sync branches from trunk to the given branch from remote, prompting the user to resolve any conflicts. If the branch already exists locally, its local upstack branches are also synced (opt out with --downstack); pass --remote-upstack to also get remote-only upstack PRs. If no branch is provided, sync the current stack.';
export const builder = args;
export const aliases = ['g'];
export const handler = async (argv: argsT): Promise<void> =>
  graphite(
    argv,
    canonical,
    async (context) =>
      await getAction(
        {
          branchName: argv.branch,
          force: argv.force,
          unfrozen: argv.unfrozen,
          checkout: argv.checkout,
          downstack: argv.downstack,
          restack: argv.restack,
          remoteUpstack: argv['remote-upstack'],
          deleteAll: argv['delete-all'],
        },
        context
      )
  );
