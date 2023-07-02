import type { CommitState } from "./stackEdit/commitStackState";
import type { Hash } from "./types";
import type { RecordOf } from "immutable";
import type { ExportStack } from "@withgraphite/gti-shared/types/stack";

import clientToServerAPI from "./ClientToServerAPI";
import { getTracker } from "./analytics/globalTracker";
import { CommitStackState } from "./stackEdit/commitStackState";
import { assert } from "./utils";
import { List, Record } from "immutable";
import { unwrap } from "@withgraphite/gti-shared/utils";
import { computed, autorun } from "mobx";
import { observableBoxWithInitializers } from "./lib/mobx-recoil/observable_box_with_init";

type StackStateWithOperationProps = {
  op: StackEditOpDescription;
  state: CommitStackState;
};

/** Description of a stack edit operation. Used for display purpose. */
export type StackEditOpDescription =
  | {
      name: "move";
      offset: number;
      /** Count of dependencies excluding self. */
      depCount?: number;
      commit: CommitState;
    }
  | {
      name: "drop";
      commit: CommitState;
    }
  | {
      name: "fold";
      commit: CommitState;
    }
  | { name: "import" };

const StackStateWithOperation = Record<StackStateWithOperationProps>({
  op: { name: "import" },
  state: new CommitStackState([]),
});
type StackStateWithOperation = RecordOf<StackStateWithOperationProps>;

/** History of multiple states for undo/redo support. */
type HistoryProps = {
  history: List<StackStateWithOperation>;
  currentIndex: number;
};

const HistoryRecord = Record<HistoryProps>({
  history: List(),
  currentIndex: 0,
});
type HistoryRecord = RecordOf<HistoryProps>;

class History extends HistoryRecord {
  current(): CommitStackState {
    return unwrap(this.history.get(this.currentIndex)).state;
  }

  push(state: CommitStackState, op: StackEditOpDescription): History {
    const newHistory = this.history
      .slice(0, this.currentIndex + 1)
      .push(StackStateWithOperation({ op, state }));
    return new History({
      history: newHistory,
      currentIndex: newHistory.size - 1,
    });
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex + 1 < this.history.size;
  }

  undoOperationDescription(): StackEditOpDescription | undefined {
    return this.canUndo() ? this.history.get(this.currentIndex)?.op : undefined;
  }

  redoOperationDescription(): StackEditOpDescription | undefined {
    return this.canRedo()
      ? this.history.get(this.currentIndex + 1)?.op
      : undefined;
  }

  undo(): History {
    return this.canUndo()
      ? this.set("currentIndex", this.currentIndex - 1)
      : this;
  }

  redo(): History {
    return this.canRedo()
      ? this.set("currentIndex", this.currentIndex + 1)
      : this;
  }
}

/** State related to stack editing UI. */
type StackEditState = {
  /**
   * Commit hashes being edited.
   * Empty means no editing is requested.
   *
   * Changing this to a non-empty value triggers `exportStack`
   * message to the server.
   */
  hashes: Set<Hash>;

  /**
   * The (mutable) main history of stack states.
   */
  history: Loading<History>;
};

/** Lightweight recoil Loadable alternative that is not coupled with Promise. */
export type Loading<T> =
  | {
      state: "loading";
      exportedStack:
        | ExportStack /* Got the exported stack. Analyzing. */
        | undefined /* Haven't got the exported stack. */;
    }
  | { state: "hasValue"; value: T }
  | { state: "hasError"; error: string };

// This is private so we can maintain state consistency
// (ex. stack and requested hashes cannot be out of sync)
// via selectors.
const stackEditState = observableBoxWithInitializers<StackEditState>({
  default: {
    hashes: new Set<Hash>(),
    history: { state: "loading", exportedStack: undefined },
  },
  effects: [
    // Subscribe to server exportedStack events.
    ({ setSelf }) => {
      const disposable = clientToServerAPI.onMessageOfType(
        "exportedStack",
        (event) => {
          setSelf(() => {
            const hashes = stackEditState.get().hashes;
            const revs = getRevs(hashes);
            if (revs !== event.revs) {
              // Wrong stack. Ignore it.
              return stackEditState.get();
            }
            if (event.error != null) {
              return {
                hashes,
                history: { state: "hasError", error: event.error },
              };
            } else {
              return {
                hashes,
                history: { state: "loading", exportedStack: event.stack },
              };
            }
          });
        }
      );
      return () => disposable.dispose();
    },
  ],
});
autorun(() => {
  const newValue = stackEditState.get();
  const { hashes, history } = newValue;
  if (
    hashes.size > 0 &&
    history.state === "loading" &&
    history.exportedStack !== undefined
  ) {
    try {
      const stack = new CommitStackState(
        history.exportedStack
      ).buildFileStacks();
      const historyValue = new History({
        history: List([StackStateWithOperation({ state: stack })]),
        currentIndex: 0,
      });
      currentMetrics = {
        commits: hashes.size,
        fileStacks: stack.fileStacks.size,
        fileStackRevs: stack.fileStacks.reduce(
          (acc, f) => acc + f.source.revLength,
          0
        ),
      };
      currentMetricsStartTime = Date.now();
      stackEditState.set({
        hashes,
        history: { state: "hasValue", value: historyValue },
      });
    } catch (err) {
      const msg = `Cannot construct stack ${err}`;
      stackEditState.set({
        hashes,
        history: { state: "hasError", error: msg },
      });
    }
  }
});

