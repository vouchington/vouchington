/**
 * Abort reason the API SSE helper gives a cycle that reached its duration bound, and the job signal
 * name the API sends a worker for the same event. It is an external protocol between the API and
 * worker signals, so the wire value must not change.
 */
export const SSE_CYCLE_EXPIRED = 'sse-cycle-expired'
