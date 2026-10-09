import { TContext } from '../lib/context';

export function persistContinuation(
  args: {
    branchesToRestack?: string[];
    branchesToSync?: string[];
    pendingParents?: Record<string, string>;
    branchesToDelete?: string[];
    rebasedBranchBase: string;
  },
  context: TContext
): void {
  const [branchesToRestack, branchesToSync] = [
    args.branchesToRestack ?? [],
    args.branchesToSync ?? [],
  ];
  context.splog.debug(
    branchesToSync.reduce(
      (acc, curr) => `${acc}\n${curr}`,
      'PERSISTING (sync):'
    )
  );
  context.splog.debug(
    branchesToRestack.reduce(
      (acc, curr) => `${acc}\n${curr}`,
      'PERSISTING (restack):'
    )
  );
  context.continueConfig.update((data) => {
    data.branchesToSync = branchesToSync;
    data.branchesToRestack = branchesToRestack;
    data.pendingParents = Object.entries(args.pendingParents ?? {});
    data.branchesToDelete = args.branchesToDelete;
    data.currentBranchOverride = context.engine.currentBranch;
    data.rebasedBranchBase = args.rebasedBranchBase;
  });
}

export function clearContinuation(context: TContext): void {
  context.continueConfig.update((data) => {
    data.branchesToSync = [];
    data.branchesToRestack = [];
    data.pendingParents = undefined;
    data.branchesToDelete = undefined;
    data.currentBranchOverride = undefined;
    data.rebasedBranchBase = undefined;
  });
}
