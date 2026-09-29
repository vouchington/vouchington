/** Queue admission always yields a promise, including when callers handle it best-effort. */
export type EnqueueReturnType = Promise<unknown>
