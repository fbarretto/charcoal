import fs from 'fs-extra';
import yargs from 'yargs';
import {
  aliasFilePath,
  LEGACY_ALIASES,
  parseAliases,
  readAliasFile,
} from '../lib/pre-yargs/aliases';
import { graphiteWithoutRepo } from '../lib/runner';

const args = {
  reset: {
    describe: 'Remove all aliases.',
    type: 'boolean',
    default: false,
  },
  legacy: {
    describe:
      'Add the pre-v1.0 noun-verb shortcuts (e.g. `ss` for `submit --stack`). Existing aliases are kept.',
    type: 'boolean',
    default: false,
  },
} as const;
type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;

export const command = 'aliases';
export const canonical = 'aliases';
export const description =
  'Edit your command aliases in $EDITOR, one per line: `<alias> <expansion...>` (e.g. `ss submit --stack`). Prints them when non-interactive.';
export const builder = args;
export const handler = async (argv: argsT): Promise<void> =>
  graphiteWithoutRepo(argv, canonical, async (context) => {
    const file = aliasFilePath();
    if (argv.reset) {
      fs.writeFileSync(file, '');
      context.splog.info('Removed all aliases.');
      return;
    }
    if (argv.legacy) {
      const current = readAliasFile();
      const defined = parseAliases(current);
      const added = LEGACY_ALIASES.split('\n').filter(
        (line) => !defined.has(line.split(' ')[0])
      );
      const sep = current && !current.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(file, current + sep + added.join('\n') + '\n');
      context.splog.info(`Added ${added.length} legacy aliases.`);
      return;
    }
    if (!context.interactive) {
      context.splog.info(readAliasFile().trimEnd());
      return;
    }
    fs.ensureFileSync(file);
    context.userConfig.execEditor(file);
  });
