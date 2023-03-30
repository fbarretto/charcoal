import yargs from 'yargs';
import { graphite } from '../../lib/runner';

const args = {
  file: {
    demandOption: true,
    type: 'string',
    positional: true,
    describe: 'The file to restore.',
  },
} as const;

export const command = 'restore [file]';
export const canonical = 'interactive restore';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    context.engine.restoreFile(argv.file);
  });
};
