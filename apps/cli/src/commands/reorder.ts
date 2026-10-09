import yargs from 'yargs';
import { editDownstack } from '../actions/edit/edit_downstack';
import { graphite } from '../lib/runner';

const args = {
  input: {
    describe: `Path to file specifying stack edits. Using this argument skips prompting for stack edits and assumes the user has already formatted a list. Primarly used for unit tests.`,
    demandOption: false,
    hidden: true,
    type: 'string',
  },
  stack: {
    describe: `Include every upstack branch through the tip that \`ch top\` would select. Prompts if ambiguous.`,
    demandOption: false,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'reorder';
export const canonical = 'reorder';
export const description =
  'Reorder the branches between trunk and the current branch, restacking all of their descendants.';
export const builder = args;
export const aliases = ['ro'];

export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    await editDownstack({ inputPath: argv.input, stack: argv.stack }, context);
  });
};
