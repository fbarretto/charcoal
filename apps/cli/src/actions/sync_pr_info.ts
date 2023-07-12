import { getPrInfoForBranches, TPRInfoToUpsert } from '../lib/api/pr_info';
import { TContext } from '../lib/context';
import { TEngine } from '../lib/engine/engine';

export async function syncPrInfo(
  branchNames: string[],
  context: TContext
): Promise<void> {
  const authToken = context.userConfig.getAuthToken();
  if (authToken === undefined) {
    return;
  }

  upsertPrInfoForBranches(
    await getPrInfoForBranches(
      branchNames.map((branchName) => ({
        branchName,
        prNumber: context.engine.getPrInfo(branchName)?.number,
      })),
      {
        authToken,
        repoName: context.repoConfig.getRepoName(),
        repoOwner: context.repoConfig.getRepoOwner(),
      },
      context.userConfig
    ),
    context.engine
  );
}

export function upsertPrInfoForBranches(
  prInfoToUpsert: TPRInfoToUpsert,
  engine: TEngine
): void {
  prInfoToUpsert.forEach((pr) =>
    engine.upsertPrInfo(pr.headRefName, {
      number: pr.prNumber,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      reviewDecision: pr.reviewDecision ?? undefined,
      base: pr.baseRefName,
      url: pr.url,
      isDraft: pr.isDraft,
    })
  );
}
