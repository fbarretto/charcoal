import yargs from 'yargs';

import { FISH_COMPLETION } from '../lib/fish_completion';
import { graphiteWithoutRepo } from '../lib/runner';
const args = {} as const;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'fish';
export const canonical = 'fish';
export const description =
  'Print a fish tab-completion script to stdout (`ch fish >> ~/.config/fish/completions/ch.fish`).';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) => {
    context.splog.page(FISH_COMPLETION);
  });