/**
 * Commit hashes being stack edited.
 * Setting to a non-empty value triggers server-side loading.
 */
export const editingStackHashes = computed(() => stackEditState.get().hashes);
export const setEditingStackHashes = (newValue: Set<string>) => {
  const hashes = newValue;
  if (hashes.size > 0) {
    const revs = getRevs(hashes);
    clientToServerAPI.postMessage({ type: "exportStack", revs });
  }
  stackEditState.set({
    hashes,
    history: { state: "loading", exportedStack: undefined },
  });
};

/**
 * State for check whether the stack is loaded or not.
 * Use `useStackEditState` if you want to read or edit the stack.
 *
 * This is not `Loading<CommitStackState>` so `hasValue`
 * states do not trigger re-render.
 */
export const loadingStackState = computed<Loading<null>>(() => {
  const history = stackEditState.get().history;
  if (history.state === "hasValue") {
    return hasValueState;
  } else {
    return history;
  }
});
const hasValueState: Loading<null> = { state: "hasValue", value: null };

/** APIs exposed via useStackEditState() */
class UseStackEditState {
  state: StackEditState;
  setState: (value: StackEditState) => void;

  // derived properties.
  private history: History;

  constructor(
    state: StackEditState,
    setState: (value: StackEditState) => void
  ) {
    this.state = state;
    this.setState = setState;
    assert(
      state.history.state === "hasValue",
      "useStackEditState only works when the stack is loaded"
    );
    this.history = state.history.value;
  }

  get commitStack(): CommitStackState {
    return this.history.current();
  }

  push(commitStack: CommitStackState, op: StackEditOpDescription) {
    if (commitStack.originalStack !== this.commitStack.originalStack) {
      // Wrong stack. Discard.
      return;
    }
    const newHistory = this.history.push(commitStack, op);
    this.setHistory(newHistory);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  undo() {
    this.setHistory(this.history.undo());
  }

  undoOperationDescription(): StackEditOpDescription | undefined {
    return this.history.undoOperationDescription();
  }

  redoOperationDescription(): StackEditOpDescription | undefined {
    return this.history.redoOperationDescription();
  }

  redo() {
    this.setHistory(this.history.redo());
  }

  private setHistory(newHistory: History) {
    this.setState({
      hashes: this.state.hashes,
      history: { state: "hasValue", value: newHistory },
    });
  }
}

// Only export the type, not the constructor.
export type { UseStackEditState };

/**
 * Get the stack edit state. The stack must be loaded already, that is,
 * `loadingStackState.state` is `hasValue`. This is the main state for
 * reading and updating the `CommitStackState`.
 */
// This is not a recoil selector for flexibility.
// See https://github.com/facebookexperimental/Recoil/issues/673
export function useStackEditState() {
  return new UseStackEditState(stackEditState.get(), stackEditState.set);
}

/** Get revset expression for requested hashes. */
function getRevs(hashes: Set<Hash>): string {
  return [...hashes].join("|");
}

type StackEditMetrics = {
  // Managed by this file.
  commits: number;
  fileStacks: number;
  fileStackRevs: number;
  // Maintained by UI, via 'bumpStackEditMetric'.
  undo?: number;
  redo?: number;
  fold?: number;
  drop?: number;
  moveUpDown?: number;
  moveDnD?: number;
};

// Not atoms. They do not trigger re-render.
let currentMetrics: StackEditMetrics = {
  commits: 0,
  fileStackRevs: 0,
  fileStacks: 0,
};
let currentMetricsStartTime = 0;

export function bumpStackEditMetric(key: keyof StackEditMetrics) {
  currentMetrics[key] = (currentMetrics[key] ?? 0) + 1;
}

export function sendStackEditMetrics(save = true) {
  const tracker = getTracker();
  const duration = Date.now() - currentMetricsStartTime;
  tracker?.track("StackEditMetrics", {
    duration,
    extras: { ...currentMetrics, save },
  });
}
