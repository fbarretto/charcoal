import chalk from 'chalk';
import { githubRepoSlug } from '../lib/api/github_repo';
import {
  findStackForPr,
  GhApiError,
  openPrNumbersOf,
  prNumbersOf,
  unstack,
} from '../lib/api/gh_stacks';
import { TContext } from '../lib/context';
import { ExitFailedError, KilledError } from '../lib/errors';
import { forgetGhStack } from './submit/link_gh_stack';

const prList = (prs: number[]) => prs.map((n) => `#${n}`).join(' → ');

export async function unstackAction(
  args: { force: boolean },
  context: TContext
): Promise<void> {
  const branch = context.engine.currentBranchPrecondition;
  const pr = context.engine.getPrInfo(branch)?.number;
  if (!pr) {
    throw new ExitFailedError(`${chalk.cyan(branch)} has no PR.`);
  }
  const repo = githubRepoSlug(context);

  let stack;
  try {
    stack = findStackForPr(repo, pr);
  } catch (err) {
    if (err instanceof GhApiError && err.status === 404) {
      throw new ExitFailedError(`Stacked PRs are not enabled for ${repo}.`);
    }
    throw err;
  }
  if (!stack) {
    context.splog.info(`PR #${pr} is not in a GitHub stack.`);
    return;
  }

  if (
    !args.force &&
    context.interactive &&
    !(
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: `Unstack GitHub stack #${stack.number} (${prList(
          prNumbersOf(stack)
        )})?`,
        initial: true,
      })
    ).value
  ) {
    throw new KilledError();
  }

  const kept = unstack(repo, stack.number);
  forgetGhStack(stack.number, context);
  const stuck = kept ? openPrNumbersOf(kept) : []; // merged PRs stay listed
  context.splog.info(
    stuck.length
      ? `Unstacked GitHub stack #${stack.number}; GitHub kept ${prList(
          stuck
        )} stacked (queued for merge or auto-merge).`
      : `Dissolved GitHub stack #${stack.number}.`
  );
}
