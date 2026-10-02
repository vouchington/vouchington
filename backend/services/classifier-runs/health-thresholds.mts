const HOUR_MS = 60 * 60 * 1000

/**
 * Longer than any legitimate delay: the spend cap parks a job until day end, so a healthy run or
 * request can wait most of a day. Older than this, classification is stuck somewhere the at-once
 * alarms (client unavailable, provider rejected, sweep bound) do not cover.
 */
export const CLASSIFIER_RUN_AGE_ALARM_MS = 26 * HOUR_MS

/** Same bound for a request that never reserved a run (a missing embedding or configuration). */
export const CLASSIFIER_REQUEST_AGE_ALARM_MS = 26 * HOUR_MS

/**
 * A live feed item with no request is given this long before it counts: the producer writes the
 * request in the item's own upsert transaction, so any wait at all means the write was skipped.
 */
export const CLASSIFIER_UNREQUESTED_GRACE_MS = HOUR_MS

/** The scan reads feed items created inside this window, so it stays an index range scan on `id`. */
export const CLASSIFIER_UNREQUESTED_LOOKBACK_MS = 7 * 24 * HOUR_MS

/** The window of runs, by reservation time, whose terminal outcomes are counted. */
export const CLASSIFIER_TERMINAL_WINDOW_MS = 24 * HOUR_MS

/**
 * Terminal failures of one classifier inside the window that raise the failure alarm. Single
 * causes with an action (a missing key, a rejected key, a looping receipt) alarm at once on their
 * own; this catches a broad outage that fails many runs for ordinary kinds.
 */
export const CLASSIFIER_TERMINAL_FAILURE_ALARM_COUNT = 10
