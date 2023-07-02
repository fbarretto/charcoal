// This file is loaded before the rest of the GTI webview.
// We define global platform data here that the rest of the app can use

import type { Platform } from "@withgraphite/gti/src/platform";

// important: this import should not transitively import code
// which depends on `window.gtiPlatform`, or else it won't be defined yet.
import { vscodeWebviewPlatform } from "./vscodeWebviewPlatform";

window.gtiPlatform = vscodeWebviewPlatform;
__webpack_nonce__ = window.webpackNonce;

declare global {
  interface Window {
    gtiPlatform?: Platform;
    webpackNonce: string;
  }
  let __webpack_nonce__: string;
}
