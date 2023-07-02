import type { TrackDataWithEventName } from "@withgraphite/gti-server/src/analytics/types";

import { Tracker } from "@withgraphite/gti-server/src/analytics/tracker";
import clientToServerAPI from "../ClientToServerAPI";

/** Client-side global analytics tracker */
export const tracker = new Tracker(sendDataToServer, {});
window.globalGtiClientTracker = tracker;

/**
 * The client side sends data to the server-side to actually get tracked.
 */
// prettier-ignore
function sendDataToServer(data: TrackDataWithEventName) {
  clientToServerAPI.postMessage({type: 'track', data});
}
