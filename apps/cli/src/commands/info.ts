import yargs from 'yargs';
import { showBranchInfo } from '../actions/show_branch';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to show information about. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
    hidden: true,
  },
  patch: {
    describe: `Show the changes made by each commit.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'p',
  },
  diff: {
    describe: `Show the diff between this branch and its parent. Takes precedence over patch`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
  },
  body: {
    describe: `Show the PR body, if it exists.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'b',
  },
  stat: {
    describe: `Show a diffstat instead of a full diff. Modifies either --patch or --diff. If neither is passed, implies --diff.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 's',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'info [branch]';
export const canonical = 'info';
export const aliases = ['i'];
export const description =
  'Display information about the current (or provided) branch.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await showBranchInfo(
      argv.branch ?? context.engine.currentBranchPrecondition,
      {
        patch: argv.patch,
        diff: argv.diff,
        body: argv.body,
        stat: argv.stat,
      },
      context
    );
  });
};
