import { API_ROUTES } from '@withgraphite/graphite-cli-routes';

import t from '@withgraphite/retype';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ExitFailedError } from '../errors';

const execFileAsync = promisify(execFile);

type TBranchNameWithPrNumber = {
  branchName: string;
  prNumber: number | undefined;
};

export type TPRInfoToUpsert = t.UnwrapSchemaMap<
  typeof API_ROUTES.pullRequestInfo.response
>['prs'];

export async function getPrInfoForBranches(
  branchNamesWithExistingPrInfo: TBranchNameWithPrNumber[],
  repo: string
): Promise<TPRInfoToUpsert> {
  // We sync branches without existing PR info by name.  For branches
  // that are already associated with a PR, we only sync if both the
  // the associated PR (keyed by number) if the name matches the headRef.

  const branchesWithoutPrInfo = new Set<string>();
  const existingPrInfo = new Map<number, string>();

  branchNamesWithExistingPrInfo.forEach((branch) => {
    if (branch?.prNumber === undefined) {
      branchesWithoutPrInfo.add(branch.branchName);
    } else {
      existingPrInfo.set(branch.prNumber, branch.branchName);
    }
  });

  // gh can look up by PR number or branch name. These lookups are independent,
  // so run them concurrently rather than one blocking subprocess at a time.
  const prIds = [...existingPrInfo.keys(), ...branchesWithoutPrInfo];
  const results = await Promise.all(
    prIds.map(async (prId) => {
      try {
        const { stdout } = await execFileAsync('gh', [
          'pr',
          'view',
          `${prId}`,
          '--repo',
          repo,
          '--json',
          'state,url,title,body,number,headRefName,baseRefName,reviewDecision,isDraft',
        ]);
        const pr = JSON.parse(stdout);

        pr.prNumber = pr.number;
        delete pr.number;

        if (pr.reviewDecision === '') {
          pr.reviewDecision = undefined;
        }

        return pr;
      } catch (error) {
        const detail =
          error instanceof Error
            ? `${error.message}\n${
                (error as Error & { stderr?: string }).stderr ?? ''
              }`
            : String(error);

        // A branch simply having no PR is expected; anything else (gh missing,
        // auth expired, rate limit, network) is a real failure we must surface
        // rather than silently treating it as "no PR info".
        if (/no .*pull requests found/i.test(detail)) {
          return undefined;
        }

        throw new ExitFailedError(
          [
            `Failed to fetch pull request info from GitHub (via \`gh\`) for "${prId}".`,
            `Ensure the GitHub CLI is installed and authenticated (run \`ch auth\`).`,
            detail.trim(),
          ].join('\n')
        );
      }
    })
  );

  const response: TPRInfoToUpsert = results.filter((pr) => pr !== undefined);

  return response.filter((pr) => {
    const branchNameIfAssociated = existingPrInfo.get(pr.prNumber);

    const shouldAssociatePrWithBranch =
      !branchNameIfAssociated &&
      pr.state === 'OPEN' &&
      branchesWithoutPrInfo.has(pr.headRefName);

    const shouldUpdateExistingBranch =
      branchNameIfAssociated === pr.headRefName;

    return shouldAssociatePrWithBranch || shouldUpdateExistingBranch;
  });
}

export async function getPrUrl(
  prNumber: number,
  repo: string
): Promise<string> {
  return JSON.parse(
    await gh(
      ['pr', 'view', `${prNumber}`, '--repo', repo, '--json', 'url'],
      `Failed to find pull request #${prNumber}`
    )
  ).url;
}

export async function openPrInBrowser(
  prNumber: number,
  repo: string
): Promise<void> {
  await gh(
    ['pr', 'view', `${prNumber}`, '--repo', repo, '--web'],
    `Failed to open pull request #${prNumber}`
  );
}

export async function mergePr(
  prNumber: number,
  repo: string,
  opts: { method: 'squash' | 'merge' | 'rebase'; auto: boolean }
): Promise<void> {
  await gh(
    [
      'pr',
      'merge',
      `${prNumber}`,
      '--repo',
      repo,
      `--${opts.method}`,
      ...(opts.auto ? ['--auto'] : []),
    ],
    `Failed to merge pull request #${prNumber}`
  );
}

