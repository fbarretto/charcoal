import { API_ROUTES } from '@withgraphite/graphite-cli-routes';
import yargs from 'yargs';
import { graphite } from '../../lib/runner';
import { requestWithArgs } from '../../lib/api/request';

const args = {} as const;

export const command = 'repo-message';
export const canonical = 'interactive repo-message';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const response = await requestWithArgs(
      context.userConfig,
      API_ROUTES.getRepoMessage,
      {},
      {
        org: context.repoConfig.getRepoOwner(),
        repo: context.repoConfig.getRepoName(),
      }
    );

    if (response._response.status !== 200 || !response.message) {
      return;
    }

    context.splog.message(response.message.text);
  });
};
