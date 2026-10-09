import { execFileSync } from 'child_process';

// GitHub's native stacked-PR REST API (what `gh stack` uses), called via `gh api`.
export type TGhStack = {
  number: number;
  pull_requests: { number: number }[];
};

export class GhApiError extends Error {
  constructor(message: string, readonly status: number | undefined) {
    super(message);
  }
}

function ghApi(
  path: string,
  opts?: { method: 'POST'; body?: unknown }
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

export const findStackForPr = (
  repo: string,
  pr: number
): TGhStack | undefined =>
  (ghApi(`repos/${repo}/stacks?pull_request=${pr}`) as TGhStack[])[0];

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
