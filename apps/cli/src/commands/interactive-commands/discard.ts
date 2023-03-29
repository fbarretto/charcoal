import yargs from 'yargs';
import { graphite } from '../../lib/runner';
import { composeGit } from '../../lib/git/git';

const args = {} as const;

export const command = 'discard';
export const canonical = 'interactive discard';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async () => {
    const git = composeGit();

    git.hardReset();
  });
};
