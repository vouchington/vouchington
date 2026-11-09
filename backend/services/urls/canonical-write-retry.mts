import { canonicalWorkConfig, getCanonicalRewriteAttempts } from './canonical-work-limits.mts'

/** Retry only a transaction owned by the caller; borrowed transactions cannot be restarted here. */
export async function retryCanonicalWrite<T>(writeTransaction: () => Promise<T>): Promise<T> {
  await canonicalWorkConfig.waitForInitialization()
  const maxAttempts = getCanonicalRewriteAttempts()
  for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
    try {
      return await writeTransaction() // oxlint-disable-line no-await-in-loop -- each attempt starts a new transaction and rereads the current roots.
    } catch (err) {
      if (!isCanonicalWriteConflict(err)) throw err
    }
  }
  return writeTransaction()
}

export function isCanonicalWriteConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const pgError = error as { code?: string; constraint?: string }
  return (
    pgError.code === '40P01' ||
    (pgError.code === '23503' && pgError.constraint === 'fk_urls__canonical_root')
  )
}
