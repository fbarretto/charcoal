/**
 * User-defined code for websocket close that tells the client not to continue reconnecting.
 * User-defined codes are in the range 3000-4999: https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.2
 */
export const CLOSED_AND_SHOULD_NOT_RECONNECT_CODE = 4100;

export const ONE_MINUTE_MS = 60_000;

export const DEFAULT_DAYS_OF_COMMITS_TO_LOAD = undefined;

/**
 * Short error messages sent from the server to the client.
 * Usually, the client will intercept and re-render these with more details + i18n.
 */
export enum ErrorShortMessages {
  NoCommitsFetched = "No commits found",
}
