import type { ServerSideTracker } from "@withgraphite/gti-server/src/analytics/serverSideTracker";
import {
  Comparison,
  labelForComparison,
} from "@withgraphite/gti-shared/Comparison";
import path from "path";
import * as vscode from "vscode";
import { encodeGraphiteDiffUri } from "./DiffContentProvider";

/**
 * VS Code Commands registered by the Sapling extension.
 */
export const vscodeCommands = {
  ["graphite.open-file-diff"]: (uri: vscode.Uri, comparison: Comparison) =>
    openDiffView(uri, comparison),
};

/** Type definitions for built-in or third-party VS Code commands we want to execute programatically. */
type ExternalVSCodeCommands = {
  'vscode.diff': (left: vscode.Uri, right: vscode.Uri, title: string) => Thenable<unknown>;
  'workbench.action.closeSidebar': () => Thenable<void>;
  'graphite.open-gti': () => Thenable<void>;
  'graphite.close-gti': () => Thenable<void>;
  'graphite.gti.focus': () => Thenable<void>;
};

export type VSCodeCommand = typeof vscodeCommands & ExternalVSCodeCommands;

/**
 * Type-safe programmatic execution of VS Code commands (via `vscode.commands.executeCommand`).
 * Sapling-provided commands are defiend in vscodeCommands.
 * Built-in or third-party commands may also be typed through this function,
 * just define them in ExternalVSCodeCommands.
 */
export function executeVSCodeCommand<K extends keyof VSCodeCommand>(
  id: K,
  ...args: Parameters<VSCodeCommand[K]>
): ReturnType<VSCodeCommand[K]> {
  return vscode.commands.executeCommand(id, ...args) as ReturnType<VSCodeCommand[K]>;
}

type Context = {
  tracker: ServerSideTracker;
};

export function registerCommands(
  tracker: ServerSideTracker
): Array<vscode.Disposable> {
  const context: Context = {
    tracker,
  };

  const disposables: Array<vscode.Disposable> = Object.entries(
    vscodeCommands
  ).map(([id, handler]) =>
    vscode.commands.registerCommand(id, (...args: Parameters<typeof handler>) =>
      tracker.operation(
        "RunVSCodeCommand",
        "VSCodeCommandError",
        { extras: { command: id } },
        () => {
          return (handler as (...args: Array<unknown>) => unknown).apply(
            context,
            args
          );
        }
      )
    )
  );
  return disposables;
}

function openDiffView(
  uri: vscode.Uri,
  comparison: Comparison
): Thenable<unknown> {
  const { fsPath } = uri;
  const left = encodeGraphiteDiffUri(uri, comparison);
  const right = comparison.type === ComparisonType.Committed
    ? encodeGraphiteDiffUri(uri, { type: ComparisonType.Committed, hash: `${comparison.hash}^` })
    : uri;
  const title = `${path.basename(fsPath)} (${labelForComparison(comparison)})`;

  return executeVSCodeCommand("vscode.diff", left, right, title);
}
