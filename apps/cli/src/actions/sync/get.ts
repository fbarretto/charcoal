import chalk from 'chalk';
import { execFileSync } from 'child_process';
import { githubRepoSlug } from '../../lib/api/github_repo';
import { TContext } from '../../lib/context';
import { TBranchPRInfo } from '../../lib/engine/metadata_ref';
import {
  ExitFailedError,
  KilledError,
  RebaseConflictError,
} from '../../lib/errors';
import { assertUnreachable } from '../../lib/utils/assert_unreachable';
import { branchesInOtherWorktrees } from '../../lib/git/worktrees';
import { persistContinuation } from '../persist_continuation';
import { printConflictStatus } from '../print_conflict_status';
import { findStackForPr } from '../../lib/api/gh_stacks';
import { SCOPE } from '../../lib/engine/scope_spec';
import { syncPrInfo } from '../sync_pr_info';
import { cleanBranches } from './clean_branches';
import { restackWithoutConflicts } from './sync';
import { skippedInWorktreeMessage } from '../restack';

type TGetArgs = {
  branchName: string | undefined;
  force: boolean;
  unfrozen: boolean;
  checkout: boolean;
  downstack: boolean;
  restack: boolean;
  remoteUpstack: boolean;
  deleteAll: boolean;
};

type TPr = {
  number: number;
  headRefName: string;
  baseRefName: string;
  author?: { login: string };
  title?: string;
  url?: string;
  state?: TBranchPRInfo['state'];
  isDraft?: boolean;
  reviewDecision?: TBranchPRInfo['reviewDecision'] | '';
};

export type TBranchToSync = { branch: string; parent: string };

// eslint-disable-next-line max-lines-per-function
export async function getAction(
  args: TGetArgs,
  context: TContext
): Promise<void> {
  const trunk = context.engine.trunk;
  const repo = githubRepoSlug(context);

  let target = args.branchName ?? context.engine.currentBranch;
  if (!target) {
    throw new ExitFailedError(
      'No branch or PR specified, and no current branch to get.'
    );
  }

  // A numeric argument is a PR number, unless a branch has that name.
  if (/^\d+$/.test(target) && !context.engine.branchExists(target)) {
    const pr = prView(target, repo);
    if (!pr) {
      throw new ExitFailedError(
        `Could not find an open pull request for "${target}".`
      );
    }
    target = pr.headRefName;
  }

  if (target === trunk) {
    context.splog.info(`Nothing to get: ${chalk.cyan(trunk)} is trunk.`);
    if (args.checkout) {
      context.engine.checkoutBranch(trunk);
    }
    return;
  }

  const startedOn = context.engine.currentBranch;
  const existedLocally = context.engine.branchExists(target);
  await cleanLocalStack(target, args.deleteAll, context);
  if (existedLocally && !context.engine.branchExists(target)) {
    return; // its PR was merged or closed and the branch deleted
  }

  const downstack = downstackPrs(target, repo, trunk);
  const prs = new Map(downstack.map((pr) => [pr.headRefName, pr]));
  const ghStack = githubStackHeads(prs.get(target), repo, context);

  // Upstack: branches above the target that already exist locally (unless
  // --downstack), and with -u the remote-only ones from open PRs.
  const upstack: string[] = [];
  if (args.remoteUpstack) {
    upstack.push(...(ghStack?.above ?? remoteChildren(target, repo)));
  }
  if (
    !args.downstack &&
    context.engine.branchExists(target) &&
    context.engine.isBranchTracked(target)
  ) {
    upstack.push(
      ...context.engine.getRelativeStack(target, SCOPE.UPSTACK_EXCLUSIVE)
    );
  }
  const branches: TBranchToSync[] = downstack.map((pr) => ({
    branch: pr.headRefName,
    parent: pr.baseRefName,
  }));
  for (const branch of new Set(upstack)) {
    const pr = prs.get(branch) ?? prView(branch, repo);
    if (pr && pr.headRefName === branch) {
      prs.set(branch, pr);
      branches.push({ branch, parent: pr.baseRefName });
    }
  }

  const me = currentGithubUser();
  await getBranchesFromRemote(
    {
      branches,
      force: args.force,
      freezeNew: (b) =>
        !args.unfrozen && (!me || prs.get(b)?.author?.login !== me),
    },
    context
  );

  // Remember each fetched branch's PR so `info`/`ls` show it right away.
  for (const { branch } of branches) {
    const pr = prs.get(branch);
    if (pr && context.engine.getPrInfo(branch)?.number === undefined) {
      context.engine.upsertPrInfo(branch, {
        number: pr.number,
        base: pr.baseRefName,
        title: pr.title,
        url: pr.url,
        state: pr.state,
        isDraft: pr.isDraft,
        reviewDecision: pr.reviewDecision || undefined,
      });
    }
  }
  if (ghStack && context.engine.branchExists(ghStack.bottom)) {
    context.engine.upsertPrInfo(ghStack.bottom, {
      ghStackNumber: ghStack.number,
    });
  }

  if (args.restack) {
    restackWithoutConflicts(
      context.engine.getRelativeStack(target, SCOPE.STACK),
      context
    );
  }
  const back = args.checkout ? target : startedOn;
  if (back && context.engine.branchExists(back)) {
    context.engine.checkoutBranch(back);
  }
}

