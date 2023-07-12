import { BranchInfo } from '@withgraphite/gti-cli-shared-types';
import yargs from 'yargs';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'log';
export const canonical = 'interactive log';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const commitInfos: Array<BranchInfo> = await Promise.all(
      context.engine.allBranchNames.map(async (branchName) => {
        const prInfo = context.engine.getPrInfo(branchName);
        const parent = context.engine.getParent(branchName);

        const [commitDate, commitAuthor, isMergedIntoTrunk] = await Promise.all(
          [
            context.engine.getCommitDate(branchName),
            context.engine.getCommitAuthor(branchName),
            context.engine.isMergedIntoTrunk(branchName),
          ]
        );

        return {
          branch: branchName,

          // Cache
          parents: parent ? [parent] : [],
          isHead: context.engine.currentBranch === branchName,
          partOfTrunk: isMergedIntoTrunk || context.engine.isTrunk(branchName),

          // Git
          author: commitAuthor,
          date: commitDate.toISOString(),

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
