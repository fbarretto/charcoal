/* eslint-disable no-console */
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { USER_CONFIG_OVERRIDE_ENV } from '../context';

export const DEFAULT_ALIASES = `# Edit this file to configure aliases for Charcoal commands.
# If you delete this file, it will be recreated with the default aliases.
# The first word of each line is the alias, and the rest is the command.
# Lines starting with # are ignored.


# The aliases for ss, ls, and ll are defined by default and must be overridden to be disabled.
# They are shown below to demonstrate the formatting.


ls log short
ll log long
ss submit --stack
`;

// gt's legacy alias preset (https://graphite.com/docs/legacy-alias-preset):
// pre-v1.0 shortcuts mapped to the flat commands that replaced them.
export const LEGACY_PRESET_HEADER = [
  '# GRAPHITE LEGACY PRESET',
  '# SOURCE: https://graphite.com/docs/legacy-alias-preset',
];
export const LEGACY_ALIASES = [
  'bc create',
  'ca modify',
  'cc modify --commit',
  'dss submit',
  'bs submit',
  'uss submit --stack',
  'rs repo sync',
  'bco checkout',
  'bi info',
  'bu up',
  'bd down',
  'bt top',
  'bb bottom',
  'ri init',
  'uso move --onto',
  'dse reorder',
  'brn rename',
  'bdl delete',
  'dsg get',
  'bf fold',
  'bsp split',
  'bsq squash',
  'br restack --only',
  'usr restack --upstack',
  'dsr restack --downstack',
  'sr restack',
  'be modify --interactive-rebase',
  'btr track',
  'but untrack',
  'dsm merge',
].join('\n');

// With the test/user-config override, aliases live next to that file.
function aliasDirs(): { dir: string; legacyDir: string } {
  const override = process.env[USER_CONFIG_OVERRIDE_ENV];
  if (override) {
    return { dir: path.dirname(override), legacyDir: path.dirname(override) };
  }
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return { dir: path.join(configHome, 'charcoal'), legacyDir: os.homedir() };
}

export function aliasFilePath(): string {
  return path.join(aliasDirs().dir, 'aliases');
}

// Creates the alias file when it is missing: migrated once from the legacy
// `~/.graphite_aliases`, otherwise seeded with the defaults.
export function readAliasFile(): string {
  const file = aliasFilePath();
  if (!fs.existsSync(file)) {
    const legacy = path.join(aliasDirs().legacyDir, '.graphite_aliases');
    try {
      fs.ensureDirSync(path.dirname(file));
      if (fs.existsSync(legacy)) {
        fs.moveSync(legacy, file);
      } else {
        fs.writeFileSync(file, DEFAULT_ALIASES);
      }
    } catch {
      return fs.existsSync(legacy)
        ? fs.readFileSync(legacy, 'utf-8')
        : DEFAULT_ALIASES;
    }
  }
  return fs.readFileSync(file, 'utf-8');
}

// One alias per line: `<alias> <expansion...>`. Blank lines and `#` comments
// are ignored. ponytail: whitespace split, no quoting inside expansions.
export function parseAliases(text: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    const [name, ...expansion] = line.trim().split(/\s+/);
    if (name && !name.startsWith('#') && expansion.length) {
      aliases.set(name, expansion);
    }
  }
  return aliases;
}

// Rewrites the first argv token if it is a user alias. Built-in command names
// always win; an alias that shadows one is ignored with a warning.
export function expandAliases(args: string[], builtins: string[]): string[] {
  const [first, ...rest] = args;
  if (first === undefined || first.startsWith('-')) {
    return args;
  }
  const expansion = new Map([
    ...parseAliases(DEFAULT_ALIASES),
    ...parseAliases(readAliasFile()),
  ]).get(first);
  if (!expansion) {
    return args;
  }
  if (builtins.includes(first)) {
    // `ch ls`/`ch ll` are built in; their default alias lines are a no-op.
    if (
      parseAliases(DEFAULT_ALIASES).get(first)?.join(' ') ===
      expansion.join(' ')
    ) {
      return args;
    }
    console.log(
      chalk.yellow(
        `Ignoring alias "${first}": it shadows a built-in command. Run \`ch aliases\` to edit.`
      )
    );
    return args;
  }
  return [...expansion, ...rest];
}
