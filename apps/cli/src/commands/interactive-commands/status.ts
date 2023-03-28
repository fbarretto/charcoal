import { ChangedFile } from '@withgraphite/gti-cli-shared-types';
import yargs from 'yargs';
import { TStatusFile } from '../../lib/engine/changed_files';
import { composeGit } from '../../lib/git/git';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'status';
export const canonical = 'interactive status';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const git = composeGit();
    const status = git.getStatus();
    const rebaseInProgress = context.metaCache.rebaseInProgress();

    const statusForInteractive: ChangedFile[] = status.map((file) => ({
      status: interactiveStatusFromStatus(file.status, rebaseInProgress),
      path: file.path,
    }));

    context.splog.info(JSON.stringify(statusForInteractive));
  });
};

function interactiveStatusFromStatus(
  status: TStatusFile['status'],
  rebaseInProgress: boolean
): ChangedFile['status'] {
  if (status === 'unresolved') {
    return 'U';
  }

  if (rebaseInProgress) {
    return 'Resolved';
  }

  if (status === 'untracked_added') {
    return '?';
  }

  if (status === 'untracked_deleted') {
    return '!';
  }

  if (status === 'added') {
    return 'A';
  }

  if (status === 'deleted') {
    return 'R';
  }

  return 'M';
}
