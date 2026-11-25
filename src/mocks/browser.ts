export const CLOCK_SKEW_MS = 90_000
export const serverNow = () => Date.now() + CLOCK_SKEW_MS
export const RESERVATION_MS = 5 * 60_000