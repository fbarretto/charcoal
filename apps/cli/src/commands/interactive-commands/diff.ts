import yargs from 'yargs';
import { PreconditionsFailedError } from '../../lib/errors';
import { composeGit } from '../../lib/git/git';
import { graphite } from '../../lib/runner';

const args = {
  target: {
    demandOption: true,
    choices: ['uncommitted', 'head', 'stack'],
    positional: true,
    describe: 'What to diff against.',
  },
  ref: {
    type: 'string',
    describe: 'Only respected for stack merge. The branch to show changes of.',
  },
} as const;

export const command = 'diff [target]';
export const canonical = 'interactive diff';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const git = composeGit();

    if (argv.target === 'uncommitted') {
      context.splog.info(git.getDiff('HEAD', undefined));
      return;
    }

    if (argv.target === 'head') {
      context.splog.info(git.getDiff('HEAD~', undefined));
      return;
    }

    if (argv.target === 'stack') {
      const current = argv.ref || context.metaCache.currentBranch;
      if (!current) {
        throw new PreconditionsFailedError(
          'Running stack diff when not on a branch and without passing --ref'
        );
      }

      context.splog.info(context.metaCache.getStackDiff(current));
      return;
    }
  });
};
