import chalk from 'chalk';
import { githubRepoSlug } from '../lib/api/github_repo';
import { findStackForPr, prNumbersOf } from '../lib/api/gh_stacks';
import { openPrInBrowser } from '../lib/api/pr_info';
import { TContext } from '../lib/context';
import { ExitFailedError } from '../lib/errors';

export async function openPrAction(
  opts: { branchOrPr?: string; stack: boolean },
  context: TContext
): Promise<void> {
  const repo = githubRepoSlug(context);
  for (const prNumber of resolvePrNumbers(opts, context)) {
    await openPrInBrowser(prNumber, repo);
  }
}

function resolvePrNumbers(
  opts: { branchOrPr?: string; stack: boolean },
  context: TContext
): number[] {
  const { branchOrPr } = opts;
  if (
    branchOrPr &&
    /^\d+$/.test(branchOrPr) &&
    !context.engine.branchExists(branchOrPr)
  ) {
    return [Number(branchOrPr)];
  }

  const branchName = branchOrPr ?? context.engine.currentBranchPrecondition;
  if (!context.engine.branchExists(branchName)) {
    throw new ExitFailedError(
      `${chalk.yellow(branchName)} is neither a branch nor a PR number.`
    );
  }
  const ghStack = opts.stack && githubStackPrs(branchName, context);
  if (ghStack) {
    return ghStack;
  }
  const branches = opts.stack
    ? context.engine
        .getRelativeStack(branchName, {
          recursiveParents: true,
          currentBranch: true,
          recursiveChildren: true,
        })
        .filter((b) => !context.engine.isTrunk(b))
    : [branchName];

  const prs = branches.map((b) => ({
    branch: b,
    number: context.engine.getPrInfo(b)?.number,
  }));
  const withoutPr = prs.filter((pr) => pr.number === undefined);
  if (withoutPr.length > 0) {
    throw new ExitFailedError(
      [
        `No PR found for: ${withoutPr
          .map((pr) => chalk.yellow(pr.branch))
          .join(', ')}.`,
        `Run ${chalk.cyan('ch submit')} to create one.`,
      ].join('\n')
    );
  }
  return prs.flatMap((pr) => (pr.number === undefined ? [] : [pr.number]));
}

// The PRs of the GitHub stack the branch's PR belongs to, if any.
function githubStackPrs(
  branchName: string,
  context: TContext
): number[] | undefined {
  const prNumber = context.engine.getPrInfo(branchName)?.number;
  if (prNumber === undefined || !context.repoConfig.getGithubStacks()) {
    return undefined;
  }
  try {
    const stack = findStackForPr(githubRepoSlug(context), prNumber);
    return stack ? prNumbersOf(stack) : undefined;
  } catch {
    return undefined; // no stacks API: fall back to the local stack
  }
}
