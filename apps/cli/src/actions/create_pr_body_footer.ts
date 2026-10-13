import { execFileSync } from 'child_process';
import { TContext } from '../lib/context';

export const stackStart = '<!-- charcoal-stack -->';
export const stackEnd = '<!-- /charcoal-stack -->';

export type TGhUser = { login: string; avatarUrl: string };

export type TPrDetails = {
  title?: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft?: boolean;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  checks?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  additions?: number;
  deletions?: number;
  author?: TGhUser;
  threads?: { resolved: number; total: number };
};

// Newest PR on top, the current PR marked, the base branch at the bottom,
// like `ch ls`. Forks above the current PR are left out.
export function createPrBodyFooter(
  context: TContext,
  branch: string,
  {
    details = {},
    viewer,
    now = new Date(),
  }: {
    details?: Record<number, TPrDetails>;
    viewer?: TGhUser;
    now?: Date;
  } = {}
): string {
  const stack = [
    ...upstackLine(context, branch).reverse(),
    branch,
    ...ancestors(context, branch),
  ].filter((b) => context.engine.getPrInfo(b)?.number);

  const prDetails = stack.map(
    (b) => details[context.engine.getPrInfo(b)?.number as number] ?? {}
  );
  const rows = stack.map((b, i) => {
    const number = context.engine.getPrInfo(b)?.number as number;
    const d = prDetails[i];
    const current = b === branch;
    const title = d.title ? ` ${escapeMarkdown(d.title)}` : '';
    const url = context.engine.getPrInfo(b)?.url;
    // The current PR is the page being read, so only the others link.
    const ref = current
      ? `**#${number}${title}** 👈`
      : url
      ? `[#${number}${title}](${url})`
      : `#${number}${title}`;
    const avatar = d.author ? `${avatarImage(d.author)} ` : '';
    const threads = d.threads?.total
      ? `💬 ${d.threads.resolved}/${d.threads.total}`
      : '';
    const state = status(prDetails, i);
    return `| ${
      current ? '◉' : '◯'
    } | ${avatar}${ref} | ${threads} | ${state} |`;
  });
  const position = stack.length - stack.indexOf(branch);
  const base =
    context.engine.getParent(stack[stack.length - 1] ?? branch) ??
    context.engine.trunk;
  // Graphite's pasteable stack: raw markdown links that Slack turns into
  // links on paste, copied verbatim by the code block's copy button.
  const copyLines = stack.map((b, i) => {
    const pr = context.engine.getPrInfo(b);
    const d = prDetails[i];
    const text = `#${pr?.number}${
      d.title ? ` ${d.title.replace(/([[\]])/g, '\\$1')}` : ''
    }`;
    const size =
      d.additions !== undefined ? ` \`+${d.additions}/-${d.deletions}\`` : '';
    const label = statusLabel(prDetails, i)?.[0];
    return `${pr?.url ? `[${text}](${pr.url})` : text}${size}${
      label ? ` · ${label}` : ''
    }`;
  });

  return [
    stackStart,
    `| | Stack · ${position} of ${stack.length} | Threads | Status |`,
    '|:-:|---|---|---|',
    ...rows,
    `| ◯ | \`${base}\` (base) | | |`,
    '',
    '<details><summary>Copy stack</summary>',
    '',
    '```',
    ...copyLines,
    '```',
    '',
    '</details>',
    '',
    `_Updated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC${
      viewer
        ? ` by ${avatarImage(viewer)} [${viewer.login}](https://github.com/${
            viewer.login
          })`
        : ''
    } · [Charcoal](https://github.com/fbarretto/charcoal)_`,
    stackEnd,
  ].join('\n');
}

// One status per PR, the first that applies, as Graphite's stack shows it.
// GitHub drops inline styles, so the color comes from its math renderer.
// `stack` runs top to bottom, so the PRs below index i are the ones after it.
function status(stack: TPrDetails[], i: number): string {
  const [label, color] = statusLabel(stack, i) ?? [];
  return label ? `$\\color{${color}}\\textsf{${label}}$` : '';
}

function statusLabel(
  stack: TPrDetails[],
  i: number
): [string, string] | undefined {
  const own = blocker(stack[i]);
  if (own !== 'ready') return own;
  const below = stack.slice(i + 1).filter((d) => d.state !== 'MERGED');
  if (!below.length) return ['ready to merge', '#1a7f37'];
  return below.every((d) => blocker(d) === 'ready')
    ? ['ready to merge as a stack', '#1a7f37']
    : ['waiting on downstack', '#1a7f37'];
}

