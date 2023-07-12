import { makeCommandDispatcher, KeyCode, Modifier } from "./KeyboardShortcuts";

/* eslint-disable no-bitwise */
export const [GTICommandContext, useCommand, dispatchCommand] =
  makeCommandDispatcher({
    ToggleSidebar: [Modifier.CMD, KeyCode.Period],
    OpenUncommittedChangesComparisonView: [Modifier.CMD, KeyCode.SingleQuote],
    OpenHeadChangesComparisonView: [
      Modifier.CMD | Modifier.SHIFT,
      KeyCode.SingleQuote,
    ],
    Escape: [Modifier.NONE, KeyCode.Escape],
    SelectUpwards: [Modifier.NONE, KeyCode.UpArrow],
    SelectDownwards: [Modifier.NONE, KeyCode.DownArrow],
    ContinueSelectionUpwards: [Modifier.SHIFT, KeyCode.UpArrow],
    ContinueSelectionDownwards: [Modifier.SHIFT, KeyCode.DownArrow],
  });

export type GTICommandName = Parameters<typeof useCommand>[0];
