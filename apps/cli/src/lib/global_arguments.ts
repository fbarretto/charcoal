import yargs from 'yargs';

export const globalArgumentsOptions = {
  interactive: {
    type: 'boolean',
    demandOption: false,
    description:
      'Prompt the user. On by default when stdin and stdout are terminals; disable with --no-interactive.',
  },
  quiet: {
    alias: 'q',
    default: false,
    type: 'boolean',
    demandOption: false,
    description: 'Minimize output to the terminal. Implies --no-interactive.',
  },
  verify: {
    default: true,
    type: 'boolean',
    demandOption: false,
    description: 'Run git hooks. Disable with --no-verify.',
  },
  cwd: {
    type: 'string',
    demandOption: false,
    description: 'Working directory in which to perform operations.',
  },
  debug: {
    default: false,
    type: 'boolean',
    demandOption: false,
    description: 'Display debug output.',
  },
} as const;

export type TGlobalArguments = Partial<
  yargs.InferredOptionTypes<typeof globalArgumentsOptions>
>;
