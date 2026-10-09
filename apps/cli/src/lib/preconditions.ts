import { TContext } from './context';
import { PreconditionsFailedError } from './errors';
import { detectStagedChanges } from './git/diff';
import {
  trackedUncommittedChanges,
  unstagedChanges,
} from './git/git_status_utils';
import { runGitCommand } from './git/runner';
import { canPrompt } from './utils/prompts_helpers';

export type TStageOpts = { all?: boolean; update?: boolean; patch?: boolean };

// `all` includes untracked files unless `untracked` is false (absorb). With
// no staging flag, nothing staged and something unstaged, asks what to stage.
export async function stageChanges(
  opts: TStageOpts,
  context: TContext,
  { untracked = true }: { untracked?: boolean } = {}
): Promise<void> {
  const mode =
    opts.all && untracked
      ? 'all'
      : opts.all || opts.update
      ? 'update'
      : opts.patch
      ? 'patch'
      : await promptToStage(context, untracked);
  if (mode) {
    git(
      mode === 'all'
        ? ['add', '--all']
        : mode === 'update'
        ? ['add', '-u']
        : ['add', '-p'],
      mode === 'patch'
    );
  }
}

async function promptToStage(
  context: TContext,
  untracked: boolean
): Promise<'all' | 'update' | 'patch' | undefined> {
  if (!canPrompt(context) || detectStagedChanges()) {
    return undefined;
  }
  const hasTracked = git(['diff', '--name-only']).length > 0;
  const hasUntracked = untracked && unstagedChanges();
  if (!hasTracked && !hasUntracked) {
    return undefined;
  }
  if (hasTracked) {
    context.splog.info(git(['-c', 'color.ui=always', 'diff', '--stat']));
  }
  const choices = [
    ...(hasUntracked
      ? [
          {
            title: 'Stage all changes, including untracked files (--all)',
            value: 'all',
          },
        ]
      : []),
    ...(hasTracked
      ? [
          {
            title: 'Stage all changes to tracked files (--update)',
            value: 'update',
          },
          { title: 'Select changes to stage (--patch)', value: 'patch' },
        ]
      : []),
    { title: 'Continue without staging', value: 'none' },
  ];
  const { value } = await context.prompts({
    type: 'select',
    name: 'value',
    message: 'You have unstaged changes. Would you like to stage them?',
    choices,
  });
  return value === 'none' ? undefined : value;
}

function git(args: string[], inherit = false): string {
  return runGitCommand({
    args,
    options: inherit ? { stdio: 'inherit' } : {},
    onError: 'throw',
    resource: 'stageChanges',
  });
}

export function getRepoRootPathPrecondition(): string {
  const repoRootPath = runGitCommand({
    args: [`rev-parse`, `--git-common-dir`],
    onError: 'ignore',
    resource: 'getRepoRootPathPrecondition',
  });

  if (!repoRootPath) {
    throw new PreconditionsFailedError('No .git repository found.');
  }
  return repoRootPath;
}

// The current worktree's own git dir (equals the common dir in the main one).
export function getWorktreeGitDirPrecondition(): string {
  const gitDir = runGitCommand({
    args: [`rev-parse`, `--absolute-git-dir`],
    onError: 'ignore',
    resource: 'getWorktreeGitDirPrecondition',
  });
  if (!gitDir) {
    throw new PreconditionsFailedError('No .git repository found.');
  }
  return gitDir;
}

export function uncommittedTrackedChangesPrecondition(): void {
  if (trackedUncommittedChanges()) {
    throw new PreconditionsFailedError(
      `There are tracked changes that have not been committed. Please resolve and then retry.`
    );
  }
}

export function ensureSomeStagedChangesPrecondition(context: TContext): void {
  if (detectStagedChanges()) {
    return;
  }

  if (unstagedChanges()) {
    context.splog.tip(
      'There are unstaged changes. Use the `--all` option to stage all changes.'
    );
  }

  throw new PreconditionsFailedError(`Cannot run without staged changes.`);
}

export function currentGitRepoPrecondition(): string {
  const repoRootPath = runGitCommand({
    args: [`rev-parse`, `--show-toplevel`],
    onError: 'ignore',
    resource: 'currentGitRepoPrecondition',
  });
  if (!repoRootPath) {
    throw new PreconditionsFailedError('No .git repository found.');
  }
  return repoRootPath;
}
