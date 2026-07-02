/**
 * Server clock synchronisation.
 *
 * Every time the server sends a `serverTime` timestamp the client calls
 * `updateClockOffset`. All timer calculations then use `serverNow()` instead
 * of `Date.now()`, eliminating the up-to-5-second drift that occurs between
 * devices whose clocks are not synchronised to the same NTP source.
 */

let _offset = 0 // ms: serverClock - clientClock (positive = client is behind)

export function updateClockOffset(serverTime: number): void {
  _offset = serverTime - Date.now()
}

/** Current server-synchronised time in milliseconds. */
export function serverNow(): number {
  return Date.now() + _offset
}
