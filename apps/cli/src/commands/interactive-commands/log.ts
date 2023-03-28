import { BranchInfo } from '@withgraphite/gti-cli-shared-types';
import yargs from 'yargs';
import { composeGit } from '../../lib/git/git';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'log';
export const canonical = 'interactive log';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const git = composeGit();

    const commitInfos: Array<BranchInfo> = await Promise.all(
      context.metaCache.allBranchNames.map((branchName) => {
        const prInfo = context.metaCache.getPrInfo(branchName);
        const parent = context.metaCache.getParent(branchName);

        const commitDate = git.getCommitDate(branchName);
        const commitAuthor = git.getCommitAuthor(branchName);

        const filesChanged = context.metaCache.getChangedFiles(branchName);

        return {
          branch: branchName,

          // Cache
          parents: parent ? [parent] : [],
          isHead: context.metaCache.currentBranch === branchName,
          partOfTrunk:
            context.metaCache.isMergedIntoTrunk(branchName) ||
            context.metaCache.isTrunk(branchName),

          // Git
          author: commitAuthor,
          date: commitDate.toISOString(),

          // Files
          filesSample: filesChanged.map((file) => ({
            path: file.path,
            status: {
              added: 'A' as const,
              modified: 'M' as const,
              deleted: 'R' as const,
              renamed: 'M' as const,
              copied: 'A' as const,
            }[file.status],
          })),
          totalFileCount: filesChanged.length,

          // PR
          title: prInfo?.title || '',
          description: prInfo?.body || '',
          pr:
            prInfo && prInfo.number
              ? {
                  number: prInfo.number?.toString(),
                  isDraft: prInfo.isDraft || false,
                }
              : undefined,
        };
      })
    );

    context.splog.info(JSON.stringify(commitInfos));
  });
};
