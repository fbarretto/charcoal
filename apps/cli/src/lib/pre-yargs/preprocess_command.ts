import { expandAliases } from './aliases';
import { GIT_COMMAND_ALLOWLIST, passthrough } from './passthrough';

// `--cwd <dir>` must take effect before alias expansion, git passthrough and
// repo detection, so it is consumed here rather than by yargs.
export function applyCwd(args: string[]): string[] {
  const i = args.findIndex((a) => a === '--cwd' || a.startsWith('--cwd='));
  if (i === -1) {
    return args;
  }
  const [flag] = args.slice(i, i + 1);
  const inline = flag.startsWith('--cwd=');
  const dir = inline ? flag.slice('--cwd='.length) : args[i + 1];
  if (dir) {
    process.chdir(dir);
  }
  return [...args.slice(0, i), ...args.slice(i + (inline ? 1 : 2))];
}

// gt's `--help --all` lists everything, hidden options included.
function applyHelpAll(args: string[]): string[] {
  const isTopLevelHelpAll =
    args.every((a) => a.startsWith('-')) &&
    args.includes('--all') &&
    (args.includes('--help') || args.includes('-h'));
  return isTopLevelHelpAll
    ? args.map((a) => (a === '--all' ? '--show-hidden' : a))
    : args;
}

export function getYargsInput(builtins: string[]): string[] {
  const args = expandAliases(applyHelpAll(applyCwd(process.argv.slice(2))), [
    ...builtins,
    ...GIT_COMMAND_ALLOWLIST,
  ]);
  passthrough([...process.argv.slice(0, 2), ...args]);
  return args;
}
