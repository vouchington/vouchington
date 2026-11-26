/**
 * Deliberately short wait for UI that settles from a client-side event (a typed search shortcut,
 * a toast, a dialog toggle). Shorter than the 10 s config default on purpose, so a regression
 * fails fast. Waits that match the config default take no explicit timeout.
 */
export const SHORT_WAIT_TIMEOUT_MS = 5_000
