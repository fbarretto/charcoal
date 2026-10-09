import { execFileSync } from 'child_process';

// GitHub's native stacked-PR REST API (what `gh stack` uses), called via `gh api`.
export type TGhStack = {
  number: number;
  open?: boolean;
  pull_requests: {
    number: number;
    state?: 'open' | 'closed';
    head?: { ref: string };
  }[];
};

// The async merge API (PUT pulls/{n}/merge-async), the only way GitHub merges
// a stacked PR. On a stacked PR it merges every member up to and including n.
export type TAsyncMerge = {
  status: 'pending' | 'merged' | 'enqueued' | 'failed';
  details?: { uuid?: string; message?: string; sha?: string };
};

export class GhApiError extends Error {
  constructor(message: string, readonly status: number | undefined) {
    super(message);
  }
}

function ghApi(
  path: string,
  opts?: { method: 'POST' | 'PUT'; body?: unknown }
): unknown {
  const args = ['api', path];
  if (opts) {
    args.push('--method', opts.method);
    if (opts.body !== undefined) {
      args.push('--input', '-');
    }
  }
  try {
    const stdout = execFileSync('gh', args, {
      input: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
    return stdout ? JSON.parse(stdout) : undefined; // 204 has no body
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? '');
    const status = /HTTP (\d{3})/.exec(stderr)?.[1];
    throw new GhApiError(
      `\`gh api ${path}\` failed: ${stderr.trim() || String(error)}`,
      status ? Number(status) : undefined
    );
  }
}

export const prNumbersOf = (stack: TGhStack): number[] =>
  stack.pull_requests.map((pr) => pr.number);

// Merged and closed PRs stay listed in a stack; only open ones form the chain.
export const openPrNumbersOf = (stack: TGhStack): number[] =>
  stack.pull_requests
    .filter((pr) => pr.state !== 'closed')
    .map((pr) => pr.number);

// A PR can also be listed in stacks GitHub already closed (fully merged or
// unstacked while a member was queued); those no longer hold it.
export const findStackForPr = (
  repo: string,
  pr: number
): TGhStack | undefined =>
  (ghApi(`repos/${repo}/stacks?pull_request=${pr}`) as TGhStack[]).find(
    (s) => s.open !== false
  );

export const createStack = (repo: string, prs: number[]): TGhStack =>
  ghApi(`repos/${repo}/stacks`, {
    method: 'POST',
    body: { pull_requests: prs },
  }) as TGhStack;

export const addToStack = (
  repo: string,
  stack: number,
  prs: number[]
): TGhStack =>
  ghApi(`repos/${repo}/stacks/${stack}/add`, {
    method: 'POST',
    body: { pull_requests: prs },
  }) as TGhStack;

// Returns the PRs GitHub kept stacked (queued for merge / auto-merge), if any.
export const unstack = (repo: string, stack: number): TGhStack | undefined =>
  ghApi(`repos/${repo}/stacks/${stack}/unstack`, { method: 'POST' }) as
    | TGhStack
    | undefined;

export const mergeAsync = (
  repo: string,
  pr: number,
  method: 'squash' | 'merge' | 'rebase'
): TAsyncMerge =>
  ghApi(`repos/${repo}/pulls/${pr}/merge-async`, {
    method: 'PUT',
    body: { merge_method: method, merge_action: 'default' },
  }) as TAsyncMerge;

export const getAsyncMerge = (
  repo: string,
  pr: number,
  uuid: string
): TAsyncMerge =>
  ghApi(`repos/${repo}/pulls/${pr}/merge-async/${uuid}`) as TAsyncMerge;