export type TPrStatus = {
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  mergeStateStatus: string; // CLEAN, BLOCKED, BEHIND, DIRTY, UNSTABLE, UNKNOWN...
  reviewDecision: '' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';
  autoMergeRequest: unknown;
};

export async function getPrStatus(
  prNumber: number,
  repo: string
): Promise<TPrStatus> {
  return JSON.parse(
    await gh(
      [
        'pr',
        'view',
        `${prNumber}`,
        '--repo',
        repo,
        '--json',
        'state,isDraft,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest',
      ],
      `Failed to read the merge state of pull request #${prNumber}`
    )
  );
}

export type TRequiredCheck = {
  name: string;
  state: string; // IN_PROGRESS, QUEUED, SUCCESS, FAILURE, ...
  bucket: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';
};

// `gh pr checks` exits non-zero while checks are pending or failing, and
// with no output when the base branch requires none.
export async function getRequiredChecks(
  prNumber: number,
  repo: string
): Promise<TRequiredCheck[]> {
  const args = ['pr', 'checks', `${prNumber}`, '--repo', repo, '--required'];
  try {
    const { stdout } = await execFileAsync('gh', [
      ...args,
      '--json',
      'name,state,bucket',
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    if (stdout?.trim()) {
      return JSON.parse(stdout);
    }
    if (/no required checks/i.test(stderr ?? '')) {
      return [];
    }
    throw new ExitFailedError(
      [
        `Failed to read the required checks of pull request #${prNumber} (via \`gh\`).`,
        error instanceof Error ? error.message : String(error),
      ].join('\n')
    );
  }
}

export async function getPrBase(
  prNumber: number,
  repo: string
): Promise<string> {
  return JSON.parse(
    await gh(
      ['pr', 'view', `${prNumber}`, '--repo', repo, '--json', 'baseRefName'],
      `Failed to read the base of pull request #${prNumber}`
    )
  ).baseRefName;
}

export async function setPrBase(
  prNumber: number,
  repo: string,
  base: string
): Promise<void> {
  await gh(
    ['pr', 'edit', `${prNumber}`, '--repo', repo, '--base', base],
    `Failed to change the base of pull request #${prNumber}`
  );
}

export async function commentOnPr(
  prNumber: number,
  repo: string,
  body: string
): Promise<void> {
  await gh(
    ['pr', 'comment', `${prNumber}`, '--repo', repo, '--body', body],
    `Failed to comment on pull request #${prNumber}`
  );
}

// Re-requests review from everyone who was requested or has reviewed.
export async function rerequestReview(
  prNumber: number,
  repo: string
): Promise<void> {
  const pr = JSON.parse(
    await gh(
      [
        'pr',
        'view',
        `${prNumber}`,
        '--repo',
        repo,
        '--json',
        'author,reviewRequests,reviews',
      ],
      `Failed to read the reviewers of pull request #${prNumber}`
    )
  ) as {
    author?: { login: string };
    reviewRequests?: { login?: string; slug?: string }[];
    reviews?: { author?: { login: string } }[];
  };
  const owner = repo.split('/')[0];
  const reviewers = new Set([
    ...(pr.reviewRequests ?? []).map((r) =>
      r.login ? r.login : `${owner}/${r.slug}`
    ),
    ...(pr.reviews ?? []).flatMap((r) => (r.author ? [r.author.login] : [])),
  ]);
  reviewers.delete(pr.author?.login ?? '');
  if (reviewers.size) {
    await gh(
      [
        'pr',
        'edit',
        `${prNumber}`,
        '--repo',
        repo,
        '--add-reviewer',
        [...reviewers].join(','),
      ],
      `Failed to re-request review on pull request #${prNumber}`
    );
  }
}

async function gh(args: string[], failure: string): Promise<string> {
  try {
    return (await execFileAsync('gh', args)).stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ExitFailedError(
      [
        `${failure} (via \`gh\`).`,
        // Only for failures that can be gh's setup, not e.g. a refused merge.
        ...(/ENOENT|auth|log ?in|credentials/i.test(detail)
          ? [
              `Ensure the GitHub CLI is installed and authenticated (run \`ch auth\`).`,
            ]
          : []),
        detail,
      ].join('\n')
    );
  }
}
