import type { AllDrawersState } from "@withgraphite/gti-shared/Drawers";

import { getWindowWidthInPixels } from "./utils";
import { observable } from "mobx";

export const gtiDrawerState = observable.box<AllDrawersState>(
  {
    right: {
      size: 500,
      // Collapse by default on small screens.
      collapsed: getWindowWidthInPixels() <= 500,
    },
    left: { size: 200, collapsed: true },
    top: { size: 200, collapsed: true },
    bottom: { size: 200, collapsed: true },
  },
  { deep: false }
);
