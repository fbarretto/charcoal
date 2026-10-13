import { Argv } from 'yargs';
import { registerCommands } from '../lib/register_commands';
import * as install from './skill-commands/install';
import * as print from './skill-commands/print';

export const command = 'skill <command>';
export const desc =
  'Install or print the Charcoal agent skill (SKILL.md) for Claude Code and other agents. It matches this version of ch.';

export const builder = function (yargs: Argv): Argv {
  return registerCommands(yargs, [install, print]).strict().demandCommand();
};
