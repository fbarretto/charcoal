import type { Operation } from "./operations/Operation";

import { useMostRecentPendingOperation } from "./previews";
import { useRunOperation } from "./serverAPIState";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { isPromise } from "@withgraphite/gti-shared/utils";
import { family } from "./lib/mobx-recoil/family";
import { observable } from "mobx";
import { observer } from "mobx-react-lite";

/**
 * Wrapper around VSCodeButton intended for buttons which runOperations.
 * It remembers what Operation it spawns, and leaves the button disabled
 * if that operation is the most recent pending operation (queued or running).
 * If any further operations have been queued, then button will be re-enabled
 * (to allow queueing it again which may be valid).
 *
 * Note: do not use "useRunOperation" directly in the "runOperation", instead return the operation instance.
 *
 * runOperation may also return an Array of operations, if it queues multiple.
 * If the pending operation is ANY of those operations, the button will be disabled.
 *
 * Provide a `contextKey` to describe what this button is doing, to correlate with its resulting operation.
 * Generally this is just the name of the operation, but for operations that e.g. depend on a commit,
 * it may also include the commit hash so not every instance of this button is disabled.
 */
export const OperationDisabledButton = observer(
  ({
    contextKey,
    runOperation,
    disabled,
    children,
    ...rest
  }: {
    appearance?: "primary" | "secondary" | "icon";
    contextKey: string;
    runOperation: () =>
      | Operation
      | Array<Operation>
      | undefined
      | Promise<Operation | Array<Operation> | undefined>;
    children: React.ReactNode;
    disabled?: boolean;
  }) => {
    const actuallyRunOperation = useRunOperation();
    const pendingOperation = useMostRecentPendingOperation();
    const triggeredOperationIdState = operationButtonDisableState(contextKey);
    const triggeredOperationId = triggeredOperationIdState.get();
    const isRunningThisOperation =
      pendingOperation != null &&
      triggeredOperationId?.includes(pendingOperation.id);

    return (
      <VSCodeButton
        {...rest}
        disabled={isRunningThisOperation || disabled}
        onClick={async () => {
          const opOrOpsResult = runOperation();
          let opOrOps;
          if (isPromise(opOrOpsResult)) {
            opOrOps = await opOrOpsResult;
          } else {
            opOrOps = opOrOpsResult;
          }
          if (opOrOps == null) {
            return;
          }
          const ops = Array.isArray(opOrOps) ? opOrOps : [opOrOps];
          for (const op of ops) {
            actuallyRunOperation(op);
          }
          triggeredOperationIdState.set(ops.map((op) => op.id));
        }}
      >
        {isRunningThisOperation && <Icon icon="loading" slot="start" />}
        {children}
      </VSCodeButton>
    );
  }
);

const operationButtonDisableState = family({
  genKey: (ctx: string) => ctx,
  genValue: () => observable.box<string[]>([]),
});
