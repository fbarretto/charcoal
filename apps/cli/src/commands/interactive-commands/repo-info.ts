import yargs from 'yargs';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'repo-info';
export const canonical = 'interactive repo-info';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const hostname = context.repoConfig.getRepoHost();
    const owner = context.repoConfig.getRepoOwner();
    const name = context.repoConfig.getRepoName();

    context.splog.info(
      JSON.stringify({
        hostname,
        owner,
        name,
      })
    );
  });
};
