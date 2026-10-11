import { runGitCommand } from './runner';
import { getShaOrThrow } from './get_sha';

const FETCH_HEAD = 'refs/gt-metadata/FETCH_HEAD';
const FETCH_BASE = 'refs/gt-metadata/FETCH_BASE';
export function fetchBranch(remote: string, branchName: string): void {
  runGitCommand({
    args: [
      `fetch`,
      `--no-write-fetch-head`,
      // Keep refs/remotes/<remote>/<branch> at the last version we pushed or
      // took, which compareToFetchHead and push leases rely on.
      `--refmap=`,
      `-f`,
      remote,
      `${branchName}:${FETCH_HEAD}`,
    ],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'fetchBranch',
  });
}
export function readFetchHead(): string {
  return getShaOrThrow(FETCH_HEAD);
}

export function readFetchBase(): string {
  return getShaOrThrow(FETCH_BASE);
}

export function writeFetchBase(sha: string): void {
  runGitCommand({
    args: [`update-ref`, FETCH_BASE, sha],
    options: { stdio: 'pipe' },
    onError: 'throw',
    resource: 'writeFetchBase',
  });
}

// How a local branch relates to the last fetched head: AHEAD when there is
// nothing to pull (the fetched head is already in it, or is still the version
// we last pushed or took, so a local restack is newer), BEHIND when every one
// of its commits since `base` is on the fetched head or patch-equivalent to one
// there (taking the fetched head loses nothing), else DIVERGED.
export function compareToFetchHead(
  branchRevision: string,
  base: string,
  lastSeenRemote: string
): 'AHEAD' | 'BEHIND' | 'DIVERGED' {
  const head = readFetchHead();
  if (head === lastSeenRemote) {
    return 'AHEAD';
  }
  try {
    runGitCommand({
      args: ['merge-base', '--is-ancestor', head, branchRevision],
      options: { stdio: 'pipe' },
      onError: 'throw',
      resource: 'compareToFetchHead',
    });
    return 'AHEAD';
  } catch {
    // not an ancestor
  }
  const unpulled = runGitCommand({
    args: ['cherry', head, branchRevision, base],
    onError: 'throw',
    resource: 'compareToFetchHead',
  });
  return unpulled.split('\n').some((l) => l.startsWith('+'))
    ? 'DIVERGED'
    : 'BEHIND';
}
