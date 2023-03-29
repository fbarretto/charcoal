import yargs from 'yargs';
import { currentBranchOnto } from '../../actions/current_branch_onto';
import { graphite } from '../../lib/runner';

const args = {
  source: {
    type: 'string',
    required: true,
    positional: true,
  },
  dest: {
    type: 'string',
    required: true,
    positional: true,
  },
} as const;

export const command = 'rebase [source] [dest]';
export const canonical = 'interactive rebase';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const current = context.metaCache.currentBranch;
    context.metaCache.checkoutBranch(argv.source);
    currentBranchOnto(argv.dest, context);
    current && context.metaCache.checkoutBranch(current);
  });
};
