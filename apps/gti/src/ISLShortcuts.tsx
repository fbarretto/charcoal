import {
  makeCommandDispatcher,
  KeyCode,
  Modifier,
} from "@withgraphite/gti-shared/KeyboardShortcuts";

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
  });
