import chalk from 'chalk';
import { githubRepoSlug } from '../../lib/api/github_repo';
import {
  addToStack,
  createStack,
  findStackForPr,
  GhApiError,
  openPrNumbersOf,
  prNumbersOf,
  TGhStack,
  unstack,
} from '../../lib/api/gh_stacks';
import { TContext } from '../../lib/context';
import { ExitFailedError } from '../../lib/errors';

const openPr = (branch: string, context: TContext): number | undefined => {
  const prInfo = context.engine.getPrInfo(branch);
  return prInfo?.number && !['MERGED', 'CLOSED'].includes(prInfo.state ?? '')
    ? prInfo.number
    : undefined;
};

// The longest path down from `branch` through branches that have open PRs.
function longestPathDown(branch: string, context: TContext): string[] {
  let longest: string[] = [];
  for (const child of context.engine.getChildren(branch)) {
    const path = openPr(child, context) ? longestPathDown(child, context) : [];
    if (path.length > longest.length) {
      longest = path;
    }
  }
  return [branch, ...longest];
}

function subtree(branch: string, context: TContext): string[] {
  return [
    branch,
    ...context.engine
      .getChildren(branch)
      .flatMap((child) => subtree(child, context)),
  ];
}

/**
 * The root-to-leaf chain through `branch` to link as one GitHub stack, as
 * bottom→top branches with their PR numbers, plus the PR'd branches of the
 * same tree that a linear stack can't include.
 */
export function ghStackChain(
  branch: string,
  context: TContext
): { chain: { branch: string; pr: number }[]; leftOut: string[] } {
  const ancestors: string[] = [];
  for (
    let b = context.engine.getParent(branch);
    b && !context.engine.isTrunk(b);
    b = context.engine.getParent(b)
  ) {
    ancestors.unshift(b);
  }
  const branches = [...ancestors, ...longestPathDown(branch, context)];

  // Skip leading branches without a PR, then stop at the first gap: a PR
  // above a PR-less branch can't form a valid base→head chain.
  const chain: { branch: string; pr: number }[] = [];
  for (const b of branches) {
    const pr = openPr(b, context);
    if (pr) {
      chain.push({ branch: b, pr });
    } else if (chain.length) {
      break;
    }
  }

  const linked = new Set(chain.map((c) => c.branch));
  const leftOut = subtree(branches[0], context).filter(
    (b) => !linked.has(b) && openPr(b, context)
  );
  return { chain, leftOut };
}

/**
 * Make GitHub's stack for the chain through `branch` match the local stack.
 * Never fails: stacked PRs are a convenience on top of a successful submit.
 */
