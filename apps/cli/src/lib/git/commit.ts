import { runGitCommand } from './runner';

export type TCommitOpts = {
  amend?: boolean;
  message?: string;
  noEdit?: boolean;
  edit?: boolean;
  patch?: boolean;
  verbose?: number;
  resetAuthor?: boolean;
  noVerify?: boolean;
};
export function commit(opts: TCommitOpts & { noVerify: boolean }): void {
  runGitCommand({
    args: [
      'commit',
      ...(opts.amend ? [`--amend`] : []),
      ...(opts.message ? [`-m`, opts.message] : []),
      ...(opts.noEdit ? [`--no-edit`] : []),
      ...(opts.edit ? [`-e`] : []),
      ...(opts.patch ? [`-p`] : []),
      ...Array(opts.verbose ?? 0).fill('-v'),
      ...(opts.resetAuthor ? ['--reset-author'] : []),
      ...(opts.noVerify ? ['-n'] : []),
    ],
    options: {
      stdio: 'inherit',
    },
    onError: 'throw',
    resource: 'commit',
  });
}

// yargs collects a repeated `-m` into an array; git joins them as paragraphs.
export function joinMessages(
  message: string | string[] | undefined
): string | undefined {
  return Array.isArray(message) ? message.join('\n\n') : message;
}
