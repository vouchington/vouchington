/** A feed ran out of its time budget. It is an ordinary error, so a queue job retries it. */
export class FeedBudgetExceededError extends Error {
  override name = 'FeedBudgetExceededError'

  constructor() {
    super('RSS feed processing exceeded its time budget')
  }
}

function ignoreLateFailure(): void {
  // The budget error is the result; the abandoned work's own failure has no reader.
}

/** Throws once the budget is spent; a no-op when the caller set none. */
export function assertWithinFeedBudget(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new FeedBudgetExceededError()
}

/**
 * Settles with `work`, or rejects with `FeedBudgetExceededError` as soon as the signal aborts, even
 * if `work` cannot be interrupted (for example a wait on another job). Whatever `work` throws after
 * the abort is the budget error too, so a timeout is never mistaken for a permanent failure.
 */
export async function raceFeedBudget<T>(
  signal: AbortSignal | undefined,
  work: Promise<T>,
): Promise<T> {
  if (!signal) return work
  if (signal.aborted) {
    // The work already started; its late failure must not surface as an unhandled rejection.
    work.catch(ignoreLateFailure)
    throw new FeedBudgetExceededError()
  }
  const aborted = Promise.withResolvers<never>()
  const onAbort = () => aborted.reject(new FeedBudgetExceededError())
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([work, aborted.promise])
  } catch (err) {
    if (signal.aborted) throw new FeedBudgetExceededError()
    throw err
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
