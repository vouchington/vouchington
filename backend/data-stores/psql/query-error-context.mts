import pg from 'pg'

const reportedErrors = new WeakSet<pg.DatabaseError>()

/** Safe context for native database failures; exception reporting remains with the caller. */
export function recordQueryErrorContext(err: unknown): void {
  try {
    if (
      !(err instanceof pg.DatabaseError) ||
      typeof err.code !== 'string' ||
      reportedErrors.has(err)
    )
      return
    let category: string
    switch (err.code) {
      case '57014':
        category =
          err.message === 'canceling statement due to statement timeout'
            ? 'statement_timeout'
            : err.message === 'canceling statement due to user request'
              ? 'user_request'
              : 'unknown_cancellation'
        break
      case '40001':
        category = 'serialization_failure'
        break
      case '40P01':
        category = 'deadlock_detected'
        break
      case '55P03':
        category = 'lock_not_available'
        break
      case '53300':
        category = 'too_many_connections'
        break
      default:
        return
    }
    console.error(`[pg-query-error-context] code=${err.code} category=${category}`)
    // Nested query/executor boundaries can observe the same original server failure.
    reportedErrors.add(err)
  } catch {
    // A synchronous reporting failure must not replace the database's rejection.
  }
}