// Like sync, clean up merged/closed branches of the local stack first, so
// their children are reparented before being compared with remote.
async function cleanLocalStack(
  target: string,
  deleteAll: boolean,
  context: TContext
): Promise<void> {
  if (
    !context.engine.branchExists(target) ||
    !context.engine.isBranchTracked(target)
  ) {
    return;
  }
  const stack = new Set(
    context.engine
      .getRelativeStack(target, SCOPE.STACK)
      .filter((b) => !context.engine.isTrunk(b))
  );
  await syncPrInfo([...stack], context);
  await cleanBranches(
    { showDeleteProgress: false, force: deleteAll, only: stack },
    context
  );
}

// Charcoal doesn't push branch metadata to the remote, so the downstack chain
// (trunk -> target) is rebuilt by walking each PR's base ref.
function downstackPrs(target: string, repo: string, trunk: string): TPr[] {
  const chain: TPr[] = [];
  let branch = target;
  while (branch !== trunk) {
    const pr = prView(branch, repo);
    if (!pr || pr.headRefName !== branch) {
      throw new ExitFailedError(
        [
          `Could not trace ${chalk.yellow(target)} back to trunk (${chalk.cyan(
            trunk
          )}) from its pull requests.`,
          `\`ch get\` reconstructs a stack from open PRs, so every branch from trunk to ${chalk.yellow(
            target
          )} needs one.`,
        ].join('\n')
      );
    }
    if (chain.some((p) => p.headRefName === branch)) {
      throw new ExitFailedError(
        `Encountered a cycle while resolving the stack for ${chalk.yellow(
          target
        )}.`
      );
    }
    chain.unshift(pr);
    branch = pr.baseRefName;
  }
  return chain;
}

// The open PRs above `pr` in its GitHub stack, if it is in one, and the
// stack's number and bottom branch.
function githubStackHeads(
  pr: TPr | undefined,
  repo: string,
  context: TContext
): { above: string[]; number: number; bottom: string } | undefined {
  if (!pr || !context.repoConfig.getGithubStacks()) {
    return undefined;
  }
  try {
    const stack = findStackForPr(repo, pr.number);
    const open = stack?.pull_requests.filter((p) => p.state !== 'closed');
    const heads = open?.map((p) => p.head?.ref);
    const at = heads?.indexOf(pr.headRefName) ?? -1;
    return stack && heads && at >= 0 && heads.every(Boolean)
      ? {
          above: heads.slice(at + 1) as string[],
          number: stack.number,
          bottom: heads[0] as string,
        }
      : undefined;
  } catch {
    return undefined; // fall back to walking PR bases
  }
}

// Open PRs based on `branch`, recursively, parents before children.
function remoteChildren(branch: string, repo: string): string[] {
  const children = ghJson<{ headRefName: string }[]>([
    'pr',
    'list',
    '--repo',
    repo,
    '--base',
    branch,
    '--state',
    'open',
    '--json',
    'headRefName',
  ]);
  return (children ?? []).flatMap((c) => [
    c.headRefName,
    ...remoteChildren(c.headRefName, repo),
  ]);
}

