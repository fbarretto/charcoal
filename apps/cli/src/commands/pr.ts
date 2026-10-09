import yargs from 'yargs';
import { openPrAction } from '../actions/open_pr';
import { graphite } from '../lib/runner';

const args = {
  'branch-or-pr': {
    describe: `Branch name or PR number to open. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
  },
  stack: {
    describe: `Open every PR of the branch's GitHub stack, or, if it isn't in one, of every branch in the current stack.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 's',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'pr [branch-or-pr]';
export const canonical = 'pr';
export const description =
  'Open the PR page for the current branch, a named branch, or a PR number in the browser.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(
    argv,
    canonical,
    async (context) =>
      await openPrAction(
        { branchOrPr: argv['branch-or-pr'], stack: argv.stack },
        context
      )
  );
