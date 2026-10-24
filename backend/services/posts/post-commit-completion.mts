import onError from '@modules/on-error'

export type PostCommitOperation = {
  start: () => Promise<unknown>
  isRejectionReported?: () => boolean
}

/** These operations start after commit; failures must not reject the durable response. */
export async function settlePostCommitEffects(
  operations: PostCommitOperation[],
  reportError: typeof onError = onError,
): Promise<void> {
  const synchronousFailures = new Set<number>()
  const started = operations.map((operation, index) => {
    try {
      return Promise.resolve(operation.start())
    } catch (err) {
      synchronousFailures.add(index)
      const failure = Promise.withResolvers<unknown>()
      failure.reject(err)
      return failure.promise
    }
  })
  const results = await Promise.allSettled(started)
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected' &&
    (synchronousFailures.has(index) || !operations[index]?.isRejectionReported?.())
      ? [result.reason]
      : [],
  )
  for (const error of errors) {
    try {
      reportError(
        error instanceof Error ? error : new Error('Post-commit effect failed', { cause: error }),
      )
    } catch {
      // Reporting is best-effort after commit; it must not reject the durable response.
    }
  }
}
