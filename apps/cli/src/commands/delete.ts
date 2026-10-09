import yargs from 'yargs';
import { deleteStackAction } from '../actions/delete_branch';
import { SCOPE } from '../lib/engine/scope_spec';
import { graphite } from '../lib/runner';

const args = {
  name: {
    type: 'string',
    positional: true,
    demandOption: false,
    optional: true,
    describe:
      'The name of the branch to delete. If no branch is provided, opens an interactive selector.',
    hidden: true,
  },
  force: {
    describe: `Delete the branch even if it is not merged or closed, without prompting.`,
    demandOption: false,
    type: 'boolean',
    alias: 'f',
    default: false,
  },
  upstack: {
    describe: `Also delete all branches upstack of the target branch.`,
    demandOption: false,
    type: 'boolean',
    conflicts: 'downstack',
  },
  downstack: {
    describe: `Also delete all branches downstack of the target branch, down to (not including) trunk.`,
    demandOption: false,
    type: 'boolean',
  },
  close: {
    describe: `Close the open GitHub PRs of the deleted branches.`,
    demandOption: false,
    type: 'boolean',
    alias: 'c',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const aliases = ['dl'];
export const command = 'delete [name]';
export const canonical = 'delete';
export const description =
  'Delete a branch (optionally with its upstack or downstack) and its corresponding Charcoal metadata. Prompts for confirmation if a branch is not merged or closed. If no branch is provided, opens an interactive selector.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    deleteStackAction(
      {
        branchName: argv.name,
        force: argv.force,
        close: argv.close,
        scope: argv.upstack
          ? SCOPE.UPSTACK
          : argv.downstack
          ? SCOPE.DOWNSTACK
          : SCOPE.BRANCH,
      },
      context
    )
  );
