import yargs from 'yargs';
import { graphiteWithoutRepo } from '../lib/runner';
import { openArgs, openUrl } from '../lib/utils/open_url';

export const CHANGELOG_URL = 'https://github.com/fbarretto/charcoal/releases';

const args = openArgs;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'changelog';
export const canonical = 'changelog';
export const description = `Open the Charcoal release notes (${CHANGELOG_URL}) in the browser.`;
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    openUrl(CHANGELOG_URL, { open: argv.open }, context)
  );
