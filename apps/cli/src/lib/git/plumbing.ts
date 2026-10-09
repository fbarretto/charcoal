import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { runGitCommand } from './runner';

// Trees are built in a throwaway index file, so building them never touches
// the working tree or the real index.

const ZERO_SHA = '0000000000000000000000000000000000000000';

function git(
  args: string[],
  opts: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    noTrim?: boolean;
    atRoot?: boolean;
  } = {}
): string {
  return runGitCommand({
    args,
    options: {
      // `git apply` silently skips paths outside the cwd, and diffs use
      // root-relative paths.
      cwd: opts.atRoot
        ? runGitCommand({
            args: ['rev-parse', '--show-toplevel'],
            onError: 'throw',
            resource: 'plumbing',
          })
        : undefined,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
      input: opts.input,
      noTrim: opts.noTrim,
    },
    onError: 'throw',
    resource: 'plumbing',
  });
}

// Runs `fn` with a git that reads/writes a temporary index seeded from `rev`.
function withTempIndex<T>(rev: string, fn: (indexGit: typeof git) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charcoal-index-'));
  const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
  const indexGit: typeof git = (args, opts = {}) =>
    git(args, { ...opts, env: { ...env, ...opts.env } });
  try {
    indexGit(['read-tree', rev]);
    return fn(indexGit);
  } finally {
    fs.removeSync(dir);
  }
}

export function getTree(rev: string): string {
  return git(['rev-parse', `${rev}^{tree}`]);
}

export function getChangedPaths(
  from: string,
  to: string,
  pathspecs: string[]
): string[] {
  return git(
    ['diff', '--name-only', '--no-renames', '-z', from, to, '--', ...pathspecs],
    { noTrim: true }
  )
    .split('\0')
    .filter((p) => p.length > 0);
}

// `index-info` lines that make an index match `source` at exactly `paths`
// (entries missing from `source` are removed).
export function indexInfoFrom(source: string, paths: string[]): string {
  const entries: Record<string, string> = Object.fromEntries(
    git(
      [
        '--literal-pathspecs',
        'ls-tree',
        '-r',
        '-z',
        '--full-tree',
        source,
      ].concat(['--', ...paths]),
      { noTrim: true }
    )
      .split('\0')
      .filter((l) => l.length > 0)
      .map((l) => [l.slice(l.indexOf('\t') + 1), l])
  );
  return paths
    .map((p) => entries[p] ?? `0 ${ZERO_SHA}\t${p}`)
    .map((l) => `${l}\0`)
    .join('');
}

export function treeWithIndexInfo(rev: string, indexInfo: string): string {
  return withTempIndex(rev, (indexGit) => {
    indexGit(['update-index', '-z', '--index-info'], { input: indexInfo });
    return indexGit(['write-tree']);
  });
}

export function getCommitAuthorEnv(rev: string): NodeJS.ProcessEnv {
  const [name, email, date] = git([
    'show',
    '-s',
    '--format=%an%x00%ae%x00%ad',
    '--date=raw',
    rev,
  ]).split('\0');
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_DATE: date,
  };
}

export function getCommitMessage(rev: string): string {
  return git(['show', '-s', '--format=%B', rev], { noTrim: true });
}

export function commitTree({
  tree,
  parents,
  message,
  authorEnv,
}: {
  tree: string;
  parents: string[];
  message: string;
  authorEnv?: NodeJS.ProcessEnv;
}): string {
  return git(
    ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-F', '-'],
    { input: message, env: authorEnv }
  );
}

export function detachAt(rev: string): void {
  git(['switch', '-q', '--detach', rev]);
}

// Throws if the patch doesn't apply cleanly to `rev`'s tree.
export function treeWithPatch(rev: string, patch: string): string {
  return withTempIndex(rev, (indexGit) => {
    indexGit(['apply', '--cached'], { input: patch, atRoot: true });
    return indexGit(['write-tree']);
  });
}

export function getStagedPatch(): string {
  return git(['diff', '--cached', '--binary', '--no-ext-diff'], {
    noTrim: true,
  });
}

export function applyToWorkingTree(patch: string): void {
  git(['apply'], { input: patch, atRoot: true });
}

// A stash commit of the index + working tree that isn't put on the stash
// stack; empty string when there is nothing to save.
export function createStashCommit(): string {
  return git(['stash', 'create']);
}

export type TStashPart = 'UNSTAGED' | 'ALL';

const stashRef = (sha: string) => `refs/charcoal/stash/${sha}`;

// Keeps a stash commit reachable (safe from gc) until it is restored.
export function keepStashCommit(sha: string): void {
  git(['update-ref', stashRef(sha), sha]);
}

// Reapplies a stash commit's changes to the working tree as unstaged ones,
// then releases its ref. 'UNSTAGED' diffs from its index parent (the staged
// part is dropped), 'ALL' from its HEAD parent.
export function restoreFromStash(sha: string, part: TStashPart): void {
  const base = part === 'UNSTAGED' ? `${sha}^2` : `${sha}^1`;
  const patch = git(['diff', '--binary', '--no-ext-diff', base, sha], {
    noTrim: true,
  });
  if (patch) {
    applyToWorkingTree(patch);
  }
  git(['update-ref', '-d', stashRef(sha)]);
}

export function hardResetToHead(): void {
  git(['reset', '--hard', '-q', 'HEAD']);
}
