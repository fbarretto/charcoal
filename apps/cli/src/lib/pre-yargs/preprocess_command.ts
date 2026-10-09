import { expandAliases } from './aliases';
import { GIT_COMMAND_ALLOWLIST, passthrough } from './passthrough';

export function getYargsInput(builtins: string[]): string[] {
  const args = expandAliases(process.argv.slice(2), [
    ...builtins,
    ...GIT_COMMAND_ALLOWLIST,
  ]);
  passthrough([...process.argv.slice(0, 2), ...args]);
  return args;
}
