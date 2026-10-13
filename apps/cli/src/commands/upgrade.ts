import yargs from 'yargs';
import { upgradeAction } from '../actions/upgrade';
import { graphiteWithoutRepo } from '../lib/runner';

const args = {} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'upgrade';
export const canonical = 'upgrade';
export const description =
  'Upgrade ch the way it was installed: `brew upgrade charcoal` for Homebrew, `npm i -g @fbarretto/charcoal` for npm; otherwise print both commands.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    upgradeAction(context)
  );
