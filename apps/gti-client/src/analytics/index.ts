import type { TrackDataWithEventName } from "@withgraphite/gti-shared";

import { Tracker } from "@withgraphite/gti-shared";
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
