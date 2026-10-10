import chalk from 'chalk';
import { githubRepoSlug } from '../../lib/api/github_repo';
import {
  commentOnPr,
  mergePr,
  openPrInBrowser,
  rerequestReview,
} from '../../lib/api/pr_info';
import { TContext } from '../../lib/context';
import { TScopeSpec } from '../../lib/engine/scope_spec';
import { ExitFailedError, KilledError } from '../../lib/errors';
import { getPRInfoForBranches } from './prepare_branches';
import { validateBranchesToSubmit } from './validate_branches';
import { submitPullRequest, TPRSubmissionInfo } from './submit_prs';
import { linkGithubStack, unstackForRetarget } from './link_gh_stack';
import {
  createPrBodyFooter,
  footerFooter,
  footerTitle,
} from '../create_pr_body_footer';
import { execFileSync } from 'child_process';
import { uncommittedTrackedChangesPrecondition } from '../../lib/preconditions';
import { restackWithoutConflicts } from '../sync/sync';

// eslint-disable-next-line max-lines-per-function
export async function submitAction(
  args: {
    scope: TScopeSpec;
    editTitle: boolean | undefined;
    editDescription: boolean | undefined;
    draft: boolean;
    publish: boolean;
    dryRun: boolean;
    updateOnly: boolean;
    reviewers: string | undefined;
    teamReviewers?: string;
    confirm: boolean;
    forcePush: boolean;
    select: boolean;
    always: boolean;
    branch: string | undefined;
    ghStack?: boolean;
    comment?: string;
    mergeWhenReady?: boolean;
    rerequestReview?: boolean;
    view?: boolean;
    restack?: boolean;
    ignoreOutOfSyncTrunk?: boolean;
    promptUpstack?: boolean;
  },
  context: TContext
): Promise<void> {
  // Check CLI pre-condition to warn early
  if (args.draft && args.publish) {
    throw new ExitFailedError(
      `Can't use both --publish and --draft flags in one command`
    );
  }
  const populateRemoteShasPromise = context.engine.populateRemoteShas();
  if (args.dryRun) {
    context.splog.info(
      chalk.yellow(
        `Running submit in 'dry-run' mode. No branches will be pushed and no PRs will be opened or updated.`
      )
    );
    context.splog.newline();
    args.editTitle = args.editDescription = false;
  }

  if (args.teamReviewers === '' && args.reviewers === undefined) {
    args.reviewers = ''; // a bare -t opens the reviewers prompt, like gt
  }
  if (!context.interactive) {
    args.editTitle = args.editDescription = false;
    if (args.reviewers === '') {
      args.reviewers = undefined; // can't prompt; explicit lists still apply
    }

    context.splog.info(
      `Running in non-interactive mode. Inline prompts to fill PR fields will be skipped${
        !(args.draft || args.publish)
          ? ' and new PRs will be created in draft mode'
          : ''
      }.`
    );
    context.splog.newline();
  }

  const currentBranch = args.branch ?? context.engine.currentBranchPrecondition;
  if (
    args.branch !== undefined &&
    !context.engine.isTrunk(args.branch) &&
    !context.engine.isBranchTracked(args.branch)
  ) {
    throw new ExitFailedError(
      `${chalk.yellow(args.branch)} is not a branch tracked by Charcoal.`
    );
  }
  const viewPr = async () => {
    const prNumber = context.engine.getPrInfo(currentBranch)?.number;
    if (args.view && prNumber !== undefined) {
      await openPrInBrowser(prNumber, githubRepoSlug(context));
    }
  };
  let unstacked = false;
  const linkStack = () => {
    if (unstacked || (args.ghStack ?? context.repoConfig.getGithubStacks())) {
      linkGithubStack(currentBranch, context);
    }
  };
  const allBranchNames = context.engine
    .getRelativeStack(currentBranch, args.scope)
    .filter((branchName) => !context.engine.isTrunk(branchName))
    .filter((branchName) => {
      const frozen = context.engine.isBranchFrozen(branchName);
      if (frozen) {
        context.splog.info(`Skipping frozen branch ${chalk.cyan(branchName)}.`);
      }
      return !frozen;
    });

  if (args.promptUpstack && !args.dryRun) {
    allBranchNames.push(...(await askForUpstackPrs(currentBranch, context)));
  }

  const branchNames = args.select
    ? await selectBranches(context, allBranchNames)
    : allBranchNames;

  if (args.restack && !args.dryRun) {
    uncommittedTrackedChangesPrecondition();
    restackWithoutConflicts(branchNames, context);
  }

  context.splog.info(
    chalk.blueBright(
      `🥞 Validating that this Charcoal stack is ready to submit...`
    )
  );
  context.splog.newline();
  await validateBranchesToSubmit(branchNames, context);

  context.splog.info(
    chalk.blueBright(
      '✏️  Preparing to submit PRs for the following branches...'
    )
  );
  await populateRemoteShasPromise;
  await checkTrunkInSync(args, context);
  const teamReviewers = teamSlugs(args.teamReviewers, context);
  const submissionInfos = await getPRInfoForBranches(
    {
      branchNames: branchNames,
      editTitle: args.editTitle,
      editDescription: args.editDescription,
      draft: args.draft,
      publish: args.publish,
      updateOnly: args.updateOnly,
      reviewers: args.reviewers,
      teamReviewers,
      reviewersForExisting: await askReviewersForExisting(
        { branchNames, reviewers: args.reviewers, teamReviewers },
        context
      ),
      dryRun: args.dryRun,
      select: args.select,
      always: args.always,
    },
    context
  );

  if (
    await shouldAbort(
      { ...args, hasAnyPrs: submissionInfos.length > 0 },
      context
    )
  ) {
    if (!args.dryRun) {
      linkStack(); // PRs may be up to date but not yet linked
      await viewPr();
    }
    return;
  }

  unstacked = unstackForRetarget(submissionInfos, context);
  try {
    await pushAndSubmit(submissionInfos, args, context);
  } catch (err) {
    if (unstacked) {
      linkStack(); // best effort: don't leave the dissolved stack unlinked
    }
    throw err;
  }

  context.splog.info(
    chalk.blueBright('\n🌳 Updating dependency trees in PR bodies...')
  );

  // Submitting changes the dependency tree of the submitted branches *and*
  // their ancestors, so refresh footers for both (#85).
  const repo = githubRepoSlug(context);
  const branchesToUpdate = new Set<string>(branchNames);
  for (const branch of branchNames) {
    let ancestor = context.engine.getParent(branch);
    while (ancestor && !context.engine.isTrunk(ancestor)) {
      branchesToUpdate.add(ancestor);
      ancestor = context.engine.getParent(ancestor);
    }
  }

  for (const branch of branchesToUpdate) {
    const prInfo = context.engine.getPrInfo(branch);

    // A branch with no open PR (e.g. an unsubmitted leaf under --update-only)
    // has no body to update; skip it rather than `gh pr edit undefined` (#109).
    if (!prInfo?.number || context.engine.isBranchFrozen(branch)) {
      continue;
    }

    const footer = createPrBodyFooter(context, branch);
    const prFooterChanged = !prInfo.body?.includes(footer);

    if (prFooterChanged) {
      execFileSync('gh', [
        'pr',
        'edit',
        `${prInfo.number}`,
        '--repo',
        repo,
        '--body',
        updatePrBodyFooter(prInfo.body, footer),
      ]);

      context.splog.info(
        `${chalk.green(branch)}: ${prInfo.url} (${chalk.yellow('Updated')})`
      );
    }
  }

  linkStack();
  await viewPr();
}

