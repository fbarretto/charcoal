import fs from 'fs-extra';
import yargs from 'yargs';
import {
  aliasFilePath,
  DEFAULT_ALIASES,
  LEGACY_ALIASES,
  LEGACY_PRESET_HEADER,
  parseAliases,
  readAliasFile,
} from '../lib/pre-yargs/aliases';
import { graphiteWithoutRepo } from '../lib/runner';

const args = {
  reset: {
    describe: 'Reset your alias configuration to the defaults.',
    type: 'boolean',
    default: false,
  },
  legacy: {
    describe:
      "Add Graphite's legacy alias preset (pre-v1.0 shortcuts such as `bc` for `create`). Existing aliases are kept.",
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
      fs.writeFileSync(file, DEFAULT_ALIASES);
      context.splog.info('Reset aliases to the defaults.');
      return;
    }
    if (argv.legacy) {
      const current = readAliasFile();
      const defined = parseAliases(current);
      const added = LEGACY_ALIASES.split('\n').filter(
        (line) => !defined.has(line.split(' ')[0])
      );
      const header = current.includes(LEGACY_PRESET_HEADER[0])
        ? []
        : ['', '', ...LEGACY_PRESET_HEADER, '', ''];
      const sep = current && !current.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(
        file,
        current + sep + [...header, ...added].join('\n') + '\n'
      );
      context.splog.info(`Added ${added.length} legacy aliases.`);
      return;
    }
    if (!context.interactive) {
      context.splog.info(readAliasFile().trimEnd());
      return;
    }
    readAliasFile(); // recreates a deleted file with the defaults
    context.userConfig.execEditor(file);
  });
