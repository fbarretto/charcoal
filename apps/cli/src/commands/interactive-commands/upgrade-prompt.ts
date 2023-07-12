import { API_ROUTES } from '@withgraphite/graphite-cli-routes';
import yargs from 'yargs';
import { graphite } from '../../lib/runner';
import { requestWithArgs } from '../../lib/api/request';
import { version } from '../../../package.json';

const args = {} as const;

export const command = 'upgrade-prompt';
export const canonical = 'interactive upgrade-prompt';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const response = await requestWithArgs(
      context.userConfig,
      API_ROUTES.upgradePrompt,
      {},
      {
        user: context.userEmail ?? 'NotFound',
        currentVersion: version,
      }
    );

    if (response._response.status == 200) {
      if (response.prompt) {
        context.splog.message(response.prompt.message);
      }
    }
  });
};