function currentGithubUser(): string | undefined {
  return ghJson<{ login: string }>(['api', 'user'])?.login;
}

function prView(branchOrNumber: string, repo: string): TPr | undefined {
  return ghJson<TPr>([
    'pr',
    'view',
    branchOrNumber,
    '--repo',
    repo,
    '--json',
    'number,headRefName,baseRefName,author,title,url,state,isDraft,reviewDecision',
  ]);
}

function ghJson<T>(args: string[]): T | undefined {
  try {
    return JSON.parse(
      execFileSync('gh', args, {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString()
    );
  } catch {
    return undefined;
  }
}

// Syncs each branch from remote in order (parents before children). Branches
// that didn't exist locally are frozen when `freezeNew` says so; existing
// branches keep their frozen state.
export async function getBranchesFromRemote(
  args: {
    branches: TBranchToSync[];
    force: boolean;
    freezeNew: (branch: string) => boolean;
  },
  context: TContext
): Promise<void> {
  const otherWorktrees = branchesInOtherWorktrees();
  for (const [index, { branch: branchName, parent: parentBranchName }] of [
    ...args.branches.entries(),
  ]) {
    const isNew = !context.engine.branchExists(branchName);
    context.engine.fetchBranch(branchName, parentBranchName);
    const worktree = otherWorktrees.get(branchName);
    if (worktree && !isNew) {
      context.splog.info(skippedInWorktreeMessage(branchName, worktree));
    } else if (args.force || isNew) {
      context.engine.checkoutBranchFromFetched(branchName, parentBranchName);
      context.splog.info(`Synced ${chalk.cyan(branchName)} from remote.`);
    } else if (!context.engine.isBranchTracked(branchName)) {
      await handleUntrackedLocally(branchName, parentBranchName, context);
    } else if (
      context.engine.getParentPrecondition(branchName) !== parentBranchName
    ) {
      await handleDifferentParents(branchName, parentBranchName, context);
    } else if (context.engine.branchMatchesFetched(branchName)) {
      context.splog.info(`${chalk.cyan(branchName)} is up to date.`);
    } else if (context.engine.isBranchFrozen(branchName)) {
      // A frozen branch has no local changes of ours to keep.
      context.engine.checkoutBranchFromFetched(branchName, parentBranchName);
      context.splog.info(`Synced ${chalk.cyan(branchName)} from remote.`);
    } else {
      const remainingBranchesToSync = args.branches
        .slice(index + 1)
        .map((b) => b.branch);
      await handleSameParent(
        { branchName, parentBranchName, remainingBranchesToSync },
        context
      );
    }
    if (isNew && args.freezeNew(branchName)) {
      context.engine.setBranchFrozen(branchName, true);
    }
  }
}

// After `ch continue`, the remaining branches resume with their tracked
// parent, or (for ones not yet local) the branch synced before them.
// ponytail: assumes a remote-only branch's parent precedes it in the list;
// true for linear stacks and for `remoteChildren`'s parents-first order.
export function branchesToSyncAfterContinue(
  names: string[],
  firstParent: string,
  context: TContext
): TBranchToSync[] {
  let prev = firstParent;
  return names.map((branch) => {
    const parent =
      context.engine.branchExists(branch) &&
      context.engine.isBranchTracked(branch)
        ? context.engine.getParentPrecondition(branch)
        : prev;
    prev = branch;
    return { branch, parent };
  });
}

async function handleUntrackedLocally(
  branchName: string,
  parentBranchName: string,
  context: TContext
): Promise<void> {
  context.splog.info(
    [
      `${chalk.yellow(
        branchName
      )} shares a name with a local branch that is not tracked by Charcoal.`,
      `In order to sync it, you must overwrite your local copy of the branch.`,
      `If you do not wish to overwrite your copy, the command will be aborted.`,
    ].join('\n')
  );
  await maybeOverwriteBranch(branchName, parentBranchName, context);
}

async function handleDifferentParents(
  branchName: string,
  parentBranchName: string,
  context: TContext
): Promise<void> {
  context.splog.info(
    [
      `${chalk.yellow(
        branchName
      )} shares a name with a local branch, but they have different parents.`,
      `In order to sync it, you must overwrite your local copy of the branch.`,
      `If you do not wish to overwrite your copy, the command will be aborted.`,
    ].join('\n')
  );
  await maybeOverwriteBranch(branchName, parentBranchName, context);
}

// Helper function for cases where we can either overwrite local or abort
async function maybeOverwriteBranch(
  branchName: string,
  parentBranchName: string,
  context: TContext
) {
  if (
    !context.interactive ||
    !(
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: `Overwrite ${chalk.yellow(
          branchName
        )} with the version from remote?`,
        initial: false,
      })
    ).value
  ) {
    throw new KilledError();
  }

  context.engine.checkoutBranchFromFetched(branchName, parentBranchName);
  context.splog.info(`Synced ${chalk.cyan(branchName)} from remote.`);
}

