import chalk from 'chalk';
import { TContext } from '../lib/context';
import { getMetadataRefList } from '../lib/engine/metadata_ref';
import { PreconditionsFailedError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { getBranchNamesAndRevisions } from '../lib/git/sorted_branch_names';
import { branchesInOtherWorktrees } from '../lib/git/worktrees';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { TUndoSnapshot, undoStackFactory } from '../lib/spiffy/undo_spf';

const MAX_SNAPSHOTS = 10;

// Commands that can change branch heads or Charcoal metadata. Everything else
// (navigation, inspection, config, `continue`, `undo`) records nothing, so
// `undo` after `continue` reverts the whole interrupted command.
// `submit` and `merge` are excluded: undoing them locally would rewind
// branches and PR info that no longer match GitHub.
const MUTATING_COMMANDS = new Set([
  'absorb',
  'create',
  'delete',
  'edit',
  'fold',
  'freeze',
  'get',
  'internal-only metaedit',
  'modify',
  'move',
  'pop',
  'rename',
  'reorder',
  'repo sync',
  'restack',
  'revert',
  'split',
  'squash',
  'sync',
  'track',
  'unfreeze',
  'unlink',
  'untrack',
]);

export function isUndoableCommand(canonicalName: string): boolean {
  return MUTATING_COMMANDS.has(canonicalName);
}

const sortedEntries = (record: Record<string, string>): [string, string][] =>
  Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

export function takeUndoSnapshot(command: string): TUndoSnapshot {
  const currentBranch =
    runGitCommand({
      args: ['symbolic-ref', '--short', '-q', 'HEAD'],
      onError: 'ignore',
      resource: 'undoCurrentBranch',
    }) || undefined;
  return {
    command,
    currentBranch,
    branches: sortedEntries(getBranchNamesAndRevisions()),
    metadata: sortedEntries(getMetadataRefList()),
  };
}

// Records `before` only if the command actually changed something, so a
// failed or no-op command doesn't leave an empty undo step behind.
export function recordUndoSnapshot(before: TUndoSnapshot): void {
  const after = takeUndoSnapshot(before.command);
  if (JSON.stringify(after) === JSON.stringify(before)) {
    return;
  }
  undoStackFactory.load().update((data) => {
    data.snapshots = [...(data.snapshots ?? []), before].slice(-MAX_SNAPSHOTS);
  });
}

type TRefChange = { name: string; from?: string; to?: string };

function diffRefs(
  current: TUndoSnapshot['branches'],
  target: TUndoSnapshot['branches']
): TRefChange[] {
  const from = Object.fromEntries(current);
  const to = Object.fromEntries(target);
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .sort()
    .filter((name) => from[name] !== to[name])
    .map((name) => ({ name, from: from[name], to: to[name] }));
}

const short = (sha: string) => sha.slice(0, 7);

function describeBranchChange({ name, from, to }: TRefChange): string {
  return !to
    ? `delete branch ${chalk.red(name)}`
    : !from
    ? `recreate branch ${chalk.green(name)} at ${short(to)}`
    : `reset branch ${chalk.yellow(name)} ${short(from)} -> ${short(to)}`;
}

function describeMetadataChange({ name, from, to }: TRefChange): string {
  return !to
    ? `remove metadata for ${chalk.red(name)}`
    : !from
    ? `restore metadata for ${chalk.green(name)}`
    : `revert metadata for ${chalk.yellow(name)}`;
}

function refUpdates(prefix: string, changes: TRefChange[]): string[] {
  return changes.map(({ name, to }) =>
    to ? `update ${prefix}${name} ${to}` : `delete ${prefix}${name}`
  );
}

function restoreSnapshot(
  snapshot: TUndoSnapshot,
  branchChanges: TRefChange[],
  metadataChanges: TRefChange[]
): void {
  // Detach first so the checked-out branch can be moved or deleted freely.
  runGitCommand({
    args: ['checkout', '-q', '--detach'],
    onError: 'throw',
    resource: 'undoDetach',
  });
  runGitCommand({
    args: ['update-ref', '--stdin'],
    options: {
      input: [
        'start',
        ...refUpdates('refs/heads/', branchChanges),
        ...refUpdates('refs/branch-metadata/', metadataChanges),
        'commit',
        '',
      ].join('\n'),
    },
    onError: 'throw',
    resource: 'undoUpdateRefs',
  });
  if (snapshot.currentBranch) {
    runGitCommand({
      args: ['checkout', '-q', snapshot.currentBranch],
      onError: 'throw',
      resource: 'undoCheckout',
    });
  }
}

async function shouldProceed(
  force: boolean,
  context: TContext
): Promise<boolean> {
  return (
    force ||
    !context.interactive ||
    (
      await context.prompts({
        type: 'confirm',
        name: 'value',
        message: 'Undo these changes?',
        initial: true,
      })
    ).value
  );
}

// Refuses (before changing anything) when restoring would move, delete or
// check out a branch that another worktree has checked out.
function assertNoOtherWorktreeBranches(
  branchChanges: TRefChange[],
  checkout: string | undefined
): void {
  const otherWorktrees = branchesInOtherWorktrees();
  const blocked = [
    ...new Set([
      ...branchChanges.map((c) => c.name),
      ...(checkout ? [checkout] : []),
    ]),
  ].filter((b) => otherWorktrees.has(b));
  if (blocked.length) {
    throw new PreconditionsFailedError(
      [
        `Cannot undo: it would need to modify or check out branches checked out in another worktree:`,
        ...blocked.map(
          (b) => `  ${chalk.yellow(b)} (${otherWorktrees.get(b)})`
        ),
        `Switch that worktree to a different branch, then retry.`,
      ].join('\n')
    );
  }
}

type TRestorePlan = {
  branchChanges: TRefChange[];
  metadataChanges: TRefChange[];
  checkout?: string;
};

function planRestore(snapshot: TUndoSnapshot): TRestorePlan {
  const current = takeUndoSnapshot('undo');
  const plan = {
    branchChanges: diffRefs(current.branches, snapshot.branches),
    metadataChanges: diffRefs(current.metadata, snapshot.metadata),
    checkout:
      snapshot.currentBranch && snapshot.currentBranch !== current.currentBranch
        ? snapshot.currentBranch
        : undefined,
  };
  assertNoOtherWorktreeBranches(plan.branchChanges, plan.checkout);
  return plan;
}

// Drops the top undo step if it is `snapshot` (it may not have been recorded
// when the command changed nothing).
export function popUndoSnapshot(snapshot: TUndoSnapshot): void {
  const undoStack = undoStackFactory.load();
  const top = undoStack.data.snapshots?.at(-1);
  if (JSON.stringify(top) !== JSON.stringify(snapshot)) {
    return;
  }
  undoStack.update((data) => {
    data.snapshots = data.snapshots?.slice(0, -1);
    if (!data.snapshots?.length) {
      delete data.snapshots;
    }
  });
}

// Restores branches, metadata and the checked-out branch to `snapshot`.
export function restoreUndoSnapshot(
  snapshot: TUndoSnapshot,
  context: TContext,
  plan = planRestore(snapshot)
): void {
  const changes = committedChanges(snapshot, context);
  restoreSnapshot(snapshot, plan.branchChanges, plan.metadataChanges);
  context.engine.clear();
  context.engine.rebuild();
  if (changes) {
    reapplyChanges(snapshot.command, changes, context);
  }
}

type TCommittedChanges = { base: string; head: string; patch: string };

// What `create` / `modify` committed (the created branch's commits, or the
// modified branch's old..new diff), so undoing it hands those changes back
// instead of leaving them only in the reflog.
function committedChanges(
  snapshot: TUndoSnapshot,
  context: TContext
): TCommittedChanges | undefined {
  const before = Object.fromEntries(snapshot.branches);
  const now = getBranchNamesAndRevisions();
  const branch =
    snapshot.command === 'create'
      ? Object.keys(now).find((b) => !(b in before))
      : snapshot.command === 'modify'
      ? modifiedBranch(before, now, context)
      : undefined;
  if (!branch || !now[branch]) {
    return undefined;
  }
  const base =
    snapshot.command === 'create'
      ? context.engine.isBranchTracked(branch)
        ? context.engine.getBaseRevision(branch)
        : undefined
      : before[branch];
  const head = now[branch];
  if (!base || base === head) {
    return undefined;
  }
  const patch = runGitCommand({
    args: ['diff', '--binary', '--no-ext-diff', base, head],
    options: { noTrim: true },
    onError: 'throw',
    resource: 'undoCommittedChanges',
  });
  return patch ? { base, head, patch } : undefined;
}

// The amended branch (current, or the --into target) is the changed branch
// whose parent didn't change; the others were only restacked onto it.
function modifiedBranch(
  before: Record<string, string>,
  now: Record<string, string>,
  context: TContext
): string | undefined {
  return Object.keys(now).find((b) => {
    if (!before[b] || before[b] === now[b]) {
      return false;
    }
    const parent = context.engine.getParent(b);
    return parent !== undefined && before[parent] === now[parent];
  });
}

function reapplyChanges(
  command: string,
  { base, head, patch }: TCommittedChanges,
  context: TContext
): void {
  try {
    runGitCommand({
      args: ['apply', '--index'],
      options: {
        input: patch,
        cwd: runGitCommand({
          args: ['rev-parse', '--show-toplevel'],
          onError: 'throw',
          resource: 'undoToplevel',
        }),
      },
      onError: 'throw',
      resource: 'undoReapplyChanges',
    });
    context.splog.info(
      `The changes ${chalk.cyan(
        `ch ${command}`
      )} committed are staged in your working tree.`
    );
  } catch {
    context.splog.warn(
      [
        `Could not reapply the changes ${chalk.cyan(
          `ch ${command}`
        )} committed. Recover them with:`,
        `  git diff --binary ${base} ${head} | git apply --3way`,
      ].join('\n')
    );
  }
}

export async function undoAction(
  { force }: { force: boolean },
  context: TContext
): Promise<void> {
  const snapshot = undoStackFactory.load().data.snapshots?.at(-1);
  if (!snapshot) {
    context.splog.info('Nothing to undo.');
    return;
  }
  uncommittedTrackedChangesPrecondition();

  const plan = planRestore(snapshot);
  const { branchChanges, metadataChanges, checkout } = plan;
  context.splog.info(
    `Undoing ${chalk.cyan(`ch ${snapshot.command}`)} (local state only):`
  );
  [
    ...branchChanges.map(describeBranchChange),
    ...metadataChanges.map(describeMetadataChange),
    ...(checkout ? [`check out ${chalk.cyan(checkout)}`] : []),
  ].forEach((line) => context.splog.info(`  - ${line}`));

  if (!(await shouldProceed(force, context))) {
    context.splog.info('Undo cancelled.');
    return;
  }

  restoreUndoSnapshot(snapshot, context, plan);
  popUndoSnapshot(snapshot);
  context.splog.info(`Undid ${chalk.cyan(`ch ${snapshot.command}`)}.`);
}
