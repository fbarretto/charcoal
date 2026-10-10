import { ExitFailedError } from '../errors';
import { CommandFailedError, runGitCommand } from './runner';

export function pushBranch(opts: {
  remote: string;
  branchName: string;
  noVerify: boolean;
  forcePush: boolean;
}): void {
  const push = (forceOption: string) =>
    runGitCommand({
      args: [
        `push`,
        `-u`,
        opts.remote,
        forceOption,
        opts.branchName,
        ...(opts.noVerify ? ['--no-verify'] : []),
      ],
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'pushBranch',
    });

  if (opts.forcePush) {
    push('--force');
    return;
  }
  try {
    push('--force-with-lease');
  } catch (err) {
    if (
      !(err instanceof CommandFailedError && /stale info/.test(err.message))
    ) {
      throw err;
    }
    const remoteSha = remoteShaIfSafeToReplace(opts.remote, opts.branchName);
    push(`--force-with-lease=${opts.branchName}:${remoteSha}`);
  }
}

// The lease was stale: the remote branch moved since we last fetched it. That
// is safe to overwrite when it holds nothing we lack — e.g. GitHub rewrote the
// heads above a merged stack bottom with identical trees.
function remoteShaIfSafeToReplace(remote: string, branchName: string): string {
  const git = (args: string[]) =>
    runGitCommand({
      args,
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'pushBranch',
    });
  const tracking = `refs/remotes/${remote}/${branchName}`;
  git([
    'fetch',
    '--no-write-fetch-head',
    remote,
    `+refs/heads/${branchName}:${tracking}`,
  ]);
  const remoteSha = git(['rev-parse', tracking]);
  const sameTree =
    git(['rev-parse', `${tracking}^{tree}`]) ===
    git(['rev-parse', `refs/heads/${branchName}^{tree}`]);
  const isAncestor = () => {
    try {
      git([
        'merge-base',
        '--is-ancestor',
        tracking,
        `refs/heads/${branchName}`,
      ]);
      return true;
    } catch {
      return false;
    }
  };
  if (!sameTree && !isAncestor()) {
    throw new ExitFailedError(
      [
        `Can't push ${branchName}: ${remote}/${branchName} has commits you don't have.`,
        'If you are collaborating on this stack, run `ch get` to pull them in; to overwrite them, pass `--force`.',
      ].join('\n')
    );
  }
  return remoteSha;
}