// This is the most complex case - if the branch's parent matches meta,
// we need to not only allow for overwrite and abort, but also rebasing
// local changes onto the changes from remote.
async function handleSameParent(
  args: {
    branchName: string;
    parentBranchName: string;
    remainingBranchesToSync: string[];
  },
  context: TContext
): Promise<void> {
  context.splog.info(
    [
      `${chalk.yellow(
        args.branchName
      )} shares a name with a local branch, and they have the same parent.`,
      `You can either overwrite your copy of the branch, or rebase your local changes onto the remote version.`,
      `You can also abort the command entirely and keep your local state as is.`,
    ].join('\n')
  );

  const fetchChoice: 'REBASE' | 'OVERWRITE' | 'ABORT' = !context.interactive
    ? 'ABORT'
    : (
        await context.prompts({
          type: 'select',
          name: 'value',
          message: `How would you like to handle ${chalk.yellow(
            args.branchName
          )}?`,
          choices: [
            {
              title: 'Rebase your changes on top of the remote version',
              value: 'REBASE',
            },
            {
              title: 'Overwrite the local copy with the remote version',
              value: 'OVERWRITE',
            },
            { title: 'Abort this command', value: 'ABORT' },
          ],
        })
      ).value;

  switch (fetchChoice) {
    case 'REBASE': {
      const result = context.engine.rebaseBranchOntoFetched(args.branchName);
      if (result.result === 'REBASE_CONFLICT') {
        await offerToCancel(args.branchName, context);
        persistContinuation(
          {
            branchesToSync: args.remainingBranchesToSync,
            rebasedBranchBase: result.rebasedBranchBase,
          },
          context
        );
        printConflictStatus(
          `Hit conflict rebasing ${chalk.yellow(
            args.branchName
          )} onto remote source of truth.`,
          context
        );
        throw new RebaseConflictError();
      }
      context.splog.info(
        `Rebased local changes to ${chalk.cyan(
          args.branchName
        )} onto remote source of truth.`
      );
      context.splog.tip(
        `If this branch has local children, they likely need to be restacked.`
      );
      break;
    }
    case 'OVERWRITE':
      context.engine.checkoutBranchFromFetched(
        args.branchName,
        args.parentBranchName
      );
      context.splog.info(`Synced ${chalk.cyan(args.branchName)} from remote.`);
      break;
    case 'ABORT':
      throw new KilledError();
    default:
      assertUnreachable(fetchChoice);
  }
}

// gt 1.6.6: on a conflict, offer to cancel instead of resolving it.
async function offerToCancel(
  branchName: string,
  context: TContext
): Promise<void> {
  if (
    !context.interactive ||
    (
      await context.prompts({
        type: 'select',
        name: 'value',
        message: `Rebasing ${chalk.yellow(branchName)} hit conflicts.`,
        choices: [
          {
            title: 'Resolve the conflicts, then `ch continue`',
            value: 'resolve',
          },
          { title: 'Cancel: undo this rebase and stop', value: 'cancel' },
        ],
      })
    ).value !== 'cancel'
  ) {
    return;
  }
  context.engine.abortRebase();
  throw new KilledError();
}
