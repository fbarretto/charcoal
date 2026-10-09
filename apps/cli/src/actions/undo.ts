import chalk from 'chalk';
import { TContext } from '../lib/context';
import { getMetadataRefList } from '../lib/engine/metadata_ref';
import { PreconditionsFailedError } from '../lib/errors';
import { runGitCommand } from '../lib/git/runner';
import { getBranchNamesAndRevisions } from '../lib/git/sorted_branch_names';
import { uncommittedTrackedChangesPrecondition } from '../lib/preconditions';
import { TUndoSnapshot, undoStackFactory } from '../lib/spiffy/undo_spf';

const MAX_SNAPSHOTS = 10;

// Commands that can change branch heads or Charcoal metadata. Everything else
// (navigation, inspection, config, `continue`, `undo`) records nothing, so
// `undo` after `continue` reverts the whole interrupted command.
// `submit` is excluded: undoing it locally would drop PR info for PRs that
// still exist remotely.
const MUTATING_COMMANDS = new Set([
  'create',
  'delete',
  'edit',
  'fold',
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

export async function undoAction(
  { force }: { force: boolean },
  context: TContext
): Promise<void> {
  if (context.engine.rebaseInProgress()) {
    throw new PreconditionsFailedError(
      `Cannot undo while a rebase is in progress. Finish it with ${chalk.cyan(
        'ch continue'
      )} or abort it first.`
    );
  }
  uncommittedTrackedChangesPrecondition();

  const undoStack = undoStackFactory.load();
  const snapshot = undoStack.data.snapshots?.at(-1);
  if (!snapshot) {
    context.splog.info('Nothing to undo.');
    return;
  }

  const current = takeUndoSnapshot('undo');
  const branchChanges = diffRefs(current.branches, snapshot.branches);
  const metadataChanges = diffRefs(current.metadata, snapshot.metadata);
  const checkoutChange =
    snapshot.currentBranch && snapshot.currentBranch !== current.currentBranch
      ? [`check out ${chalk.cyan(snapshot.currentBranch)}`]
      : [];

  context.splog.info(
    `Undoing ${chalk.cyan(`ch ${snapshot.command}`)} (local state only):`
  );
  [
    ...branchChanges.map(describeBranchChange),
    ...metadataChanges.map(describeMetadataChange),
    ...checkoutChange,
  ].forEach((line) => context.splog.info(`  - ${line}`));

  if (!(await shouldProceed(force, context))) {
    context.splog.info('Undo cancelled.');
    return;
  }

  restoreSnapshot(snapshot, branchChanges, metadataChanges);
  undoStack.update((data) => {
    data.snapshots = data.snapshots?.slice(0, -1);
    if (!data.snapshots?.length) {
      delete data.snapshots;
    }
  });
  context.engine.clear();
  context.engine.rebuild();
  context.splog.info(`Undid ${chalk.cyan(`ch ${snapshot.command}`)}.`);
}
