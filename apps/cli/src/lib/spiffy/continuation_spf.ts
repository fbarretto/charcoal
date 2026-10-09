import * as t from '@withgraphite/retype';
import { spiffy } from './spiffy';
import { undoSnapshotSchema } from './undo_spf';

/**
 * After Graphite is interrupted by a merge conflict, upon continuing, there
 * are 3 main things we need to do, in the following order.
 *
 * 1) Complete the original rebase operation.
 * 2) Sync any remaining branches from remote.
 * 3) Restack any remaining branches that were queued.
 *
 * The below object persists the queue of branches to be restacked.
 * We also store the Graphite current branch, so that we can switch back to it.
 * We need to keep track of the new parentBranchRevision for the branch that
 * hit a merge conflict, as we cannot pull this information from Git.
 * pendingParents holds queued branches whose new parent must not be written
 * until just before they restack: once a branch's new parent is already in
 * its history, the cache loader would silently "fix" its parentBranchRevision.
 * branchesToDelete are deleted only after the queue is restacked, so their
 * children keep a valid parent until they move off it.
 * stashToRestore is a stash commit (kept alive under refs/charcoal/stash/)
 * whose `part` is reapplied once the command finishes or aborts.
 * undoSnapshot is the state before the halted command; `ch abort` restores it.
 */
const ContinueSchema = t.shape({
  branchesToSync: t.array(t.string),
  branchesToRestack: t.array(t.string),
  pendingParents: t.optional(t.array(t.tuple([t.string, t.string] as const))),
  branchesToDelete: t.optional(t.array(t.string)),
  stashToRestore: t.optional(
    t.shape({
      sha: t.string,
      part: t.literals(['UNSTAGED', 'ALL'] as const),
    })
  ),
  currentBranchOverride: t.optional(t.string),
  rebasedBranchBase: t.optional(t.string),
  undoSnapshot: t.optional(undoSnapshotSchema),
});

export const continueConfigFactory = spiffy({
  schema: ContinueSchema,
  defaultLocations: [
    {
      relativePath: '.gtcontinue',
      relativeTo: 'REPO',
    },
  ],
  initialize: () => {
    return {};
  },
  helperFunctions: () => {
    return {} as const;
  },
  options: { removeIfEmpty: true, removeIfInvalid: true },
});

export type TContinueConfig = ReturnType<typeof continueConfigFactory.load>;
