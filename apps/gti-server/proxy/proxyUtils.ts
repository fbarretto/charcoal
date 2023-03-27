

import {timingSafeEqual} from 'crypto';

/**
 * Timing safe comparison of tokens coming from strings.
 */
export function areTokensEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}
