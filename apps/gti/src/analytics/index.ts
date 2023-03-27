import type { TrackDataWithEventName } from "@withgraphite/gti-server/src/analytics/types";

import { Tracker } from "@withgraphite/gti-server/src/analytics/tracker";

/** Client-side global analytics tracker */
export const tracker = new Tracker(sendDataToServer, {});

/**
 * The client side sends data to the server-side to actually get tracked.
 */
// prettier-ignore
function sendDataToServer(_data: TrackDataWithEventName) {
  // In open source, we don't even need to bother sending these messages to the server,
  // since we don't track anything anyway.

  // @nocommit do something?
}
