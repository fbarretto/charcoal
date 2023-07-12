import { API_ROUTES } from '@withgraphite/graphite-cli-routes';
import yargs from 'yargs';
import { requestWithArgs } from '../../lib/api/request';
import { graphite } from '../../lib/runner';

const args = {
  name: {
    type: 'string',
    positional: true,
    demandOption: true,
    describe: 'Name of the event.',
  },
  timestamp: {
    type: 'string',
    positional: true,
    demandOption: true,
    describe: 'Time of the event.',
  },
  payload: {
    type: 'string',
    positional: true,
    demandOption: true,
    describe: 'JSON-encoded properties.',
  },
} as const;

export const command = 'log-action [name] [timestamp] [payload]';
export const canonical = 'internal-only log-action';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await requestWithArgs(context.userConfig, API_ROUTES.logActions, {
      actions: [
        {
          name: argv.name,
          timestamp: argv.timestamp,
          details: JSON.parse(argv.payload),
        },
      ],
    });
  });
};