async function pushAndSubmit(
  submissionInfos: TPRSubmissionInfo,
  args: { forcePush: boolean } & Parameters<typeof afterSubmit>[1],
  context: TContext
): Promise<void> {
  context.splog.info(
    chalk.blueBright('📨 Pushing to remote and creating/updating PRs...')
  );
  for (const submissionInfo of submissionInfos) {
    context.engine.pushBranch(submissionInfo.head, args.forcePush);
    await submitPullRequest([submissionInfo], context);
    await afterSubmit(submissionInfo, args, context);
  }
}

async function afterSubmit(
  submission: { head: string; action: 'create' | 'update' },
  args: {
    comment?: string;
    mergeWhenReady?: boolean;
    rerequestReview?: boolean;
  },
  context: TContext
): Promise<void> {
  const prNumber = context.engine.getPrInfo(submission.head)?.number;
  if (prNumber === undefined) {
    return;
  }
  const repo = githubRepoSlug(context);
  if (args.comment) {
    await commentOnPr(prNumber, repo, args.comment);
  }
  if (args.rerequestReview && submission.action === 'update') {
    await rerequestReview(prNumber, repo);
  }
  if (args.mergeWhenReady) {
    await mergePr(prNumber, repo, { method: 'squash', auto: true });
  }
}

export function updatePrBodyFooter(
  body: string | undefined,
  footer: string
): string {
  if (!body) {
    return footer;
  }

  // Get the core title and footer text without extra whitespace
  const titleText = footerTitle.trim().replace(/^\s*\n+|\n+\s*$/g, '');
  const footerText = footerFooter.trim().replace(/^\s*\n+|\n+\s*$/g, '');

  const escapedTitleText = titleText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedFooterText = footerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Strip every existing footer block (and the blank lines before it), wherever
  // it sits in the body — not just at the very end. Anchoring to end-of-body
  // meant that if a bot appended content after the footer, we couldn't find the
  // old footer and appended a second one (duplicate). Removing all of them and
  // re-appending a single footer keeps exactly one, and preserves any other
  // content (e.g. bot sections) that followed it.
  const footerBlock = new RegExp(
    `\\s*${escapedTitleText}[\\s\\S]*?${escapedFooterText}`,
    'g'
  );

  return body.replace(footerBlock, '').trimEnd() + footer;
}

