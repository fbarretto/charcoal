import { execFileSync } from 'child_process';
import { TContext } from '../lib/context';

export const stackStart = '<!-- charcoal-stack -->';
export const stackEnd = '<!-- /charcoal-stack -->';

export type TPrDetails = {
  title?: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft?: boolean;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  checks?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED' | null;
  threads?: { resolved: number; total: number };
};

// Newest PR on top, the current PR marked, the base branch at the bottom,
// like `ch ls`. Forks above the current PR are left out.
export function createPrBodyFooter(
  context: TContext,
  branch: string,
  details: Record<number, TPrDetails> = {}
): string {
  const stack = [
    ...upstackLine(context, branch).reverse(),
    branch,
    ...ancestors(context, branch),
  ].filter((b) => context.engine.getPrInfo(b)?.number);

  const rows = stack.map((b) => {
    const number = context.engine.getPrInfo(b)?.number as number;
    const d = details[number] ?? {};
    const current = b === branch;
    const title = d.title ? ` ${escapeMarkdown(d.title)}` : '';
    const ref = current ? `**#${number}${title}** 👈` : `#${number}${title}`;
    return `| ${current ? '◉' : '◯'} | ${ref} | ${badges(d).join(' | ')} |`;
  });
  const position = stack.length - stack.indexOf(branch);
  const base =
    context.engine.getParent(stack[stack.length - 1] ?? branch) ??
    context.engine.trunk;
  const copyLines = stack.map((b) => {
    const pr = context.engine.getPrInfo(b);
    const title = details[pr?.number as number]?.title;
    return [`#${pr?.number}`, title, pr?.url].filter(Boolean).join(' ');
  });

  return [
    `\n\n${stackStart}`,
    `| | Stack · ${position} of ${stack.length} | State | CI | Review | Threads |`,
    '|:-:|---|---|---|---|---|',
    ...rows,
    `| ◯ | \`${base}\` (base) | | | | |`,
    '',
    '<details><summary>Copy stack</summary>',
    '',
    '```',
    ...copyLines,
    '```',
    '',
    '</details>',
    '',
    `<sub>Updated on each \`ch submit\` by [Charcoal](https://github.com/fbarretto/charcoal)</sub>`,
    stackEnd,
  ].join('\n');
}

// State, CI, review and threads columns; empty cells keep the table aligned.
function badges(d: TPrDetails): string[] {
  const open = d.state === 'OPEN';
  const state =
    d.state === 'MERGED'
      ? '🟣 Merged'
      : d.state === 'CLOSED'
      ? '⚪ Closed'
      : d.isDraft
      ? '📝 Draft'
      : open
      ? '🟢 Open'
      : '';
  const checks = !open
    ? ''
    : d.checks === 'FAILURE' || d.checks === 'ERROR'
    ? '❌ Failing'
    : d.checks === 'PENDING' || d.checks === 'EXPECTED'
    ? '⏳ Running'
    : d.checks === 'SUCCESS'
    ? '✅ Passing'
    : '';
  const review = !open
    ? ''
    : d.reviewDecision === 'APPROVED'
    ? '👍 Approved'
    : d.reviewDecision === 'CHANGES_REQUESTED'
    ? '🔴 Changes requested'
    : '';
  const threads = d.threads?.total
    ? `💬 ${d.threads.resolved}/${d.threads.total}`
    : '';
  return [state, checks, review, threads];
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

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]<>|#])/g, '\\$1');
}

// One GraphQL call for every PR the footers mention. On any failure the
// footers fall back to bare PR numbers rather than blocking the submit.
export function fetchPrDetails(
  repo: string,
  numbers: number[]
): Record<number, TPrDetails> {
  if (!numbers.length) {
    return {};
  }
  const [owner, name] = repo.split('/');
  const fields = numbers
    .map(
      (
        n
      ) => `pr${n}: pullRequest(number: ${n}) { number title state isDraft reviewDecision
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
        `query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
      ],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const prs = Object.values(JSON.parse(out).data.repository) as Array<{
      number: number;
      title: string;
      state: TPrDetails['state'];
      isDraft: boolean;
      reviewDecision: TPrDetails['reviewDecision'];
      commits: {
        nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
      };
      reviewThreads: { nodes: { isResolved: boolean }[] };
    }>;
    return Object.fromEntries(
      prs
        .filter((pr) => pr)
        .map((pr) => [
          pr.number,
          {
            title: pr.title,
            state: pr.state,
            isDraft: pr.isDraft,
            reviewDecision: pr.reviewDecision,
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
  } catch {
    return {};
  }
}