export function linkGithubStack(branch: string, context: TContext): void {
  const { chain, leftOut } = ghStackChain(branch, context);
  if (chain.length < 2) {
    return;
  }
  try {
    const stack = reconcile(
      githubRepoSlug(context),
      chain.map((c) => c.pr),
      context
    );
    if (!stack) {
      return;
    }
    for (const { branch: b } of chain) {
      const ghStackNumber = b === chain[0].branch ? stack.number : undefined;
      if (context.engine.getPrInfo(b)?.ghStackNumber !== ghStackNumber) {
        context.engine.upsertPrInfo(b, { ghStackNumber });
      }
    }
    if (leftOut.length) {
      context.splog.warn(
        `GitHub stacks are linear; linked ${chain
          .map((c) => c.branch)
          .join(' → ')} and left out ${leftOut.join(', ')}.`
      );
    }
  } catch (err) {
    context.splog.warn(
      `Could not link the GitHub stack: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

function reconcile(
  repo: string,
  prs: number[],
  context: TContext
): TGhStack | undefined {
  let existing: TGhStack | undefined;
  try {
    existing = findStackForPr(repo, prs[0]);
  } catch (err) {
    if (err instanceof GhApiError && err.status === 404) {
      context.splog.debug(`Stacked PRs are not enabled for ${repo}.`);
      return undefined;
    }
    throw err;
  }

  const current = existing ? prNumbersOf(existing) : [];
  const isPrefix = current.every((pr, i) => prs[i] === pr);
  const describe = (s: TGhStack) =>
    `GitHub stack ${chalk.cyan(`#${s.number}`)}: ${prNumbersOf(s)
      .map((n) => `#${n}`)
      .join(' → ')}`;

  if (existing && isPrefix) {
    if (current.length === prs.length) {
      context.splog.debug(`${describe(existing)} is up to date.`);
      return existing;
    }
    const added = addToStack(repo, existing.number, prs.slice(current.length));
    context.splog.info(`🥞 Updated ${describe(added)}`);
    return added;
  }

  if (existing) {
    const kept = unstack(repo, existing.number);
    if (kept) {
      context.splog.warn(
        `GitHub kept ${prNumbersOf(kept)
          .map((n) => `#${n}`)
          .join(', ')} stacked (queued for merge); not relinking.`
      );
      return undefined;
    }
  }
  const created = createStack(repo, prs);
  context.splog.info(`🥞 Linked ${describe(created)}`);
  return created;
}

// Drops the recorded stack number from every branch that carries it.
export function forgetGhStack(stackNumber: number, context: TContext): void {
  for (const b of context.engine.allBranchNames) {
    if (context.engine.getPrInfo(b)?.ghStackNumber === stackNumber) {
      context.engine.upsertPrInfo(b, { ghStackNumber: undefined });
    }
  }
}

/**
 * Dissolves the GitHub stacks holding `prs` and returns their numbers.
 * Throws if GitHub keeps one of `prs` stacked (queued for merge or with
 * auto-merge on). Repos without stacked PRs enabled are a no-op.
 */
export function unstackPrs(prs: number[], context: TContext): number[] {
  const repo = githubRepoSlug(context);
  const dissolved: number[] = [];
  const seen = new Set<number>();
  for (const pr of prs) {
    if (seen.has(pr)) {
      continue;
    }
    let stack: TGhStack | undefined;
    try {
      stack = findStackForPr(repo, pr);
    } catch (err) {
      if (err instanceof GhApiError && err.status === 404) {
        return dissolved;
      }
      throw err;
    }
    if (!stack) {
      continue;
    }
    prNumbersOf(stack).forEach((n) => seen.add(n));
    const kept = unstack(repo, stack.number);
    forgetGhStack(stack.number, context);
    dissolved.push(stack.number);
    const stuck = kept
      ? openPrNumbersOf(kept).filter((n) => prs.includes(n))
      : [];
    if (stuck.length) {
      throw new ExitFailedError(
        `GitHub kept ${stuck
          .map((n) => `#${n}`)
          .join(', ')} stacked (queued for merge or auto-merge).`
      );
    }
  }
  return dissolved;
}

/**
 * GitHub refuses to change the base of a stacked PR, so before anything is
 * pushed, dissolve the stacks of the PRs whose base this submit changes.
 * Returns whether it dissolved any; the caller relinks after the push.
 */
export function unstackForRetarget(
  submissions: { head: string; base: string; action: string }[],
  context: TContext
): boolean {
  const retargeted = submissions.flatMap(({ head, base, action }) => {
    const prInfo = context.engine.getPrInfo(head);
    return action === 'update' && prInfo?.number && prInfo.base !== base
      ? [prInfo.number]
      : [];
  });
  if (!retargeted.length) {
    return false;
  }
  let dissolved: number[];
  try {
    dissolved = unstackPrs(retargeted, context);
  } catch (err) {
    throw new ExitFailedError(
      `Can't change the base of a stacked PR; nothing was pushed. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  dissolved.forEach((n) =>
    context.splog.info(
      `Unstacked GitHub stack ${chalk.cyan(
        `#${n}`
      )} to change PR bases; relinking after the push.`
    )
  );
  return dissolved.length > 0;
}
