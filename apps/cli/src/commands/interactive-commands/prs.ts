import { PRInfo } from '@withgraphite/gti-cli-shared-types';
import yargs from 'yargs';
import { syncPrInfo } from '../../actions/sync_pr_info';
import { graphite } from '../../lib/runner';

const args = {} as const;

export const command = 'prs';
export const canonical = 'interactive prs';
export const description = false;
export const builder = args;

type argsT = yargs.Arguments<yargs.InferredOptionTypes<typeof args>>;
export const handler = async (argv: argsT): Promise<void> => {
  return graphite(argv, canonical, async (context) => {
    const syncInfo = await syncPrInfo(context.engine.allBranchNames, context);

    context.splog.info(
      JSON.stringify(
        syncInfo.map((info): PRInfo => {
          return {
            title: info.title,
            branchName: info.headRefName,
            isDraft: info.isDraft,
            number: info.prNumber.toString(),
            state: info.state,
          };
        }) as PRInfo[]
      )
    );
  });
};
