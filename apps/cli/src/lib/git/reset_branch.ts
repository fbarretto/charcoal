import { runGitCommand } from './runner';

export function softReset(sha: string): void {
  runGitCommand({
    args: [`reset`, `-q`, `--soft`, sha],
    onError: 'throw',
    resource: 'softReset',
  });
}

export function hardReset(sha?: string): void {
  runGitCommand({
    args: [`reset`, `-q`, `--hard`, ...(sha ? [sha] : [])],
    onError: 'throw',
    resource: 'hardReset',
  });
}

export function trackedReset(sha: string): void {
  runGitCommand({
    args: [`reset`, `-Nq`, sha],
    onError: 'throw',
    resource: 'trackedReset',
  });
}
