import { TStatusFile } from '../engine/changed_files';
import { runGitCommand } from './runner';

// Using pretty formats specified here

export function getStatus(): TStatusFile[] {
  const result = runGitCommand({
    args: [`status`, '-z', '--porcelain'],
    onError: 'ignore',
    resource: 'getStatus',
  });

  const files: TStatusFile[] = [];

  const tokens = result.split('\0');
  // Last character is always whitespace as it ends in a NULL terminator
  for (let i = 0; i < tokens.length - 1; i) {
    const rawStatus = tokens[i];

    // https://git-scm.com/docs/git-status#_short_format
    const indexStatus = rawStatus[0];
    const workingTreeStatus = rawStatus[1];
    const path = rawStatus.slice(3);

    const status = statusFromStatusCode(indexStatus, workingTreeStatus);

    // Renamed and copied files include the origin before the destination
    const parameters = status === 'copied' || status === 'renamed' ? 2 : 1;

    files.push({ path, status });

    i += parameters;
  }

  return files;
}

function statusFromStatusCode(indexStatus: string, workingTreeStatus: string) {
  if (
    (indexStatus === 'A' && workingTreeStatus === 'A') ||
    (indexStatus === 'D' && workingTreeStatus === 'D') ||
    indexStatus === 'U' ||
    workingTreeStatus === 'U'
  ) {
    return 'unresolved' as const;
  }

  if (workingTreeStatus === 'M' || workingTreeStatus === 'T') {
    return 'modified' as const;
  }

  if (workingTreeStatus === 'D') {
    return 'deleted' as const;
  }

  if (workingTreeStatus === 'C') {
    return 'copied' as const;
  }

  if (workingTreeStatus === 'R') {
    return 'renamed' as const;
  }

  if (workingTreeStatus === 'D') {
    return 'untracked_deleted' as const;
  }

  if (workingTreeStatus === '?') {
    return 'untracked_added' as const;
  }

  if (
    workingTreeStatus === ' ' &&
    (indexStatus === 'M' || indexStatus === 'T')
  ) {
    return 'modified' as const;
  }

  if (workingTreeStatus === ' ' && indexStatus === 'A') {
    return 'added' as const;
  }

  if (workingTreeStatus === ' ' && indexStatus === 'R') {
    return 'renamed' as const;
  }

  if (workingTreeStatus === ' ' && indexStatus === 'C') {
    return 'copied' as const;
  }

  return 'modified';
}
