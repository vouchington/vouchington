/**
 * When BULLMQ_INLINE_MODE is true, enqueue functions must return a promise for testing.
 * Otherwise, it must not return a value - jobs are enqueued asynchronously.
 * Exceptions to this rule are allowed, e.g. if we need to `await` the result of an enqueue function for a 201 response.
 */
export type EnqueueReturnType = Promise<unknown> | void
