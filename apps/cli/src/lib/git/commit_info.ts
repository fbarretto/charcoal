import { runGitCommand } from './runner';

// Using pretty formats specified here

export function getCommitAuthor(ref: string): string {
  return runGitCommand({
    args: [`log`, '--format=%an', '-n', '1', ref],
    onError: 'ignore',
    resource: 'commitInfoAuthor',
  });
}

export function getCommitDate(ref: string): Date {
  const result = runGitCommand({
    args: [`log`, '--format=%cd', '-n', '1', ref],
    onError: 'ignore',
    resource: 'commitInfoBody',
  });

  return new Date(result);
}
