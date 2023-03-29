// @fb-only

/* eslint-disable @typescript-eslint/no-explicit-any */

// This file contains imports only used by non-OSS internal builds of GTI
// This should be the only file using fb-only imports and prettier ignores.

// prettier-ignore
type InternalImportsType =
  // @fb-only
// @fb-only
  {[key: string]: undefined | any}
// @fb-only

/**
 * API for accessing internal (non-OSS) features / functions.
 * In OSS builds, all properties will give `undefined`.
 */
export const Internal: InternalImportsType = {
  // @fb-only
};
