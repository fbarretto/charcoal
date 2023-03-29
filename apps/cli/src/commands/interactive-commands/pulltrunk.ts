import yargs from 'yargs';
import { pullTrunk } from '../../actions/sync/sync';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'pulltrunk';
export const canonical = 'interactive pulltrunk';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await pullTrunk(true, context);
  });
};
