import * as t from '@withgraphite/retype';
import { spiffy } from './spiffy';

const refShasSchema = t.array(t.tuple([t.string, t.string]));

export const undoSnapshotSchema = t.shape({
  command: t.string,
  currentBranch: t.optional(t.string),
  branches: refShasSchema,
  metadata: refShasSchema,
});
export type TUndoSnapshot = t.TypeOf<typeof undoSnapshotSchema>;

export const undoStackFactory = spiffy({
  schema: t.shape({ snapshots: t.optional(t.array(undoSnapshotSchema)) }),
  defaultLocations: [
    {
      relativePath: '.graphite_undo',
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
