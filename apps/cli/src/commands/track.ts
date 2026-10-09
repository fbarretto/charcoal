import yargs from 'yargs';
import { trackBranch } from '../actions/track_branch';
import { graphite } from '../lib/runner';

const args = {
  branch: {
    describe: `Branch to begin tracking. Defaults to the current branch.`,
    demandOption: false,
    positional: true,
    type: 'string',
    hidden: true,
  },
  parent: {
    describe: `The tracked branch's parent. If provided, only one branch is tracked. If unset, prompts for a parent branch, recursively tracking untracked parents.`,
    demandOption: false,
    positional: false,
    type: 'string',
    alias: 'p',
  },
  force: {
    describe: `Sets the parent to the most recent ancestor of each branch being tracked, without prompting. Takes precedence over \`--parent\``,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'f',
  },
  downstack: {
    describe: `No-op: tracking is recursive by default.`,
    demandOption: false,
    default: false,
    type: 'boolean',
    alias: 'd',
    hidden: true,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'track [branch]';
export const canonical = 'track';
export const aliases = ['tr'];
export const description = [
  'Start tracking the current (or provided) branch with Charcoal by selecting its parent.',
  'Untracked parents are tracked recursively, until a tracked branch or trunk is reached.',
  'This command can also be used to fix corrupted Charcoal metadata.',
].join(' ');
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphite(argv, canonical, async (context) =>
    trackBranch(
      {
        branchName: argv.branch,
        parentBranchName: argv.parent,
        force: argv.force,
      },
      context
    )
  );
