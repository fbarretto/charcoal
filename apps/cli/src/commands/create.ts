import yargs from 'yargs';
import { createBranchAction } from '../actions/create_branch';
import { joinMessages } from '../lib/git/commit';
import { graphite } from '../lib/runner';

const args = {
  name: {
    type: 'string',
    positional: true,
    demandOption: false,
    optional: true,
    describe: 'The name of the new branch.',
    hidden: true,
  },
  message: {
    describe: `Commit staged changes on the new branch with this message. Repeat for multiple paragraphs.`,
    demandOption: false,
    type: 'string',
    alias: 'm',
  },
  all: {
    describe: `Stage all unstaged changes before creating the branch, including to untracked files.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  patch: {
    describe: `Pick hunks to stage before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  update: {
    describe: `Stage all updates to tracked files before creating the branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'u',
  },
  verbose: {
    describe: `Show the diff in the commit message template. Pass twice to also show unstaged changes.`,
    demandOption: false,
    type: 'count',
    alias: 'v',
  },
  insert: {
    describe: `Insert this branch between the current branch and its children. If there are multiple children, prompts you to select which should be moved onto the new branch.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'i',
  },
  onto: {
    describe: `Stack the new branch on this branch instead of the current one. Staged and unstaged changes are carried over.`,
    demandOption: false,
    type: 'string',
    alias: 'o',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const aliases = ['c'];
export const command = 'create [name]';
export const canonical = 'create';
export const description =
  "Create a new branch stacked on top of the current branch and commit staged changes. If no branch name is specified, generate a branch name from the commit message (opening the editor if no message is passed). If you have unstaged changes and nothing staged, you will be asked whether you'd like to stage them.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await createBranchAction(
      {
        branchName: argv.name,
        message: joinMessages(argv.message),
        all: argv.all,
        update: argv.update,
        verbose: argv.verbose,
        insert: argv.insert,
        patch: argv.patch,
        onto: argv.onto,
      },
      context
    );
  });
};
