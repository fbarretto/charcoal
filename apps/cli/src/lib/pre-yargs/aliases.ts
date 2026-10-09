/* eslint-disable no-console */
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { USER_CONFIG_OVERRIDE_ENV } from '../context';
import { userConfigFactory } from '../spiffy/user_config_spf';

// Pre-v1.0 noun-verb shortcuts (e.g. `ss` = `stack submit`) mapped to the
// flat commands that replaced them in the v1.0 flattening.
export const LEGACY_ALIASES = [
  'bb bottom',
  'bc create',
  'bco checkout',
  'bd down',
  'bdl delete',
  'be edit',
  'bf fold',
  'bi info',
  'br restack --only',
  'brn rename',
  'bsp split',
  'bsq squash',
  'bt top',
  'btr track',
  'bu up',
  'but untrack',
  'ca modify',
  'cc modify --commit',
  'sf restack',
  'sr restack',
  'ss submit --stack',
  'st test',
  'dse reorder',
  'dsg get',
  'dsr restack --downstack',
  'dss submit',
  'dst test --downstack',
  'dstr track --downstack',
  'usf restack --upstack',
  'uso move',
  'usr restack --upstack',
  'ust test --upstack',
  'ri repo init',
  'rs repo sync',
].join('\n');

export function aliasFilePath(): string {
  const userConfigPath = userConfigFactory.load(
    process.env[USER_CONFIG_OVERRIDE_ENV]
  ).path;
  return path.join(path.dirname(userConfigPath), '.graphite_aliases');
}

export function readAliasFile(): string {
  const file = aliasFilePath();
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
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
  const expansion = parseAliases(readAliasFile()).get(first);
  if (!expansion) {
    return args;
  }
  if (builtins.includes(first)) {
    console.log(
      chalk.yellow(
        `Ignoring alias "${first}": it shadows a built-in command. Run \`ch aliases\` to edit.`
      )
    );
    return args;
  }
  return [...expansion, ...rest];
}