// gt: without --stack, offer to also submit the branches above this one
// that already have open PRs (--no-stack skips the question).
async function askForUpstackPrs(
  branch: string,
  context: TContext
): Promise<string[]> {
  const withOpenPrs = (b: string): string[] =>
    context.engine.getChildren(b).flatMap((child) => {
      const pr = context.engine.getPrInfo(child);
      return pr?.number !== undefined &&
        !['MERGED', 'CLOSED'].includes(pr.state ?? '') &&
        !context.engine.isBranchFrozen(child)
        ? [child, ...withOpenPrs(child)]
        : [];
    });
  const upstack = withOpenPrs(branch);
  if (!context.interactive || upstack.length === 0) {
    return [];
  }
  const { value } = await context.prompts({
    type: 'confirm',
    name: 'value',
    message: `Also submit the branches above ${chalk.cyan(
      branch
    )} that have open PRs (${upstack.join(', ')})?`,
    initial: true,
  });
  return value ? upstack : [];
}

async function checkTrunkInSync(
  args: { ignoreOutOfSyncTrunk?: boolean; dryRun: boolean },
  context: TContext
): Promise<void> {
  const trunk = context.engine.trunk;
  if (args.ignoreOutOfSyncTrunk || context.engine.branchMatchesRemote(trunk)) {
    return;
  }
  context.splog.warn(
    `${chalk.yellow(
      trunk
    )} is out of sync with its remote; PRs may pick up the wrong base. Run ${chalk.cyan(
      'ch sync'
    )} first, or pass --ignore-out-of-sync-trunk.`
  );
  if (args.dryRun) {
    return;
  }
  if (!context.interactive) {
    throw new ExitFailedError(`Aborting non-interactive submit.`);
  }
  const { value } = await context.prompts({
    type: 'confirm',
    name: 'value',
    message: 'Submit anyway?',
    initial: false,
  });
  if (!value) {
    throw new KilledError();
  }
}

// `-t core` means the repo owner's `core` team; `org/slug` passes through.
function teamSlugs(teams: string | undefined, context: TContext): string[] {
  const owner = githubRepoSlug(context).split('/')[0];
  return (teams ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.includes('/') ? t : `${owner}/${t}`));
}

// When a stack mixes new and existing PRs, ask whether explicit reviewers go
// on all of them or only the new ones (gt 1.7.10).
async function askReviewersForExisting(
  args: {
    branchNames: string[];
    reviewers: string | undefined;
    teamReviewers: string[];
  },
  context: TContext
): Promise<boolean> {
  const hasPr = args.branchNames.map(
    (b) => context.engine.getPrInfo(b)?.number !== undefined
  );
  if (
    !context.interactive ||
    !(args.reviewers || args.teamReviewers.length) ||
    !hasPr.includes(true) ||
    !hasPr.includes(false)
  ) {
    return true;
  }
  return (
    (
      await context.prompts({
        type: 'select',
        name: 'value',
        message: 'Request these reviewers on which PRs?',
        choices: [
          { title: 'All PRs in this submit', value: 'all' },
          { title: 'Only newly created PRs', value: 'new' },
        ],
      })
    ).value !== 'new'
  );
}

async function selectBranches(
  context: TContext,
  branchNames: string[]
): Promise<string[]> {
  const result = [];
  for (const branchName of branchNames) {
    const selected = (
      await context.prompts({
        name: 'value',
        initial: true,
        type: 'confirm',
        message: `Would you like to submit ${chalk.cyan(branchName)}?`,
      })
    ).value;
    // Clear the prompt result
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);
    if (selected) {
      result.push(branchName);
    }
  }
  return result;
}

async function shouldAbort(
  args: { dryRun: boolean; confirm: boolean; hasAnyPrs: boolean },
  context: TContext
): Promise<boolean> {
  if (args.dryRun) {
    context.splog.info(chalk.blueBright('✅ Dry run complete.'));
    return true;
  }

  if (!args.hasAnyPrs) {
    context.splog.info(chalk.blueBright('🆗 All PRs up to date.'));
    return true;
  }

  if (
    context.interactive &&
    args.confirm &&
    !(
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: 'Continue with this submit operation?',
        initial: true,
      })
    ).value
  ) {
    context.splog.info(chalk.blueBright('🛑 Aborted submit.'));
    throw new KilledError();
  }

  return false;
}
