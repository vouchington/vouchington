/** Retain errors independently of an already-settled shutdown signal. */
export function createOwnedWorkerFailures() {
  const errors: unknown[] = []
  return {
    record(err: unknown) {
      errors.push(err)
    },
    finish(primary?: { error: unknown }) {
      const retained = primary
        ? [primary.error, ...errors.filter(err => !Object.is(err, primary.error))]
        : errors
      if (retained.length === 1) throw retained[0]
      if (retained.length)
        throw new AggregateError(retained, 'Owned worker and cleanup failed', {
          cause: retained[0],
        })
    },
  }
}
