import { TChangedFile } from '../engine/changed_files';
import { runGitCommand } from './runner';

// Using pretty formats specified here
// https://git-scm.com/docs/pretty-formats

export function getFilesChanged(from: string, to: string): TChangedFile[] {
  const result = runGitCommand({
    args: [`diff`, '-z', '--name-status', from, to],
    onError: 'ignore',
    resource: 'getFilesChanged',
  });

  const files: TChangedFile[] = [];

  const tokens = result.split('\0');
  // Last character is always whitespace as it ends in a NULL terminator
  for (let i = 0; i < tokens.length - 1; i) {
    const rawStatus = tokens[i];

    /**
     * R and C are returned with scores. For example, renamed with 100% match is encoded
     * as R100.
     */
    const status = statusFromStatusCode(rawStatus[0]);

    // Renamed and copied files include the origin before the destination
    const parameters = status === 'copied' || status === 'renamed' ? 2 : 1;
    const path = tokens[i + parameters];

    files.push({ path, status });

    i += parameters + 1;
  }

  return files;
}

function statusFromStatusCode(code: string) {
  switch (code) {
    case 'A':
      return 'added' as const;
    case 'C':
      return 'copied' as const;
    case 'D':
      return 'deleted' as const;
    case 'M':
      return 'modified' as const;
    case 'R':
      return 'renamed' as const;

    default:
      return 'modified' as const;
  }
}
