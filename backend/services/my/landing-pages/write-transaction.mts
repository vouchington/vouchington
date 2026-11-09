import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getLandingPageTransactionAttempts } from './limits.mts'

export class LandingPageSlotConflictError extends Error {}

/** Retry whole owned writes after deadlocks, serialization or a competing default promotion. */
export async function runLandingPageWriteTransaction<Result>(
  write: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const attempts = getLandingPageTransactionAttempts()
  let failure: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- every bounded retry owns a new transaction.
      await using query = await beginTransaction()
      // oxlint-disable-next-line no-await-in-loop -- a retry begins only after the aborted attempt rolls back.
      const result = await write(query)
      // oxlint-disable-next-line no-await-in-loop -- successful commit ends the bounded attempt loop.
      await query.commit()
      return result
    } catch (err) {
      if (!isRetryableLandingPageConflict(err)) throw err
      failure = err
    }
  }
  throw failure
}

function isRetryableLandingPageConflict(err: unknown): boolean {
  if (err instanceof LandingPageSlotConflictError) return true
  if (typeof err !== 'object' || err === null || !('code' in err)) return false
  return (
    err.code === '40P01' ||
    err.code === '40001' ||
    (err.code === '23505' &&
      'constraint' in err &&
      err.constraint === 'idx_user_landing_pages__user_id_default')
  )
}
