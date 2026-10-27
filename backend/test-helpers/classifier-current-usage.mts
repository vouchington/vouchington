import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { vi } from 'vitest'
import { spendCapConfig } from '../services/ai-usage/index.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

/**
 * Runs an end-to-end classifier test near the real clock so PostgreSQL's UUIDv7 run and batch
 * receipts, the billed ledger row, and the report window describe the same period. Spend-cap
 * behavior has its own reserved-day tests; these tests assert billing and replay by owned run ID.
 * The Date-only fake permits deterministic provider latency without changing the test's day.
 */
export async function withCurrentClassifierUsage<T>(
  run: (trackRunId: (runId: string) => void) => Promise<T>,
): Promise<T> {
  await spendCapConfig.waitForInitialization()
  const now = new Date()
  const ownedRunIds = new Set<string>()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
  try {
    return await run(runId => ownedRunIds.add(runId))
  } finally {
    restore()
    vi.useRealTimers()
    if (ownedRunIds.size > 0) {
      // The provider response-key FK cascades from only these test-owned ledger rows. The
      // classifier run identities and their replay receipts stay intact.
      await write(sql`/* cleanupCurrentClassifierUsage */
        DELETE FROM ai_usage_records
        WHERE classifier_run_identity_id = ANY(${[...ownedRunIds]}::uuid[])
      `)
    }
  }
}
