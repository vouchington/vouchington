import { advisoryLockPool, write } from '@data-stores/psql'
import { generateLegacySentimentFinalReconciliationSql } from '@data-stores/psql/config-driven/utils/legacy-sentiment-zero-vote-repair'
import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import { loadSqlParserModule } from '@data-stores/psql/migration-runner/sql-statements'
import { enqueueLegacySentimentEntityRefreshes } from './migrate-legacy-sentiment-refresh.mts'

const finalizationClaimId = 'finalize-legacy-sentiment-production-promotion'

/**
 * Repairs latest ballots written while an older production API was draining, then waits for
 * durable cache/election refresh enqueues before recording its independent completion claim.
 */
export async function finalizeLegacySentimentProductionPromotion(
  claimId = finalizationClaimId,
): Promise<void> {
  await withFinalizationLock(async () => await finalize(claimId))
}

async function withFinalizationLock(handler: () => Promise<void>): Promise<void> {
  const client = await advisoryLockPool.connect()
  let released = false
  try {
    await client.query(
      "/* lockLegacySentimentProductionFinalization */ SELECT pg_advisory_lock(hashtext('legacy_sentiment_production_finalization'))",
    )
    let handlerError: Error | undefined
    try {
      await handler()
    } catch (error) {
      handlerError = toError(error)
    }
    const unlock = await client.query<{ unlocked: boolean }>(
      "/* unlockLegacySentimentProductionFinalization */ SELECT pg_advisory_unlock(hashtext('legacy_sentiment_production_finalization')) AS unlocked",
    )
    if (!unlock.rows[0]?.unlocked)
      throw new Error('Legacy sentiment finalization advisory lock was not held')
    client.release()
    released = true
    if (handlerError) throw handlerError
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

async function finalize(claimId: string): Promise<void> {
  const { rows: existingClaims } = await write<{ migration_id: string }>(
    `/* getLegacySentimentFinalizationClaim */
    SELECT migration_id FROM election_vote_migration_claims
    WHERE migration_id = $1`,
    [claimId],
  )
  if (existingClaims.length > 0) return

  await reconcileLegacySentimentBallots()
  await enqueueLegacySentimentEntityRefreshes(claimId)
}

async function reconcileLegacySentimentBallots(): Promise<void> {
  await loadSqlParserModule()
  await runConfigDrivenStatementsInTransaction(
    generateLegacySentimentFinalReconciliationSql(),
    undefined,
  )
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