// What keeps this PR from merging on its own, or 'ready'.
function blocker(d: TPrDetails): [string, string] | 'ready' | undefined {
  const checks = d.checks ?? null;
  if (d.state === 'MERGED') return ['merged', '#8250df'];
  if (d.state === 'CLOSED') return ['closed', '#cf222e'];
  if (d.state !== 'OPEN') return undefined;
  if (d.isDraft) return ['draft', '#6e7781'];
  if (d.mergeable === 'CONFLICTING') return ['merge conflicts', '#bc4c00'];
  if (checks === 'FAILURE' || checks === 'ERROR')
    return ['required checks failed', '#cf222e'];
  if (d.reviewDecision === 'CHANGES_REQUESTED')
    return ['changes requested', '#cf222e'];
  if (d.threads && d.threads.resolved < d.threads.total)
    return ['unresolved comments', '#bc4c00'];
  if (checks === 'PENDING' || checks === 'EXPECTED')
    return ['ci running', '#9a6700'];
  if (d.reviewDecision !== 'APPROVED') return ['needs review', '#0969da'];
  return 'ready';
}

// The first child at each level, so the list stays one straight line.
function upstackLine(context: TContext, branch: string): string[] {
  const line: string[] = [];
  let next = context.engine.getChildren(branch)[0];
  while (next) {
    line.push(next);
    next = context.engine.getChildren(next)[0];
  }
  return line;
}

function ancestors(context: TContext, branch: string): string[] {
  const result: string[] = [];
  let parent = context.engine.getParent(branch);
  while (parent && !context.engine.isTrunk(parent)) {
    result.push(parent);
    parent = context.engine.getParent(parent);
  }
  return result;
}

// Markdown can't size or round an image, so an image proxy crops it to a
// 16px circle. No '@' anywhere: in a comment it would notify the user.
function avatarImage(user: TGhUser): string {
  const url = encodeURIComponent(user.avatarUrl);
  return `![${user.login}](https://images.weserv.nl/?url=${url}&w=16&h=16&fit=cover&mask=circle)`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<>|#])/g, '\\$1');
}

// One GraphQL call for every PR the footers mention. On any failure the
// footers fall back to bare PR numbers rather than blocking the submit.
export function fetchPrDetails(
  repo: string,
  numbers: number[]
): { details: Record<number, TPrDetails>; viewer?: TGhUser } {
  if (!numbers.length) {
    return { details: {} };
  }
  const [owner, name] = repo.split('/');
  const fields = numbers
    .map(
      (
        n
      ) => `pr${n}: pullRequest(number: ${n}) { number title state isDraft reviewDecision mergeable additions deletions author { login avatarUrl(size: 64) }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        reviewThreads(first: 100) { nodes { isResolved } } }`
    )
    .join('\n');
  try {
    const out = execFileSync(
      'gh',
      [
        'api',
        'graphql',
        '-f',
        `query=query($owner: String!, $name: String!) { viewer { login avatarUrl(size: 64) } repository(owner: $owner, name: $name) { ${fields} } }`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const data = JSON.parse(out).data;
    const prs = Object.values(data.repository) as Array<{
      number: number;
      title: string;
      state: TPrDetails['state'];
      isDraft: boolean;
      reviewDecision: TPrDetails['reviewDecision'];
      mergeable: TPrDetails['mergeable'];
      additions: number;
      deletions: number;
      author: TGhUser | null;
      commits: {
        nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
      };
      reviewThreads: { nodes: { isResolved: boolean }[] };
    }>;
    const details = Object.fromEntries(
      prs
        .filter((pr) => pr)
        .map((pr) => [
          pr.number,
          {
            title: pr.title,
            state: pr.state,
            isDraft: pr.isDraft,
            reviewDecision: pr.reviewDecision,
            mergeable: pr.mergeable,
            additions: pr.additions,
            deletions: pr.deletions,
            author: pr.author ?? undefined,
            checks: (pr.commits.nodes[0]?.commit.statusCheckRollup?.state ??
              null) as TPrDetails['checks'],
            threads: {
              resolved: pr.reviewThreads.nodes.filter((t) => t.isResolved)
                .length,
              total: pr.reviewThreads.nodes.length,
            },
          },
        ])
    );
    return { details, viewer: data.viewer ?? undefined };
  } catch {
    return { details: {} };
  }
}

// The stack lives in one comment per PR, found again by its marker. Submit
// posts it right after creating the PR, so it is the first comment there; it
// is looked for on the first page only.
export function upsertStackComment(
  repo: string,
  number: number,
  block: string
): 'created' | 'updated' | 'unchanged' {
  const comments = JSON.parse(
    execFileSync(
      'gh',
      ['api', `repos/${repo}/issues/${number}/comments?per_page=100`],
      { encoding: 'utf-8' }
    ) || '[]'
  ) as { id: number; body?: string }[];
  const existing = comments.find((c) => c.body?.includes(stackStart));
  if (existing?.body === block) {
    return 'unchanged';
  }
  execFileSync(
    'gh',
    existing
      ? [
          'api',
          '-X',
          'PATCH',
          `repos/${repo}/issues/comments/${existing.id}`,
          '-f',
          `body=${block}`,
        ]
      : [
          'api',
          `repos/${repo}/issues/${number}/comments`,
          '-f',
          `body=${block}`,
        ],
    { encoding: 'utf-8' }
  );
  return existing ? 'updated' : 'created';
}
