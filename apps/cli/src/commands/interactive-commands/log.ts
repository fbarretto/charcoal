import yargs from 'yargs';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'log';
export const canonical = 'interactive log';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    context.splog.info(context.metaCache.debug);
  });
};
