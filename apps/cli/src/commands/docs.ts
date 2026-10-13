import yargs from 'yargs';
import { graphiteWithoutRepo } from '../lib/runner';
import { openUrl } from '../lib/utils/open_url';

export const DOCS_URL = 'https://fbarretto.github.io/charcoal/';

const args = {
  open: {
    describe:
      'Open the page in the browser (default). With --no-open, or without a terminal, only print the URL.',
    demandOption: false,
    default: true,
    type: 'boolean',
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'docs';
export const canonical = 'docs';
export const description = `Open the Charcoal documentation (${DOCS_URL}) in the browser.`;
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) =>
    openUrl(DOCS_URL, { open: argv.open }, context)
  );
