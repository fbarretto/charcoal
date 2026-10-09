import yargs from 'yargs';
import { commitAmendAction } from '../actions/commit_amend';
import { commitCreateAction } from '../actions/commit_create';
import { editBranchAction } from '../actions/edit_branch';
import { modifyIntoAction } from '../actions/modify_into';
import { joinMessages } from '../lib/git/commit';
import { graphite } from '../lib/runner';

const args = {
  all: {
    describe: `Stage all changes before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'a',
  },
  commit: {
    describe: `Create a new commit instead of amending the current commit. If this branch has no commits, this command always creates a new commit.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'c',
  },
  edit: {
    type: 'boolean',
    describe:
      'If passed, open an editor to edit the commit message. When creating a new commit, this flag is ignored.',
    demandOption: false,
    default: false,
    alias: 'e',
  },
  'interactive-rebase': {
    type: 'boolean',
    describe:
      'Ignore all other flags and start a git interactive rebase on the commits in this branch.',
    demandOption: false,
    default: false,
  },
  into: {
    type: 'string',
    describe:
      'The branch to modify instead of the current branch. Must be downstack in the current stack.',
    demandOption: false,
  },
  message: {
    type: 'string',
    alias: 'm',
    describe:
      'The message for the new or amended commit. If passed, no editor is opened. Repeat for multiple paragraphs.',
    demandOption: false,
  },
  'no-edit': {
    type: 'boolean',
    describe:
      "Don't open an editor for the commit message. Takes precedence over --edit",
    demandOption: false,
    default: false,
    alias: 'n',
  },
  patch: {
    describe: `Pick hunks to stage before committing.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  'reset-author': {
    describe: `Set the author of the commit to the current user if amending.`,
    demandOption: false,
    default: false,
    type: 'boolean',
  },
  update: {
    describe: `Stage all updates to tracked files before committing.`,
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
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'modify';
export const canonical = 'modify';
export const aliases = ['m'];
export const description =
  "Modify the current branch by amending its commit or creating a new commit, and restack upstack branches. If you have unstaged changes and nothing staged, you will be asked whether you'd like to stage them.";
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    if (argv['interactive-rebase']) {
      return editBranchAction(context);
    }
    const opts = {
      all: argv.all,
      update: argv.update,
      patch: argv.patch,
      message: joinMessages(argv.message),
    };
    const current = context.engine.currentBranchPrecondition;
    return argv.into && argv.into !== current
      ? modifyIntoAction(
          {
            ...opts,
            into: argv.into,
            commit: argv.commit,
            resetAuthor: argv['reset-author'],
          },
          context
        )
      : argv.commit ||
        (!context.engine.isTrunk(current) &&
          context.engine.getAllCommits(current, 'SHA').length === 0)
      ? commitCreateAction({ ...opts, verbose: argv.verbose }, context)
      : commitAmendAction(
          {
            ...opts,
            edit: argv.edit && !argv['no-edit'],
            verbose: argv.verbose,
            resetAuthor: argv['reset-author'],
          },
          context
        );
  });
};
